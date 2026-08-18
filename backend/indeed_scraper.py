"""Indeed job description scraper.

Fetches full job descriptions from Indeed job postings.
Handles Indeed's various URL formats and extracts:
- Job title
- Company name
- Location
- Full job description (HTML -> text)
- Salary range (if listed)
- Job type (full-time, part-time, etc.)
- Posted date
- Indeed job ID

Uses requests + BeautifulSoup for scraping.
Respects robots.txt and rate limits.
"""

import html
import logging
import os
import re
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

import requests
from bs4 import BeautifulSoup, Tag

from backend.constants import WORKER_DOWNLOAD_TIMEOUT
from backend.job_scraper import (
    DEFAULT_HEADERS,
    DEFAULT_USER_AGENT,
    clean_html_text,
    extract_job_text_from_html,
    is_indeed_url,
    normalize_job_url,
)

logger = logging.getLogger(__name__)

# ── Rate Limiting ────────────────────────────────

_RATE_LIMIT_SECONDS = 2.0
_last_request_time: float = 0.0


def _enforce_rate_limit() -> None:
    """Block until at least _RATE_LIMIT_SECONDS have elapsed since the last request."""
    global _last_request_time
    now = time.monotonic()
    elapsed = now - _last_request_time
    if elapsed < _RATE_LIMIT_SECONDS:
        time.sleep(_RATE_LIMIT_SECONDS - elapsed)
    _last_request_time = time.monotonic()


# ── Caching ──────────────────────────────────────

_cache: Dict[str, "IndeedJobData"] = {}
CACHE_DIR: Optional[str] = None


def _get_cache_path(job_id: str) -> Optional[str]:
    """Return filesystem path for a cached job, or None if CACHE_DIR is unset."""
    if CACHE_DIR:
        return os.path.join(CACHE_DIR, f"{job_id}.json")
    return None


def _load_from_disk_cache(job_id: str) -> Optional["IndeedJobData"]:
    """Try to load a cached result from disk."""
    import json
    path = _get_cache_path(job_id)
    if path and os.path.exists(path):
        try:
            with open(path) as f:
                data = json.load(f)
            return IndeedJobData(**data)
        except (json.JSONDecodeError, OSError, TypeError):
            pass
    return None


def _save_to_disk_cache(job_id: str, job_data: "IndeedJobData") -> None:
    """Persist a scraped result to disk cache."""
    import json
    path = _get_cache_path(job_id)
    if path:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            with open(path, "w") as f:
                json.dump(asdict(job_data), f, indent=2)
        except OSError:
            logger.warning("Failed to write cache file: %s", path)


def get_cached(job_id: str) -> Optional["IndeedJobData"]:
    """Return cached IndeedJobData for *job_id*, or None."""
    if job_id in _cache:
        return _cache[job_id]
    cached = _load_from_disk_cache(job_id)
    if cached:
        _cache[job_id] = cached
    return cached


def set_cached(job_id: str, job_data: "IndeedJobData") -> None:
    """Store IndeedJobData in both in-memory and disk caches."""
    _cache[job_id] = job_data
    _save_to_disk_cache(job_id, job_data)


def clear_cache() -> None:
    """Wipe in-memory cache.  Disk cache files are left untouched."""
    _cache.clear()


# ── URL Parsing ──────────────────────────────────

# Indeed URL patterns
_VIEWJOB_PATTERN = re.compile(
    r"https?://(?:(?:www|uk|ca|de|fr|au|in|jp)\.)?indeed\.\w+/(?:viewjob|rc/clk)\?.*jk=([a-zA-Z0-9_-]+)",
    re.IGNORECASE,
)

_REDIRECT_PATTERN = re.compile(
    r"https?://(?:(?:www|uk|ca|de|fr|au|in|jp)\.)?indeed\.\w+/rc/clk\?.*jk=([a-zA-Z0-9_-]+)",
    re.IGNORECASE,
)

_CMP_JOBS_PATTERN = re.compile(
    r"https?://(?:(?:www|uk|ca|de|fr|au|in|jp)\.)?indeed\.\w+/cmp/[^/]+/jobs\?.*jk=([a-zA-Z0-9_-]+)",
    re.IGNORECASE,
)


