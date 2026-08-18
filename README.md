# easyCV

CV/resume consolidation pipeline. Upload your CVs, resumes, and LinkedIn exports — get a clean, ATS-optimized single-column LaTeX resume.

## How It Works

1. **Upload** — drag-and-drop your PDFs, text files, or LinkedIn exports
2. **Extract** — text is pulled from your documents server-side
3. **Consolidate** — an LLM (GPT-4o, Claude, or Ollama) merges everything into a structured profile
4. **Generate** — produces a clean single-column LaTeX resume optimized for ATS parsers
5. **Download** — pay once ($9-19) to download the final PDF

The LLM handles the hard part: deduplicating overlapping roles, ranking experience relevance, and writing strong bullet points. Your files are processed then discarded — no accounts, no retention.

## Quick Start

```bash
# Install dependencies
pip install -e .

# CLI: scan directories for resumes
easycv scan --auto

# CLI: specific directories with a particular LLM
easycv scan ~/Downloads ~/Desktop --llm openai

# Dry run to preview before copying
easycv scan ~/Downloads --dry-run
```

## LLM Configuration

The pipeline supports three LLM providers. Set via `LLM_PROVIDER` env var:

| Provider | Default Model | API Key Env Var |
|----------|---------------|-----------------|
| `openai` | `gpt-4o` | `OPENAI_API_KEY` |
| `anthropic` | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` |
| `ollama` | `llama3.2` | none (local) |

Set API keys via environment variables or in `~/.config/cv-pipeline/config.json`.

## Web App

A Next.js + Convex frontend handles upload, live preview, Stripe checkout, and PDF download. A Python worker process handles background consolidation jobs.

```bash
# Run frontend dev server
cd web && bun run dev

# Run worker (polls Convex for queued jobs)
uv run python -m backend.worker
```

## Architecture

```
easyCV
├── backend/
│   ├── pipeline.py    — Resume processing pipeline (extract, LLM consolidate, STE-100, LaTeX)
│   ├── latex.py       — LaTeX/PDF resume generation
│   ├── ste100.py      — ASD-STE100 grammar/style validator
│   └── worker.py      — Long-lived background worker (polls Convex for jobs)
├── web/
│   ├── app/           — Next.js 16 App Router (upload, preview, checkout, download)
│   ├── convex/        — Convex DB schema & functions
│   └── components/    — React UI components
├── tests/             — Python test suite
└── automation/        — Autonomous coding framework (OCR, TDD, LLM refactor)
```

### Pipeline Stages

1. **Scan** — find PDFs matching CV/resume/LinkedIn patterns, group by person
2. **Extract** — pull text from PDFs using system tools
3. **Consolidate** — LLM produces structured JSON (name, skills, experience, education)
4. **Score** — evaluate completeness and quality
5. **Generate** — produce LaTeX/PDF resume in single-column ATS format

## Tech Stack

- **Python 3.13+** — pipeline, extraction, LaTeX generation (`uv run pytest`)
- **TypeScript / Bun** — Next.js 16 web frontend, Convex backend
- **Convex** — database, realtime subscriptions, file storage
- **OpenAI / Anthropic / Ollama** — LLM providers for consolidation
- **LaTeX** — PDF resume output
- **Stripe** — payment processing (one-time or subscription)
