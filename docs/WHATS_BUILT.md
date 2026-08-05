# easyCV — What's Built

## Python Backend (CLI Core)

| Module | What it does |
|--------|-------------|
| `pipeline.py` | Scan directories, extract text from PDFs/TXT/MD, consolidate via LLM (OpenAI/Anthropic/Ollama), generate resume, validate quality, match job descriptions. CLI subcommands: `scan`, `validate`, `rescore`, `redetect`, `stats`, `consolidate-stdin`, `match-job` |
| `latex.py` | Render structured JSON → ATS-safe .tex → PDF via pdflatex |
| `ste100.py` | ASD-STE100 Issue 9 validator (British spelling, passive voice, contractions, sentence length, -ing forms, semicolons) |
| `worker.py` | Long-lived process that polls Convex for queued uploads, runs consolidation, writes results back. Bounded retry (3 attempts), graceful shutdown. |

## Web Frontend (Next.js App Router)

| Page | Route | Purpose |
|------|-------|---------|
| Upload | `/` | Drag-drop file upload → Convex storage → queue for worker |
| Preview | `/preview/[uploadId]` | Live reactive status via Convex push; free preview of consolidated resume |
| Admin | `/admin` | Stripe metrics, upload lifecycle (retry, bypass payment, delete) |
| Checkout | Stripe hosted | One-time payment ($9-19), redirects back to preview |

## API Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /api/upload` | session cookie | Upload files, create upload row, queue for worker |
| `POST /api/checkout` | session cookie + ownership | Create Stripe Checkout session |
| `GET /api/download/[token]` | downloadToken | Payment-gated PDF download |
| `POST /api/admin/auth` | passcode | Admin authentication |
| `GET /api/admin/metrics` | — (public) | Stripe balance/payouts/sales (first-party metrics only) |
| `GET /api/admin/stripe/callback` | — | Stripe Connect OAuth callback |

## Convex Backend

| Module | Functions |
|--------|-----------|
| `uploads.ts` | `createUpload`, `finalizeUpload`, `getUpload`, `claimNextQueued`, `markReady`, `markAttemptFailed` |
| `profiles.ts` | `saveStructuredProfile` (full replace), `setProfilePdf`, `getStructuredProfile`, `getProfilePdfUrl` |
| `payments.ts` | `createPaymentRecord`, `markPaymentPaid` (internalMutation), `getPaymentStatus`, `getByDownloadToken`, `incrementDownloadCount` |
| `admin.ts` | `listAllUploads`, `deleteUpload`, `bypassPayment`, `retryUpload` |
| `http.ts` | Stripe webhook (signature-verified, calls internal mutation) |
| `files.ts` | `generateUploadUrl` (Convex storage) |
| `resumeFiles.ts` | `addResumeFile`, `listResumeFiles`, `getResumeFilesForWorker` |

## Libraries

| File | Purpose |
|------|---------|
| `lib/session.ts` | Cookie name constant (`cv_session`) |
| `lib/profileMapping.ts` | Defensive Python→TS field coercion |
| `lib/convexClient.ts` | React Convex client (reactive) |
| `lib/convexServer.ts` | HTTP Convex client (server-side) |
| `lib/utils.ts` | Tailwind `cn()` utility |

## Tests

| Suite | Count | File |
|-------|-------|------|
| Python pipeline | 174+ | `tests/test_pipeline.py` |
| Python STE-100 | 53 | `tests/test_ste100.py` |
| Python worker | — | `tests/test_worker.py` |
| Vitest (profile mapping) | — | `web/lib/profileMapping.test.ts` |
| Vitest (checkout) | — | `web/app/api/checkout/route.test.ts` |
| Convex (schema) | — | `web/convex/schema.test.ts` |

---

## Not Yet Built

| Item | Reason |
|------|--------|
| Google OAuth | Explicitly deferred — session cookie is sufficient for v1 |
| Subscription billing | Deprioritized — rf-2 confirms one-time payment converts better |
| Worker Docker/VPS deployment | Known gap noted in backlog — run on same box as Ollama for now |
| Ollama message-type guard | Pending backlog item (narrow non-blocking edge case) |

## Next Feature to Ship

The core pipeline (CLI + web upload → queue → worker → preview → payment → download) is fully built and tested. The **next thing to ship** is production deployment:
1. Set up Convex deployment env vars (Stripe keys, worker secret, admin password, etc.)
2. Deploy Next.js to Netlify
3. Run worker.py on a persistent box (same Tailscale host as Ollama)
4. Point Stripe webhook at Convex HTTP action URL
5. DNS + custom domain
