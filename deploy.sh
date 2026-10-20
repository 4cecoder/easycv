#!/usr/bin/env bash
set -euo pipefail

# easyCV — one-command deploy to Vultr Kubernetes
# Usage: ./deploy.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S="${SCRIPT_DIR}/k8s"
ENV="${SCRIPT_DIR}/.env.production"
NS="easycv"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

# ── Config (override via env vars or edit these) ─────────────────────────────
# Vultr Container Registry — get this from cloud.vultr.com/container-registry
VCR_REGISTRY="registry.vultrcr.com"
VCR_PROJECT="${VCR_PROJECT:?Set VCR_PROJECT (Vultr Container Registry project name)}"
DOMAIN="${DOMAIN:?Set DOMAIN (e.g. easycv.example.com)}"
EMAIL="${EMAIL:?Set EMAIL (for Let's Encrypt TLS certs)}"
DOMAIN_EMAILS=("${DOMAIN}" "www.${DOMAIN}")

# ── Sensible defaults (no need to set these unless overriding) ────────────────
CONVEX_MODE="${CONVEX_MODE:-}"
# Production worker inference must not depend on a developer workstation or
# tailnet service. Choose a hosted provider by default; environment variables
# still take precedence, followed by values in .env.production.
LLM_PROVIDER="${LLM_PROVIDER:-}"
LLM_MODEL="${LLM_MODEL:-}"
OLLAMA_API_BASE="${OLLAMA_API_BASE:-}"
APP_URL="${APP_URL:-}"
# ─────────────────────────────────────────────────────────────────────────────

die() { echo -e "${RED}ERROR:${NC} $*" >&2; exit 1; }
ok() { echo -e "${GREEN}✓${NC} $*"; }

# ── Helper: read value (env var, then .env.production, then optional default) ─
get() {
  local spec="$1" key="${1%%:-*}" fallback="" value
  if [[ "$spec" == *":-"* ]]; then fallback="${spec#*:-}"; fi
  value="${!key:-}"
  if [[ -z "$value" && -f "$ENV" ]]; then
    value="$(grep -E "^${key}=" "$ENV" 2>/dev/null | head -1 | cut -d'=' -f2-)"
  fi
  if [[ -n "$value" ]]; then echo "$value"; else echo "$fallback"; fi
}

APP_URL="$(get APP_URL:-https://${DOMAIN})"

WORKER_SECRET="$(get WORKER_SECRET:-)"
if [[ -z "$WORKER_SECRET" ]]; then
  WORKER_SECRET="$(openssl rand -hex 32)"
  echo -e "${CYAN}Auto-generated WORKER_SECRET${NC}"
fi

# Resolve and validate OIDC settings before building images or changing cluster
# state. Auth is required for every production deployment.
SERIDIAN_AUTH_ISSUER="$(get SERIDIAN_AUTH_ISSUER)"
SERIDIAN_AUTH_CLIENT_ID="$(get SERIDIAN_AUTH_CLIENT_ID)"
SERIDIAN_AUTH_CLIENT_SECRET="$(get SERIDIAN_AUTH_CLIENT_SECRET)"
ADMIN_EMAILS="$(get ADMIN_EMAILS)"
[[ -n "$SERIDIAN_AUTH_ISSUER" ]] || die "Set SERIDIAN_AUTH_ISSUER in the environment or .env.production"
[[ -n "$SERIDIAN_AUTH_CLIENT_ID" ]] || die "Set SERIDIAN_AUTH_CLIENT_ID in the environment or .env.production"
[[ -n "$SERIDIAN_AUTH_CLIENT_SECRET" ]] || die "Set SERIDIAN_AUTH_CLIENT_SECRET in the environment or .env.production"
[[ -n "$ADMIN_EMAILS" ]] || die "Set ADMIN_EMAILS (comma-separated verified admin emails) in the environment or .env.production"
for name in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_ID STRIPE_PRO_PRICE_ID; do
  [[ -n "$(get "$name")" ]] || die "Set $name in the environment or .env.production to preserve production billing"
done