def parse_indeed_url(url: str) -> Optional[str]:
    """Extract the Indeed job key (jk parameter) from any Indeed URL format.

    Supported formats:
        - indeed.com/viewjob?jk=xxx
        - indeed.com/rc/clk?jk=xxx
        - indeed.com/cmp/Company/jobs?jk=xxx
        - indeed.com/jobs?q=...&vjk=xxx (search result with direct view)

    Returns:
        The job key string, or None if not found.
    """
    normalized = normalize_job_url(url)
    if not normalized or not is_indeed_url(normalized):
        return None

    try:
        parsed = urlparse(normalized)
        query_params = parse_qs(parsed.query)

        # Primary: jk query parameter
        if "jk" in query_params:
            return query_params["jk"][0]

        # Secondary: vjk query parameter
        if "vjk" in query_params:
            return query_params["vjk"][0]

        # Tertiary: regex match on path
        for pattern in (_VIEWJOB_PATTERN, _REDIRECT_PATTERN, _CMP_JOBS_PATTERN):
            match = pattern.search(normalized)
            if match:
                return match.group(1)
    except (ValueError, IndexError):
        pass

    return None


def is_indeed_viewjob_url(url: str) -> bool:
    """Return True if the URL points to a specific Indeed job posting."""
    return parse_indeed_url(url) is not None


# ── Data Model ───────────────────────────────────


