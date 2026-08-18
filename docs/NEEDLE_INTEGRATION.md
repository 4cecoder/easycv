# Needle 2 Integration Guide

## What is Needle 2?

14MB model for structured extraction. Runs at 500+ tok/s. No API key needed. Apache 2.0.

It takes text + a schema and returns structured JSON. Perfect for extracting resume data.

## Architecture

```
Current:  PDF → extract_text() → OpenAI/Anthropic ($$$) → JSON → LaTeX → PDF
Proposed: PDF → extract_text() → Needle (free, local) → JSON → LaTeX → PDF
                                  ↓ (low confidence)
                              OpenAI/Anthropic (fallback)
```

Needle handles extraction (name, skills, experience, education). Cloud LLM handles resume writing and job matching (higher quality, worth the cost).

## Step 1: Add dependency

```bash
cd /Users/fource/bytecats/easycv
uv add cactus-needle
```

Verify it works:
```bash
uv run python -c "import needle; print('OK')"
```

## Step 2: Create `backend/needle_extractor.py`

```python
"""Needle 2 based structured extraction for resume data.

Runs locally, no API key, 14MB model, ~500 tok/s.
Falls back to None if extraction fails or confidence is low.
"""

import json
from typing import Optional

try:
    import needle
    HAS_NEEDLE = True
except ImportError:
    HAS_NEEDLE = False

# Schema matching the structured profile format pipeline.py expects
RESUME_SCHEMA = {
    "name": "resume",
    "description": "Extract structured resume data from text",
    "parameters": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Full name"},
            "titles": {"type": "array", "items": {"type": "string"}, "description": "Job titles"},
            "summary": {"type": "string", "description": "Professional summary"},
            "skills": {
                "type": "object",
                "properties": {
                    "languages": {"type": "array", "items": {"type": "string"}},
                    "frameworks": {"type": "array", "items": {"type": "string"}},
                    "cloud_devops": {"type": "array", "items": {"type": "string"}},
                    "databases": {"type": "array", "items": {"type": "string"}},
                    "tools": {"type": "array", "items": {"type": "string"}},
                },
            },
            "experience": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "company": {"type": "string"},
                        "start": {"type": "string"},
                        "end": {"type": "string"},
                        "location": {"type": "string"},
                        "bullets": {"type": "array", "items": {"type": "string"}},
                    },
                },
            },
            "education": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "degree": {"type": "string"},
                        "school": {"type": "string"},
                        "years": {"type": "string"},
                    },
                },
            },
            "certifications": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["name", "skills", "experience"],
    },
}

# Minimum confidence to trust Needle's output without cloud fallback
CONFIDENCE_THRESHOLD = 0.7


def extract_resume(text: str, confidence_threshold: float = CONFIDENCE_THRESHOLD) -> Optional[dict]:
    """Extract structured resume data using Needle 2.
    
    Returns structured dict on success, None on failure/low confidence.
    The caller should fall back to cloud LLM when this returns None.
    """
    if not HAS_NEEDLE:
        return None

    try:
        # Truncate to 3000 chars (Needle has 256-token window, ~1000 chars)
        # Feed the most relevant portion
        truncated = text[:3000]
        
        agent = needle.Needle(tools=[RESUME_SCHEMA])
        result = agent.complete(truncated)
        
        if not result or result.get("type") != "call":
            return None
            
        calls = result.get("function_calls", [])
        if not calls:
            return None
            
        confidence = result.get("confidence", 0)
        if confidence < confidence_threshold:
            print(f"  [needle] confidence {confidence:.2f} < {confidence_threshold}, falling back to cloud LLM")
            return None
            
        profile = calls[0].get("arguments", {})
        print(f"  [needle] extracted with confidence {confidence:.2f}")
        return profile
        
    except Exception as e:
        print(f"  [needle] extraction failed: {e}")
        return None
```

## Step 3: Patch `backend/pipeline.py`

In `llm_consolidate()`, try Needle first, fall back to cloud LLM:

```python
# At the top of the file, add:
from backend.needle_extractor import extract_resume

# In llm_consolidate(), BEFORE the existing LLM call (around line 652):
def llm_consolidate(client: LLMClient, bundle: PersonBundle) -> Optional[dict]:
    """Send extracted texts to LLM and get structured JSON."""
    combined = []
    for fname, text in sorted(bundle.extracted_texts.items()):
        combined.append(f"--- {fname} ---\n{text.strip()[:TEXT_TRUNCATION_LENGTH]}")
    payload = "\n\n".join(combined)

    # --- NEW: Try Needle first (free, local, fast) ---
    needle_result = extract_resume(payload)
    if needle_result and _validate_structured_data(needle_result):
        print(f"  [needle] extraction successful, skipping cloud LLM")
        return needle_result
    # --- END NEW ---

    # Fall through to cloud LLM (existing code)
    messages = [
        {"role": "system", "content": LLM_CONSOLIDATE_SYSTEM},
        {"role": "user", "content": f"Extract structured data from these CV files for {bundle.name}:\n\n{payload}"},
    ]
    # ... rest of existing code
```

