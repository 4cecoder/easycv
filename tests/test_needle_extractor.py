"""Unit tests for Needle 2 Structured Resume Extractor & CLI."""

import json
import os
import subprocess
import sys
import pytest

from backend.needle_extractor import (
    NeedleExtractor,
    NeedleExtractionResult,
    extract_resume,
    NEEDLE_AVAILABLE,
)
from backend import pipeline

pytestmark = pytest.mark.local


SAMPLE_RESUME_TEXT = """
Elena Rostova
elena.rostova@cloudscale.io | (415) 555-0142 | San Francisco, CA
linkedin.com/in/elenarostova | github.com/erostova

Principal Cloud Infrastructure & AI Architect

Summary:
Principal systems architect with 12+ years designing distributed storage, high-throughput Rust services, and multi-region Kubernetes platforms.

Technical Skills:
- Languages: Rust, Python, Go, TypeScript, C++, SQL
- Cloud & DevOps: Kubernetes, Docker, Terraform, AWS, GCP, Helm, Linux
- Databases: PostgreSQL, Redis, Convex, SQLite, MongoDB
- Frameworks: PyTorch, Ray, Next.js, FastAPI

Professional Experience:
Principal Infrastructure Architect | CloudScale Inc.
2021 - Present | San Francisco, CA
- Architected Kubernetes microservices handling 75,000 requests per second with 99.999% availability.
- Reduced vector retrieval p99 latency by 54% through custom Rust kernels and memory-mapped indexes.

Senior Systems Engineer | Apex Distributed Systems
2016 - 2021 | Seattle, WA
- Engineered distributed consensus layer processing 40M transactions daily.
- Implemented automated failover protocol eliminating service outages across 6 cloud regions.

Education:
M.S. in Computer Science | Stanford University
2014 - 2016

B.S. in Electrical Engineering & Computer Science | UC Berkeley
2010 - 2014
"""


def test_needle_package_availability():
    """Verify that cactus-needle package is installed and importable."""
    if not NEEDLE_AVAILABLE:
        pytest.skip("cactus-needle package is not installed or available")
    assert NEEDLE_AVAILABLE is True
    extractor = NeedleExtractor()
    assert extractor.available is True


def test_needle_full_profile_extraction():
    """Test full profile extraction on standard resume text."""
    if not NEEDLE_AVAILABLE:
        pytest.skip("cactus-needle package is not installed")
    extractor = NeedleExtractor()
    result = extractor.extract_full_profile(SAMPLE_RESUME_TEXT)

    assert isinstance(result, NeedleExtractionResult)
    assert result.success is True
    assert result.elapsed_ms > 0

    profile = result.profile
    assert isinstance(profile, dict)

    # Name and Contact
    assert "name" in profile
    assert profile["name"] in ("Elena Rostova", "Candidate") or len(profile["name"]) > 2
    assert profile["contact"]["email"] == "elena.rostova@cloudscale.io"
    assert "415" in profile["contact"]["phone"]
    assert "elenarostova" in profile["contact"]["linkedin"]

    # Skills
    skills = profile["skills"]
    assert isinstance(skills, dict)
    assert any("Rust" in s or "Python" in s for s in skills.get("languages", []))
    assert any("Kubernetes" in s or "Docker" in s for s in skills.get("cloud_devops", []))
    assert any("PostgreSQL" in s or "Redis" in s for s in skills.get("databases", []))

    # Experience
    experience = profile["experience"]
    assert isinstance(experience, list)
    assert len(experience) >= 1

    # Education
    education = profile["education"]
    assert isinstance(education, list)


def test_needle_extract_helper_function():
    """Test extract_resume helper function."""
    if not NEEDLE_AVAILABLE:
        pytest.skip("cactus-needle package is not installed")
    profile = extract_resume(SAMPLE_RESUME_TEXT)
    assert isinstance(profile, dict)
    assert "name" in profile
    assert "contact" in profile
    assert "skills" in profile


def test_needle_empty_input_handling():
    """Test behavior on empty or whitespace text."""
    if not NEEDLE_AVAILABLE:
        pytest.skip("cactus-needle package is not installed")
    extractor = NeedleExtractor()
    result = extractor.extract_full_profile("   \n\t  ")
    assert result.success is False
    assert result.profile == {}
    assert "Empty" in (result.error or "")


def test_cli_needle_execution(tmp_path):
    """Test the CLI extraction tool via subprocess."""
    if not NEEDLE_AVAILABLE:
        pytest.skip("cactus-needle package is not installed")
    sample_file = tmp_path / "test_resume.txt"
    sample_file.write_text(SAMPLE_RESUME_TEXT)

    cli_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend", "cli_needle.py")

    # Run CLI with --json flag
    cmd = [sys.executable, cli_path, str(sample_file), "--json"]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

    assert proc.returncode == 0
    parsed = json.loads(proc.stdout)
    assert isinstance(parsed, dict)
    assert "contact" in parsed
    assert parsed["contact"]["email"] == "elena.rostova@cloudscale.io"


def test_pipeline_integration_with_needle(tmp_path):
    """Test pipeline.consolidate_files utilizing NeedleExtractor."""
    if not NEEDLE_AVAILABLE:
        pytest.skip("cactus-needle package is not installed")
    sample_file = tmp_path / "Elena_Rostova_Resume.txt"
    sample_file.write_text(SAMPLE_RESUME_TEXT)

    res = pipeline.consolidate_files([str(sample_file)], llm_client=None)

    assert isinstance(res, dict)
    assert "profile" in res
    assert "score" in res
    assert "pdf_path" in res

    profile = res["profile"]
    assert profile.get("contact", {}).get("email") == "elena.rostova@cloudscale.io"
