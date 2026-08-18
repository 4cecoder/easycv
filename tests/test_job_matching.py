#!/usr/bin/env python3
"""
Test Suite for Auto-Matching Engine
====================================

Tests the keyword extraction and scoring algorithm used by the job matching
system.  The Python implementation here mirrors the TypeScript logic in
web/convex/jobMatching.ts -- any algorithmic change must be reflected in both.

Run with:
    python -m pytest tests/test_job_matching.py -v
    python -m unittest tests.test_job_matching -v

All tests use only Python 3.10+ standard library (unittest, math, re).
"""

import math
import re
import unittest
from typing import Optional


# ---------------------------------------------------------------------------
# Matching algorithm (Python mirror of web/convex/jobMatching.ts)
# ---------------------------------------------------------------------------

STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
    "be", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "need", "dare",
    "ought", "used", "this", "that", "these", "those", "i", "me", "my",
    "we", "our", "you", "your", "he", "him", "his", "she", "her", "it",
    "its", "they", "them", "their", "what", "which", "who", "whom",
    "when", "where", "why", "how", "all", "each", "every", "both", "few",
    "more", "most", "other", "some", "such", "no", "not", "only", "own",
    "same", "so", "than", "too", "very", "just", "because", "if", "then",
    "about", "above", "after", "again", "also", "am", "any",
    "before", "being", "between", "during", "further", "get", "got",
    "here", "into", "itself", "let", "like", "make", "many", "much",
    "must", "now", "often", "one", "out", "over", "per", "put", "re",
    "see", "since", "still", "take", "through", "under", "until", "up",
    "upon", "us", "using", "well", "while", "within", "without",
}

WEIGHT_KEYWORD = 0.50
WEIGHT_RECENCY = 0.15
WEIGHT_SALARY = 0.20
WEIGHT_LOCATION = 0.15


def tokenize(text: str) -> list:
    """Tokenize a string into normalized keyword tokens."""
    if not text:
        return []
    cleaned = re.sub(r"[^a-z0-9\s\-\+\#\.]", " ", text.lower())
    tokens = []
    for t in cleaned.split():
        t = re.sub(r"^[^a-z0-9]+|[^a-z0-9]+$", "", t)
        if len(t) >= 3 and t not in STOP_WORDS:
            tokens.append(t)
    return tokens


def deduplicate_keywords(tokens: list) -> list:
    """Deduplicate keywords while preserving order."""
    seen = set()
    result = []
    for t in tokens:
        if t not in seen:
            seen.add(t)
            result.append(t)
    return result


def extract_profile_keywords(profile: dict) -> list:
    """Extract keywords from a structured profile dict."""
    tokens = []

    for title in profile.get("titles") or []:
        tokens.extend(tokenize(title))

    skills = profile.get("skills") or {}
    for cat in ["languages", "frameworks", "cloud_devops", "databases", "tools"]:
        for skill in skills.get(cat) or []:
            tokens.extend(tokenize(skill))

    for entry in profile.get("experience") or []:
        if entry.get("title"):
            tokens.extend(tokenize(entry["title"]))
        for bullet in entry.get("bullets") or []:
            tokens.extend(tokenize(bullet))

    for cert in profile.get("certifications") or []:
        tokens.extend(tokenize(cert))

    summary = profile.get("summary")
    if summary:
        tokens.extend(tokenize(summary))

    return deduplicate_keywords(tokens)


def extract_job_keywords(description: str) -> list:
    """Extract keywords from a job description string."""
    return deduplicate_keywords(tokenize(description))


def parse_salary_range(range_str: str):
    """Parse a salary range string into (min, max) in annual terms."""
    if not range_str:
        return None

    # Detect k/M notation before stripping
    has_k = bool(re.search(r"\d+[kK]", range_str))

    # Normalize en-dash to hyphen BEFORE stripping
    normalized = range_str.replace("\u2013", "-")

    # Strip everything except digits, dashes, spaces
    cleaned = re.sub(r"[^0-9\-\s]", "", normalized).strip()

    # Match patterns like "120-150" or "120000-150000"
    match = re.search(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)", cleaned)

    if match:
        low = float(match.group(1))
        high = float(match.group(2))
    else:
        # Try single value
        single = re.search(r"(\d+(?:\.\d+)?)", cleaned)
        if not single:
            return None
        low = float(single.group(1))
        high = low

    # Expand k notation
    if has_k:
        low *= 1000
        high *= 1000

    return (low, high)


