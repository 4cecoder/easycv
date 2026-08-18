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

# ── Build images ────────────────────────────────────────────────────────────
echo -e "${YELLOW}Building Docker images...${NC}"
docker build -t "${VCR_REGISTRY}/${VCR_PROJECT}/easycv-frontend:latest" -f web/Dockerfile web/
docker build -t "${VCR_REGISTRY}/${VCR_PROJECT}/easycv-worker:latest"   -f Dockerfile .

echo -e "${YELLOW}Pushing to Vultr Container Registry...${NC}"
docker push "${VCR_REGISTRY}/${VCR_PROJECT}/easycv-frontend:latest"
docker push "${VCR_REGISTRY}/${VCR_PROJECT}/easycv-worker:latest"

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
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: easycv-secrets
  namespace: ${NS}
type: Opaque
data:
  CONVEX_URL: $(b64 "$(get CONVEX_URL)")
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
  NEXT_PUBLIC_CONVEX_URL: "$(get NEXT_PUBLIC_CONVEX_URL)"
  NEXT_PUBLIC_POSTHOG_KEY: "$(get NEXT_PUBLIC_POSTHOG_KEY:-)"
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

# Patch image references
sed -i.bak "s|your-registry|${VCR_PROJECT}|g" "$TMP"/*.yaml
sed -i.bak "s|your-domain.com|${DOMAIN}|g" "$TMP"/*.yaml
sed -i.bak "s|your-email@example.com|${EMAIL}|g" "$TMP"/*.yaml
rm -f "$TMP"/*.bak

# Apply all manifests
kubectl apply -f "$TMP/namespace.yaml"
kubectl apply -f "$TMP/frontend-deployment.yaml" -n "$NS"
kubectl apply -f "$TMP/frontend-service.yaml"    -n "$NS"
kubectl apply -f "$TMP/worker-deployment.yaml"   -n "$NS"
kubectl apply -f "$TMP/cert-manager-issuer.yaml"
kubectl apply -f "$TMP/ingress.yaml"             -n "$NS"

# ── Wait ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}Waiting for rollout...${NC}"
kubectl rollout status deployment/easycv-frontend -n "$NS" --timeout=300s
kubectl rollout status deployment/easycv-worker   -n "$NS" --timeout=300s

# ── Done ────────────────────────────────────────────────────────────────────
IP=$(kubectl get svc easycv-frontend -n "$NS" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")

echo ""
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Deployed!${NC}"
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}External IP:${NC}  ${IP}"
echo -e "  ${GREEN}Domain:${NC}      ${DOMAIN}"
echo -e "  ${GREEN}Namespace:${NC}   ${NS}"
echo ""
if [[ "$IP" == "pending" ]]; then
  echo -e "  ${YELLOW}IP is provisioning — check in a few minutes:${NC}"
  echo "    kubectl get svc easycv-frontend -n ${NS} -w"
  echo ""
fi
echo -e "  ${YELLOW}Next steps:${NC}"
echo "  1. Point DNS for ${DOMAIN} → ${IP}"
echo "  2. Configure Stripe webhook: https://${DOMAIN}/api/webhook"
echo "  3. Set WORKER_SECRET in Convex: npx convex env set WORKER_SECRET <same-value>"
echo "  4. Verify: kubectl get pods -n ${NS}"
echo ""
