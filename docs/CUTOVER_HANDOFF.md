# EasyCV → Seridian Auth Cutover Handoff

Updated: 2026-10-20 · Kanban: `EASYC-5` "Cut EasyCV over to Seridian Auth" (in progress) · Notes policy: `KAN-274`

## TL;DR

The EasyCV relying-party code (OIDC + PKCE against `https://auth.seridian.dev`) and the Seridian Auth project/CLI provisioning path are **written locally, uncommitted, and not deployed from the correct unified backend source**. The EasyCV web client `seridian_client_jty5kvqzmvgu64s1` was created in the dashboard on 2026-10-20. Its one-time secret was subsequently shared in a screenshot in this work session. Treat that secret as exposed: do not configure production with it; revoke/rotate it and provision a replacement through the Auth CLI once the unified backend and API key path are safe.

Before anyone can cut over, these production steps must happen:

1. **Keep the selected production database consistent.** The owner confirmed `reliable-firefly-73` is the fresh production database; Netlify already points its browser and server URLs there. Do not migrate from inaccessible historical `lively-badger-123`.
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
- GitLab CI now has a preflight. It checks the exact discovery issuer, same Convex server/browser deployment URL, canonical app URL, deploy key, Auth/admin values, Stripe, and hosted inference key, and it runs a Convex configure/deploy job before Kubernetes.

## Where the code is

| Repo | Location | Branch / remote | State |
|---|---|---|---|
| EasyCV | `~/bytecats/adventurers/easycv` | `feat/seridian-auth-cutover` | Current HEAD `e3f9df2`; cutover implementation is in `1f50a78`; GitHub PR checks pass. Unrelated dirty automation logs, generated files, and `docs/OVERHAUL_PLAN.md` remain outside these commits. Not deployed. |
| Seridian Auth | `~/bytecats/seridian-auth` | `fix/account-switcher-light-contrast`, remote GitLab `4cecoder/seridian-auth` | CLI/admin-scope, proxy, project/org, and Auth security changes **uncommitted** |
| Unified core | `~/bytecats/core-wt/easycv-project-api` | branch `feat/easycv-auth-project-api`, based on `origin/main` `11306a7` | Project/org API and platform-admin CLI user API **uncommitted**; shared mounts and AUTH-76 submodule pin preserved |

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

**Seridian Auth (live; rechecked 2026-10-20)**
- `https://successful-puma-904.convex.site/.well-known/openid-configuration` returns 200 and advertises issuer `https://auth.seridian.dev` with OIDC endpoints on the branded host. However, every checked path on `https://auth.seridian.dev` (`/`, `/.well-known/openid-configuration`, `/authorize`, `/token`, `/userinfo`, `/jwks.json`, `/revoke`, `/v1/projects`) currently returns 404 from Netlify. The branded issuer migration is therefore incomplete and OIDC cannot work. Do not set or deploy EasyCV to this issuer until the Auth domain routing is restored and discovery plus all OIDC endpoints return expected responses.
- The project/org management API is live on `https://successful-puma-904.convex.site`: unauthenticated `/v1/projects`, `/v1/organizations`, and `/v1/applications` return **401**. The matching `/v1/*` paths on `auth.seridian.dev` return **404** because branded domain routing/proxy is not live.
- **Shared backend incident:** that Auth-only deploy removed 11 mounted shared application components and numerous indexes. The unified source of truth is `/Users/fource/bytecats/core-wt/main/backend/convex/`; merge Auth changes there before the next shared deploy. A same-origin Auth Next proxy for `/v1/*` was added locally under `src/app/v1/`, but is uncommitted and not deployed; live `/v1/projects` still returns 404 at the Auth hostname. Never deploy Auth-only Convex config to the shared backend.

**EasyCV Netlify** (`easycv-app-4ce`, Seridian team, `https://easycv.seridian.dev`)
- The site returns 200, but `/api/auth/login`, `/api/auth/token`, and `/health` return **404**: the new auth code and local health route are not live.
- The site is not connected to a Git repo; local branch changes are not reflected in production.
- The `/health` rewrite previously targeted a missing `/api/health` route. A route has now been added locally; it is not live until a deploy.