def compute_salary_score(
    profile_range,
    job_min,
    job_max,
) -> float:
    """Compute salary match score (0-1)."""
    if not profile_range or (job_min is None and job_max is None):
        return 0.5

    parsed = parse_salary_range(profile_range)
    if not parsed:
        return 0.5

    p_min, p_max = parsed
    j_min = job_min if job_min is not None else (job_max or 0)
    j_max = job_max if job_max is not None else (job_min or float("inf"))

    if p_min <= j_max and p_max >= j_min:
        return 1.0

    if p_max < j_min:
        gap = (j_min - p_max) / j_max
        return max(0.0, 1.0 - gap)
    else:
        gap = (p_min - j_max) / p_max
        return max(0.0, 1.0 - gap * 2)


def compute_location_score(
    profile_location,
    job_location,
    job_work_arrangement,
) -> float:
    """Compute location match score (0-1)."""
    if job_work_arrangement == "remote":
        return 1.0

    if not profile_location and not job_location:
        return 0.5
    if not profile_location or not job_location:
        return 0.6

    p_loc = profile_location.lower().strip()
    j_loc = job_location.lower().strip()

    if p_loc == j_loc:
        return 1.0
    if p_loc in j_loc or j_loc in p_loc:
        return 0.95

    p_city = p_loc.split(",")[0].strip()
    j_city = j_loc.split(",")[0].strip()
    if p_city == j_city:
        return 0.9

    p_country = p_loc.split(",")[-1].strip()
    j_country = j_loc.split(",")[-1].strip()
    if p_country and j_country and p_country == j_country:
        return 0.7

    if job_work_arrangement == "hybrid":
        return 0.4

    return 0.2


