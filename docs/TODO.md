# Easy CV — Development TODO

Legend: ✅ Done | 🔧 In Progress | ⏳ Pending | ❌ Blocked

---

## Phase 0: Core Pipeline (SHIPPED)

- [x] `easycv scan` — directory scanning + person-dedup + text extraction
- [x] `easycv consolidate-stdin` — LLM consolidation bridge (web layer calls this)
- [x] `easycv validate` — data-quality gate for structured JSON
- [x] `easycv rescore` — re-run LLM step without re-scanning
- [x] `easycv redetect` — re-run person detection after alias edits
- [x] `easycv stats` — summarize output directory
- [x] `easycv match-job` — keyword alignment analysis against job description
- [x] LaTeX rendering + PDF compilation (`backend/latex.py`)
- [x] ASD-STE100 Issue 9 validator (`backend/ste100.py`)
- [x] 222 passing tests (pipeline + STE100 + worker + profile mapping)
- [x] Package structure: `backend/` package with `uv` / `pyproject.toml`

---

## Phase 1: Web MVP (SHIPPED)

- [x] Drag-drop upload page (`/`) with file validation
- [x] Upload route (`POST /api/upload`) — Convex storage + queue
- [x] Preview page (`/preview/[uploadId]`) — reactive status + free HTML export
- [x] `worker.py` — long-lived poller: claim → process → save → mark ready
- [x] Stripe Checkout integration (`POST /api/checkout`)
- [x] Payment-gated PDF download (`GET /api/download/[token]`)
- [x] Convex schema (uploads, resumeFiles, structuredProfiles, payments, jobMatches)
- [x] Admin page — metrics, retry, bypass payment, delete
- [x] Stripe webhook → Convex HTTP action
- [x] Job-match integration: upload accepts jobDescription + worker runs match

---

## Phase 2: Template System (SHIPPED)

- [x] Live template selection (Modern, Classic, Minimal, Technical)
- [x] Font budget / family selection
- [x] Accent color customization
- [x] Print-ready CSS preview layouts

---

## Phase 3: Deployment (READY — needs execution)

- [x] `web/netlify.toml` — build config, env var docs, redirects, security headers
- [x] `Dockerfile` — worker container with LaTeX deps
- [x] `.dockerignore` — lean build context
- [x] `web/README.deployment.md` — SSH deploy key setup for `@bytecats/ui-kit`
- [ ] Deploy Convex to production — `npx convex deploy`
- [ ] Set Convex production env vars (Stripe keys, WORKER_SECRET, ADMIN_PASSWORD)
- [ ] Deploy Next.js to Netlify
- [ ] Run worker on persistent host (Docker on same Tailscale as Ollama)
- [ ] Point Stripe webhook at Convex HTTP action URL
- [ ] DNS + custom domain
- [ ] Change `ADMIN_PASSWORD` from default `"admin123"`

---

## Phase 4: Editor & Builder (NEXT)

- [ ] **Dynamic Builder Form**: Modal input cards for editing work history, projects, skills from scratch (not just consolidation)
- [ ] **CV Builder mode**: New route `/build` — build a CV from blank slate, not just from uploaded files
- [ ] **Section reordering**: Drag-and-drop sections (experience, education, skills, projects)
- [ ] **Real-time save**: Auto-save drafts to Convex as user types
- [ ] **Multi-resume management**: Dashboard at `/dashboard` listing all saved resumes
- [ ] **Duplicate / branch a resume**: Start from an existing one, try a different template
- [ ] **Undo / history**: Track changes per resume with ability to revert

---

## Phase 5: Job Match & AI Features (NEXT)

- [ ] **Job match on preview**: Show keyword alignment automatically after consolidation
- [ ] **AI bullet polishing** button: Rewrite selected bullets with LLM
- [ ] **Tailored resume per job**: Generate a version optimized for each job link
- [ ] **Cover letter generation**: From structured profile + job description
- [ ] **STE-100 compliance score** in UI: Visual indicator for aerospace/engineering CVs

---

## Phase 6: Monetization (NEXT)

- [ ] Evaluate one-time payment → subscription pivot based on conversion data
- [ ] Add `subscriptions` table to Convex schema
- [ ] Integration Subscription Stripe webhooks (checkout.session.completed, invoice.paid)
- [ ] Gate premium templates behind subscription tier
- [ ] Gate AI bullet polishing behind subscription tier
- [ ] Add pricing page (`/pricing`)
- [ ] Add account page (`/account`) with subscription management portal

---

## Phase 7: Auth & Multi-User (LATER)

- [ ] Google OAuth integration
- [ ] Merge session-based uploads into authenticated user
- [ ] Per-user resume library with sharing
- [ ] Public portfolio URL per user (`/portfolio/:username`)

---

## Phase 8: Polish & Scale (LATER)

- [ ] Loading skeletons for all async states
- [ ] Error boundaries per route
- [ ] Rate limiting on upload / checkout API routes
- [ ] Ollama message-type guard (narrow edge case)
- [ ] E2E tests with Playwright
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Prepare Product Hunt / HN launch assets
