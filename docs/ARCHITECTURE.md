# Easy CV — Technical Architecture & Project Blueprint

## Project Overview

Easy CV is a modern, modular resume and CV building application. The platform is engineered for high customizability, rapid live editing, and structured data management, supporting both export and import workflows.

### Truth-Based Deterministic Pipeline

- **Source document tracking**: verifying user history/experience claims against uploaded/linked source documents.
- **Target Job Alignment**: parsing job links/descriptions and calculating match/gap matrices via Python API.
- **ASD-STE100 Issue 9 Grammar & Style Rule Engine** for aerospace/engineering compliance.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | Next.js 16 (App Router, React, Tailwind CSS, shadcn/ui) |
| JS Runtime & Package Manager | Bun |
| Database & Backend Services | Convex DB (real-time reactive backend, TypeScript queries/mutations) |
| Python Package & Environment Manager | uv by Astral |
| Deployment Platform | Netlify (Netlify Next.js Runtime) |
| Version Control & CI/CD | GitHub |
| Payments | Stripe (one-time Checkout) |
| Analytics | PostHog |
| LLM Providers | Anthropic, OpenAI, Ollama (local) |

---

## System Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser    │────▶│  Next.js (App)   │────▶│   Convex DB     │
│ (Upload,     │     │  /upload         │     │  /uploads       │
│  Preview,    │     │  /preview/:id    │     │  /profiles      │
│  Download)   │     │  /admin          │     │  /payments      │
└──────────────┘     │  API routes      │     │  /jobMatches    │
       ▲             └──────────────────┘     │  /resumeFiles   │
       │                    │                 └────────┬────────┘
       │                    │  POST /api/upload          │
       │                    │  POST /api/checkout        │  poll claim
       │                    ▼                            ▼
       │             ┌──────────────────┐     ┌─────────────────┐
       │             │  Stripe          │     │  worker.py      │
       └─────────────┤  Checkout        │     │  (Docker)       │
                     │  Webhook─────────┼────▶│  consolidate    │
                     └──────────────────┘     │  + match-job    │
                                              │  + LaTeX/PDF    │
                                              └────────┬────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │  Ollama / API    │
                                              │  (LLM provider)  │
                                              └─────────────────┘
