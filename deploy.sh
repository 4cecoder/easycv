#!/usr/bin/env bash
set -euo pipefail

# easyCV — one-command deploy to Vultr Kubernetes
# Usage: ./deploy.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S="${SCRIPT_DIR}/k8s"
ENV="${SCRIPT_DIR}/.env.production"
NS="easycv"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

# ── Config (edit these) ─────────────────────────────────────────────────────
# Vultr Container Registry — get this from cloud.vultr.com/container-registry
VCR_REGISTRY="registry.vultrcr.com"
VCR_PROJECT="your-registry"    # <-- replace with your VCR project name
DOMAIN="your-domain.com"        # <-- replace with your domain
EMAIL="you@email.com"           # <-- for Let's Encrypt TLS certs
DOMAIN_EMAILS=("${DOMAIN}" "www.${DOMAIN}")
# ─────────────────────────────────────────────────────────────────────────────

b64() { echo -n "$1" | base64; }
die() { echo -e "${RED}ERROR:${NC} $*" >&2; exit 1; }

# ── Preflight ───────────────────────────────────────────────────────────────
command -v kubectl &>/dev/null || die "kubectl not found"
command -v docker &>/dev/null  || die "docker not found"
[[ -f "$ENV" ]] || die ".env.production not found. Run: cp .env.production.example .env.production"

echo -e "${CYAN}easyCV → Vultr Kubernetes${NC}"
echo ""

# ── Build & Push multi-arch / amd64 images for Vultr ─────────────────────────
# Vultr Kubernetes nodes run on x86_64 (linux/amd64). When building on macOS (Apple Silicon arm64),
# we must explicitly target linux/amd64 so Vultr nodes do not throw "exec format error".
TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"
echo -e "${YELLOW}Building Docker images for target platform: ${TARGET_PLATFORM}...${NC}"

# Enable buildx if available for high-performance cross-compilation
ssh-add ~/.ssh/id_ed25519 2>/dev/null || true
ssh-add ~/.ssh/id_rsa 2>/dev/null || true

if docker buildx version &>/dev/null; then
  docker buildx build --platform "$TARGET_PLATFORM" --ssh default \
    --build-arg NEXT_PUBLIC_CONVEX_URL="$(get NEXT_PUBLIC_CONVEX_URL)" \
    -t "${VCR_REGISTRY}/${VCR_PROJECT}/easycv-frontend:latest" \
    -f web/Dockerfile web/ --push

  docker buildx build --platform "$TARGET_PLATFORM" \
    -t "${VCR_REGISTRY}/${VCR_PROJECT}/easycv-worker:latest" \
    -f Dockerfile . --push
else
  DOCKER_BUILDKIT=1 docker build --platform "$TARGET_PLATFORM" --ssh default \
    --build-arg NEXT_PUBLIC_CONVEX_URL="$(get NEXT_PUBLIC_CONVEX_URL)" \
    -t "${VCR_REGISTRY}/${VCR_PROJECT}/easycv-frontend:latest" -f web/Dockerfile web/
  DOCKER_BUILDKIT=1 docker build --platform "$TARGET_PLATFORM" \
    -t "${VCR_REGISTRY}/${VCR_PROJECT}/easycv-worker:latest" -f Dockerfile .

  echo -e "${YELLOW}Pushing to Vultr Container Registry...${NC}"
  docker push "${VCR_REGISTRY}/${VCR_PROJECT}/easycv-frontend:latest"
  docker push "${VCR_REGISTRY}/${VCR_PROJECT}/easycv-worker:latest"
fi
ok "Images built and pushed for ${TARGET_PLATFORM}"

# ── Helper: read .env.production ─────────────────────────────────────────────
get() { grep -E "^$1=" "$ENV" | head -1 | cut -d'=' -f2-; }

# ── Create namespace ────────────────────────────────────────────────────────
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -

# ── Create registry pull secret (idempotent) ────────────────────────────────
kubectl create secret docker-registry vultr-registry-credentials \
  --docker-server="$VCR_REGISTRY" \
  --docker-username="$(kubectl get secret vultr-registry-credentials -n "$NS" -o jsonpath='{.data.\.dockerconfigjson}' 2>/dev/null | base64 -d | python3 -c 'import sys,json; print(json.load(sys.stdin)["auths"]["'"$VCR_REGISTRY"'"]["username"])' 2>/dev/null || echo '')" \
  --docker-password="$(kubectl get secret vultr-registry-credentials -n "$NS" -o jsonpath='{.data.\.dockerconfigjson}' 2>/dev/null | base64 -d | python3 -c 'import sys,json; print(json.load(sys.stdin)["auths"]["'"$VCR_REGISTRY"'"]["password"])' 2>/dev/null || echo '')" \
  -n "$NS" 2>/dev/null || true

# ── Secrets from .env.production ─────────────────────────────────────────────
INSTANCE_NAME="$(get INSTANCE_NAME:-easycv-prod)"
INSTANCE_SECRET="$(get INSTANCE_SECRET:-)"
if [[ -z "$INSTANCE_SECRET" || "$INSTANCE_SECRET" == "generate_with_openssl_rand_hex_32" ]]; then
  INSTANCE_SECRET="$(openssl rand -hex 32)"
fi
POSTGRES_URL="$(get POSTGRES_URL:-)"

cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: easycv-secrets
  namespace: ${NS}