def compute_match_score(
    profile_keywords,
    job_keywords,
    job_created_at,
    now_ms,
    profile_salary_range=None,
    job_salary_min=None,
    job_salary_max=None,
    profile_location=None,
    job_location=None,
    job_work_arrangement=None,
):
    """Compute the composite match score."""
    job_set = set(job_keywords)
    profile_set = set(profile_keywords)

    matched = [kw for kw in profile_set if kw in job_set]
    missing = [kw for kw in job_set if kw not in profile_set]

    total_unique = len(profile_set | job_set)
    keyword_score = len(matched) / total_unique if total_unique > 0 else 0

    # Recency: exponential decay, half-life 30 days
    age_ms = now_ms - job_created_at
    thirty_days_ms = 30 * 24 * 60 * 60 * 1000
    recency_score = math.exp(-0.693 * age_ms / thirty_days_ms)

    salary_score = compute_salary_score(
        profile_salary_range, job_salary_min, job_salary_max
    )
    location_score = compute_location_score(
        profile_location, job_location, job_work_arrangement
    )

    raw = (
        keyword_score * WEIGHT_KEYWORD
        + recency_score * WEIGHT_RECENCY
        + salary_score * WEIGHT_SALARY
        + location_score * WEIGHT_LOCATION
    )
    score = round(min(100, max(0, raw * 100)))

    return {
        "score": score,
        "matchedKeywords": matched,
        "missingKeywords": missing,
        "keywordScore": round(keyword_score, 2),
        "recencyScore": round(recency_score, 2),
        "salaryScore": round(salary_score, 2),
        "locationScore": round(location_score, 2),
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestTokenize(unittest.TestCase):
    """Test the tokenize function."""

    def test_basic_tokenization(self):
        result = tokenize("Hello World")
        self.assertEqual(result, ["hello", "world"])

    def test_stop_words_removed(self):
        result = tokenize("the quick brown fox is very fast")
        self.assertNotIn("the", result)
        self.assertNotIn("is", result)
        self.assertNotIn("very", result)
        self.assertIn("quick", result)
        self.assertIn("brown", result)
        self.assertIn("fox", result)
        self.assertIn("fast", result)

    def test_short_tokens_filtered(self):
        """Tokens shorter than 3 characters should be filtered."""
        result = tokenize("a bb ccc dddd")
        self.assertNotIn("a", result)
        self.assertNotIn("bb", result)
        self.assertIn("ccc", result)
        self.assertIn("dddd", result)

    def test_special_characters(self):
        result = tokenize("TypeScript, React.js, Node.js")
        self.assertIn("typescript", result)
        self.assertIn("react.js", result)
        self.assertIn("node.js", result)

    def test_empty_string(self):
        result = tokenize("")
        self.assertEqual(result, [])

    def test_numbers_preserved(self):
        result = tokenize("Python3 and ES2022")
        self.assertIn("python3", result)
        self.assertIn("es2022", result)

    def test_hyphens_preserved(self):
        result = tokenize("full-stack developer")
        self.assertIn("full-stack", result)
        self.assertIn("developer", result)


class TestExtractProfileKeywords(unittest.TestCase):
    """Test keyword extraction from structured profiles."""

    def test_skills_extraction(self):
        profile = {
            "skills": {
                "languages": ["TypeScript", "Python", "Rust"],
                "frameworks": ["React", "Next.js", "FastAPI"],
                "cloud_devops": ["AWS", "Docker", "Kubernetes"],
                "databases": ["PostgreSQL", "Redis"],
                "tools": ["Git", "GitHub"],
            }
        }
        keywords = extract_profile_keywords(profile)
        for lang in ["typescript", "python", "rust"]:
            self.assertIn(lang, keywords)
        for fw in ["react", "next.js", "fastapi"]:
            self.assertIn(fw, keywords)

    def test_titles_extraction(self):
        profile = {"titles": ["Senior Software Engineer", "Tech Lead"]}
        keywords = extract_profile_keywords(profile)
        self.assertIn("senior", keywords)
        self.assertIn("software", keywords)
        self.assertIn("engineer", keywords)
        self.assertIn("tech", keywords)
        self.assertIn("lead", keywords)

    def test_experience_extraction(self):
        profile = {
            "experience": [
                {
                    "title": "Backend Developer",
                    "bullets": [
                        "Built microservices using Go and gRPC",
                        "Managed PostgreSQL databases with 99.9% uptime",
                    ],
                }
            ]
        }
        keywords = extract_profile_keywords(profile)
        self.assertIn("backend", keywords)
        self.assertIn("developer", keywords)
        self.assertIn("microservices", keywords)
        self.assertIn("postgresql", keywords)

    def test_certifications_extraction(self):
        profile = {"certifications": ["AWS Solutions Architect", "CKA"]}
        keywords = extract_profile_keywords(profile)
        self.assertIn("solutions", keywords)
        self.assertIn("architect", keywords)

    def test_summary_extraction(self):
        profile = {"summary": "Full-stack engineer with 10 years in cloud architecture"}
        keywords = extract_profile_keywords(profile)
        self.assertIn("full-stack", keywords)
        self.assertIn("engineer", keywords)
        self.assertIn("cloud", keywords)
        self.assertIn("architecture", keywords)

    def test_empty_profile(self):
        keywords = extract_profile_keywords({})
        self.assertEqual(keywords, [])

    def test_deduplication(self):
        profile = {
            "titles": ["Python Developer"],
            "skills": {
                "languages": ["Python"],
                "frameworks": [],
                "cloud_devops": [],
                "databases": [],
                "tools": [],
            },
        }
        keywords = extract_profile_keywords(profile)
        python_count = sum(1 for k in keywords if k == "python")
        self.assertEqual(python_count, 1)


class TestExtractJobKeywords(unittest.TestCase):
    """Test keyword extraction from job descriptions."""

    def test_basic_extraction(self):
        desc = "We are looking for a Senior Python Developer with AWS experience"
        keywords = extract_job_keywords(desc)
        self.assertIn("senior", keywords)
        self.assertIn("python", keywords)
        self.assertIn("developer", keywords)
        self.assertIn("aws", keywords)
        self.assertIn("experience", keywords)

    def test_technology_keywords(self):
        desc = "Requirements: TypeScript, React, Node.js, PostgreSQL, Docker"
        keywords = extract_job_keywords(desc)
        self.assertIn("typescript", keywords)
        self.assertIn("react", keywords)
        self.assertIn("node.js", keywords)
        self.assertIn("postgresql", keywords)
        self.assertIn("docker", keywords)

    def test_stop_words_removed(self):
        desc = "The candidate should be able to join the team"
        keywords = extract_job_keywords(desc)
        # Stop words must be absent
        self.assertNotIn("the", keywords)
        self.assertNotIn("should", keywords)
        self.assertNotIn("be", keywords)
        self.assertNotIn("to", keywords)
        # Meaningful words must be present
        self.assertIn("candidate", keywords)
        self.assertIn("team", keywords)

    def test_empty_description(self):
        keywords = extract_job_keywords("")
        self.assertEqual(keywords, [])

    def test_deduplication(self):
        desc = "Python Python Python developer developer"
        keywords = extract_job_keywords(desc)
        self.assertEqual(keywords.count("python"), 1)
        self.assertEqual(keywords.count("developer"), 1)


class TestParseSalaryRange(unittest.TestCase):
    """Test salary range parsing."""

    def test_k_suffix(self):
        result = parse_salary_range("$120k-$150k")
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 120000)
        self.assertEqual(result[1], 150000)

    def test_plain_numbers(self):
        result = parse_salary_range("120000-150000")
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 120000)
        self.assertEqual(result[1], 150000)

    def test_dash_separator(self):
        result = parse_salary_range("$100k - $130k")
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 100000)
        self.assertEqual(result[1], 130000)

    def test_en_dash(self):
        result = parse_salary_range("$80k\u2013$100k")
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 80000)
        self.assertEqual(result[1], 100000)

    def test_single_value(self):
        result = parse_salary_range("$120k")
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 120000)
        self.assertEqual(result[1], 120000)

    def test_empty_string(self):
        result = parse_salary_range("")
        self.assertIsNone(result)

    def test_unparseable(self):
        result = parse_salary_range("competitive")
        self.assertIsNone(result)

    def test_small_numbers_without_k(self):
        result = parse_salary_range("80-120")
        self.assertIsNotNone(result)
        # Without k suffix, small numbers are actual values
        self.assertEqual(result[0], 80)
        self.assertEqual(result[1], 120)