```

### Data Flow

1. **Upload**: User uploads CV files via drag-drop on `/`. Files go to Convex storage via signed URL. Upload row created in `uploads` table with `sessionId` cookie.
2. **Queue**: Worker poll-clams the upload via `claimNextQueued` mutation with shared secret auth.
3. **Process**: Worker downloads files, runs `pipeline.consolidate_files()` (extract → LLM consolidate → score → LaTeX compile → PDF).
4. **Save**: Structured profile, quality score, and optional job-match (if job description provided) saved to Convex.
5. **Preview**: Browser subscribes to `getStructuredProfile` via reactive Convex query — auto-updates when worker finishes.
6. **Payment**: User clicks "Download PDF" → `POST /api/checkout` creates Stripe Checkout session → redirects to Stripe → webhook marks paid.
7. **Download**: Paid user clicks download → verified by `downloadToken` → PDF served from Convex storage.
8. **Export**: Free HTML version always available. Paid PDF download. Optional LaTeX source export.

---

## Convex DB Data Schema

### Tables

| Table | Key Index | Purpose |
|-------|-----------|---------|
| `uploads` | `by_status` | Per-session upload lifecycle — status, attempts, error, optional job description/link |
| `resumeFiles` | `by_upload` | Per-file metadata (name, ext, category, size) — raw bytes in Convex storage |
| `structuredProfiles` | `by_upload` | Structured JSON output from pipeline — mirrors LLM_CONSOLIDATE_SYSTEM shape + quality scores |
| `jobMatches` | `by_upload` | Optional job-match analysis — match score, keywords, gap analysis, tailored bullets |
| `payments` | `by_stripe_session`, `by_download_token`, `by_upload` | Stripe Checkout records — status, amount, download token with download count |

### Key Design Decisions

- **No user auth table**: Single `sessionId` cookie is the only identity concept. OAuth is explicitly deferred.
- **Python is source of truth**: Schema mirrors `pipeline.py`'s structured JSON shape. No scoring logic reimplemented in TypeScript.
- **Worker secret auth**: Worker authenticates via shared secret (`WORKER_SECRET`) set as Convex env var.

---

## Next.js Frontend Modules

### Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | UploadPage | Drag-drop file upload with optional job description/link → Convex storage → queue |
| `/preview/[uploadId]` | PreviewClient + JobMatchWidget | Reactive live preview via Convex subscriptions; free static HTML export; paid PDF download |
| `/admin` | — | Stripe metrics, upload lifecycle management (retry, bypass payment, delete) |

### Key UI Components

- **FileDrop**: Drag-drop zone with file validation (.pdf, .txt, .md)
- **Live Preview Canvas**: Print-ready CSS layouts with real-time template switching
- **Template Selector**: Theme color, font family, layout style toggles
- **Job Match Widget**: Keyword alignment visualization with gap analysis
- **Quality Score Badge**: Visual indicator from pipeline quality gate

---

## Python Services & Tooling (Managed by uv)

### Modules

| Module | Responsibilities |
|--------|-----------------|
| `backend/pipeline.py` | CLI entry point (`easycv`), directory scanning, text extraction (PDF/TXT/MD), LLM consolidation (Anthropic/OpenAI/Ollama), resume generation, quality scoring, job matching |
| `backend/latex.py` | LaTeX rendering from structured JSON → .tex → PDF compilation via pdflatex |
| `backend/ste100.py` | ASD-STE100 Issue 9 validator — British spelling, passive voice, contractions, sentence length, -ing forms, semicolons |
| `backend/worker.py` | Long-lived process — polls Convex, claims queued uploads, runs consolidation, saves results, handles graceful shutdown |

### Utilities

- **Resume Parser**: Extracts text from existing PDF/TXT/MD resumes into structured JSON
- **LLM Bullet Generator**: Rewrites user achievements into high-impact bullet points via configurable provider
- **Match-Job Analyzer**: Compares structured profile against job description → keyword matrix + gap analysis

---

## Deployment Architecture

| Component | Hosting | Access |
|-----------|---------|--------|
| Next.js App | Netlify (OpenNext adapter) | Public HTTPS |
| Convex Backend | Convex Cloud | Public HTTPS (env-var-gated) |
| Worker | Docker on persistent host (same Tailscale as Ollama) | Outbound HTTPS to Convex |
| LLM Provider | Ollama (local) / Anthropic / OpenAI | Local network / API key |
| Stripe Webhook | → Convex HTTP action URL | Signed payloads |

### Key Deployment Files

- `web/netlify.toml` — Build settings, env var documentation, function timeouts, redirect/security headers
- `Dockerfile` — Worker container with LaTeX deps, non-root user, pip-installed package
- `.dockerignore` — Excludes .venv, web/, .git, env files from build context

---

## Monetization Strategy & $500 MRR Goal

### Current Model

One-time payment ($9-19) gates PDF download. Free preview (structured profile + HTML export) is always available.

### Pricing Models

| Tier | Price | Target Subscribers | MRR |
|------|-------|-------------------|-----|
| Pro (monthly) | $10/mo | 50 | $500 |
| Pro (monthly) | $15/mo | 34 | $500 |
| Annual | $99/yr | 5 | $500 (annualized) |

### Path from One-Time → Subscription

The current one-time model validates demand. Subscription billing is the next revenue layer:
1. Add `subscriptions` table + Stripe sub webhooks
2. Gate premium templates behind sub tier
3. Add AI bullet polishing as feature gated by sub tier

### Key Metrics

- **Free-to-paid conversion** (current funnel: upload → preview → checkout)
- **MRR / Churn / LTV** (via Stripe Dashboard + PostHog)
- **Job-match usage** (potential upsell trigger)