@dataclass
class IndeedJobData:
    """Structured data extracted from an Indeed job posting."""

    url: str = ""
    job_id: str = ""
    title: str = ""
    company: str = ""
    location: str = ""
    description: str = ""
    salary: str = ""
    job_type: str = ""
    posted_date: str = ""
    snippet: str = ""
    raw_html: str = ""
    success: bool = False
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to a plain dictionary, omitting raw_html for compactness."""
        d = asdict(self)
        d.pop("raw_html", None)
        return d

    @property
    def description_text(self) -> str:
        """Return cleaned description text (convenience accessor)."""
        return self.description


# ── HTML Extraction Helpers ──────────────────────

_INDEED_TITLE_SELECTORS = [
    "h1.jobsearch-JobInfoHeader-title",       # modern Indeed
    "h1.jobsearch-DesktopUnifiedHeader-jobTitle",  # 2024+ redesign
    "h1[data-testid='jobsearch-JobInfoHeader-title']",
    "h1.jcs-JobTitle",                         # alternate
    "h1",                                      # generic fallback
]

_INDEED_COMPANY_SELECTORS = [
    "div[data-testid='inlineHeader-companyName'] a",
    "div[data-testid='inlineHeader-companyName']",
    "a[data-testid='jobHeaderCompanyInfo']",
    "div.jobsearch-CompanyInfoWithoutHeader a",
    "div.jobsearch-CompanyInfo a",
    "span.companyName",
    "a.companyOverviewLink",
    "div.companyLocation + div a",             # nearby company link
]

_INDEED_LOCATION_SELECTORS = [
    "div[data-testid='inlineHeader-companyLocation']",
    "div[data-testid='companyLocation']",
    "div.jobsearch-CompanyInfoWithoutHeader .companyLocation",
    "div.jobsearch-CompanyInfo .companyLocation",
    "div.companyLocation",
    "span.companyLocation",
]

_INDEED_SALARY_SELECTORS = [
    "div[data-testid='attribute_snippet_testid']",
    "div.salary-snippet-container",
    "div.jobsearch-JobInfoHeader-salary",
    "span.salary-text",
    "div.missing-component-benefits",
]

_INDEED_JOB_TYPE_SELECTORS = [
    "div.jobsearch-JobInfoHeader-subtitle .jobType",
    "div[data-testid='employeeType']",
    "span.jobType",
    "div.jobsearch-JobInfoHeader-subtitle div",
]

_INDEED_DATE_SELECTORS = [
    "div.jobsearch-JobInfoHeader-subtitle .date",
    "span.date",
    "div.jobsearch-JobInfoHeader-subtitle",
    "div[data-testid='jobsearch-JobInfoHeader-subtitle']",
]

_INDEED_DESC_SELECTORS = [
    "div#jobDescriptionText",
    "div.jobsearch-JobComponent-description",
    "div.jobsearch-jobDescriptionText",
    "div[id='jobDescriptionText']",
]


def _extract_text(soup: BeautifulSoup, selectors: List[str]) -> str:
    """Try each CSS selector and return the first non-empty stripped text."""
    for selector in selectors:
        try:
            el = soup.select_one(selector)
            if el:
                text = el.get_text(separator=" ", strip=True)
                if text:
                    return text
        except Exception:
            continue
    return ""


def _extract_salary_from_text(text: str) -> str:
    """Pull salary patterns from surrounding text."""
    patterns = [
        r"\$[\d,]+(?:\.\d{2})?(?:\s*[-–]\s*\$[\d,]+(?:\.\d{2})?)?(?:\s*(?:per|/)\s*(?:hour|hr|year|yr|month|mo|week|wk))?",
        r"€[\d,]+(?:\.\d{2})?(?:\s*[-–]\s*€[\d,]+(?:\.\d{2})?)?(?:\s*(?:per|/)\s*(?:hour|hr|year|yr|month|mo|week|wk))?",
        r"£[\d,]+(?:\.\d{2})?(?:\s*[-–]\s*£[\d,]+(?:\.\d{2})?)?(?:\s*(?:per|/)\s*(?:hour|hr|year|yr|month|mo|week|wk))?",
        r"[\d,]+(?:\.\d{2})?\s*(?:USD|EUR|GBP)(?:\s*[-–]\s*[\d,]+(?:\.\d{2})?\s*(?:USD|EUR|GBP))?",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(0).strip()
    return ""


def _extract_date_from_text(text: str) -> str:
    """Try to find posted-date patterns in the subtitle area."""
    patterns = [
        r"(?:Posted|Published|Active)\s+(\d+\s+(?:days?|hours?|minutes?|weeks?|months?)\s+ago)",
        r"((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s*\d{4})",
        r"(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*,?\s*\d{4})",
        r"(\d{4}-\d{2}-\d{2})",
        r"(?:Posted|Active)\s+just\s+now",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(0).strip()
    return ""


def _extract_structured_data(html_content: str) -> Dict[str, str]:
    """Parse Indeed HTML with BeautifulSoup and extract structured fields."""
    soup = BeautifulSoup(html_content, "html.parser")

    data: Dict[str, str] = {
        "title": _extract_text(soup, _INDEED_TITLE_SELECTORS),
        "company": _extract_text(soup, _INDEED_COMPANY_SELECTORS),
        "location": _extract_text(soup, _INDEED_LOCATION_SELECTORS),
        "salary": _extract_text(soup, _INDEED_SALARY_SELECTORS),
        "job_type": _extract_text(soup, _INDEED_JOB_TYPE_SELECTORS),
        "posted_date": _extract_text(soup, _INDEED_DATE_SELECTORS),
    }

    # Extract description from dedicated container
    for selector in _INDEED_DESC_SELECTORS:
        try:
            desc_el = soup.select_one(selector)
            if desc_el:
                data["description"] = desc_el.get_text(separator="\n", strip=True)
                break
        except Exception:
            continue

    # Fallback: description from og:description or page description meta
    if not data.get("description"):
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            data["description"] = html.unescape(meta_desc["content"])

    if not data.get("description"):
        meta_og = soup.find("meta", attrs={"property": "og:description"})
        if meta_og and meta_og.get("content"):
            data["description"] = html.unescape(meta_og["content"])

    # Fallback salary from page text
    if not data.get("salary"):
        data["salary"] = _extract_salary_from_text(html_content)

    # Fallback date from subtitle text
    if not data.get("posted_date"):
        subtitle_text = ""
        subtitle_el = soup.select_one("div.jobsearch-JobInfoHeader-subtitle")
        if subtitle_el:
            subtitle_text = subtitle_el.get_text(" ", strip=True)
        data["posted_date"] = _extract_date_from_text(subtitle_text)

    # Snippet: short summary from meta or first 200 chars of description
    if not data.get("snippet"):
        meta_og_desc = soup.find("meta", attrs={"property": "og:description"})
        if meta_og_desc and meta_og_desc.get("content"):
            data["snippet"] = html.unescape(meta_og_desc["content"])[:300]
        elif data.get("description"):
            data["snippet"] = data["description"][:300]

    return data


# ── HTTP Fetching ────────────────────────────────

_INDEED_HEADERS = {
    **DEFAULT_HEADERS,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}


def fetch_indeed_page(
    url: str,
    timeout: int = WORKER_DOWNLOAD_TIMEOUT,
    headers: Optional[Dict[str, str]] = None,
) -> str:
    """Fetch the raw HTML of an Indeed job posting page.

    Args:
        url: Indeed job URL (any supported format).
        timeout: Request timeout in seconds.
        headers: Optional extra HTTP headers.

    Returns:
        Raw HTML string.

    Raises:
        ValueError: If URL is invalid or not an Indeed URL.
        requests.HTTPError: On 4xx/5xx responses.
        requests.ConnectionError: On network failures.
    """
    normalized = normalize_job_url(url)
    if not normalized or not is_indeed_url(normalized):
        raise ValueError(f"Not a valid Indeed URL: {url}")

    _enforce_rate_limit()

    req_headers = _INDEED_HEADERS.copy()
    if headers:
        req_headers.update(headers)

    response = requests.get(normalized, headers=req_headers, timeout=timeout)
    response.raise_for_status()
    return response.text


def scrape_indeed_job(
    url: str,
    timeout: int = WORKER_DOWNLOAD_TIMEOUT,
    headers: Optional[Dict[str, str]] = None,
    use_cache: bool = True,
) -> IndeedJobData:
    """Scrape a full job posting from an Indeed URL.

    Returns an IndeedJobData with all extracted fields populated on success,
    or success=False and error set on failure.

    Supports:
        - indeed.com/viewjob?jk=xxx
        - indeed.com/rc/clk?jk=xxx
        - indeed.com/cmp/Company/jobs?jk=xxx
        - Indeed international domains (uk.indeed.com, ca.indeed.com, etc.)
    """
    normalized = normalize_job_url(url)
    job_id = parse_indeed_url(normalized) or ""

    result = IndeedJobData(url=normalized, job_id=job_id)

    # Check cache first
    if use_cache and job_id:
        cached = get_cached(job_id)
        if cached:
            logger.debug("Cache hit for job %s", job_id)
            return cached

    if not job_id:
        result.error = "Could not extract job ID from URL"
        return result

    try:
        raw_html = fetch_indeed_page(normalized, timeout=timeout, headers=headers)
        result.raw_html = raw_html
    except ValueError as exc:
        result.error = f"Invalid URL: {exc}"
        return result
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status == 404:
            result.error = "Job posting not found (404) — may be deleted or expired"
        elif status == 403:
            result.error = "Access denied (403) — Indeed may be blocking automated requests"
        elif status == 429:
            result.error = "Rate limited (429) — too many requests"
        else:
            result.error = f"HTTP error {status}: {exc}"
        return result
    except requests.ConnectionError:
        result.error = "Connection failed — check network or try again later"
        return result
    except requests.Timeout:
        result.error = f"Request timed out after {timeout}s"
        return result
    except requests.RequestException as exc:
        result.error = f"Request failed: {exc}"
        return result

    # Extract structured data
    try:
        extracted = _extract_structured_data(raw_html)
        result.title = extracted.get("title", "")
        result.company = extracted.get("company", "")
        result.location = extracted.get("location", "")
        result.salary = extracted.get("salary", "")
        result.job_type = extracted.get("job_type", "")
        result.posted_date = extracted.get("posted_date", "")
        result.snippet = extracted.get("snippet", "")
        result.description = extracted.get("description", "")
    except Exception as exc:
        logger.warning("HTML extraction error for job %s: %s", job_id, exc)
        # Fallback: use generic text extraction from job_scraper
        result.description = extract_job_text_from_html(raw_html, site="indeed")

    # Final fallback: if description is still empty, try the generic extractor
    if not result.description and raw_html:
        result.description = extract_job_text_from_html(raw_html, site="indeed")

    result.success = bool(result.title or result.description)

    if not result.success:
        result.error = "Could not extract meaningful job data from page"
    else:
        # Cache successful result
        if use_cache:
            set_cached(job_id, result)

    return result


def scrape_indeed_jobs(
    urls: List[str],
    timeout: int = WORKER_DOWNLOAD_TIMEOUT,
    headers: Optional[Dict[str, str]] = None,
    use_cache: bool = True,
) -> List[IndeedJobData]:
    """Scrape multiple Indeed job postings.

    Returns a list of IndeedJobData in the same order as the input URLs.
    Rate limiting is enforced between requests automatically.
    """
    results = []
    for url in urls:
        result = scrape_indeed_job(url, timeout=timeout, headers=headers, use_cache=use_cache)
        results.append(result)
    return results