# Production inference must use a reachable hosted provider with its key
# provisioned before any image build or cluster mutation begins.
LLM_PROVIDER="$(get LLM_PROVIDER:-openai)"
OPENAI_API_KEY="$(get OPENAI_API_KEY:-)"
ANTHROPIC_API_KEY="$(get ANTHROPIC_API_KEY:-)"
case "$LLM_PROVIDER" in
  openai) [[ -n "$OPENAI_API_KEY" ]] || die "LLM_PROVIDER=openai requires OPENAI_API_KEY in the environment or .env.production" ;;
  anthropic) [[ -n "$ANTHROPIC_API_KEY" ]] || die "LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY in the environment or .env.production" ;;
  *) die "Unsupported production LLM_PROVIDER '$LLM_PROVIDER'; choose openai or anthropic" ;;
esac

CONVEX_MODE="$(get CONVEX_MODE:-self-hosted)"
CONVEX_DEPLOY_KEY="$(get CONVEX_DEPLOY_KEY:-)"
NEXT_CONVEX_URL="$(get NEXT_PUBLIC_CONVEX_URL:-)"
if [[ "$CONVEX_MODE" == "cloud" || "$NEXT_CONVEX_URL" == *".convex.cloud"* || -n "$CONVEX_DEPLOY_KEY" ]]; then
  IS_CLOUD=true
  [[ -n "$CONVEX_DEPLOY_KEY" ]] || die "Convex Cloud requires CONVEX_DEPLOY_KEY so Auth environment variables can be configured safely"
else
  IS_CLOUD=false
fi

# ── Preflight ───────────────────────────────────────────────────────────────
command -v kubectl &>/dev/null || die "kubectl not found"
command -v docker &>/dev/null  || die "docker not found"
[[ -f "$ENV" ]] || echo -e "${YELLOW}Note: .env.production not found — using env vars only${NC}"

# ── Docker login (for local execution — GitHub Actions handles this separately)
if [[ -n "${VCR_USERNAME:-}" && -n "${VCR_PASSWORD:-}" ]]; then
  echo -e "${YELLOW}Logging into Vultr Container Registry...${NC}"
  echo "$VCR_PASSWORD" | docker login "${VCR_REGISTRY}" -u "$VCR_USERNAME" --password-stdin
fi

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

# ── Create namespace ────────────────────────────────────────────────────────
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -

# ── Create registry pull secret (idempotent) ────────────────────────────────
kubectl create secret docker-registry vultr-registry-credentials \
  --docker-server="$VCR_REGISTRY" \
  --docker-username="$(kubectl get secret vultr-registry-credentials -n "$NS" -o jsonpath='{.data.\.dockerconfigjson}' 2>/dev/null | base64 -d | python3 -c 'import sys,json; print(json.load(sys.stdin)["auths"]["'"$VCR_REGISTRY"'"]["username"])' 2>/dev/null || echo '')" \
  --docker-password="$(kubectl get secret vultr-registry-credentials -n "$NS" -o jsonpath='{.data.\.dockerconfigjson}' 2>/dev/null | base64 -d | python3 -c 'import sys,json; print(json.load(sys.stdin)["auths"]["'"$VCR_REGISTRY"'"]["password"])' 2>/dev/null || echo '')" \
  -n "$NS" 2>/dev/null || true

# ── Determine Convex Deployment Mode (Cloud vs Self-Hosted) ───────────────────
if [[ "$IS_CLOUD" == true ]]; then
  echo -e "${CYAN}Convex Mode: CLOUD (${NEXT_CONVEX_URL})${NC}"
else
  IS_CLOUD=false
  echo -e "${CYAN}Convex Mode: SELF-HOSTED (In-cluster backend + dashboard)${NC}"
fi

# ── Secrets from .env.production ─────────────────────────────────────────────
INSTANCE_NAME="$(get INSTANCE_NAME:-easycv-prod)"
INSTANCE_SECRET="$(get INSTANCE_SECRET:-)"
if [[ -z "$INSTANCE_SECRET" || "$INSTANCE_SECRET" == "generate_with_openssl_rand_hex_32" ]]; then
  INSTANCE_SECRET="$(openssl rand -hex 32)"
fi
POSTGRES_URL="$(get POSTGRES_URL:-)"
POSTGRES_PASSWORD="$(get POSTGRES_PASSWORD:-)"

if [[ "$IS_CLOUD" == true ]]; then
  INTERNAL_CONVEX_URL="$NEXT_CONVEX_URL"
  INTERNAL_SITE_URL="${NEXT_CONVEX_URL/convex.cloud/convex.site}"