**Netlify production environment** (11 variables configured; values inspected only for non-secret settings)

| Variable | Value | Problem |
|---|---|---|
| `APP_URL` | `https://easycv.seridian.dev` | Correct |
| `CONVEX_URL`, `NEXT_PUBLIC_CONVEX_URL` | Both `https://reliable-firefly-73.convex.cloud` | Same deployment; owner confirmed this is the intended fresh production database |
| `CONVEX_SITE_URL` | `https://reliable-firefly-73.convex.site` | Same EasyCV deployment |
| `SERIDIAN_AUTH_ISSUER` | `https://auth.seridian.dev` | Matches the issuer advertised by the Convex discovery document, but the branded host and all checked OIDC routes return 404; OIDC cannot work until routing is restored |
| `SERIDIAN_AUTH_CLIENT_ID` | Existing dashboard-created EasyCV client | Present; its secret was exposed in a screenshot and the client must be retired |
| `ADMIN_EMAILS`, `LLM_PROVIDER`, `LLM_MODEL`, `OPENAI_API_KEY`, `WORKER_SECRET` | Configured | Names verified; secret values were not displayed |

- `SERIDIAN_AUTH_CLIENT_SECRET` and Stripe secret/webhook/price variables are absent. Production cutover preflight must remain blocked until replacement OAuth credentials and billing configuration are present.

**Convex** (current production deployment configured in Netlify)

| Deployment | Role | Access from current CLI identity | Env |
|---|---|---|---|
| `famous-armadillo-963` | `bytecats/easycv` **dev** | ✅ | Legacy env: magic-link Resend, Ollama, Stripe, `ADMIN_PASSWORD` |
| `reliable-firefly-73` | `bytecats/easycv` **prod**, both Netlify Convex URLs | ✅ | `ADMIN_EMAILS`, `APP_URL`, `SERIDIAN_AUTH_CLIENT_ID`, `SERIDIAN_AUTH_ISSUER`, `WORKER_SECRET`; missing client secret, Stripe config, and worker inference provider key |
| `lively-badger-123` | Historical Netlify client URL | ❌ "You don't have access to the selected project" | Unknown; ownership and any historical user/billing records are unverified |

Read-only production counts on `reliable-firefly-73`: `userAccounts`, `orders`, `payments`, and `uploads` each have 0 documents. The accessible `famous-armadillo-963` dev deployment has 13 uploads and 0 documents in the other three tables. This does not establish whether the inaccessible historical `lively-badger-123` deployment contains customer data.

- No Convex deploy key is available locally.

**Other access**
- `kubectl` has no current context.
- No Seridian CLI config: `~/.seridian/` has no `config.json` and no `SERIDIAN_*` env vars are set.

**Data decision confirmed:** use `reliable-firefly-73` as the fresh production database. Its key user and billing tables are empty. Do not migrate records from historical `lively-badger-123`; that deployment remains inaccessible and outside this cutover path.

Do **not** run the ownership mapping against the wrong deployment.

## Test & check status (run 2026-10-20)

