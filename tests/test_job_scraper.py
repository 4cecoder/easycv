"""Unit tests for backend/job_scraper.py URL detection and fetching helpers."""

import unittest
from unittest.mock import MagicMock, patch

import requests

from backend.job_scraper import (
    clean_html_text,
    detect_job_site,
    extract_job_id,
    extract_job_text_from_html,
    fetch_job_html,
    fetch_job_text,
    is_glassdoor_url,
    is_indeed_url,
    is_linkedin_url,
    is_supported_job_url,
    is_ziprecruiter_url,
    normalize_job_url,
    scrape_job_posting,
)


class TestJobScraperURLDetection(unittest.TestCase):
    def test_normalize_job_url(self):
        self.assertEqual(normalize_job_url(""), "")
        self.assertEqual(normalize_job_url(None), "")
        self.assertEqual(normalize_job_url("   "), "")
        self.assertEqual(normalize_job_url("indeed.com/viewjob?jk=123"), "https://indeed.com/viewjob?jk=123")
        self.assertEqual(normalize_job_url("  https://linkedin.com/jobs/view/123  "), "https://linkedin.com/jobs/view/123")

    def test_is_indeed_url(self):
        valid_urls = [
            "https://www.indeed.com/viewjob?jk=abcdef123456",
            "http://indeed.com/rc/clk?jk=987654",
            "https://uk.indeed.com/cmp/Company/jobs?jk=112233",
            "ca.indeed.com/jobs?q=developer&vjk=445566",
        ]
        for url in valid_urls:
            with self.subTest(url=url):
                self.assertTrue(is_indeed_url(url))

        invalid_urls = [
            "https://notindeed.com/viewjob",
            "https://indeed.fakesite.com",
            "",
            None,
        ]
        for url in invalid_urls:
            with self.subTest(url=url):
                self.assertFalse(is_indeed_url(url))

    def test_is_linkedin_url(self):
        valid_urls = [
            "https://www.linkedin.com/jobs/view/3920192019/",
            "https://linkedin.com/jobs/search/?currentJobId=987654321",
            "https://ca.linkedin.com/jobs/view/software-engineer-123456",
            "https://lnkd.in/abcxyz",
        ]
        for url in valid_urls:
            with self.subTest(url=url):
                self.assertTrue(is_linkedin_url(url))

        invalid_urls = [
            "https://linkedin.otherdomain.org",
            "https://fake-linkedin.com",
            "",
            None,
        ]
        for url in invalid_urls:
            with self.subTest(url=url):
                self.assertFalse(is_linkedin_url(url))

    def test_is_glassdoor_url(self):
        valid_urls = [
            "https://www.glassdoor.com/job-listing/software-engineer-company-JV_IC123.htm?jl=1008912345",
            "https://glassdoor.co.uk/Job/jobs.htm?keyword=engineer&jl=998877",
            "https://www.glassdoor.com/partner/jobListing.htm?jobListingId=554433",
            "glassdoor.ca/job-listing/_jl_123456.htm",
        ]
        for url in valid_urls:
            with self.subTest(url=url):
                self.assertTrue(is_glassdoor_url(url))

        invalid_urls = [
            "https://glassdoor.unrelated.com",
            "https://fakeglassdoor.com",
            "",
            None,
        ]
        for url in invalid_urls:
            with self.subTest(url=url):
                self.assertFalse(is_glassdoor_url(url))

    def test_is_ziprecruiter_url(self):
        valid_urls = [
            "https://www.ziprecruiter.com/jobs/company-123/engineer-abc12",
            "https://ziprecruiter.co.uk/c/Company/Job/Engineer?job_id=98765",
            "https://www.ziprecruiter.com/job/12345678",
        ]
        for url in valid_urls:
            with self.subTest(url=url):
                self.assertTrue(is_ziprecruiter_url(url))

        invalid_urls = [
            "https://ziprecruiter.malicious.com",
            "https://fakeziprecruiter.com",
            "",
            None,
        ]
        for url in invalid_urls:
            with self.subTest(url=url):
                self.assertFalse(is_ziprecruiter_url(url))

    def test_detect_job_site(self):
        self.assertEqual(detect_job_site("https://www.indeed.com/viewjob?jk=123"), "indeed")
        self.assertEqual(detect_job_site("https://www.linkedin.com/jobs/view/123"), "linkedin")
        self.assertEqual(detect_job_site("https://www.glassdoor.com/Job/jobs.htm?jl=123"), "glassdoor")
        self.assertEqual(detect_job_site("https://www.ziprecruiter.com/job/123"), "ziprecruiter")
        self.assertIsNone(detect_job_site("https://google.com"))
        self.assertIsNone(detect_job_site(None))

    def test_is_supported_job_url(self):
        self.assertTrue(is_supported_job_url("https://www.indeed.com/viewjob?jk=123"))
        self.assertTrue(is_supported_job_url("https://www.linkedin.com/jobs/view/123"))
        self.assertTrue(is_supported_job_url("https://www.glassdoor.com/Job/jobs.htm?jl=123"))
        self.assertTrue(is_supported_job_url("https://www.ziprecruiter.com/job/123"))
        self.assertFalse(is_supported_job_url("https://github.com"))
        self.assertFalse(is_supported_job_url(""))

    def test_extract_job_id(self):
        # Indeed
        self.assertEqual(extract_job_id("https://www.indeed.com/viewjob?jk=abc123def"), "abc123def")
        self.assertEqual(extract_job_id("https://indeed.com/jobs?q=dev&vjk=vjk999"), "vjk999")

        # LinkedIn
        self.assertEqual(extract_job_id("https://www.linkedin.com/jobs/view/3920192019/"), "3920192019")
        self.assertEqual(extract_job_id("https://www.linkedin.com/jobs/view/senior-python-dev-3920192019"), "3920192019")
        self.assertEqual(extract_job_id("https://linkedin.com/jobs/search/?currentJobId=887766"), "887766")

        # Glassdoor
        self.assertEqual(extract_job_id("https://www.glassdoor.com/Job/jobs.htm?jl=1008912345"), "1008912345")
        self.assertEqual(extract_job_id("https://www.glassdoor.com/partner/jobListing.htm?jobListingId=776655"), "776655")
        self.assertEqual(extract_job_id("https://www.glassdoor.com/job-listing/_jl_998877.htm"), "998877")

        # ZipRecruiter
        self.assertEqual(extract_job_id("https://www.ziprecruiter.com/c/Co/Job/Dev?job_id=zip123"), "zip123")
        self.assertEqual(extract_job_id("https://www.ziprecruiter.com/job/jobid456"), "jobid456")

        # Non supported or missing ID
        self.assertIsNone(extract_job_id("https://google.com"))
        self.assertIsNone(extract_job_id(None))


