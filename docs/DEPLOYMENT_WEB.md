# easyCV Web — Deployment Guide

## Prerequisites

### 1. Private package: `@bytecats/ui-kit`

The app imports shadcn/ui-style components from the private package
`@bytecats/ui-kit`, referenced in `package.json` as:

```
"@bytecats/ui-kit": "git+ssh://git@github.com/4cecoder/ui-kit.git"
```

The local `components/` directory is intentionally empty — all UI components
are resolved from this package at install time.

**Netlify build will fail** unless Netlify's build environment can
authenticate to GitHub to clone this private repository.

#### Setting up SSH access for Netlify

1. Generate a dedicated deploy key (no passphrase):

   ```bash
   ssh-keygen -t ed25519 -C "netlify-deploy@easycv" -f /tmp/netlify-deploy-key
   ```

2. Add the **public** key as a **Deploy Key** (read-only) on the
   [ui-kit repository](https://github.com/4cecoder/ui-kit/settings/keys).

3. Add the **private** key as a Netlify environment variable:

   | Variable | Value |
   |---|---|
   | `NETLIFY_SSH_KEY` | raw contents of the private key file |

   Netlify's build image will use this key for SSH-authenticated git
   operations.  See
   https://docs.netlify.com/configure-builds/environment-variables/#ssh-key

#### Alternative: GitHub personal access token

If SSH deploy keys are not an option, replace the `package.json` dependency
with a token-authenticated HTTPS URL:

```
"@bytecats/ui-kit": "https://x-access-token:<GH_TOKEN>@github.com/4cecoder/ui-kit.git"
```

Set `GH_TOKEN` as a Netlify environment variable and interpolate before
install (requires a `preinstall` or build-script wrapper).

### 2. Environment Variables

Set these in the Netlify dashboard (**Site Settings → Environment Variables**):

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Yes | Convex deployment URL (e.g. `https://<project>.convex.cloud`) |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (starts with `sk_live_` or `sk_test_`) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret (starts with `whsec_`) |
| `STRIPE_PRICE_ID` | Yes | Stripe Price ID for the checkout product |
| `APP_URL` | Yes | Canonical HTTPS origin; production is `https://easycv.seridian.dev` and callback is `${APP_URL}/api/auth/callback` |
| `SERIDIAN_AUTH_ISSUER` | Yes | Exact issuer value published by the Seridian OIDC discovery document |
| `SERIDIAN_AUTH_CLIENT_ID` | Yes | EasyCV relying-party client ID registered in Seridian Auth |
| `SERIDIAN_AUTH_CLIENT_SECRET` | Yes | EasyCV relying-party secret; store as a deployment secret |
| `ADMIN_EMAILS` | Yes, in web and Convex environments | Comma-separated verified Seridian emails allowed to use EasyCV admin functions |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | PostHog project API key (app works without it) |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | PostHog host (defaults to `https://us.i.posthog.com`) |
| `NEXT_PUBLIC_STRIPE_CLIENT_ID` | No | Stripe Connect client ID for admin (defaults to `ca_12345`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | No | Stripe publishable key (starts with `pk_live_` or `pk_test_`) |
| `LLM_PROVIDER` | Yes for job matching | Hosted provider: `openai` (default) or `anthropic`; serverless job matching rejects local Ollama |
| `LLM_MODEL` | No | Provider-specific model override |
| `OPENAI_API_KEY` | Yes when `LLM_PROVIDER=openai` | Hosted OpenAI credential; store as a deployment secret |
| `ANTHROPIC_API_KEY` | Yes when `LLM_PROVIDER=anthropic` | Hosted Anthropic credential; store as a deployment secret |

The serverless job-match endpoint calls the configured hosted provider directly. It does not invoke `uv`, Python, a Tailscale URL, or a local Ollama endpoint. The separate Convex worker also needs the selected hosted provider key and `WORKER_SECRET` in its own runtime environment to process queued resume uploads; configuring the web deployment alone does not configure that worker.

Set the same `ADMIN_EMAILS` allowlist in both the web app environment (for
metrics and Stripe Connect routes) and Convex deployment environment (for
admin mutations). Keep Stripe credentials in the web host and Convex
deployment, and keep `WORKER_SECRET` plus the selected hosted inference key in
the worker and Convex deployment. The OIDC client secret belongs only in the
web host. For example:

```bash
bunx convex env set SERIDIAN_AUTH_ISSUER https://auth.seridian.dev
bunx convex env set SERIDIAN_AUTH_CLIENT_ID ...
bunx convex env set STRIPE_SECRET_KEY ...
bunx convex env set STRIPE_WEBHOOK_SECRET ...
bunx convex env set STRIPE_PRICE_ID ...
bunx convex env set STRIPE_PRO_PRICE_ID ...
bunx convex env set APP_URL https://easycv.seridian.dev
bunx convex env set WORKER_SECRET ...
bunx convex env set ADMIN_EMAILS "admin@example.com,another-admin@example.com"
```

Convex actions (in `convex/http.ts`, `convex/admin.ts`, `convex/workerAuth.ts`)
read `process.env` from Convex's own deployment environment — they cannot see
Netlify's environment variables.

## Build & Deploy

The `netlify.toml` at the project root configures the build:

- **Build command**: `bun run build` (uses Bun as the package manager)
- **Publish directory**: `.next`
- **Node version**: 20 (set automatically or via `NODE_VERSION` env var)

### First-time deploy

1. Push the repository to GitHub.
2. In Netlify, click **Add new site → Import an existing project**.
3. Connect your GitHub repo.
4. Netlify auto-detects Next.js and pre-fills the build settings.
5. Add all required environment variables (see above).
6. Set up the SSH deploy key for `@bytecats/ui-kit` (see §1).
7. Click **Deploy**.

### Concurrency & long-running tasks

The upload API route finishes in << 1 second (it saves files to Convex storage
and queues a background job). The actual resume consolidation runs in a
separate long-lived `worker.py` process (not on Netlify). API routes that
call Stripe or Convex have a 26-second function timeout configured in
`netlify.toml`.

## Troubleshooting

**Build fails with "Host key verification failed"**
→ The SSH deploy key for `@bytecats/ui-kit` is not set up. See §1 above.

**Build fails with "Cannot find module '@bytecats/ui-kit'"**
→ The private package could not be installed. Check Netlify build logs for
  git authentication errors.

**Pages return 404 on direct navigation (e.g. `/preview/some-id`)**
→ The SPA redirect rules in `netlify.toml` may not be routing correctly.
  Check that `___netlify-server-handler` exists in the deployed functions.

**Stripe webhook returns 400**
→ `STRIPE_WEBHOOK_SECRET` and `STRIPE_SECRET_KEY` must be set in **both**
  Netlify AND Convex environments (see §2 above).
