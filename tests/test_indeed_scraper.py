"""Unit tests for backend/indeed_scraper.py — Indeed job description scraper."""

import json
import os
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch, PropertyMock

import requests

from backend.indeed_scraper import (
    IndeedJobData,
    _enforce_rate_limit,
    _extract_salary_from_text,
    _extract_date_from_text,
    _extract_structured_data,
    _extract_text,
    clear_cache,
    fetch_indeed_page,
    get_cached,
    is_indeed_viewjob_url,
    parse_indeed_url,
    scrape_indeed_job,
    scrape_indeed_jobs,
    set_cached,
    _cache,
    _RATE_LIMIT_SECONDS,
)


# ── Fixtures: Sample Indeed HTML ─────────────────

SAMPLE_INDEED_VIEWJOB_HTML = """<!DOCTYPE html>
<html>
<head>
    <title>Senior Backend Engineer - Acme Corp | Indeed.com</title>
    <meta property="og:description" content="Join Acme Corp as a Senior Backend Engineer. Build scalable microservices in Python and Go.">
    <meta name="description" content="Senior Backend Engineer role at Acme Corp in San Francisco, CA.">
</head>
<body>
    <div class="jobsearch-JobInfoHeader">
        <h1 class="jobsearch-JobInfoHeader-title">Senior Backend Engineer</h1>
        <div class="jobsearch-JobInfoHeader-subtitle">
            <div data-testid="inlineHeader-companyName"><a href="/cmp/Acme">Acme Corp</a></div>
            <div data-testid="inlineHeader-companyLocation">San Francisco, CA</div>
            <span class="salary-text">$150,000 - $190,000 per year</span>
            <span class="jobType">Full-time</span>
            <span class="date">Posted 3 days ago</span>
        </div>
    </div>
    <div id="jobDescriptionText">
        <h2>About the Role</h2>
        <p>We are looking for a Senior Backend Engineer to join our growing engineering team. You will work on building and maintaining scalable microservices.</p>
        <h2>Requirements</h2>
        <ul>
            <li>5+ years of backend development experience</li>
            <li>Proficiency in Python, Go, or similar languages</li>
            <li>Experience with AWS cloud services</li>
            <li>Strong understanding of distributed systems</li>
        </ul>
        <h2>Nice to Have</h2>
        <ul>
            <li>Kubernetes experience</li>
            <li>Contributions to open source</li>
        </ul>
        <h2>Benefits</h2>
        <p>Competitive salary, equity, health insurance, 401k matching, unlimited PTO.</p>
    </div>
</body>
</html>"""

SAMPLE_INDEED_MINIMAL_HTML = """<!DOCTYPE html>
<html>
<head><title>Job - Indeed.com</title></head>
<body>
    <h1>Software Developer</h1>
    <div id="jobDescriptionText">
        <p>Build software. Write code. Ship features.</p>
    </div>
</body>
</html>"""

SAMPLE_INDEED_NO_DESC_HTML = """<!DOCTYPE html>
<html>
<head>
    <meta name="description" content="Short description of a job posting at Some Company.">
</head>
<body>
    <h1>Product Manager</h1>
</body>
</html>"""

SAMPLE_INDEED_EXPIRED_HTML = """<!DOCTYPE html>
<html>
<head><title>Indeed</title></head>
<body>
    <div class="jobsearch-JobInfoHeader">
        <h1>This job posting is no longer available</h1>
    </div>
</body>
</html>"""


# ── URL Parsing Tests ────────────────────────────


