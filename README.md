# easyCV

CV/resume consolidation pipeline that scans, extracts, consolidates, and generates tech-focused resumes using LLMs.

## Quick Start

```bash
# Install dependencies
pip install -e .

# Scan common dirs with Ollama (default, no API key needed)
easycv scan --auto

# Scan specific dirs with OpenAI
easycv scan ~/Downloads ~/Desktop --llm openai

# Dry run to preview before copying
easycv scan ~/Downloads --dry-run

# Full pipeline with Anthropic
easycv scan --auto --llm anthropic --output ./my_resumes
```

Set API keys via environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) or in `~/.config/cv-pipeline/config.json`.

## Automation Commands

```bash
# Run full test suite (pytest + typecheck + ts_tests + ts_build)
uv run python -m automation test

# Run only pytest (skip TypeScript)
uv run python -m automation test --skip-ts

# Self-driving improvement cycle: policy → OCR refine → TDD → tests → optional commit
uv run python -m automation loop --limit 5

# Same, but auto-commit when all tests pass (for cron/launchd)
uv run python -m automation loop --limit 3 --commit

# Run TDD loop with LLM auto-fix
uv run python -m automation tdd --target tests/ --rounds 3 --max-failures 5

# Run OCR-based code review + LLM refactor
uv run python -m automation refine --target backend/ --limit 5

# Show automation progress
uv run python -m automation status
```

The autonomous coding framework has **heavy LLM rails**:
- Test failures are parsed and fed to LLM for fix suggestions
- OCR (OpenCodeReview) scans code for issues
- LLM refactors code while preserving functionality
- All changes are verified by tests before being applied
- Runs entirely against a self-hosted llama.cpp endpoint (`AUTOMATION_LLM_BASE_URL`) — no cloud tokens

Scheduled autonomous runs (macOS):

```bash
chmod +x automation/schedule.sh
automation/schedule.sh                # one pass, logs to automation/logs/
launchctl load automation/com.easycv.automation.plist   # daily 03:00
```

| Command | Description |
|---|---|
| `scan` | Scan directories for CV/resume/LinkedIn PDFs, sort by person, consolidate |
| `validate` | Score consolidated JSON for completeness |
| `rescore` | Re-run LLM consolidation against existing structured data |
| `redetect` | Re-run person detection on already-organized directories |
| `stats` | Summarize an existing output directory |
| `consolidate-stdin` | Feed text via stdin for consolidation |

## Architecture

```
easyCV
├── backend/
│   ├── pipeline.py    — Resume processing pipeline (OCR, LLM, STE-100, LaTeX)
│   ├── latex.py       — LaTeX/PDF resume generation
│   └── worker.py      — Long-lived background worker process
├── automation/        — Autonomous coding framework with LLM rails
│   ├── steer.py       — CLI entry point: `uv run python -m automation <cmd>`
│   ├── test_orchestration.py — Test runners & orchestration
│   ├── tdd.py         — TDD loop with LLM auto-fix
│   ├── refine.py      — OCR code review + LLM refactor
│   ├── improve.py     — Parse failures, suggest fixes
│   ├── llm_client.py  — LLM abstraction layer
│   └── config.py      — Environment & configuration
├── tests/             — Python test suite (222 tests)
└── web/               — Next.js + Convex frontend (upload, preview, download)
```

### Resume Processing Pipeline (`backend/pipeline.py`)

The resume pipeline works in stages:

1. **Scan** -- recursively find PDFs matching CV/resume/LinkedIn patterns, group by person using filename heuristics.
2. **Extract** -- pull text from PDFs using system tools.
3. **Consolidate** -- send extracted text to an LLM (OpenAI, Anthropic, or Ollama) to produce structured JSON.
4. **Generate** -- produce compact tech-focused resumes in Markdown and LaTeX/PDF.

A web frontend (Next.js + Convex) provides upload, preview, and download. A long-lived worker process handles background consolidation jobs.

## Tech Stack & CLI Tooling

- **Python 3.13+ (`uv`)** -- pipeline, extraction, generation (`uv run pytest`, `uv run python pipeline.py`)
- **JavaScript / TypeScript (`bun`)** -- Next.js web frontend & Convex backend
  > **Note**: Always use `bun` and `bunx` for all frontend development, scripts, and package management. **Do NOT use `npx` or `npm`.**
  > - `bun run dev` / `bun run build` / `bun run test` / `bun run typecheck`
  > - `bunx convex dev` / `bunx vitest run`
- **OpenAI / Anthropic / Ollama** -- LLM providers
- **Next.js + Convex** -- web frontend
- **LaTeX** -- PDF resume output