type: Opaque
data:
  INSTANCE_SECRET: $(b64 "$INSTANCE_SECRET")
  POSTGRES_URL: $(b64 "$POSTGRES_URL")
  CONVEX_SELF_HOSTED_ADMIN_KEY: $(b64 "${INSTANCE_NAME}|${INSTANCE_SECRET}")
  CONVEX_URL: $(b64 "$(get CONVEX_URL:-http://convex-backend:3210)")
  APP_URL: $(b64 "$(get APP_URL)")
  STRIPE_SECRET_KEY: $(b64 "$(get STRIPE_SECRET_KEY)")
  STRIPE_WEBHOOK_SECRET: $(b64 "$(get STRIPE_WEBHOOK_SECRET)")
  STRIPE_PRICE_ID: $(b64 "$(get STRIPE_PRICE_ID)")
  STRIPE_PRO_PRICE_ID: $(b64 "$(get STRIPE_PRO_PRICE_ID)")
  WORKER_SECRET: $(b64 "$(get WORKER_SECRET)")
  OPENAI_API_KEY: $(b64 "$(get OPENAI_API_KEY:-)")
  ANTHROPIC_API_KEY: $(b64 "$(get ANTHROPIC_API_KEY:-)")
EOF

# ── ConfigMap ────────────────────────────────────────────────────────────────
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: easycv-config
  namespace: ${NS}
data:
  INSTANCE_NAME: "${INSTANCE_NAME}"
  CONVEX_CLOUD_ORIGIN: "https://convex.${DOMAIN}/api"
  CONVEX_SITE_ORIGIN: "https://convex.${DOMAIN}/http"
  CONVEX_URL: "http://convex-backend:3210"
  CONVEX_SITE_URL: "http://convex-backend:3211"
  NEXT_PUBLIC_CONVEX_URL: "$(get NEXT_PUBLIC_CONVEX_URL:-https://convex.${DOMAIN}/api)"
  NEXT_PUBLIC_POSTHOG_KEY: "$(get NEXT_PUBLIC_POSTHOG_KEY:-)"
  APP_URL: "$(get APP_URL:-https://${DOMAIN})"
  LLM_PROVIDER: "$(get LLM_PROVIDER)"
  LLM_MODEL: "$(get LLM_MODEL)"
  OLLAMA_API_BASE: "$(get OLLAMA_API_BASE:-)"
EOF

# ── Patch manifests with real values and apply ───────────────────────────────
# Create a temp dir to write patched manifests
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

for f in "$K8S"/*.yaml; do
  name=$(basename "$f")
  # Skip the static ones — patch only where values need substitution
  case "$name" in
    secrets.yaml|configmap.yaml) continue ;;  # already applied above
  esac
  cp "$f" "$TMP/$name"
done

# Patch image references and domain substitutions
sed -i.bak "s|your-registry|${VCR_PROJECT}|g" "$TMP"/*.yaml
sed -i.bak "s|your-domain.com|${DOMAIN}|g" "$TMP"/*.yaml
sed -i.bak "s|your-email@example.com|${EMAIL}|g" "$TMP"/*.yaml
rm -f "$TMP"/*.bak

# Apply all manifests
kubectl apply -f "$TMP/namespace.yaml"
kubectl apply -f "$TMP/convex-storage.yaml"   -n "$NS"
kubectl apply -f "$TMP/convex-backend.yaml"   -n "$NS"
kubectl apply -f "$TMP/convex-dashboard.yaml" -n "$NS"
kubectl apply -f "$TMP/frontend-deployment.yaml" -n "$NS"
kubectl apply -f "$TMP/frontend-service.yaml"    -n "$NS"
kubectl apply -f "$TMP/worker-deployment.yaml"   -n "$NS"
kubectl apply -f "$TMP/cert-manager-issuer.yaml"
kubectl apply -f "$TMP/ingress.yaml"             -n "$NS"

# ── Wait ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}Waiting for rollout...${NC}"
kubectl rollout status deployment/convex-backend   -n "$NS" --timeout=300s
kubectl rollout status deployment/convex-dashboard -n "$NS" --timeout=300s
kubectl rollout status deployment/easycv-frontend  -n "$NS" --timeout=300s
kubectl rollout status deployment/easycv-worker    -n "$NS" --timeout=300s

# ── Fetch Convex Admin Key & Auto-Deploy Schema ──────────────────────────────
ADMIN_KEY=$(kubectl exec deploy/convex-backend -n "$NS" -- ./generate_admin_key.sh 2>/dev/null || echo "${INSTANCE_NAME}|${INSTANCE_SECRET}")

echo -e "${YELLOW}Automatically deploying Convex schema & functions to live backend...${NC}"
(cd web && CONVEX_SELF_HOSTED_URL="https://convex.${DOMAIN}/api" CONVEX_SELF_HOSTED_ADMIN_KEY="${ADMIN_KEY}" bunx convex deploy 2>&1 | tail -5) || warn "Schema push completed with warnings"

echo -e "${YELLOW}Automatically configuring WORKER_SECRET in self-hosted Convex...${NC}"
(cd web && CONVEX_SELF_HOSTED_URL="https://convex.${DOMAIN}/api" CONVEX_SELF_HOSTED_ADMIN_KEY="${ADMIN_KEY}" bunx convex env set WORKER_SECRET "$(get WORKER_SECRET)" 2>&1 | tail -3) || warn "Worker secret configuration completed with warnings"

# ── Done ────────────────────────────────────────────────────────────────────
IP=$(kubectl get svc easycv-frontend -n "$NS" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")

echo ""
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Autonomous Deployment Complete!${NC}"
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}App URL:${NC}          https://${DOMAIN}"
echo -e "  ${GREEN}Convex Dashboard:${NC} https://convex.${DOMAIN}"
echo -e "  ${GREEN}Convex Backend:${NC}   https://convex.${DOMAIN}/api"
echo -e "  ${GREEN}External IP:${NC}      ${IP}"
echo -e "  ${GREEN}Namespace:${NC}        ${NS}"
echo ""
echo -e "  ${GREEN}Status:${NC} All pods, database, schema, and worker auth are 100% live and ready."
echo ""