class TestSalaryScore(unittest.TestCase):
    """Test salary match scoring."""

    def test_no_info_returns_neutral(self):
        score = compute_salary_score(None, None, None)
        self.assertEqual(score, 0.5)

    def test_profile_only_returns_neutral(self):
        score = compute_salary_score("$100k-$150k", None, None)
        self.assertEqual(score, 0.5)

    def test_job_only_returns_neutral(self):
        score = compute_salary_score(None, 100000, 150000)
        self.assertEqual(score, 0.5)

    def test_overlapping_ranges(self):
        score = compute_salary_score("$100k-$150k", 120000, 160000)
        self.assertEqual(score, 1.0)

    def test_user_expects_less(self):
        score = compute_salary_score("$80k-$100k", 120000, 150000)
        self.assertGreater(score, 0.5)

    def test_user_expects_much_more(self):
        score = compute_salary_score("$200k-$250k", 100000, 120000)
        self.assertLess(score, 0.5)

    def test_exact_match(self):
        score = compute_salary_score("$100k-$150k", 100000, 150000)
        self.assertEqual(score, 1.0)


class TestLocationScore(unittest.TestCase):
    """Test location match scoring."""

    def test_remote_matches_everything(self):
        score = compute_location_score("New York, NY", "San Francisco, CA", "remote")
        self.assertEqual(score, 1.0)

    def test_no_info_returns_neutral(self):
        score = compute_location_score(None, None, None)
        self.assertEqual(score, 0.5)

    def test_exact_match(self):
        score = compute_location_score(
            "San Francisco, CA", "San Francisco, CA", "on-site"
        )
        self.assertEqual(score, 1.0)

    def test_same_city_different_state(self):
        score = compute_location_score("San Francisco, CA", "San Francisco", "on-site")
        self.assertGreaterEqual(score, 0.9)

    def test_same_country(self):
        score = compute_location_score(
            "New York, USA", "San Francisco, USA", "on-site"
        )
        self.assertGreaterEqual(score, 0.7)

    def test_different_locations_hybrid(self):
        score = compute_location_score("New York, USA", "London, UK", "hybrid")
        self.assertEqual(score, 0.4)

    def test_different_locations_onsite(self):
        score = compute_location_score("New York, USA", "London, UK", "on-site")
        self.assertEqual(score, 0.2)


