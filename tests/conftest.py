"""Shared pytest fixtures for easyCV test suite.

Provides reusable test clients, mock Convex client, and sample profile data
for all backend test modules.
"""

import json
import os
import tempfile
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Sample profile data
# ---------------------------------------------------------------------------

SAMPLE_PROFILE: Dict[str, Any] = {
    "name": "Jane Smith",
    "slug": "jane-smith",
    "email": "jane.smith@example.com",
    "phone": "+1-555-0100",
    "location": "San Francisco, CA",
    "summary": "Full-stack engineer with 5+ years building web applications.",
    "skills": {
        "languages": ["Python", "TypeScript", "Go"],
        "frameworks": ["React", "FastAPI", "Next.js"],
        "tools": ["Docker", "Kubernetes", "PostgreSQL"],
    },
    "experience": [
        {
            "company": "Acme Corp",
            "role": "Senior Engineer",
            "startDate": "2021-01",
            "endDate": None,
            "bullets": [
                "Led migration to microservices architecture",
                "Reduced latency by 40% through query optimization",
            ],
        },
        {
            "company": "StartupXYZ",
            "role": "Software Engineer",
            "startDate": "2018-06",
            "endDate": "2020-12",
            "bullets": [
                "Built real-time data pipeline processing 1M events/day",
            ],
        },
    ],
    "education": [
        {
            "institution": "UC Berkeley",
            "degree": "B.S. Computer Science",
            "year": 2018,
        },
    ],
}

SAMPLE_RESUME_MARKDOWN = """# Jane Smith

**Email:** jane.smith@example.com | **Phone:** +1-555-0100

## Summary
Full-stack engineer with 5+ years building web applications.

## Experience

### Acme Corp — Senior Engineer (2021–present)
- Led migration to microservices architecture
- Reduced latency by 40% through query optimization

### StartupXYZ — Software Engineer (2018–2020)
- Built real-time data pipeline processing 1M events/day

## Education
- B.S. Computer Science, UC Berkeley, 2018

## Skills
Python, TypeScript, Go, React, FastAPI, Next.js, Docker, Kubernetes, PostgreSQL
"""

SAMPLE_JOB_DESCRIPTION = """Senior Full-Stack Engineer at Acme Corp

We are looking for a Senior Full-Stack Engineer to join our growing team.
You will be responsible for building and maintaining web applications using
modern technologies.

Requirements:
- 5+ years of software engineering experience
- Proficiency in Python and TypeScript
- Experience with React and modern frontend frameworks
- Familiarity with cloud services (AWS, GCP)
- Strong understanding of databases (PostgreSQL, MongoDB)

Nice to have:
- Experience with Kubernetes
- Contributions to open-source projects
"""


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def tmp_dir():
    """Create a temporary directory that is cleaned up after the test."""
    with tempfile.TemporaryDirectory() as d:
        yield d


@pytest.fixture
def sample_profile():
    """Return a fresh copy of the sample profile dictionary."""
    return json.loads(json.dumps(SAMPLE_PROFILE))


@pytest.fixture
def sample_resume_markdown():
    """Return the sample resume markdown string."""
    return SAMPLE_RESUME_MARKDOWN


@pytest.fixture
def sample_job_description():
    """Return the sample job description string."""
    return SAMPLE_JOB_DESCRIPTION


@pytest.fixture
def mock_convex_client():
    """Return a mock Convex client with common query/mutation stubs."""
    client = MagicMock()
    client.query = MagicMock(return_value={})
    client.mutation = MagicMock(return_value="mock-id")
    client.run = MagicMock(return_value=None)
    client.runAction = MagicMock(return_value=None)
    return client


@pytest.fixture
def mock_llm_client():
    """Return a mock LLMClient with sensible defaults."""
    from backend.pipeline import LLMClient

    client = MagicMock(spec=LLMClient)
    client.provider = "ollama"
    client.model = "llama3.2"
    client.api_key = "test-key"
    client.chat = MagicMock(return_value=json.dumps(SAMPLE_PROFILE))
    return client


@pytest.fixture
def env_vars():
    """Context manager that temporarily sets required environment variables."""
    originals = {}

    def _set(env_map: Dict[str, str]):
        for key, value in env_map.items():
            originals[key] = os.environ.get(key)
            os.environ[key] = value

    yield _set

    for key, original in originals.items():
        if original is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = original
