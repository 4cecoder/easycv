# Production inference and browser E2E

## Hosted inference in Kubernetes

The production worker defaults to the hosted OpenAI API (`gpt-4o`). It must
not rely on Ollama or another service on a developer machine or tailnet. Set
these values in the deployment environment or `.env.production`:

```dotenv
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o
OPENAI_API_KEY=<provisioned-secret-value>
```

`deploy.sh` requires the key for the selected hosted provider before building
images or changing cluster resources. It writes the key to the workload-scoped
`easycv-worker-secrets`; the Next.js server uses `easycv-web-secrets`. The
worker does not receive OIDC or Stripe secrets. `anthropic` is also supported
when `ANTHROPIC_API_KEY` is set. Local Ollama and other providers are rejected
by the production deploy script. Do not commit provider keys or apply the
placeholder `k8s/secrets.yaml` as a production secret. The web job-matching
route also needs its selected hosted provider key in the hosting platform's
server-side environment. Never put an API key in a `NEXT_PUBLIC_*` variable.

## Seridian Auth deployment settings

Set these in the EasyCV Convex deployment environment:

- `SERIDIAN_AUTH_ISSUER`: the exact issuer from Seridian Auth's OIDC discovery
  document. Production currently returns
  `https://successful-puma-904.convex.site`; the accepted switch to
  `https://auth.seridian.dev` has not run yet (see core ADR 0002).
- `SERIDIAN_AUTH_CLIENT_ID`: the registered EasyCV relying-party client ID.
- `ADMIN_EMAILS`: comma-separated verified email addresses allowed to use
  EasyCV's admin operations.

The production deploy paths require the OIDC, admin, billing, and hosted
inference values before building or changing production resources. They set
Convex environment variables before deploying `auth.config.ts`; this ordering
is required because the auth config fails closed if issuer or client ID is
missing. The client secret belongs only in the Next.js server environment and
is never sent to Convex or the worker. For Convex Cloud, provide
`CONVEX_DEPLOY_KEY`; deployment fails early without it rather than leaving
Auth unconfigured. GitLab also provisions `APP_URL`, Stripe credentials and
price IDs, `WORKER_SECRET`, `ADMIN_EMAILS`, and Seridian issuer/client ID on
the same Convex deployment used by the frontend and worker.

For the live EasyCV site, use `APP_URL=https://easycv.seridian.dev` and register
`https://easycv.seridian.dev/api/auth/callback` as the OIDC redirect URI. Set
`SERIDIAN_AUTH_ISSUER` to exactly the issuer returned by the public discovery
document, the registered client ID, client secret, and the same `ADMIN_EMAILS`
value in the web host's server-side environment and Convex deployment.
Production Netlify currently has the canonical `APP_URL`, matching
`CONVEX_URL` and `NEXT_PUBLIC_CONVEX_URL` for `reliable-firefly-73`, Auth issuer
and client ID, admin email, and OpenAI inference settings. The issuer is set to
`https://auth.seridian.dev`, which matches the issuer in discovery on
`successful-puma-904.convex.site`. However, all checked paths on
`auth.seridian.dev`, including discovery and OIDC endpoints, currently return
404, so authentication cannot work until branded domain routing is restored.
`SERIDIAN_AUTH_CLIENT_SECRET` and Stripe credentials are missing. The existing
client secret was shared in a screenshot and must be revoked before use. The
live EasyCV build still returns 404 for `/api/auth/*`;
do not treat the code cutover as live until replacement client credentials,
billing settings, production data decision, and the new release are verified.
Keep the client secret private. `APP_URL` must be the canonical public origin.

To override the production defaults, export `LLM_PROVIDER` and `LLM_MODEL`
before calling `deploy.sh`. An explicitly configured `anthropic` provider is
also supported when its API key is provisioned in the same Kubernetes Secret.

## Playwright

By default Playwright starts the local web server. To point it at an already
running deployment, set `PLAYWRIGHT_BASE_URL`; Playwright then skips starting
the local server:

```sh
PLAYWRIGHT_BASE_URL=https://easycv.example.com bunx playwright test
```

The standard upload and job-match E2E flows stub their HTTP endpoints. The
`hostedInference.smoke.spec.ts` is a separate, explicit opt-in smoke test. It
posts once to the real `/api/job-match` endpoint using a test user's Seridian
session cookie and owned upload ID, then checks the returned structured fields.
It does not intercept or mock `/api/job-match`. Because the app invokes the
configured hosted provider, this test can incur a charge. Never run it as part
of CI, a default test suite, or an unattended deploy.

Run the smoke test manually from `web/` only when you intend to make one real
provider request and have configured a dedicated test account/upload, the
matching hosted provider key in the test environment, and the provider key in
the target app's server environment:

```sh
HOSTED_INFERENCE_E2E=1 \
ALLOW_BILLABLE_HOSTED_INFERENCE_E2E=1 \
PLAYWRIGHT_BASE_URL=https://easycv.seridian.dev \
E2E_SESSION_COOKIE='<test user easycv_seridian_session cookie>' \
E2E_UPLOAD_ID='<upload owned by that test user>' \
LLM_PROVIDER=openai OPENAI_API_KEY='<hosted provider key>' \
bunx playwright test e2e/hostedInference.smoke.spec.ts
```

For Anthropic, set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` instead.
The runner key is used as an explicit configuration gate; the request itself
uses the key configured on the target app server. The spec is skipped unless
both opt-in flags, a remote base URL, the test session cookie, upload ID, and
provider key are present. Do not use a developer's primary account or upload.
Do not point inference at local Ollama or a Tailscale host.