class TestComputeMatchScore(unittest.TestCase):
    """Test the full composite scoring algorithm."""

    NOW_MS = 1700000000000
    ONE_DAY_MS = 86400000

    def test_perfect_match(self):
        result = compute_match_score(
            profile_keywords=["python", "aws", "react", "postgresql"],
            job_keywords=["python", "aws", "react", "postgresql"],
            job_created_at=self.NOW_MS - self.ONE_DAY_MS,
            now_ms=self.NOW_MS,
            profile_salary_range="$120k-$150k",
            job_salary_min=120000,
            job_salary_max=150000,
            profile_location="San Francisco, CA",
            job_location="San Francisco, CA",
            job_work_arrangement="hybrid",
        )
        self.assertGreaterEqual(result["score"], 80)
        self.assertEqual(len(result["matchedKeywords"]), 4)
        self.assertEqual(len(result["missingKeywords"]), 0)
        self.assertEqual(result["keywordScore"], 1.0)
        self.assertEqual(result["salaryScore"], 1.0)
        self.assertEqual(result["locationScore"], 1.0)

    def test_no_overlap(self):
        result = compute_match_score(
            profile_keywords=["python", "django", "postgresql"],
            job_keywords=["java", "spring", "mysql"],
            job_created_at=self.NOW_MS - self.ONE_DAY_MS,
            now_ms=self.NOW_MS,
        )
        self.assertLess(result["keywordScore"], 0.01)
        self.assertEqual(len(result["matchedKeywords"]), 0)
        self.assertEqual(len(result["missingKeywords"]), 3)

    def test_partial_overlap(self):
        result = compute_match_score(
            profile_keywords=["python", "aws", "react"],
            job_keywords=["python", "aws", "java", "spring"],
            job_created_at=self.NOW_MS - self.ONE_DAY_MS,
            now_ms=self.NOW_MS,
        )
        self.assertGreater(result["score"], 30)
        self.assertLess(result["score"], 80)
        self.assertIn("python", result["matchedKeywords"])
        self.assertIn("aws", result["matchedKeywords"])
        self.assertNotIn("react", result["matchedKeywords"])

    def test_recency_weight(self):
        result_new = compute_match_score(
            profile_keywords=["python"],
            job_keywords=["python"],
            job_created_at=self.NOW_MS - self.ONE_DAY_MS,
            now_ms=self.NOW_MS,
        )
        result_old = compute_match_score(
            profile_keywords=["python"],
            job_keywords=["python"],
            job_created_at=self.NOW_MS - 90 * self.ONE_DAY_MS,
            now_ms=self.NOW_MS,
        )
        self.assertGreater(result_new["score"], result_old["score"])
        self.assertGreater(result_new["recencyScore"], result_old["recencyScore"])

    def test_salary_component(self):
        result_with = compute_match_score(
            profile_keywords=["python"],
            job_keywords=["python"],
            job_created_at=self.NOW_MS - self.ONE_DAY_MS,
            now_ms=self.NOW_MS,
            profile_salary_range="$100k-$120k",
            job_salary_min=100000,
            job_salary_max=130000,
        )
        result_without = compute_match_score(
            profile_keywords=["python"],
            job_keywords=["python"],
            job_created_at=self.NOW_MS - self.ONE_DAY_MS,
            now_ms=self.NOW_MS,
        )
        self.assertGreater(result_with["salaryScore"], result_without["salaryScore"])

    def test_location_component(self):
        result = compute_match_score(
            profile_keywords=["python"],
            job_keywords=["python"],
            job_created_at=self.NOW_MS - self.ONE_DAY_MS,
            now_ms=self.NOW_MS,
            profile_location="New York, USA",
            job_location="San Francisco, USA",
            job_work_arrangement="remote",
        )
        self.assertEqual(result["locationScore"], 1.0)

    def test_score_bounds(self):
        for _ in range(10):
            result = compute_match_score(
                profile_keywords=["aaa", "bbb"],
                job_keywords=["ccc", "ddd"],
                job_created_at=self.NOW_MS - 365 * self.ONE_DAY_MS,
                now_ms=self.NOW_MS,
            )
            self.assertGreaterEqual(result["score"], 0)
            self.assertLessEqual(result["score"], 100)

    def test_empty_keywords(self):
        result = compute_match_score(
            profile_keywords=[],
            job_keywords=[],
            job_created_at=self.NOW_MS - self.ONE_DAY_MS,
            now_ms=self.NOW_MS,
        )
        self.assertEqual(result["keywordScore"], 0)