| Check | Result |
|---|---|
| Earlier full EasyCV suite/typecheck snapshot | ⚠️ Stale; predates current cutover regression fixes and cross-repo schema integration |
| EasyCV legacy binding + OIDC callback focused tests | ✅ 7 tests across 2 files |
| Auth global-user API/key-scope focused tests | ✅ 21 tests; Auth `tsc --noEmit` passed |
| Unified core project/admin-user API tests/typecheck | ✅ 35 focused tests; backend typecheck passed (worker report) |
| Auth management proxy focused tests/typecheck | ✅ 3 tests; Auth `tsc --noEmit` passed (worker report) |
| EasyCV API/checkout mocks | ✅ 27 focused tests (worker report) |
| Hosted inference parser validation | ✅ 3 focused tests; no TypeScript errors in parser or smoke test |
| Hosted inference remote smoke spec | ✅ Playwright discovers 1 test; intentionally not executed because it makes a billable provider request |
| EasyCV full unit suite | ✅ 270 tests across 16 files |
| EasyCV full TypeScript check | ✅ `bun run typecheck` |
| Local browser E2E | ✅ 69 passed, 1 intentionally skipped (full 70-test suite, 2026-10-20). Uses the local authenticated Convex WebSocket fixture; hosted inference smoke is skipped unless explicitly enabled. No local or Tailscale inference was used. |
| Full integrated suite and remote E2E | Not run; production backend, client secret, deployment selection, hosted inference configuration, and release are unresolved |
| `bash -n deploy.sh` | ✅ Passes after repairing the quote parsing and registry credential lookup |
| GitLab YAML parse, CI shell-block syntax | ✅ (earlier in this work) |
| Auth: `cargo check --manifest-path cli/Cargo.toml` | ✅ (earlier) |
| Auth: TypeScript | ⚠️ blocked by pre-existing errors in `convex/auth.config.ts`, `convex/seed.ts`, `tsconfig.json` |
| Production deploy / remote E2E | Not run |

**Outstanding EasyCV verification**
- Full unit tests passed: 270 tests across 16 files. TypeScript check passed after the auth-provider bootstrap and forced-refresh lifecycle fixes.
- Full local browser suite passed: 69 passed, 1 hosted-inference smoke skipped. Checkout, preview, Job Match, and upload specs use an authenticated local Convex WebSocket fixture. No local or Tailscale inference service is used.
- Remote production browser E2E remains outstanding. The hosted inference smoke spec is opt-in and requires a deployed endpoint, dedicated test account/upload, and explicit billable-run flags.

## EasyCV client: registered 2026-10-20 (dashboard)

- Client ID: `seridian_client_jty5kvqzmvgu64s1` (not a secret)
- It was created in the Auth dashboard, not through the CLI path below.
- Verified with a probe:
  - `/authorize` with `redirect_uri=https://easycv.seridian.dev/api/auth/callback` returns 302 to sign-in.
  - Any other redirect URI returns 400.
- The client secret was shown once and shared via screenshot in this work session. It was never copied into files or Kanban. Treat it as exposed and revoke it before use. The CLI now has `seridian apps delete --client-id … --yes` (or `--id … --yes`) and `seridian organizations create --name … [--slug …]`. The delete command resolves the exact owner-visible app and uses the owner-scoped API. Focused CLI checks passed, but these commands have not been run against production. Revoke the exposed client after the authenticated management API path is available, then create a replacement through the CLI.
- Side finding: the sign-in redirect's `returnTo` points at the raw Convex site `successful-puma-904.convex.site/authorize` instead of `auth.seridian.dev`. Check that the flow completes end to end, since cookies or the issuer could be scoped to the wrong host.

## Provisioning via CLI (alternative, once the Auth API is deployed)

1. In the Auth dashboard, create an API key **owned by the intended user** with these scopes: `organizations:read`, `projects:read`, `projects:write`, `applications:write`.
2. For platform-wide user management, use a separate key with `users:admin:read` and/or `users:admin:write`; only an active dashboard admin can create it. The CLI calls `/v1/admin/users`, preserving organization-scoped `/v1/users`.
3. Point the CLI at the management API base URL and authenticate with the project key.
4. Run `seridian auth switch` and pick the target org. The CLI validates org IDs against the API.
5. Run `seridian projects create --name EasyCV --slug easycv`.
6. Create the web client:
   ```sh
   seridian apps create --name EasyCV --slug easycv --type web \
     --redirect-uris https://easycv.seridian.dev/api/auth/callback \
     --allowed-origins https://easycv.seridian.dev \
     --project-id PROJECT_ID
   ```
7. Capture the **one-time client secret** straight into the secret manager. Never put it in Kanban, git, or this file.

The CLI no longer fabricates credentials. Project and app operations are authenticated against the owner's API key and check current org membership. Reads, updates, and deletes of project-linked apps re-check current membership and role, including excluding SCIM-deactivated memberships. Security fixes also require an active platform administrator for global user listing and ban/unban, and prevent non-admin keys from receiving `users:read`, `users:write`, or `*`.

