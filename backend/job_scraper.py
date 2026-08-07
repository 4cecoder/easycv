"""Job posting scraper and URL detection utility for EasyCV backend.

Provides URL detection, URL normalization, job ID extraction, and job description
text fetching and parsing for major job boards: Indeed, LinkedIn, Glassdoor, and ZipRecruiter.
"""

import html
from html.parser import HTMLParser
import re

from typing import Any, Dict, Optional
from urllib.parse import parse_qs, urlparse

import requests

from backend.constants import WORKER_DOWNLOAD_TIMEOUT

# Default User-Agent header mimicking a modern web browser to avoid automated scraping blocks
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)

DEFAULT_HEADERS = {
    "User-Agent": DEFAULT_USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Domain regex patterns for job sites
_INDEED_DOMAIN_PATTERN = re.compile(
    r"^(?:[a-z0-9-]+\.)*(?:indeed\.(?:com|[a-z]{2,3}(?:\.[a-z]{2})?))$",
    re.IGNORECASE,
)

_LINKEDIN_DOMAIN_PATTERN = re.compile(
    r"^(?:[a-z0-9-]+\.)*(?:linkedin\.com|lnkd\.in)$",
    re.IGNORECASE,
)

_GLASSDOOR_DOMAIN_PATTERN = re.compile(
    r"^(?:[a-z0-9-]+\.)*(?:glassdoor\.(?:com|[a-z]{2,3}(?:\.[a-z]{2})?))$",
    re.IGNORECASE,
)

_ZIPRECRUITER_DOMAIN_PATTERN = re.compile(
    r"^(?:[a-z0-9-]+\.)*(?:ziprecruiter\.(?:com|[a-z]{2,3}(?:\.[a-z]{2})?))$",
    re.IGNORECASE,
)

# Job ID Regex patterns
_LINKEDIN_JOB_ID_PATH_PATTERN = re.compile(r"/jobs/view/(?:[a-zA-Z0-9_-]+-)?(\d+)", re.IGNORECASE)
_GLASSDOOR_JOB_ID_PATTERN = re.compile(r"(?:_jl_|_JL_|jobListingId=)(\d+)", re.IGNORECASE)
_ZIPRECRUITER_JOB_ID_PATTERN = re.compile(r"/job(?:s)?/(?:[a-zA-Z0-9_-]+-)?([a-zA-Z0-9]+)", re.IGNORECASE)


class _JobHTMLParser(HTMLParser):
    """HTML Parser that converts HTML structure into clean plain text."""

    def __init__(self) -> None:
        super().__init__()
        self.text_chunks: list[str] = []
        self.ignore_stack: list[str] = []
        self.ignored_tags = {
            "script", "style", "noscript", "header", "footer", "nav", "svg", "head", "iframe"
        }
        self.block_tags = {
            "p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6",
            "tr", "section", "article", "blockquote", "dt", "dd"
        }

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        tag_lower = tag.lower()
        if tag_lower in self.ignored_tags:
            self.ignore_stack.append(tag_lower)
        elif tag_lower in self.block_tags:
            self.text_chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag_lower = tag.lower()
        if self.ignore_stack and self.ignore_stack[-1] == tag_lower:
            self.ignore_stack.pop()
        elif tag_lower in self.block_tags:
            self.text_chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.ignore_stack:
            self.text_chunks.append(data)


def normalize_job_url(url: Optional[str]) -> str:
    """Normalize a job URL string by stripping whitespace and adding scheme if missing."""
    if not url:
        return ""
    clean_url = url.strip()
    if not clean_url:
        return ""
    if not clean_url.startswith(("http://", "https://")):
        clean_url = "https://" + clean_url
    return clean_url


def _get_hostname(url: Optional[str]) -> str:
    """Extract netloc/hostname from a URL string."""
    normalized = normalize_job_url(url)
    if not normalized:
        return ""
    try:
        parsed = urlparse(normalized)
        return parsed.hostname or ""
    except ValueError:
        return ""


def is_indeed_url(url: Optional[str]) -> bool:
    """Check if the provided URL belongs to Indeed."""
    hostname = _get_hostname(url)
    return bool(hostname and _INDEED_DOMAIN_PATTERN.match(hostname))


def is_linkedin_url(url: Optional[str]) -> bool:
    """Check if the provided URL belongs to LinkedIn."""
    hostname = _get_hostname(url)
    return bool(hostname and _LINKEDIN_DOMAIN_PATTERN.match(hostname))


def is_glassdoor_url(url: Optional[str]) -> bool:
    """Check if the provided URL belongs to Glassdoor."""
    hostname = _get_hostname(url)
    return bool(hostname and _GLASSDOOR_DOMAIN_PATTERN.match(hostname))


def is_ziprecruiter_url(url: Optional[str]) -> bool:
    """Check if the provided URL belongs to ZipRecruiter."""
    hostname = _get_hostname(url)
    return bool(hostname and _ZIPRECRUITER_DOMAIN_PATTERN.match(hostname))


def detect_job_site(url: Optional[str]) -> Optional[str]:
    """Detect which supported job platform a URL belongs to.

    Returns:
        'indeed', 'linkedin', 'glassdoor', 'ziprecruiter', or None if not supported.
    """
    if is_indeed_url(url):
        return "indeed"
    if is_linkedin_url(url):
        return "linkedin"
    if is_glassdoor_url(url):
        return "glassdoor"
    if is_ziprecruiter_url(url):
        return "ziprecruiter"
    return None


def is_supported_job_url(url: Optional[str]) -> bool:
    """Return True if the URL is from a supported job portal (Indeed, LinkedIn, Glassdoor, ZipRecruiter)."""
    return detect_job_site(url) is not None


def extract_job_id(url: Optional[str]) -> Optional[str]:
    """Extract job ID parameter/slug from a supported job portal URL.

    Returns:
        Job ID string if extracted, or None.
    """
    normalized = normalize_job_url(url)
    if not normalized:
        return None

    site = detect_job_site(normalized)
    if not site:
        return None

    try:
        parsed = urlparse(normalized)
        query_params = parse_qs(parsed.query)

        if site == "indeed":
            if "jk" in query_params:
                return query_params["jk"][0]
            if "vjk" in query_params:
                return query_params["vjk"][0]

        elif site == "linkedin":
            match = _LINKEDIN_JOB_ID_PATH_PATTERN.search(parsed.path)
            if match:
                return match.group(1)
            if "currentJobId" in query_params:
                return query_params["currentJobId"][0]

        elif site == "glassdoor":
            if "jl" in query_params:
                return query_params["jl"][0]
            if "jobListingId" in query_params:
                return query_params["jobListingId"][0]
            match = _GLASSDOOR_JOB_ID_PATTERN.search(normalized)
            if match:
                return match.group(1)

        elif site == "ziprecruiter":
            if "job_id" in query_params:
                return query_params["job_id"][0]
            match = _ZIPRECRUITER_JOB_ID_PATTERN.search(parsed.path)
            if match:
                return match.group(1)
    except ValueError:
        pass

    return None


def clean_html_text(html_content: Optional[str]) -> str:
    """Convert raw HTML content into cleaned, readable text.

    Strips script/style blocks, decodes HTML entities, and normalizes spacing.
    """
    if not html_content:
        return ""

    parser = _JobHTMLParser()
    try:
        parser.feed(html_content)
        parser.close()
        raw_text = "".join(parser.text_chunks)
    except (ValueError, TypeError, AssertionError):
        # Fallback to regex cleaning if parser encounters malformed HTML error
        raw_text = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", "", html_content, flags=re.DOTALL | re.IGNORECASE)
        raw_text = re.sub(r"<[^>]+>", "\n", raw_text)

    # Decode HTML entities
    decoded = html.unescape(raw_text)

    # Normalize newlines and consecutive whitespace
    lines = [line.strip() for line in decoded.splitlines()]
    non_empty_lines = [line for line in lines if line]

    return "\n\n".join(non_empty_lines)


def extract_job_text_from_html(html_content: Optional[str], site: Optional[str] = None) -> str:
    """Extract job description text from raw HTML content.

    Uses site-specific element/container heuristics or meta tag extraction when available,
    falling back to clean general HTML text extraction.
    """
    if not html_content:
        return ""

    # Attempt meta tag description extraction first if available
    meta_desc_patterns = [
        r'<meta\s+property=["\']og:description["\']\s+content=["\']([^"\']+)["\']',
        r'<meta\s+content=["\']([^"\']+)["\']\s+property=["\']og:description["\']',
        r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']+)["\']',
        r'<meta\s+content=["\']([^"\']+)["\']\s+name=["\']description["\']',
    ]

    # Site specific container regexes for job descriptions
    container_patterns = []
    if site == "indeed":
        container_patterns.append(r'<div[^>]*id=["\']jobDescriptionText["\'][^>]*>(.*?)</div>\s*<div')
        container_patterns.append(r'<div[^>]*class=["\'][^"\']*jobsearch-JobComponent-description[^"\']*["\'][^>]*>(.*?)</div>')
    elif site == "linkedin":
        container_patterns.append(r'<div[^>]*class=["\'][^"\']*description__text[^"\']*["\'][^>]*>(.*?)</div>')
        container_patterns.append(r'<section[^>]*class=["\'][^"\']*show-more-less-html[^"\']*["\'][^>]*>(.*?)</section>')
    elif site == "glassdoor":
        container_patterns.append(r'<div[^>]*class=["\'][^"\']*jobDescriptionContent[^"\']*["\'][^>]*>(.*?)</div>')
        container_patterns.append(r'<div[^>]*id=["\']JobDescriptionContainer["\'][^>]*>(.*?)</div>')
    elif site == "ziprecruiter":
        container_patterns.append(r'<div[^>]*class=["\'][^"\']*job_description[^"\']*["\'][^>]*>(.*?)</div>')
        container_patterns.append(r'<section[^>]*class=["\'][^"\']*job_details[^"\']*["\'][^>]*>(.*?)</section>')

    for pattern in container_patterns:
        match = re.search(pattern, html_content, re.DOTALL | re.IGNORECASE)
        if match:
            extracted = clean_html_text(match.group(1))
            if len(extracted) > 50:
                return extracted

    # Fallback to general HTML text cleaning
    full_text = clean_html_text(html_content)
    if len(full_text) > 100:
        return full_text

    # Meta tag description fallback for short/rendered pages
    for pattern in meta_desc_patterns:
        match = re.search(pattern, html_content, re.IGNORECASE)
        if match:
            meta_text = html.unescape(match.group(1).strip())
            if meta_text:
                return meta_text

    return full_text


def fetch_job_html(
    url: str,
    timeout: int = WORKER_DOWNLOAD_TIMEOUT,
    headers: Optional[Dict[str, str]] = None,
) -> str:
    """Fetch raw HTML content of a job page URL over HTTP GET.

    Args:
        url: Target job posting URL.
        timeout: Request timeout in seconds.
        headers: Optional HTTP headers dictionary.

    Returns:
        HTML string content of the response.

    Raises:
        ValueError: If URL is invalid.
        requests.RequestException: If network or HTTP request fails.
    """
    normalized = normalize_job_url(url)
    if not normalized:
        raise ValueError("Invalid or empty URL provided")

    req_headers = DEFAULT_HEADERS.copy()
    if headers:
        req_headers.update(headers)

    response = requests.get(normalized, headers=req_headers, timeout=timeout)
    response.raise_for_status()
    return response.text


def fetch_job_text(
    url: str,
    timeout: int = WORKER_DOWNLOAD_TIMEOUT,
    headers: Optional[Dict[str, str]] = None,
) -> str:
    """Fetch and extract cleaned job description text from a job posting URL.

    Args:
        url: Target job posting URL.
        timeout: Request timeout in seconds.
        headers: Optional HTTP headers dictionary.

    Returns:
        Cleaned text string of the job posting.
    """
    site = detect_job_site(url)
    html_content = fetch_job_html(url, timeout=timeout, headers=headers)
    return extract_job_text_from_html(html_content, site=site)


def scrape_job_posting(
    url: str,
    timeout: int = WORKER_DOWNLOAD_TIMEOUT,
    headers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Scrape full job details from a job posting URL.

    Returns a structured dictionary with detection, job ID, raw text, and execution status.
    """
    normalized = normalize_job_url(url)
    site = detect_job_site(normalized)
    job_id = extract_job_id(normalized)

    res: Dict[str, Any] = {
        "url": normalized,
        "site": site,
        "job_id": job_id,
        "text": "",
        "success": False,
        "error": None,
    }

    try:
        text = fetch_job_text(normalized, timeout=timeout, headers=headers)
        res["text"] = text
        res["success"] = True
    except (ValueError, requests.RequestException) as exc:
        res["error"] = str(exc)

    return res