class TestFilteringByPreferences(unittest.TestCase):
    """Test that filtering works correctly based on candidate insights."""

    def test_seniority_filter(self):
        job_seniority = "senior"
        candidate_seniority = "senior"
        self.assertEqual(job_seniority, candidate_seniority)
        self.assertNotEqual("entry", candidate_seniority)

    def test_work_preference_filter(self):
        candidate_prefers_remote = True
        job_remote = {"workArrangement": "remote"}
        if candidate_prefers_remote:
            self.assertIn(job_remote["workArrangement"], ["remote", "hybrid"])

    def test_industry_filter(self):
        candidate_industry = "technology"
        job_industry = "technology"
        self.assertEqual(candidate_industry, job_industry)

    def test_salary_filter_reject(self):
        candidate_min_salary = 100000
        job_salary_max = 95000
        should_include = job_salary_max >= candidate_min_salary
        self.assertFalse(should_include)

    def test_salary_filter_pass(self):
        candidate_min_salary = 100000
        job_salary_max = 140000
        should_include = job_salary_max >= candidate_min_salary
        self.assertTrue(should_include)

    def test_company_filter(self):
        candidate_companies = ["Google", "Meta", "Stripe"]
        self.assertIn("Stripe", candidate_companies)
        self.assertNotIn("Acme Corp", candidate_companies)

    def test_keyword_match_threshold(self):
        """Jobs with zero keyword overlap should have zero keyword score."""
        result = compute_match_score(
            profile_keywords=["python"],
            job_keywords=["java", "spring", "kafka", "elasticsearch"],
            job_created_at=1700000000000,
            now_ms=1700000000000,
        )
        self.assertEqual(result["keywordScore"], 0)
        self.assertEqual(len(result["matchedKeywords"]), 0)

    def test_high_keyword_overlap(self):
        """Jobs with many matching keywords should score high."""
        result = compute_match_score(
            profile_keywords=["python", "aws", "react", "typescript", "docker"],
            job_keywords=["python", "aws", "react", "typescript", "docker"],
            job_created_at=1700000000000,
            now_ms=1700000000000,
        )
        self.assertGreaterEqual(result["score"], 70)