class TestParseIndeedURL(unittest.TestCase):
    """Test parse_indeed_url for all Indeed URL formats."""

    def test_viewjob_jk_param(self):
        url = "https://www.indeed.com/viewjob?jk=abc123def456"
        self.assertEqual(parse_indeed_url(url), "abc123def456")

    def test_viewjob_jk_with_other_params(self):
        url = "https://www.indeed.com/viewjob?jk=xyz789&from=serp&jk=xyz789"
        self.assertEqual(parse_indeed_url(url), "xyz789")

    def test_rc_clk_jk_param(self):
        url = "https://indeed.com/rc/clk?jk=jobkey999&fcc=abc&sj=vacancy"
        self.assertEqual(parse_indeed_url(url), "jobkey999")

    def test_cmp_jobs_jk_param(self):
        url = "https://www.indeed.com/cmp/Acme-Corp/jobs?jk=cmpjob123"
        self.assertEqual(parse_indeed_url(url), "cmpjob123")

    def test_search_vjk_param(self):
        url = "https://indeed.com/jobs?q=python+developer&vjk=vjk445566"
        self.assertEqual(parse_indeed_url(url), "vjk445566")

    def test_uk_indeed(self):
        url = "https://uk.indeed.com/viewjob?jk=ukjob123"
        self.assertEqual(parse_indeed_url(url), "ukjob123")

    def test_ca_indeed(self):
        url = "https://ca.indeed.com/viewjob?jk=cadj456"
        self.assertEqual(parse_indeed_url(url), "cadj456")

    def test_de_indeed(self):
        url = "https://de.indeed.com/viewjob?jk=dejob789"
        self.assertEqual(parse_indeed_url(url), "dejob789")

    def test_http_scheme(self):
        url = "http://indeed.com/viewjob?jk=httpjob"
        self.assertEqual(parse_indeed_url(url), "httpjob")

    def test_no_jk_returns_none(self):
        url = "https://www.indeed.com/jobs?q=python"
        self.assertIsNone(parse_indeed_url(url))

    def test_non_indeed_url_returns_none(self):
        self.assertIsNone(parse_indeed_url("https://www.linkedin.com/jobs/view/123"))

    def test_empty_string_returns_none(self):
        self.assertIsNone(parse_indeed_url(""))

    def test_none_returns_none(self):
        self.assertIsNone(parse_indeed_url(None))

    def test_whitespace_only_returns_none(self):
        self.assertIsNone(parse_indeed_url("   "))

    def test_malformed_url_returns_none(self):
        self.assertIsNone(parse_indeed_url("not-a-url-at-all"))

    def test_indeed_with_path_param(self):
        url = "https://www.indeed.com/viewjob?jk=abc123&from=indeed&tk=123"
        self.assertEqual(parse_indeed_url(url), "abc123")

    def test_international_tld(self):
        url = "https://www.indeed.co.uk/viewjob?jk=ukjob456"
        self.assertEqual(parse_indeed_url(url), "ukjob456")

    def test_indeed_com_au(self):
        url = "https://au.indeed.com/viewjob?jk=aujob789"
        self.assertEqual(parse_indeed_url(url), "aujob789")


class TestIsIndeedViewjobUrl(unittest.TestCase):
    """Test is_indeed_viewjob_url convenience function."""

    def test_valid_viewjob(self):
        self.assertTrue(is_indeed_viewjob_url("https://www.indeed.com/viewjob?jk=abc123"))

    def test_valid_rc_clk(self):
        self.assertTrue(is_indeed_viewjob_url("https://indeed.com/rc/clk?jk=abc123"))

    def test_invalid_non_indeed(self):
        self.assertFalse(is_indeed_viewjob_url("https://www.linkedin.com/jobs/view/123"))

    def test_invalid_no_jk(self):
        self.assertFalse(is_indeed_viewjob_url("https://www.indeed.com/jobs?q=python"))

    def test_empty(self):
        self.assertFalse(is_indeed_viewjob_url(""))

    def test_none(self):
        self.assertFalse(is_indeed_viewjob_url(None))


# ── HTML Extraction Tests ────────────────────────


