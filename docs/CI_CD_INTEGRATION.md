# easyCV — Multi-Cloud CI/CD & Deployment Guide

This guide explains how to tie together **GitHub Actions**, **GitLab CI**, **Vultr Container Registry (VCR)**, **Vultr Kubernetes Engine (VKE)**, and **GitHub Pages** for fully automated developer workflows.

---

## 1. CI/CD Architecture

```
GitHub / GitLab Push (master / main)
   │
   ├──> 1. Automated Testing (.github/workflows/test.yml / .gitlab-ci.yml)
   │       ├── Bun Vitest Unit Tests & Next.js Build
   │       └── Python 3.13 Pytest Suite
   │
   ├──> 2. Multi-Arch Docker Build (.github/workflows/deploy.yml)
   │       ├── Builds linux/amd64 for Vultr nodes
   │       └── Pushes to Vultr Container Registry (registry.vultrcr.com)
   │
   ├──> 3. Autonomous Kubernetes Rollout (deploy.sh)
   │       ├── Applies PVC, Secrets, ConfigMaps, Deployments, Ingress
   │       ├── Waits for in-cluster Convex backend + dashboard
   │       ├── Auto-deploys schema (bunx convex deploy)
   │       └── Auto-configures WORKER_SECRET in Convex DB
   │
   └──> 4. Developer Documentation (.github/workflows/docs.yml)
           └── Deploys docs-site/ to GitHub Pages (gh-pages)
```

---

## 2. GitHub Actions Secrets Configuration

In your GitHub repository under **Settings → Secrets and variables → Actions**, set the following repository secrets:

| Secret Name | Description | Example |
|---|---|---|
| `VCR_REGISTRY` | Vultr Container Registry Host | `registry.vultrcr.com` |
| `VCR_PROJECT` | Vultr Container Registry Project Name | `my-easycv-registry` |
| `VCR_USERNAME` | VCR API Username / Key | `vultr-api-user` |
| `VCR_PASSWORD` | VCR API Password / Key Secret | `secret-token` |
| `KUBECONFIG` | Base64 or Raw YAML Kubeconfig from VKE | `apiVersion: v1...` |
| `DOMAIN` | Application Public Domain | `easycv.yourdomain.com` |
| `LETSENCRYPT_EMAIL` | Email for TLS cert-manager | `admin@yourdomain.com` |
| `CONVEX_MODE` | `self-hosted` (default) or `cloud` | `self-hosted` |
| `CONVEX_DEPLOY_KEY` | (Optional) Convex Cloud Deploy Key | `prod:easycv|...` |
| `POSTGRES_URL` | (Optional) Vultr Managed Postgres connection | `postgres://user:pass@host:5432/easycv?sslmode=require` |
| `WORKER_SECRET` | 32-byte secret for backend worker | `f84366a71052...` |
| `STRIPE_SECRET_KEY` | Stripe Secret Key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET`| Stripe Webhook Signing Key | `whsec_...` |
| `STRIPE_PRICE_ID` | Stripe Price ID | `price_...` |
| `STRIPE_PRO_PRICE_ID` | Stripe Pro Price ID | `price_...` |
| `OPENAI_API_KEY` | OpenAI API Key (if LLM_PROVIDER=openai) | `sk-...` |
| `ANTHROPIC_API_KEY` | Anthropic API Key (if LLM_PROVIDER=anthropic) | `sk-ant-...` |

---

## 3. GitLab Repository Mirroring

If you or your team use GitLab:
1. In GitLab: Go to **Settings → Repository → Mirroring repositories**.
2. Enter your GitHub repository URL (`https://github.com/4cecoder/easycv.git`) and Personal Access Token.
3. Configure identical variables in GitLab under **Settings → CI/CD → Variables** (`VCR_USERNAME`, `VCR_PASSWORD`, `KUBECONFIG_DATA`, `VCR_PROJECT`, `DOMAIN`).
4. Every push to GitHub will automatically mirror to GitLab and execute `.gitlab-ci.yml`.

---

## 4. GitHub Pages Developer Documentation

The developer documentation is located in `docs-site/index.html`.
- **Workflow**: `.github/workflows/docs.yml` automatically publishes changes to GitHub Pages on every push to `master`/`main`.
- **Enabling GitHub Pages**: Go to **Settings → Pages** in your GitHub repository and select **Source: GitHub Actions**.
- **URL**: `https://<username>.github.io/easycv/`

---

## 5. Local Kind Testing Before Deployment

To verify everything on your local macOS machine (ARM64) before pushing to production:
```bash
./test-local.sh
```

To clean up the local cluster:
```bash
./test-local.sh --teardown
```