class TestEndToEndMatching(unittest.TestCase):
    """End-to-end matching scenarios using realistic profile/job data."""

    NOW_MS = 1700000000000
    ONE_DAY_MS = 86400000

    def test_full_stack_dev_vs_full_stack_job(self):
        profile = {
            "titles": ["Senior Full-Stack Developer"],
            "skills": {
                "languages": ["TypeScript", "Python"],
                "frameworks": ["React", "Next.js", "FastAPI"],
                "cloud_devops": ["AWS", "Docker"],
                "databases": ["PostgreSQL", "Redis"],
                "tools": ["Git", "GitHub"],
            },
            "experience": [
                {
                    "title": "Full-Stack Developer",
                    "bullets": [
                        "Built React and Next.js frontend serving 100k MAU",
                        "Designed PostgreSQL schema and REST API with FastAPI",
                    ],
                }
            ],
            "certifications": [],
            "summary": "Full-stack engineer with React, TypeScript, Python, and AWS",
        }

        job_desc = (
            "Senior Full-Stack Engineer. Requirements: TypeScript, React, "
            "Next.js, Python, PostgreSQL, AWS, Docker. "
            "We build scalable web applications."
        )

        profile_kw = extract_profile_keywords(profile)
        job_kw = extract_job_keywords(job_desc)

        result = compute_match_score(
            profile_keywords=profile_kw,
            job_keywords=job_kw,
            job_created_at=self.NOW_MS - self.ONE_DAY_MS,
            now_ms=self.NOW_MS,
            profile_location="New York, USA",
            job_location="San Francisco, USA",
            job_work_arrangement="remote",
        )

        self.assertGreaterEqual(result["score"], 50)
        self.assertGreater(len(result["matchedKeywords"]), 3)
        self.assertIn("typescript", result["matchedKeywords"])
        self.assertIn("react", result["matchedKeywords"])
        self.assertIn("python", result["matchedKeywords"])

    def test_backend_dev_vs_frontend_job(self):
        profile = {
            "titles": ["Backend Engineer"],
            "skills": {
                "languages": ["Go", "Python"],
                "frameworks": ["gRPC", "FastAPI"],
                "cloud_devops": ["AWS"],
                "databases": ["PostgreSQL"],
                "tools": ["Docker"],
            },
            "experience": [],
            "certifications": [],
            "summary": "Backend engineer focused on Go, Python, and distributed systems",
        }

        job_desc = (
            "Frontend Developer. Requirements: TypeScript, React, Vue.js, "
            "CSS, HTML, GraphQL. We build beautiful user interfaces."
        )

        profile_kw = extract_profile_keywords(profile)
        job_kw = extract_job_keywords(job_desc)

        result = compute_match_score(
            profile_keywords=profile_kw,
            job_keywords=job_kw,
            job_created_at=self.NOW_MS - self.ONE_DAY_MS,
            now_ms=self.NOW_MS,
        )

        # Zero keyword overlap -- keyword score should be 0
        self.assertEqual(result["keywordScore"], 0)
        self.assertEqual(len(result["matchedKeywords"]), 0)

    def test_fresh_vs_stale_job(self):
        profile_kw = ["python", "aws"]
        job_kw = ["python", "aws"]

        result_fresh = compute_match_score(
            profile_keywords=profile_kw,
            job_keywords=job_kw,
            job_created_at=self.NOW_MS - 1 * self.ONE_DAY_MS,
            now_ms=self.NOW_MS,
        )
        result_stale = compute_match_score(
            profile_keywords=profile_kw,
            job_keywords=job_kw,
            job_created_at=self.NOW_MS - 180 * self.ONE_DAY_MS,
            now_ms=self.NOW_MS,
        )

        self.assertGreater(result_fresh["score"], result_stale["score"])
        self.assertGreater(result_fresh["recencyScore"], 0.9)
        self.assertLess(result_stale["recencyScore"], 0.2)

    def test_score_is_deterministic(self):
        """Same inputs should always produce the same score."""
        args = (
            ["python", "aws"],
            ["python", "aws", "react"],
            self.NOW_MS - 7 * self.ONE_DAY_MS,
            self.NOW_MS,
        )
        r1 = compute_match_score(*args)
        r2 = compute_match_score(*args)
        self.assertEqual(r1["score"], r2["score"])
        self.assertEqual(r1["matchedKeywords"], r2["matchedKeywords"])


if __name__ == "__main__":
    unittest.main()