class TestJobScraperHTMLParsing(unittest.TestCase):
    def test_clean_html_text(self):
        raw_html = """
        <html>
            <head><style>body { color: red; }</style></head>
            <body>
                <script>console.log('test');</script>
                <h1>Senior Backend Engineer</h1>
                <p>We are seeking a Python developer &amp; system architect.</p>
                <ul>
                    <li>5+ years Python</li>
                    <li>Experience with AWS &lt;Cloud&gt;</li>
                </ul>
            </body>
        </html>
        """
        cleaned = clean_html_text(raw_html)
        self.assertNotIn("console.log", cleaned)
        self.assertNotIn("color: red", cleaned)
        self.assertIn("Senior Backend Engineer", cleaned)
        self.assertIn("Python developer & system architect.", cleaned)
        self.assertIn("Experience with AWS <Cloud>", cleaned)

    def test_extract_job_text_from_html_site_container(self):
        indeed_html = """
        <div id="jobDescriptionText">
            <h2>Indeed Job Position</h2>
            <p>Join our core backend engineering team building scalable services in Python.</p>
        </div>
        """
        extracted = extract_job_text_from_html(indeed_html, site="indeed")
        self.assertIn("Indeed Job Position", extracted)
        self.assertIn("Join our core backend engineering team", extracted)

    def test_extract_job_text_from_html_meta_fallback(self):
        meta_html = """
        <html>
            <head>
                <meta property="og:description" content="Great job opportunity for Senior Python Engineer at Tech Co.">
            </head>
            <body>Short body content</body>
        </html>
        """
        extracted = extract_job_text_from_html(meta_html)
        self.assertIn("Great job opportunity for Senior Python Engineer", extracted)


class TestJobScraperHTTPFetching(unittest.TestCase):
    @patch("backend.job_scraper.requests.get")
    def test_fetch_job_html_success(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.text = "<html><body>Job description text</body></html>"
        mock_get.return_value = mock_resp

        result = fetch_job_html("https://www.indeed.com/viewjob?jk=123")
        self.assertIn("Job description text", result)
        mock_get.assert_called_once()

    @patch("backend.job_scraper.requests.get")
    def test_fetch_job_text_success(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.text = "<div id='jobDescriptionText'><p>Awesome Software Engineer Role</p></div>"
        mock_get.return_value = mock_resp

        text = fetch_job_text("https://www.indeed.com/viewjob?jk=123")
        self.assertIn("Awesome Software Engineer Role", text)

    @patch("backend.job_scraper.requests.get")
    def test_scrape_job_posting_success(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.text = "<div id='jobDescriptionText'><p>Full job text details here.</p></div>"
        mock_get.return_value = mock_resp

        res = scrape_job_posting("https://www.indeed.com/viewjob?jk=abc12345")
        self.assertTrue(res["success"])
        self.assertEqual(res["site"], "indeed")
        self.assertEqual(res["job_id"], "abc12345")
        self.assertIn("Full job text details here", res["text"])
        self.assertIsNone(res["error"])

    @patch("backend.job_scraper.requests.get")
    def test_scrape_job_posting_failure(self, mock_get):
        mock_get.side_effect = requests.RequestException("404 Client Error: Not Found")

        res = scrape_job_posting("https://www.linkedin.com/jobs/view/99999999/")
        self.assertFalse(res["success"])
        self.assertEqual(res["site"], "linkedin")
        self.assertEqual(res["job_id"], "99999999")
        self.assertIn("404 Client Error", res["error"])


if __name__ == "__main__":
    unittest.main()
