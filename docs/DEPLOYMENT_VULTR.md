# Self-Hosted Convex & easyCV on Vultr Kubernetes (VKE)

This document describes how to deploy easyCV with a **fully self-hosted Convex backend and Convex dashboard** to Vultr Kubernetes Engine (VKE), using either SQLite (PersistentVolume) or Vultr Managed PostgreSQL.

---

## Architecture Overview

```
Vultr Kubernetes Engine (VKE)
├── Namespace: easycv
│
├── Convex Backend (ghcr.io/get-convex/convex-backend:latest)
│   ├── Port 3210 (Client API & WebSocket)
│   ├── Port 3211 (HTTP actions / Site endpoint)
│   ├── PersistentVolume (SQLite fallback) OR Vultr Managed Postgres
│   └── Convex Dashboard (ghcr.io/get-convex/convex-dashboard:latest)
│       └── Port 6791 (Web UI for database tables, logs, file storage)
│
├── easyCV Frontend (Next.js 16) → 2 Replicas
├── easyCV Worker (Python daemon) → 1 Replica
│
├── Ingress (NGINX Ingress Controller + cert-manager Let's Encrypt TLS)
│   ├── easycv.yourdomain.com → Frontend:80
│   ├── convex.yourdomain.com/     → Convex Dashboard:6791
│   ├── convex.yourdomain.com/api  → Convex Backend API:3210
│   └── convex.yourdomain.com/http → Convex Backend Actions:3211
│
└── Managed Postgres (Vultr) [Optional Production Database]
```

---

## Storage & Database Strategy

### 1. SQLite with PersistentVolume (Default)
- **Zero configuration**: Runs out of the box using `k8s/convex-storage.yaml` (backed by Vultr Block Storage).
- Ideal for quick test setups, staging, and demo deployments.

### 2. Vultr Managed Postgres (Production Recommendation)
- High availability, automated backups, and survivability across node restarts.
- Add `POSTGRES_URL` in `.env.production` — Convex detects it automatically and switches the database driver to `postgres-v5`:
  ```bash
  POSTGRES_URL=postgres://vultradmin:secretpassword@vultr-db-host.vultrdb.com:16751/easycv?sslmode=require
  ```

### Multi-Architecture Support (macOS Apple Silicon ARM64 vs Vultr AMD64)
- **Local Testing (macOS M1 / Apple Silicon)**: `test-local.sh` and `docker-compose.yml` build images natively for `linux/arm64` for zero-lag native execution.
- **Production (Vultr VKE / x86_64)**: `deploy.sh` automatically targets `linux/amd64` via `docker buildx build --platform linux/amd64` when pushing to Vultr Container Registry (VCR), preventing `exec format error` issues on cloud nodes.

---

## Setup & Deployment Guide

### Prerequisites
- `kubectl` configured with your VKE cluster kubeconfig.
- `docker` and `bun` / `bunx` installed locally.
- A domain name pointing to your Vultr LoadBalancer IP.
- Vultr Container Registry (VCR) credentials.

### Step 1: Configure Environment
```bash
git clone https://github.com/4cecoder/easycv.git
cd easycv
cp .env.production.example .env.production
```

Edit `.env.production`:
- Set your domain (e.g. `DOMAIN=yourdomain.com`)
- Set `NEXT_PUBLIC_CONVEX_URL=https://convex.yourdomain.com/api`
- Set `CONVEX_URL=http://convex-backend:3210`
- Set `WORKER_SECRET` (generate with `openssl rand -hex 32`)
- *(Optional)* Add `POSTGRES_URL` for Vultr Managed Postgres.

### Step 2: Deploy Stack
Run the automated deployment script:
```bash
./deploy.sh
```

`deploy.sh` will:
1. Build and push frontend & worker Docker images to Vultr Container Registry.
2. Apply Kubernetes secrets, configmaps, persistent volumes, and deployments.
3. Wait for Convex backend, Convex dashboard, frontend, and worker rollouts.
4. Retrieve and display the self-hosted Convex Admin Key.

### Step 3: Initialize Convex Schema & Functions
Deploy your schema and functions to the newly created self-hosted Convex backend using `bunx`:

```bash
cd web
CONVEX_SELF_HOSTED_URL="https://convex.yourdomain.com/api" \
CONVEX_SELF_HOSTED_ADMIN_KEY="<ADMIN_KEY_FROM_STEP_2>" \
bunx convex deploy
```

Set the shared worker secret in Convex:
```bash
CONVEX_SELF_HOSTED_URL="https://convex.yourdomain.com/api" \
CONVEX_SELF_HOSTED_ADMIN_KEY="<ADMIN_KEY_FROM_STEP_2>" \
bunx convex env set WORKER_SECRET "<YOUR_WORKER_SECRET>"
```

---

## Local Testing with Kind (Kubernetes in Docker)

To verify the entire self-hosted stack locally before shipping to Vultr:

```bash
./test-local.sh
```

This spins up a local Kind cluster with port mapping:
- **Frontend UI**: [http://localhost:8080](http://localhost:8080)
- **Convex Dashboard**: [http://localhost:6791](http://localhost:6791)
- **Convex Backend API**: [http://localhost:3210](http://localhost:3210)

To tear down the local cluster when done:
```bash
./test-local.sh --teardown
```

---

## Local Testing with Docker Compose

You can also run the full stack via Docker Compose:

```bash
docker compose up -d
```
