# EasyCV → Seridian Auth Cutover Handoff

Updated: 2026-10-20 · Kanban: `EASYC-5` "Cut EasyCV over to Seridian Auth" (in progress) · Notes policy: `KAN-274`

## TL;DR

The EasyCV relying-party code (OIDC + PKCE against `https://auth.seridian.dev`) and the Seridian Auth project/CLI provisioning path are **written locally, uncommitted, and not deployed from the correct unified backend source**. The EasyCV web client `seridian_client_jty5kvqzmvgu64s1` was created in the dashboard on 2026-10-20. Its one-time secret was subsequently shared in a screenshot in this work session. Treat that secret as exposed: do not configure production with it; revoke/rotate it and provision a replacement through the Auth CLI once the unified backend and API key path are safe.

Before anyone can cut over, three things must happen:

1. **Pick one production Convex deployment.** Netlify currently points at two different deployments (see [Production state](#production-state-verified-2026-10-20)).
2. **Restore the unified Convex backend configuration and ship Auth safely.** A deploy from the Auth-only repository to the shared `successful-puma-904` deployment exposed `/v1/projects` and `/v1/organizations` (they now return 401 without credentials), but also removed 11 shared application component mounts and indexes. Restore the shared mounts from `core-wt/main/backend/convex/convex.config.ts` before further deploys; do not deploy Auth-only config to the shared backend again.
3. **Finish integration validation.** Focused regression checks now cover the Auth management routes, project API, and EasyCV legacy identity binding. The previous full-suite snapshot is stale; run the complete suite and remote E2E after integrating the changes and resolving deployment access.

## Objective

Move EasyCV sign-in and user ownership to Seridian Auth, while preserving existing EasyCV uploads, files, profiles, job matches, billing state, and download flows. Production inference and E2E must use hosted services only (no workstation, local Ollama, `uv` subprocesses, or Tailscale).

## Design (what the code does)

**Identity**
- OIDC authorization code flow with PKCE, state and nonce checks, and ID-token signature/issuer/audience validation.
- The session is an encrypted HttpOnly cookie (`easycv_seridian_session`).
- The old magic-link flow is removed (`send-magic-link` route, `AccountSignupModal`, `lib/auth-context.ts`).

**Ownership**
- Protected Convex functions derive identity from verified Convex auth.
- The stable Seridian subject (`tokenIdentifier`) is the canonical owner key.

**Legacy mapping**
- A legacy record is linked only when the OIDC callback receives the exact existing `cv_session` cookie, it matches the legacy account's current stored session ID, and Seridian supplies a verified email matching the account's verified email.
- Missing or mismatched cookie proof, anonymous/unverified accounts, and the retired shared `default_session` value never link; the Seridian subject receives a fresh owner key.
- The binding is immutable and subject-unique, preventing a recycled email holder from taking over a former owner's records.
- Upload/file IDs, stored objects, billing records, and paid-download tokens must survive unchanged.

**Admin**
- Admin access requires a verified email listed in `ADMIN_EMAILS`.

**Inference**
- Inference is hosted OpenAI or Anthropic.
- Deploy preflight requires the API key for whichever provider is selected.
- Provider output must match the UI contract: integer score from 0–100, bounded string lists, and gap analysis. Invalid or incomplete JSON is rejected instead of being reported as success.

**Kubernetes**
- The frontend and worker use separate Secrets.
- The worker never receives OIDC or Stripe credentials.

**Release-path fixes already made**
- `deploy.sh` called an undefined `ok` helper under `set -e`. That aborted every deploy after the image push and before `kubectl apply`. It is fixed.
- Convex env setup now runs before `convex deploy`, so `auth.config.ts` sees the issuer and client values on the first deploy. It uses `--force` so changed values get updated.
- GitLab CI now has a preflight. It checks the exact issuer, the canonical URL, the Convex deploy key, the Auth/admin values, Stripe, and the inference key, and it runs a Convex configure/deploy job before Kubernetes.

## Where the code is

| Repo | Location | Branch / remote | State |
|---|---|---|---|
| EasyCV | `~/bytecats/adventurers/easycv` | `master`, in sync with `origin` (GitHub `4cecoder/easycv`) | ~60 files modified/deleted, **uncommitted** |
| Seridian Auth | `~/bytecats/seridian-auth` | `fix/account-switcher-light-contrast`, remote GitLab `4cecoder/seridian-auth` | ~30 files modified, 5 untracked, **uncommitted** |

**EasyCV key files**
- `deploy.sh`, `.gitlab-ci.yml`, `k8s/`
- `web/lib/seridian-*.ts`, `web/app/api/auth/*`
- `web/convex/{auth,authz,identity,schema,uploads,files,billing,payments}.ts`
- `docs/PRODUCTION_INFERENCE_E2E.md`

**Seridian Auth key files**
- `convex/schema.ts`, `convex/http.ts`
- `convex/v1/{auth,applications,users}.ts`
- New, untracked: `convex/v1/{organizations,projects}.ts`, `cli/src/commands/{projects,users}.rs`, `docs/PRODUCT_ROADMAP.md`
- `cli/src/{client,config,main}.rs`, `cli/src/commands/{apps,auth_cmd,config_cmd}.rs`
- `src/app/dashboard/api-keys/page.tsx`

> ⚠️ Both trees also contain unrelated concurrent edits (e.g. EasyCV `automation/logs/`, the UserMon telemetry files; Auth OIDC/branding/SDK changes). Stage only the files that belong to this cutover. The Auth branch name doesn't match this work, so cut a dedicated branch before committing.

## Production state (verified 2026-10-20)

**Seridian Auth (live)**
- OIDC discovery at `https://auth.seridian.dev/.well-known/openid-configuration` is live. Issuer: `https://auth.seridian.dev`.
- Netlify production currently points its API URLs at `successful-puma-904` (`seridian-unified`, dev/4ce). The Auth-only Convex deploy made `/v1/projects`, `/v1/organizations`, and `/v1/applications` return **401** unauthenticated, confirming routes are present on that deployment.
- **Shared backend incident:** that Auth-only deploy removed 11 mounted shared application components and numerous indexes. The unified source of truth is `/Users/fource/bytecats/core-wt/main/backend/convex/`; merge Auth changes there before the next shared deploy. A same-origin Auth Next proxy for `/v1/*` was added locally under `src/app/v1/`, but is uncommitted and not deployed; live `/v1/projects` still returns 404 at the Auth hostname. Never deploy Auth-only Convex config to the shared backend.

**EasyCV Netlify** (`easycv-app-4ce`, Seridian team, `https://easycv.seridian.dev`)
- The site returns 200, but `/api/auth/login` returns **404**: the new auth code is not live.
- The last published deploy was 2026-09-08. The site is not connected to a Git repo.

**Netlify env vars** (only three are set)

| Variable | Value | Problem |
|---|---|---|
| `APP_URL` | `https://easycv-app-4ce.netlify.app` | Stale; should be `https://easycv.seridian.dev` |
| `CONVEX_URL` | `https://famous-armadillo-963.convex.cloud` | Server side points at a **dev** deployment |
| `NEXT_PUBLIC_CONVEX_URL` | `https://lively-badger-123.convex.cloud` | Browser points at a **different** deployment |

- No Auth, admin, Stripe, or inference variables are set.

**Convex** (three deployments in play)

| Deployment | Role | Access from current CLI identity | Env |
|---|---|---|---|
| `famous-armadillo-963` | `bytecats/easycv` **dev** | ✅ | Legacy env: magic-link Resend, Ollama, Stripe, `ADMIN_PASSWORD` |
| `reliable-firefly-73` | `bytecats/easycv` **prod** | ✅ | **Empty** |
| `lively-badger-123` | Netlify's client URL | ❌ "You don't have access to the selected project" | Unknown |

- No Convex deploy key is available locally.

**Other access**
- `kubectl` has no current context.
- No Seridian CLI config: `~/.seridian/` has no `config.json` and no `SERIDIAN_*` env vars are set.

**Decision needed:** Which deployment holds the real production user and billing data? `lively-badger-123` is probably where browser traffic has been writing, and `famous-armadillo-963` gets server-side traffic. Before cutover:
- Confirm with the owner of `lively-badger-123` (it isn't in the `bytecats` team visible to this CLI).
- Choose one deployment.
- Plan a data migration if that deployment isn't the one with the live data.

Do **not** run the ownership mapping against the wrong deployment.

## Test & check status (run 2026-10-20)

| Check | Result |
|---|---|
| Earlier full EasyCV suite/typecheck snapshot | ⚠️ Stale; predates current cutover regression fixes and cross-repo schema integration |
| EasyCV legacy binding + OIDC callback focused tests | ✅ 7 tests across 2 files |
| Auth global-user API/key-scope focused tests | ✅ 21 tests; Auth `tsc --noEmit` passed |
| Unified core project API tests/typecheck | ✅ 34 tests across 3 files; backend typecheck passed (worker report) |
| Auth management proxy focused tests/typecheck | ✅ 3 tests; Auth `tsc --noEmit` passed (worker report) |
| EasyCV API/checkout mocks | ✅ 27 focused tests (worker report) |
| Hosted inference parser validation | ✅ 3 focused tests; no TypeScript errors in parser or smoke test |
| Hosted inference remote smoke spec | ✅ Playwright discovers 1 test; intentionally not executed because it makes a billable provider request |
| EasyCV full TypeScript check | ⚠️ Still fails on old `sessionId`-missing fixtures in `convex/convex.test.ts` and `convex/schema.test.ts` |
| Full integrated suite and remote E2E | Not run; production backend, client secret, deployment selection, hosted inference configuration, and release are unresolved |
| `bash -n deploy.sh`, GitLab YAML parse, CI shell-block syntax | ✅ (earlier in this work) |
| Auth: `cargo check --manifest-path cli/Cargo.toml` | ✅ (earlier) |
| Auth: TypeScript | ⚠️ blocked by pre-existing errors in `convex/auth.config.ts`, `convex/seed.ts`, `tsconfig.json` |
| Production deploy / remote E2E | Not run |

**Outstanding EasyCV verification**
- The earlier full-suite failure inventory is stale: API and checkout test mocks have since been updated, but the full suite has not been rerun.
- Current TypeScript failures are test fixtures in `convex/convex.test.ts` and `convex/schema.test.ts` that still omit required `sessionId` args. Update them to authenticated owner fixtures and add schema migration coverage.
- Run the full unit suite and remote browser E2E after integrating changes; the hosted inference smoke spec is opt-in and must be run only with explicit cost approval and a dedicated test account/upload.

## EasyCV client: registered 2026-10-20 (dashboard)

- Client ID: `seridian_client_jty5kvqzmvgu64s1` (not a secret)
- It was created in the Auth dashboard, not through the CLI path below.
- Verified with a probe:
  - `/authorize` with `redirect_uri=https://easycv.seridian.dev/api/auth/callback` returns 302 to sign-in.
  - Any other redirect URI returns 400.
- The client secret was shown once, then shared via screenshot in this work session. It was never written to this file or Kanban. Treat it as exposed and rotate/revoke it before production use.
- Side finding: the sign-in redirect's `returnTo` points at the raw Convex site `successful-puma-904.convex.site/authorize` instead of `auth.seridian.dev`. Check that the flow completes end to end, since cookies or the issuer could be scoped to the wrong host.

## Provisioning via CLI (alternative, once the Auth API is deployed)

1. In the Auth dashboard, create an API key **owned by the intended user** with these scopes: `organizations:read`, `projects:read`, `projects:write`, `applications:write`.
2. Point the CLI at the management API base URL (the Convex site URL serving `/v1/*`) and authenticate with that key.
3. Run `seridian auth switch` and pick the target org. The CLI validates org IDs against the API.
4. Run `seridian projects create --name EasyCV --slug easycv`.
5. Create the web client:
   ```sh
   seridian apps create --name EasyCV --slug easycv --type web \
     --redirect-uris https://easycv.seridian.dev/api/auth/callback \
     --allowed-origins https://easycv.seridian.dev \
     --project-id PROJECT_ID
   ```
6. Capture the **one-time client secret** straight into the secret manager. Never put it in Kanban, git, or this file.

The CLI no longer fabricates credentials. Project and app operations are authenticated against the owner's API key and check current org membership. Reads, updates, and deletes of project-linked apps re-check current membership and role, including excluding SCIM-deactivated memberships. Security fixes also require an active platform administrator for global user listing and ban/unban, and prevent non-admin keys from receiving `users:read`, `users:write`, or `*`.

### Current integration/security notes

- EasyCV legacy binding requires exact cookie proof plus a verified matching email; the subject binding is immutable. Focused callback/binding tests passed (7).
- Hosted inference previously accepted incomplete provider objects as successful results. Output validation now checks the full UI contract; 3 focused tests pass.
- Added a manual-only hosted inference smoke test that calls the deployed endpoint without mocking it. It requires explicit billable-run flags, remote base URL, test-session cookie, owned upload ID, and provider key. Playwright discovers the test, but no provider request has run.
- The Auth management API proxy exists locally, with focused tests (3), but is not live until the Auth web deploy is released.
- Project/org backend routes were ported into the unified core worktree, but that worktree is detached at `34fb39e` while `origin/main` is `11306a7`. Integrate the changes with current main and retain all shared component mounts before PR/release.
- All changes remain uncommitted. No production config changes, credential creation, or deployment occurred in this pass.
- Two owner decisions remain pending: permission to create and later revoke a temporary scoped management API key, and permission to create the `Seridian` organization under the signed-in Auth account. CLI provisioning cannot be exercised against a real organization until resolved.

## Cutover sequence

1. **Backend recovery:** Restore shared Convex component mounts and indexes using the unified core source. Merge the Auth project/org API changes into that source and deploy only after reviewing the full shared config. Recheck component availability and unauthenticated 401 behavior for Auth management routes.
2. **Auth:** Integrate project/org routes into current unified core `origin/main` and preserve shared mounts. Commit the project/org API and CLI on dedicated branches, review them, then deploy through the unified backend release process.
3. **EasyCV tests:** Fix the five failing test files above until `vitest` and `tsc` pass. Then commit the cutover changes on a branch and open a PR.
4. **Convex:** Resolve the deployment decision above. Get access and a deploy key for the chosen production deployment.
5. **Provision:** Revoke/rotate the screenshot-shared client secret. After the pending API-key and organization decisions are approved and the management API is deployed, create/select the EasyCV project and create a replacement web client through `seridian` CLI. Capture its one-time secret directly into the secret manager.
6. **Configure production:**
   - Issuer `https://auth.seridian.dev`, client ID, and client secret
   - `APP_URL=https://easycv.seridian.dev`
   - `ADMIN_EMAILS`, Stripe keys and price IDs, and the hosted-inference provider and key
   - `CONVEX_URL` and `NEXT_PUBLIC_CONVEX_URL` set to the **same** deployment

   Set these in Netlify (or k8s), the Convex env, and GitLab CI variables. Remove the legacy magic-link and `ADMIN_PASSWORD` settings once they're unused.
7. **Deploy:** Deploy Convex first, then web and worker, all against the same Convex deployment. Never apply placeholder k8s Secrets.
8. **Verify:** Run remote E2E against hosted inference. Then check:
   - Sign-in and sign-out
   - Legacy-account mapping for a verified email, and **no** mapping for an unverified one
   - Upload and worker processing
   - Profile and job-match access
   - Checkout and webhook
   - Paid downloads for pre-existing purchases
9. **Close out:** Post evidence to `EASYC-5`. Keep it open until all ownership and billing checks pass.

**Rollback:** The current live site doesn't depend on any of this. Redeploy the 2026-09-08 Netlify deploy and leave the Convex env untouched until step 6 succeeds.

## Open questions

- Who owns `lively-badger-123`, and is it the real production database?
- Should the Netlify site be Git-connected, or stay deploy-only (`deploy.sh`/CI)?
- Is Kubernetes (VKE) still the target for the worker, or is Netlify plus hosted inference enough? `kubectl` has no context, and the recent PRs (#48–#51) shrank the cluster to a single node.