class TestExtractStructuredData(unittest.TestCase):
    """Test _extract_structured_data with sample Indeed HTML."""

    def test_full_extraction(self):
        data = _extract_structured_data(SAMPLE_INDEED_VIEWJOB_HTML)
        self.assertEqual(data["title"], "Senior Backend Engineer")
        self.assertEqual(data["company"], "Acme Corp")
        self.assertEqual(data["location"], "San Francisco, CA")
        self.assertIn("150,000", data["salary"])
        self.assertIn("Full-time", data["job_type"])
        self.assertIn("3 days ago", data["posted_date"])
        self.assertIn("Senior Backend Engineer", data["description"])
        self.assertIn("5+ years", data["description"])
        self.assertIn("Kubernetes", data["description"])

    def test_minimal_extraction(self):
        data = _extract_structured_data(SAMPLE_INDEED_MINIMAL_HTML)
        self.assertEqual(data["title"], "Software Developer")
        self.assertIn("Build software", data["description"])

    def test_no_description_meta_fallback(self):
        data = _extract_structured_data(SAMPLE_INDEED_NO_DESC_HTML)
        self.assertEqual(data["title"], "Product Manager")
        self.assertIn("Short description", data["description"])

    def test_empty_html_returns_empty(self):
        data = _extract_structured_data("<html><body></body></html>")
        self.assertEqual(data.get("title", ""), "")
        self.assertEqual(data.get("description", ""), "")

    def test_description_preserves_structure(self):
        """Description should contain meaningful text, not just HTML tags."""
        data = _extract_structured_data(SAMPLE_INDEED_VIEWJOB_HTML)
        desc = data["description"]
        self.assertNotIn("<ul>", desc)
        self.assertNotIn("<li>", desc)
        self.assertNotIn("<h2>", desc)
        self.assertIn("microservices", desc)
        self.assertIn("Benefits", desc)


class TestExtractText(unittest.TestCase):
    """Test _extract_text selector helper."""

    def test_returns_first_match(self):
        from bs4 import BeautifulSoup
        soup = BeautifulSoup("<div class='a'>First</div><div class='b'>Second</div>", "html.parser")
        result = _extract_text(soup, [".b", ".a"])
        self.assertEqual(result, "Second")

    def test_returns_empty_when_no_match(self):
        from bs4 import BeautifulSoup
        soup = BeautifulSoup("<div class='a'>Content</div>", "html.parser")
        result = _extract_text(soup, [".nonexistent", ".missing"])
        self.assertEqual(result, "")

    def test_handles_invalid_selector(self):
        from bs4 import BeautifulSoup
        soup = BeautifulSoup("<div>Content</div>", "html.parser")
        # Invalid CSS selector should not raise
        result = _extract_text(soup, ["[[invalid", "div"])
        self.assertEqual(result, "Content")


class TestExtractSalaryFromText(unittest.TestCase):
    """Test _extract_salary_from_text helper."""

    def test_usd_salary(self):
        self.assertIn("$150,000", _extract_salary_from_text("Salary: $150,000 - $190,000 per year"))

    def test_hourly_rate(self):
        self.assertIn("$25.00", _extract_salary_from_text("Pay: $25.00 - $35.00 per hour"))

    def test_eur_salary(self):
        self.assertIn("€50,000", _extract_salary_from_text("Gehalt: €50,000 pro Jahr"))

    def test_gbp_salary(self):
        self.assertIn("£45,000", _extract_salary_from_text("Salary: £45,000 per annum"))

    def test_no_salary(self):
        self.assertEqual(_extract_salary_from_text("No salary information here"), "")


class TestExtractDateFromText(unittest.TestCase):
    """Test _extract_date_from_text helper."""

    def test_relative_date(self):
        result = _extract_date_from_text("Posted 3 days ago")
        self.assertEqual(result, "Posted 3 days ago")

    def test_absolute_date(self):
        result = _extract_date_from_text("Published January 15, 2025")
        self.assertIn("January 15, 2025", result)

    def test_iso_date(self):
        result = _extract_date_from_text("Date: 2025-06-01")
        self.assertEqual(result, "2025-06-01")

    def test_no_date(self):
        self.assertEqual(_extract_date_from_text("Some other text"), "")