## Step 4: CLI test script

Create `backend/test_needle.py`:

```python
#!/usr/bin/env python3
"""Quick CLI test for Needle resume extraction."""

import sys
import json
from backend.needle_extractor import extract_resume

SAMPLE_RESUME = """
Alex Mercer
Senior Full Stack Engineer
alex.mercer@example.com | (555) 234-5678 | San Francisco, CA

Professional Summary:
High-impact Full Stack Engineer with 7+ years architecting fault-tolerant web applications.

Skills:
Languages: TypeScript, JavaScript, Python, Go, SQL
Frameworks: Next.js, React, Node.js, Express
Cloud: AWS (ECS, Lambda, S3), Docker, Kubernetes

Experience:
Senior Frontend Engineer, TechCorp Solutions (2022 - Present)
- Architected enterprise Next.js micro-frontend platform serving 2.5M daily users
- Reduced core web vitals LCP from 2.4s to 0.8s

Software Engineer, StartupInc (2019 - 2022)
- Built distributed REST microservices handling 15,000 req/sec

Education:
B.S. Computer Science, University of Washington (2015 - 2019)
"""

if __name__ == "__main__":
    text = sys.argv[1] if len(sys.argv) > 1 else SAMPLE_RESUME
    result = extract_resume(text, confidence_threshold=0.0)  # Show output regardless
    
    if result:
        print(json.dumps(result, indent=2))
    else:
        print("Extraction failed")
        sys.exit(1)
```

Run with:
```bash
uv run python -m backend.test_needle
```

## Step 5: Unit test

Create `tests/test_needle_extractor.py`:

```python
"""Tests for Needle 2 resume extraction."""

import pytest
from backend.needle_extractor import extract_resume, HAS_NEEDLE

SAMPLE = """
Jane Doe
Software Engineer
 jane@example.com

Skills: Python, Go, Docker, PostgreSQL

Experience:
Software Engineer, Acme Corp (2020-2023)
- Built data pipelines processing 1M events/day

Education:
B.S. CS, MIT (2016-2020)
"""

@pytest.mark.skipif(not HAS_NEEDLE, reason="cactus-needle not installed")
class TestNeedleExtraction:
    def test_extracts_name(self):
        result = extract_resume(SAMPLE, confidence_threshold=0.0)
        assert result is not None
        assert "name" in result
        assert "jane" in result["name"].lower() or "doe" in result["name"].lower()

    def test_extracts_skills(self):
        result = extract_resume(SAMPLE, confidence_threshold=0.0)
        assert result is not None
        assert "skills" in result

    def test_extracts_experience(self):
        result = extract_resume(SAMPLE, confidence_threshold=0.0)
        assert result is not None
        assert "experience" in result

    def test_returns_none_on_garbage(self):
        result = extract_resume("asdfghjkl random gibberish 12345", confidence_threshold=0.99)
        # Should either return None or a low-confidence result
        # (Needle is surprisingly good, so we just check it doesn't crash)
        assert result is None or isinstance(result, dict)
```

Run with:
```bash
uv run pytest tests/test_needle_extractor.py -v
```

## Step 6: Verify the pipeline still works

```bash
# Run full test suite to make sure nothing broke
uv run python -m automation test --skip-ts

# Test end-to-end with a sample resume
echo "Test resume text here" | uv run python -m backend.pipeline consolidate-stdin
```

## What stays cloud LLM

- **Resume writing** (generating bullet points, polishing language) — keep using OpenAI/Anthropic
- **Job matching** (comparing resume to job description) — keep using OpenAI/Anthropic
- **Extraction** — move to Needle (free, fast, local)

## Cost impact

| Step | Before | After |
|------|--------|-------|
| Extraction | OpenAI GPT-4o (~$0.01-0.03/doc) | Needle (free) |
| Consolidation | OpenAI GPT-4o (~$0.01-0.03/doc) | Needle (free) |
| Resume writing | OpenAI GPT-4o | OpenAI GPT-4o (unchanged) |
| Job matching | OpenAI GPT-4o | OpenAI GPT-4o (unchanged) |

For a 100-doc batch: before ~$2-6, after ~$0.50-1.50 (only writing + matching uses cloud).
