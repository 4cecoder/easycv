# Easy CV — Development Timeline (Gantt)

```
Week:    1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16
Phase:   ──────────────────────────────────────────────────

PHASE 0 — CORE PIPELINE (SHIPPED)
─────────────────────────────────
pipeline.py CLI           ████████████████████████████
latex.py                  ████████████████
ste100.py                 ████████████████
worker.py                 ██████████████████
222 tests                 ████████████████████████████

PHASE 1 — WEB MVP (SHIPPED)
─────────────────────────────────
Upload page + route       ████████████████
Preview page              ██████████████████
worker.py integration     ████████████████████
Stripe Checkout           ████████████████
Admin panel               ████████████
Job-match integration     ████████████

PHASE 2 — TEMPLATES (SHIPPED)
─────────────────────────────────
Template selector         ████████████
Font/color customization  ████████████
Print-ready CSS layout    ████████████

PHASE 3 — DEPLOYMENT (NEXT → Week 2)
─────────────────────────────────
Convex prod deploy            ████
Netlify deploy                ████
Worker Docker deploy          ████
Stripe webhook setup          ██
DNS + custom domain           ██

PHASE 4 — EDITOR & BUILDER (Weeks 2-7)
─────────────────────────────────
Dynamic Builder Form              ████████████████
CV Builder route (/build)         ████████████████
Section reordering                       ████████
Real-time save to Convex                 ████████
Multi-resume dashboard                   ████████████
Duplicate / branch resume                       ██████
Undo / history                                 ██████

PHASE 5 — JOB MATCH & AI (Weeks 5-10)
─────────────────────────────────
Job match in preview                     ████████
AI bullet polishing                       ██████████
Tailored resume per job                         ████████
Cover letter generation                         ████████
STE-100 UI score                                 ██████

PHASE 6 — MONETIZATION (Weeks 8-12)
─────────────────────────────────
Subscriptions table                        ████
Stripe sub webhooks                        ████
Premium template gating                        ██████
AI feature gating                               ██████
Pricing page                                        ████
Account page                                          ████

PHASE 7 — AUTH (Weeks 11-14)
─────────────────────────────────
Google OAuth                                         ████████
Merge session → user                                  ████████
User resume library                                    ████████
Public portfolio URL                                        ████

PHASE 8 — POLISH (Weeks 13-16)
─────────────────────────────────
Skeletons + error boundaries                            ████
Rate limiting                                            ████
E2E tests                                                ██████████
Accessibility audit                                       ██████
Launch assets (PH/HN)                                        ████
```

## Milestones

| Milestone | Target Week | Deliverable |
|-----------|-------------|-------------|
| M0: Pipeline shipped | ✅ Done | `easycv` CLI + 222 tests |
| M1: Web MVP shipped | ✅ Done | Upload → preview → payment → download |
| M2: Templates shipped | ✅ Done | Theme/font/color controls + live preview |
| **M3: Production live** | **Week 2** | Netlify + Convex + worker deployed |
| **M4: Builder live** | **Week 7** | `/build` route — create CV from scratch |
| **M5: Job match live** | **Week 10** | AI bullet polishing + tailored resumes |
| **M6: Self-serve billing** | **Week 12** | Subscriptions + tier gating |
| **M7: Auth live** | **Week 14** | Google OAuth + user accounts |
| **M8: Launch-ready** | **Week 16** | E2E tests, a11y, PH/HN assets |

## Dependencies

```
M3 (deploy) ───────────────────┐
                                ├──▶ M4 (builder) ──▶ M6 (billing) ──▶ M7 (auth)
M1 (web mvp) ──────────────────┘       │                                       │
                                        ├──▶ M5 (job match) ───────────────────┤
                                        │                                       │
                                        └──────────▶ M8 (launch) ◀──────────────┘
```

## Resource Notes

- **Worker**: Deploy once (M3), run forever — only needs updates if `backend/pipeline.py` changes
- **Editor/Builder (M4)**: Largest dev investment — new route, new Convex tables, drag-drop UI
- **Monetization (M6)**: Depends on conversion data from M1 — don't start until you have at least 2-4 weeks of real user data
- **Auth (M7)**: Can be fast-tracked if users are churning on session loss; otherwise deferred