# ── IndeedJobData Tests ─────────────────────────


class TestIndeedJobData(unittest.TestCase):
    """Test IndeedJobData dataclass."""

    def test_default_values(self):
        job = IndeedJobData()
        self.assertEqual(job.url, "")
        self.assertEqual(job.job_id, "")
        self.assertFalse(job.success)
        self.assertIsNone(job.error)

    def test_to_dict_omits_raw_html(self):
        job = IndeedJobData(title="Test", raw_html="<html>big</html>")
        d = job.to_dict()
        self.assertNotIn("raw_html", d)
        self.assertEqual(d["title"], "Test")

    def test_to_dict_includes_all_other_fields(self):
        job = IndeedJobData(
            url="https://example.com",
            job_id="abc",
            title="Engineer",
            company="Co",
            location="NYC",
            description="Desc",
            salary="$100k",
            job_type="Full-time",
            posted_date="Today",
            snippet="Snip",
            success=True,
        )
        d = job.to_dict()
        self.assertEqual(len(d), 12)  # all fields minus raw_html
        for key in ("url", "job_id", "title", "company", "location",
                     "description", "salary", "job_type", "posted_date",
                     "snippet", "success", "error"):
            self.assertIn(key, d)

    def test_description_text_property(self):
        job = IndeedJobData(description="Full description here")
        self.assertEqual(job.description_text, "Full description here")


# ── Caching Tests ────────────────────────────────