else
  INTERNAL_CONVEX_URL="$(get CONVEX_URL:-http://convex-backend:3210)"
  INTERNAL_SITE_URL="$(get CONVEX_SITE_URL:-http://convex-backend:3211)"
  NEXT_CONVEX_URL="https://convex.${DOMAIN}/api"
fi

# Keep each workload limited to the secrets it needs. In particular, the
# worker must never receive the OIDC client secret or Stripe credentials.
kubectl create secret generic easycv-secrets -n "$NS" \
  --from-literal=INSTANCE_SECRET="$INSTANCE_SECRET" \
  --from-literal=POSTGRES_URL="$POSTGRES_URL" \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=CONVEX_SELF_HOSTED_ADMIN_KEY="${INSTANCE_NAME}|${INSTANCE_SECRET}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic easycv-web-secrets -n "$NS" \
  --from-literal=SERIDIAN_AUTH_ISSUER="$SERIDIAN_AUTH_ISSUER" \
  --from-literal=SERIDIAN_AUTH_CLIENT_ID="$SERIDIAN_AUTH_CLIENT_ID" \
  --from-literal=SERIDIAN_AUTH_CLIENT_SECRET="$SERIDIAN_AUTH_CLIENT_SECRET" \
  --from-literal=ADMIN_EMAILS="$ADMIN_EMAILS" \
  --from-literal=STRIPE_SECRET_KEY="$(get STRIPE_SECRET_KEY)" \
  --from-literal=STRIPE_WEBHOOK_SECRET="$(get STRIPE_WEBHOOK_SECRET)" \
  --from-literal=STRIPE_PRICE_ID="$(get STRIPE_PRICE_ID)" \
  --from-literal=STRIPE_PRO_PRICE_ID="$(get STRIPE_PRO_PRICE_ID)" \
  --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY" \
  --from-literal=ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic easycv-worker-secrets -n "$NS" \
  --from-literal=CONVEX_URL="$INTERNAL_CONVEX_URL" \
  --from-literal=WORKER_SECRET="$(get WORKER_SECRET)" \
  --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY" \
  --from-literal=ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

# ── ConfigMap ────────────────────────────────────────────────────────────────
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: easycv-config
  namespace: ${NS}
data:
  INSTANCE_NAME: "${INSTANCE_NAME}"
  CONVEX_CLOUD_ORIGIN: "${NEXT_CONVEX_URL}"
  CONVEX_SITE_ORIGIN: "${INTERNAL_SITE_URL}"
  CONVEX_URL: "${INTERNAL_CONVEX_URL}"
  CONVEX_SITE_URL: "${INTERNAL_SITE_URL}"
  NEXT_PUBLIC_CONVEX_URL: "${NEXT_CONVEX_URL}"
  NEXT_PUBLIC_POSTHOG_KEY: "$(get NEXT_PUBLIC_POSTHOG_KEY:-)"
  APP_URL: "$(get APP_URL:-https://${DOMAIN})"
  LLM_PROVIDER: "$LLM_PROVIDER"
  LLM_MODEL: "$(get LLM_MODEL:-gpt-4o)"
  OLLAMA_API_BASE: "$(get OLLAMA_API_BASE:-)"
EOF

# ── Patch manifests with real values and apply ───────────────────────────────
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

