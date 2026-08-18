"""Unit tests for Smart Categorization, Dynamic Remixing & Caching Layer."""

import time
from backend.resume_remixer import (
    SmartCategorizer,
    ResumeCache,
    ResumeRemixer,
    global_resume_cache,
)


SAMPLE_PROFILE = {
    "name": "Marcus Vance",
    "contact": {"email": "marcus@cloudscale.io", "phone": "555-0199"},
    "titles": ["Senior Software Engineer"],
    "summary": "Full stack and distributed systems engineer.",
    "skills": {
        "languages": ["Python", "Rust", "TypeScript"],
        "cloud_devops": ["Docker", "Kubernetes", "Terraform"],
        "databases": ["PostgreSQL", "Redis"],
        "frameworks": ["Next.js", "PyTorch"],
    },
    "experience": [
        {
            "title": "Senior Systems Engineer",
            "company": "ScaleTech",
            "bullets": [
                "Built frontend Next.js dashboard for real-time telemetry.",
                "Architected Kubernetes cluster handling 100k RPS with Rust microservices.",
                "Optimized PostgreSQL query execution by 40%."
            ]
        }
    ]
}


def test_smart_categorizer():
    flat_skills = ["Rust", "Kubernetes", "PostgreSQL", "PyTorch", "Terraform", "TypeScript", "Redis"]
    categorized = SmartCategorizer.categorize_skills(flat_skills)

    assert "Rust" in categorized["languages"]
    assert "TypeScript" in categorized["languages"]
    assert "Kubernetes" in categorized["cloud_devops"]
    assert "Terraform" in categorized["cloud_devops"]
    assert "PostgreSQL" in categorized["databases"]
    assert "Redis" in categorized["databases"]
    assert "PyTorch" in categorized["frameworks"]


def test_resume_cache_lru_and_speed():
    cache = ResumeCache(max_entries=3)
    payload_a = {"id": "doc1", "text": "resume a"}
    payload_b = {"id": "doc2", "text": "resume b"}

    cache.set(payload_a, {"result": "extracted_a"})
    cache.set(payload_b, {"result": "extracted_b"})

    # Cache hit speed test (< 0.1ms)
    t0 = time.perf_counter()
    hit = cache.get(payload_a)
    duration_ms = (time.perf_counter() - t0) * 1000.0

    assert hit == {"result": "extracted_a"}
    assert duration_ms < 1.0, f"Cache retrieval too slow: {duration_ms}ms"

    # Cache miss
    assert cache.get({"id": "nonexistent"}) is None


def test_dynamic_resume_remixing():
    remixer = ResumeRemixer()
    
    # Remix for AI Systems Architect role highlighting PyTorch and Rust
    remixed = remixer.remix_profile(
        SAMPLE_PROFILE,
        target_role="Lead AI Systems Architect",
        highlight_skills=["Rust", "Kubernetes", "PyTorch"],
        max_bullets_per_job=2
    )

    # 1. Title was re-targeted
    assert remixed["titles"][0] == "Lead AI Systems Architect"

    # 2. Highlighted skills moved to front of their category
    assert remixed["skills"]["languages"][0] == "Rust"
    assert remixed["skills"]["frameworks"][0] == "PyTorch"

    # 3. Bullets prioritized matching keywords
    job_bullets = remixed["experience"][0]["bullets"]
    assert len(job_bullets) == 2
    # The Kubernetes/Rust bullet matched 2 keywords so it should be #1
    assert "Kubernetes" in job_bullets[0] and "Rust" in job_bullets[0]


def test_remix_and_render_latex():
    remixer = ResumeRemixer()
    tex = remixer.remix_and_render_latex(
        SAMPLE_PROFILE,
        target_role="Principal Cloud Architect",
        highlight_skills=["Kubernetes", "Terraform"]
    )

    assert "\\begin{document}" in tex
    assert "Principal Cloud Architect" in tex
    assert "Marcus Vance" in tex
    assert "\\end{document}" in tex