class TestCaching(unittest.TestCase):
    """Test in-memory and disk caching."""

    def setUp(self):
        clear_cache()

    def tearDown(self):
        clear_cache()

    def test_set_and_get_cached(self):
        job = IndeedJobData(job_id="test123", title="Test Job")
        set_cached("test123", job)
        cached = get_cached("test123")
        self.assertIsNotNone(cached)
        self.assertEqual(cached.title, "Test Job")

    def test_get_nonexistent_returns_none(self):
        self.assertIsNone(get_cached("nonexistent"))

    def test_clear_cache(self):
        job = IndeedJobData(job_id="test456", title="Job")
        set_cached("test456", job)
        clear_cache()
        self.assertIsNone(get_cached("test456"))

    def test_disk_cache(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            import backend.indeed_scraper as scraper
            old_cache_dir = scraper.CACHE_DIR
            scraper.CACHE_DIR = tmpdir
            try:
                job = IndeedJobData(job_id="disktest", title="Disk Cached Job")
                set_cached("disktest", job)
                # Clear in-memory cache to force disk read
                clear_cache()
                cached = get_cached("disktest")
                self.assertIsNotNone(cached)
                self.assertEqual(cached.title, "Disk Cached Job")
                # Verify file exists
                self.assertTrue(os.path.exists(os.path.join(tmpdir, "disktest.json")))
            finally:
                scraper.CACHE_DIR = old_cache_dir
                clear_cache()

    def test_disk_cache_corrupt_file(self):
        """Corrupt cache file should be ignored gracefully."""
        with tempfile.TemporaryDirectory() as tmpdir:
            import backend.indeed_scraper as scraper
            old_cache_dir = scraper.CACHE_DIR
            scraper.CACHE_DIR = tmpdir
            try:
                corrupt_path = os.path.join(tmpdir, "corrupt.json")
                with open(corrupt_path, "w") as f:
                    f.write("{invalid json!!")
                cached = get_cached("corrupt")
                self.assertIsNone(cached)
            finally:
                scraper.CACHE_DIR = old_cache_dir

    def test_disk_cache_disabled_when_no_dir(self):
        """When CACHE_DIR is None, disk cache is not used."""
        import backend.indeed_scraper as scraper
        old = scraper.CACHE_DIR
        scraper.CACHE_DIR = None
        try:
            job = IndeedJobData(job_id="nodisk", title="No Disk")
            set_cached("nodisk", job)
            # Should still be in memory
            self.assertIsNotNone(get_cached("nodisk"))
        finally:
            scraper.CACHE_DIR = old


# ── Rate Limiting Tests ──────────────────────────


class TestRateLimiting(unittest.TestCase):
    """Test _enforce_rate_limit behavior."""

    @patch("backend.indeed_scraper.time.monotonic")
    @patch("backend.indeed_scraper.time.sleep")
    def test_enforces_delay_between_requests(self, mock_sleep, mock_monotonic):
        import backend.indeed_scraper as scraper
        # _enforce_rate_limit calls time.monotonic() twice:
        #   1) now = time.monotonic()
        #   2) _last_request_time = time.monotonic()
        # Simulate: now = 100.5 (0.5s since last request at 100.0)
        mock_monotonic.side_effect = [100.5, 100.5]
        scraper._last_request_time = 100.0
        _enforce_rate_limit()
        mock_sleep.assert_called_once_with(_RATE_LIMIT_SECONDS - 0.5)

    @patch("backend.indeed_scraper.time.monotonic")
    @patch("backend.indeed_scraper.time.sleep")
    def test_no_delay_when_enough_time_passed(self, mock_sleep, mock_monotonic):
        import backend.indeed_scraper as scraper
        # now = 103.0, last_request_time = 100.0 => elapsed = 3.0 >= 2.0, no sleep
        mock_monotonic.side_effect = [103.0, 103.0]
        scraper._last_request_time = 100.0
        _enforce_rate_limit()
        mock_sleep.assert_not_called()


# ── HTTP Fetching Tests ──────────────────────────


class TestFetchIndeedPage(unittest.TestCase):
    """Test fetch_indeed_page with mocked HTTP responses."""

    @patch("backend.indeed_scraper.requests.get")
    @patch("backend.indeed_scraper._enforce_rate_limit")
    def test_success(self, mock_rate, mock_get):
        mock_resp = MagicMock()
        mock_resp.text = "<html><body>Job Page</body></html>"
        mock_get.return_value = mock_resp

        result = fetch_indeed_page("https://www.indeed.com/viewjob?jk=abc123")
        self.assertEqual(result, "<html><body>Job Page</body></html>")
        mock_get.assert_called_once()
        mock_rate.assert_called_once()

    @patch("backend.indeed_scraper.requests.get")
    @patch("backend.indeed_scraper._enforce_rate_limit")
    def test_rate_limit_called(self, mock_rate, mock_get):
        mock_resp = MagicMock()
        mock_resp.text = "<html></html>"
        mock_get.return_value = mock_resp

        fetch_indeed_page("https://www.indeed.com/viewjob?jk=abc123")
        self.assertEqual(mock_rate.call_count, 1)

    def test_non_indeed_url_raises_value_error(self):
        with self.assertRaises(ValueError):
            fetch_indeed_page("https://www.linkedin.com/jobs/view/123")

    def test_empty_url_raises_value_error(self):
        with self.assertRaises(ValueError):
            fetch_indeed_page("")

    @patch("backend.indeed_scraper.requests.get")
    @patch("backend.indeed_scraper._enforce_rate_limit")
    def test_http_404(self, mock_rate, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_get.return_value = mock_resp
        mock_resp.raise_for_status.side_effect = requests.HTTPError(response=mock_resp)

        with self.assertRaises(requests.HTTPError):
            fetch_indeed_page("https://www.indeed.com/viewjob?jk=deleted123")

    @patch("backend.indeed_scraper.requests.get")
    @patch("backend.indeed_scraper._enforce_rate_limit")
    def test_connection_error(self, mock_rate, mock_get):
        mock_get.side_effect = requests.ConnectionError("DNS resolution failed")

        with self.assertRaises(requests.ConnectionError):
            fetch_indeed_page("https://www.indeed.com/viewjob?jk=netfail")

    @patch("backend.indeed_scraper.requests.get")
    @patch("backend.indeed_scraper._enforce_rate_limit")
    def test_timeout(self, mock_rate, mock_get):
        mock_get.side_effect = requests.Timeout("Connection timed out")

        with self.assertRaises(requests.Timeout):
            fetch_indeed_page("https://www.indeed.com/viewjob?jk=timeout")


# ── Scrape Indeed Job Integration Tests ──────────


class TestScrapeIndeedJob(unittest.TestCase):
    """Test scrape_indeed_job end-to-end with mocked HTTP."""

    def setUp(self):
        clear_cache()

    def tearDown(self):
        clear_cache()

    @patch("backend.indeed_scraper.fetch_indeed_page")
    def test_full_scrape_success(self, mock_fetch):
        mock_fetch.return_value = SAMPLE_INDEED_VIEWJOB_HTML

        result = scrape_indeed_job("https://www.indeed.com/viewjob?jk=fulljob123")

        self.assertTrue(result.success)
        self.assertEqual(result.job_id, "fulljob123")
        self.assertEqual(result.title, "Senior Backend Engineer")
        self.assertEqual(result.company, "Acme Corp")
        self.assertEqual(result.location, "San Francisco, CA")
        self.assertIn("150,000", result.salary)
        self.assertIn("Full-time", result.job_type)
        self.assertIn("3 days ago", result.posted_date)
        self.assertIn("microservices", result.description)
        self.assertIsNone(result.error)

    @patch("backend.indeed_scraper.fetch_indeed_page")
    def test_scrape_minimal_page(self, mock_fetch):
        mock_fetch.return_value = SAMPLE_INDEED_MINIMAL_HTML

        result = scrape_indeed_job("https://www.indeed.com/viewjob?jk=minimal123")

        self.assertTrue(result.success)
        self.assertEqual(result.title, "Software Developer")
        self.assertIn("Build software", result.description)

    @patch("backend.indeed_scraper.fetch_indeed_page")
    def test_scrape_uses_cache(self, mock_fetch):
        mock_fetch.return_value = SAMPLE_INDEED_VIEWJOB_HTML

        # First call hits HTTP
        result1 = scrape_indeed_job("https://www.indeed.com/viewjob?jk=cachetest")
        self.assertEqual(mock_fetch.call_count, 1)

        # Second call should use cache
        result2 = scrape_indeed_job("https://www.indeed.com/viewjob?jk=cachetest")
        self.assertEqual(mock_fetch.call_count, 1)  # still 1
        self.assertEqual(result2.title, result1.title)

    @patch("backend.indeed_scraper.fetch_indeed_page")
    def test_scrape_bypasses_cache(self, mock_fetch):
        mock_fetch.return_value = SAMPLE_INDEED_VIEWJOB_HTML

        scrape_indeed_job("https://www.indeed.com/viewjob?jk=nocache", use_cache=True)
        scrape_indeed_job("https://www.indeed.com/viewjob?jk=nocache", use_cache=False)
        self.assertEqual(mock_fetch.call_count, 2)

    @patch("backend.indeed_scraper.fetch_indeed_page")
    def test_invalid_url_returns_error(self, mock_fetch):
        result = scrape_indeed_job("https://www.linkedin.com/jobs/view/123")
        self.assertFalse(result.success)
        self.assertIn("job ID", result.error)

    @patch("backend.indeed_scraper.fetch_indeed_page")
    def test_http_404_returns_error(self, mock_fetch):
        mock_fetch.side_effect = requests.HTTPError(response=MagicMock(status_code=404))

        result = scrape_indeed_job("https://www.indeed.com/viewjob?jk=deleted")
        self.assertFalse(result.success)
        self.assertIn("404", result.error)
        self.assertIn("deleted", result.error.lower())

    @patch("backend.indeed_scraper.fetch_indeed_page")
    def test_http_403_returns_error(self, mock_fetch):
        mock_fetch.side_effect = requests.HTTPError(response=MagicMock(status_code=403))

        result = scrape_indeed_job("https://www.indeed.com/viewjob?jk=blocked")
        self.assertFalse(result.success)
        self.assertIn("403", result.error)

    @patch("backend.indeed_scraper.fetch_indeed_page")
    def test_http_429_returns_error(self, mock_fetch):
        mock_fetch.side_effect = requests.HTTPError(response=MagicMock(status_code=429))

        result = scrape_indeed_job("https://www.indeed.com/viewjob?jk=ratelimited")
        self.assertFalse(result.success)
        self.assertIn("429", result.error)

    @patch("backend.indeed_scraper.fetch_indeed_page")
    def test_connection_error_returns_error(self, mock_fetch):
        mock_fetch.side_effect = requests.ConnectionError("Network unreachable")

        result = scrape_indeed_job("https://www.indeed.com/viewjob?jk=netdown")
        self.assertFalse(result.success)
        self.assertIn("Connection failed", result.error)

    @patch("backend.indeed_scraper.fetch_indeed_page")
    def test_timeout_returns_error(self, mock_fetch):
        mock_fetch.side_effect = requests.Timeout("Timed out")

        result = scrape_indeed_job("https://www.indeed.com/viewjob?jk=slowpage")
        self.assertFalse(result.success)
        self.assertIn("timed out", result.error.lower())

    @patch("backend.indeed_scraper.fetch_indeed_page")
    def test_empty_page_fallback(self, mock_fetch):
        mock_fetch.return_value = "<html><body><h1>Nothing here</h1></body></html>"

        result = scrape_indeed_job("https://www.indeed.com/viewjob?jk=empty")
        # Should not crash, even if extraction yields nothing
        self.assertIsInstance(result, IndeedJobData)


class TestScrapeIndeedJobs(unittest.TestCase):
    """Test batch scraping with scrape_indeed_jobs."""

    def setUp(self):
        clear_cache()

    def tearDown(self):
        clear_cache()

    @patch("backend.indeed_scraper.fetch_indeed_page")
    def test_batch_scrape(self, mock_fetch):
        mock_fetch.return_value = SAMPLE_INDEED_VIEWJOB_HTML

        urls = [
            "https://www.indeed.com/viewjob?jk=job1",
            "https://www.indeed.com/viewjob?jk=job2",
        ]
        results = scrape_indeed_jobs(urls)

        self.assertEqual(len(results), 2)
        self.assertTrue(results[0].success)
        self.assertTrue(results[1].success)
        self.assertEqual(results[0].job_id, "job1")
        self.assertEqual(results[1].job_id, "job2")

    def test_batch_scrape_empty_list(self):
        results = scrape_indeed_jobs([])
        self.assertEqual(results, [])


# ── Integration: scrape_and_extract consistency ──


class TestScrapeIndeedJobConsistency(unittest.TestCase):
    """Verify scrape_indeed_job output matches expected IndeedJobData contract."""

    @patch("backend.indeed_scraper.fetch_indeed_page")
    def test_output_is_valid_dataclass(self, mock_fetch):
        mock_fetch.return_value = SAMPLE_INDEED_VIEWJOB_HTML
        result = scrape_indeed_job("https://www.indeed.com/viewjob?jk=contract1")
        self.assertIsInstance(result, IndeedJobData)

    @patch("backend.indeed_scraper.fetch_indeed_page")
    def test_to_dict_serializable(self, mock_fetch):
        mock_fetch.return_value = SAMPLE_INDEED_VIEWJOB_HTML
        result = scrape_indeed_job("https://www.indeed.com/viewjob?jk=serial1")
        d = result.to_dict()
        # Should be JSON-serializable
        json_str = json.dumps(d)
        self.assertIsInstance(json_str, str)
        self.assertIn("Senior Backend Engineer", json_str)


if __name__ == "__main__":
    unittest.main()
