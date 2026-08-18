# Cactus Needle 2 — High-Performance On-Device Extraction Guide

This guide details how **Cactus Needle 2** (an open 45M-parameter, 14 MB on-device engine) is integrated into easyCV as the default, zero-cloud-cost structured resume extraction engine.

---

## 1. Overview & Key Metrics

Needle 2 is built by Cactus Compute on the **Simple Attention Network** architecture with **CQ2-bit quantization** and compiled directly into a self-contained C++ shared library with Python bindings.

| Metric | Needle 2 Specification |
|---|---|
| **Parameters** | 45 Million |
| **Binary / Weights Size** | 14 MB (`.cact` format) |
| **Session RAM** | 28 MB – 54 MB (deterministic sliding window) |
| **Arithmetic Precision** | CQ2-bit weights, Int8 activations & KV cache |
| **Decode Speed** | 500+ tok/s (Raspberry Pi 5) / 1,000+ tok/s (Apple Silicon / WebGPU) |
| **Grammar Guarantees** | Byte-level schema constraint (guarantees valid JSON) |

---

## 2. Architecture: Why Needle 2 for easyCV

1. **Walsh-Hadamard MLP**: Replaces dense up-and-down projection matrices with fixed orthonormal Walsh transforms, eliminating 90%+ of channel-mixing memory reads.
2. **Engram Hashed Tables**: Reads world knowledge via integer hash lookups at decode time without dense matrix multiplication.
3. **Grammar-Constrained Decoding**: The matcher computes logits only for tokens that satisfy the declared Pydantic schema, pruning up to 98% of vocabulary projections on structural tokens.
4. **Zero-Cloud Privacy & $0 Compute Cost**: Resume data is parsed locally on the worker or client device in sub-second time without sending sensitive PII to external cloud LLM APIs.

---

## 3. CLI Extraction & Benchmark Tool

easyCV includes a standalone CLI extraction tool: [`backend/cli_needle.py`](file:///Users/fource/bytecats/easycv/backend/cli_needle.py).

### Usage

```bash
# Extract structured JSON from a PDF or text file:
uv run python backend/cli_needle.py path/to/resume.pdf

# Output raw JSON only (pipe into other tools):
uv run python backend/cli_needle.py path/to/resume.pdf --json

# Pipe text directly from stdin:
cat resume.txt | uv run python backend/cli_needle.py - --json

# Run benchmark over 5 iterations:
uv run python backend/cli_needle.py path/to/resume.pdf --benchmark 5

# Save extracted profile directly to file:
uv run python backend/cli_needle.py path/to/resume.pdf -o profile.json
```

---

## 4. Pipeline Integration

In easyCV, [`backend/needle_extractor.py`](file:///Users/fource/bytecats/easycv/backend/needle_extractor.py) is hooked directly into [`backend/pipeline.py`](file:///Users/fource/bytecats/easycv/backend/pipeline.py) (`consolidate_files`) and [`backend/worker.py`](file:///Users/fource/bytecats/easycv/backend/worker.py).

```python
from backend.needle_extractor import NeedleExtractor, NEEDLE_AVAILABLE

if NEEDLE_AVAILABLE:
    extractor = NeedleExtractor()
    result = extractor.extract_full_profile(resume_text)
    if result.success:
        profile = result.profile
```

### Extraction Flow:
1. **Extraction (Primary)**: Needle 2 parses contact details, titles, skills, experience, and education into Pydantic models.
2. **Grounding & Enrichment**: Regex grounding cross-validates emails, phone numbers, and LinkedIn handles against source text.
3. **Fallback**: If Needle is unavailable, the pipeline seamlessly falls back to cloud LLMs (OpenAI, Anthropic, or Ollama).

---

## 5. WebGPU Client-Side Inference

For web users, client-side inference in [`web/lib/transformersInference.ts`](file:///Users/fource/bytecats/easycv/web/lib/transformersInference.ts) allows tiny models (MiniCPM, SmolLM, Qwen) to execute directly in the user's browser using **WebGPU** with local IndexedDB model weight caching.

---

## 6. Running Unit Tests

To verify Needle 2 extraction in the easyCV test suite:

```bash
uv run pytest tests/test_needle_extractor.py -v
```