for f in "$K8S"/*.yaml; do
  name=$(basename "$f")
  case "$name" in
    secrets.yaml|configmap.yaml) continue ;;
  esac
  cp "$f" "$TMP/$name"
done

# Patch image references and domain substitutions
sed -i.bak "s|your-registry|${VCR_PROJECT}|g" "$TMP"/*.yaml
sed -i.bak "s|your-domain.com|${DOMAIN}|g" "$TMP"/*.yaml
sed -i.bak "s|your-email@example.com|${EMAIL}|g" "$TMP"/*.yaml
rm -f "$TMP"/*.bak

# Apply base manifests
kubectl apply -f "$TMP/namespace.yaml"

if [[ "$IS_CLOUD" == false ]]; then
  kubectl apply -f "$TMP/convex-storage.yaml"   -n "$NS"
  kubectl apply -f "$TMP/convex-backend.yaml"   -n "$NS"
  kubectl apply -f "$TMP/convex-dashboard.yaml" -n "$NS"
fi

kubectl apply -f "$TMP/frontend-deployment.yaml" -n "$NS"
kubectl apply -f "$TMP/frontend-service.yaml"    -n "$NS"
kubectl apply -f "$TMP/worker-deployment.yaml"   -n "$NS"
kubectl apply -f "$TMP/cert-manager-issuer.yaml"
kubectl apply -f "$TMP/ingress.yaml"             -n "$NS"

# ── Wait for Deployments ────────────────────────────────────────────────────
echo -e "${YELLOW}Waiting for rollout...${NC}"
if [[ "$IS_CLOUD" == false ]]; then
  kubectl rollout status deployment/convex-backend   -n "$NS" --timeout=300s
  kubectl rollout status deployment/convex-dashboard -n "$NS" --timeout=300s
fi
kubectl rollout status deployment/easycv-frontend  -n "$NS" --timeout=300s
kubectl rollout status deployment/easycv-worker    -n "$NS" --timeout=300s

# ── Auto-Deploy Schema & Worker Auth ─────────────────────────────────────────
if [[ "$IS_CLOUD" == true ]]; then
  if [[ -n "$CONVEX_DEPLOY_KEY" ]]; then
    echo -e "${YELLOW}Configuring worker and Seridian Auth environment on Convex Cloud...${NC}"
    for name in WORKER_SECRET SERIDIAN_AUTH_ISSUER SERIDIAN_AUTH_CLIENT_ID ADMIN_EMAILS APP_URL STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_ID STRIPE_PRO_PRICE_ID; do
      value="$(get "$name")"
      (cd web && CONVEX_DEPLOY_KEY="${CONVEX_DEPLOY_KEY}" bunx convex env set --force "$name" "$value") || die "Could not configure Convex Cloud variable $name"
    done
    echo -e "${YELLOW}Deploying schema and Auth config to Convex Cloud with deploy key...${NC}"
    (cd web && CONVEX_DEPLOY_KEY="${CONVEX_DEPLOY_KEY}" bunx convex deploy 2>&1 | tail -5) || die "Convex Cloud schema deploy failed"
  fi
else
  ADMIN_KEY=$(kubectl exec deploy/convex-backend -n "$NS" -- ./generate_admin_key.sh | tail -n 1 2>/dev/null || echo "${INSTANCE_NAME}|${INSTANCE_SECRET}")

  TMP_ENV=$(mktemp)
  echo "CONVEX_SELF_HOSTED_URL=https://convex.${DOMAIN}/api" > "$TMP_ENV"
  echo "CONVEX_SELF_HOSTED_ADMIN_KEY=${ADMIN_KEY}" >> "$TMP_ENV"

  echo -e "${YELLOW}Configuring worker and Seridian Auth environment in self-hosted Convex...${NC}"
  for name in WORKER_SECRET SERIDIAN_AUTH_ISSUER SERIDIAN_AUTH_CLIENT_ID ADMIN_EMAILS APP_URL STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_ID STRIPE_PRO_PRICE_ID; do
    value="$(get "$name")"
    (cd web && bunx convex env set --force --env-file "$TMP_ENV" "$name" "$value") || die "Could not configure self-hosted Convex variable $name"
  done
  echo -e "${YELLOW}Deploying schema and Auth config to live self-hosted backend...${NC}"
  (cd web && bunx convex deploy --env-file "$TMP_ENV" 2>&1 | tail -5) || die "Self-hosted Convex schema deploy failed"
  rm -f "$TMP_ENV"
fi

# ── Done ────────────────────────────────────────────────────────────────────
IP=$(kubectl get svc easycv-frontend -n "$NS" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")

echo ""
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Autonomous Deployment Complete!${NC}"
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}App URL:${NC}          https://${DOMAIN}"
if [[ "$IS_CLOUD" == true ]]; then
  echo -e "  ${GREEN}Convex Endpoint:${NC} ${NEXT_CONVEX_URL} (Cloud)"
else
  echo -e "  ${GREEN}Convex Dashboard:${NC} https://convex.${DOMAIN}"
  echo -e "  ${GREEN}Convex Backend:${NC}   https://convex.${DOMAIN}/api"
fi
echo -e "  ${GREEN}External IP:${NC}      ${IP}"
echo -e "  ${GREEN}Namespace:${NC}        ${NS}"
echo ""
echo -e "  ${GREEN}Status:${NC} Deployment rollout commands completed; run the production smoke and E2E checks."
echo ""
