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

## CLI Subcommands

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
├── pipeline.py      — CLI entry point and core pipeline logic
├── latex.py         — LaTeX/PDF resume generation
├── worker.py        — Long-lived background worker process
└── web/             — Next.js + Convex frontend (upload, preview, download)
```

The pipeline works in stages:

1. **Scan** -- recursively find PDFs matching CV/resume/LinkedIn patterns, group by person using filename heuristics.
2. **Extract** -- pull text from PDFs using system tools.
3. **Consolidate** -- send extracted text to an LLM (OpenAI, Anthropic, or Ollama) to produce structured JSON.
4. **Generate** -- produce compact tech-focused resumes in Markdown and LaTeX/PDF.

A web frontend (Next.js + Convex) provides upload, preview, and download. A long-lived worker process handles background consolidation jobs.

## Tech Stack

- **Python 3.13+** -- pipeline, extraction, generation
- **OpenAI / Anthropic / Ollama** -- LLM providers
- **Next.js + Convex** -- web frontend
- **LaTeX** -- PDF resume output