### Current integration/security notes

- EasyCV legacy binding requires exact cookie proof plus a verified matching email; the subject binding is immutable. Focused callback/binding tests passed (7).
- Hosted inference previously accepted incomplete provider objects as successful results. Output validation now checks the full UI contract; 3 focused tests pass.
- Added a manual-only hosted inference smoke test that calls the deployed endpoint without mocking it. It requires explicit billable-run flags, remote base URL, test-session cookie, owned upload ID, and provider key. Playwright discovers the test, but no provider request has run.
- GitHub's clean-cache CI install failed because the `4cecoder/ui-kit` URL now redirects to the renamed `seridian-dev/ui-kit-archive` repo, invalidating the lock's archive SRI. EasyCV now pins the same upstream commit by its canonical repository URL and regenerated the Bun lock. A clean frozen install passed in a temporary copy on Bun 1.4.4-canary.1; GitHub CI still needs to validate its Bun 1.4.3 runtime.
- The Convex auth provider now bootstraps `/api/auth/token` on mount. Forced refresh no longer toggles the provider's initial `isLoading` state, which previously caused Convex 1.43.0 to clear and recreate auth on refresh.
- The Auth management API proxy exists locally, with focused tests (3), but is not live until the Auth web deploy is released.
- Core project/org routes and protected `/v1/admin/users` CLI endpoints are ported into a clean worktree on current `origin/main` `11306a7`; project/user API tests and backend typecheck pass. The existing org-scoped `/v1/users` remains unchanged. Changes are uncommitted.
- EasyCV's cutover branch is pushed at `e3f9df2` (implementation commit `1f50a78`); GitHub frontend/backend checks and GitLab mirror push pass. The cutover changes are committed; unrelated workspace changes remain uncommitted. Auth and core changes remain uncommitted. No production config changes, API key/org provisioning, or deployment occurred in this pass. The latest production probe found Auth discovery returns the branded issuer from Convex, but all checked paths on `auth.seridian.dev` still return 404.
- The requested organization/project provisioning is authorized by the cutover task, but no authenticated management API credential is available in the local CLI session. Create or provide an owner-scoped key with only the scopes needed for the requested operations; do not use a platform-admin key for project provisioning. CLI provisioning cannot be exercised against a real organization until that credential is available and the management proxy is deployed.

## Cutover sequence

1. **Backend recovery:** Restore shared Convex component mounts and indexes using the unified core source. Merge the Auth project/org API changes into that source and deploy only after reviewing the full shared config. Recheck component availability and unauthenticated 401 behavior for Auth management routes.
2. **Auth:** Integrate project/org routes into current unified core `origin/main` and preserve shared mounts. Commit the project/org API and CLI on dedicated branches, review them, then deploy through the unified backend release process.
3. **EasyCV tests:** Chromium is installed. The provider bootstrap and refresh lifecycle are fixed. Full local validation passes: 270 unit tests, TypeScript, and 69 browser tests; the hosted inference smoke is intentionally skipped. GitHub PR checks pass for the pushed branch. Remote production browser E2E remains outstanding and must use hosted inference only.
4. **Convex:** Netlify points both browser and server URLs at `reliable-firefly-73` production; its user/order/payment/upload tables are empty, and the owner has confirmed it is the intended fresh production database. Do not migrate historical data from inaccessible `lively-badger-123`. Obtain the matching deploy key before changing backend state.
5. **Provision:** Revoke/rotate the screenshot-shared client secret. After the pending API-key and organization decisions are approved and the management API is deployed, create/select the EasyCV project and create a replacement web client through `seridian` CLI. Capture its one-time secret directly into the secret manager.
6. **Configure production:**
   - Issuer exactly as returned by live discovery (currently `https://successful-puma-904.convex.site`), client ID, and newly rotated client secret. Move to `https://auth.seridian.dev` only as part of the coordinated ADR 0002 issuer migration.
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
