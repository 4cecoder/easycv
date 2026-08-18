#!/usr/bin/env bash
set -euo pipefail

# easyCV — local k8s test using kind (Kubernetes IN Docker)
#
# What this does:
#   1. Builds Docker images locally
#   2. Creates a kind cluster with port mapping
#   3. Loads images into the cluster
#   4. Applies all k8s manifests (with test values)
#   5. Waits for pods to come up
#   6. Prints how to access the app
#
# Usage:
#   ./test-local.sh              # full test
#   ./test-local.sh --skip-build # reuse existing images
#   ./test-local.sh --teardown   # delete the cluster when done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[->]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!!]${NC} $*"; }
die()   { echo -e "${RED}[XX]${NC} $*" >&2; exit 1; }

SKIP_BUILD=false
TEARDOWN=false
CLUSTER_NAME="easycv-test"
NS="easycv"

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --teardown)   TEARDOWN=true ;;
    --help|-h)    echo "Usage: $0 [--skip-build] [--teardown]"; exit 0 ;;
    *) die "Unknown flag: $arg" ;;
  esac
done

# ── Teardown ────────────────────────────────────────────────────────────────
if [[ "$TEARDOWN" == true ]]; then
  info "Deleting kind cluster '${CLUSTER_NAME}'..."
  kind delete cluster --name "$CLUSTER_NAME"
  ok "Cluster deleted"
  exit 0
fi

# ── Check prereqs ───────────────────────────────────────────────────────────
command -v kind &>/dev/null   || die "kind not found. Install: brew install kind"
command -v docker &>/dev/null || die "docker not found"
command -v kubectl &>/dev/null || die "kubectl not found"

# ── Step 1: Build Docker images locally ─────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  info "Building frontend image..."
  docker build -t easycv-frontend:local -f web/Dockerfile web/ \
    2>&1 | tail -3
  ok "Frontend image built"

  info "Building worker image..."
  docker build -t easycv-worker:local -f Dockerfile . \
    2>&1 | tail -3
  ok "Worker image built"
else
  info "Skipping Docker build (--skip-build)"
  # Check images exist
  docker image inspect easycv-frontend:local &>/dev/null || die "easycv-frontend:local not found. Run without --skip-build first."
  docker image inspect easycv-worker:local &>/dev/null   || die "easycv-worker:local not found. Run without --skip-build first."
  ok "Found existing local images"
fi

# ── Step 2: Create kind cluster ─────────────────────────────────────────────
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  warn "Cluster '${CLUSTER_NAME}' already exists, reusing"
else
  info "Creating kind cluster '${CLUSTER_NAME}'..."
  kind create cluster --name "$CLUSTER_NAME" --config kind-config.yaml
  ok "Cluster created"
fi

# ── Step 3: Load images into kind ───────────────────────────────────────────
info "Loading images into kind cluster..."
kind load docker-image easycv-frontend:local --name "$CLUSTER_NAME"
kind load docker-image easycv-worker:local   --name "$CLUSTER_NAME"
ok "Images loaded"

# ── Step 4: Apply k8s manifests ─────────────────────────────────────────────
info "Applying manifests..."

kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -

# Secrets (fake values for testing — won't actually connect to anything)
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: easycv-secrets
  namespace: ${NS}
type: Opaque
data:
  CONVEX_URL: $(echo -n 'https://test-convex.convex.cloud' | base64)
  APP_URL: $(echo -n 'http://localhost:8080' | base64)
  STRIPE_SECRET_KEY: $(echo -n 'sk_test_fake' | base64)
  STRIPE_WEBHOOK_SECRET: $(echo -n 'whsec_fake' | base64)
  STRIPE_PRICE_ID: $(echo -n 'price_fake' | base64)
  STRIPE_PRO_PRICE_ID: $(echo -n 'price_fake_pro' | base64)
  WORKER_SECRET: $(echo -n 'test-secret-$(openssl rand -hex 16)' | base64)
  OPENAI_API_KEY: $(echo -n '' | base64)
  ANTHROPIC_API_KEY: $(echo -n '' | base64)
EOF

cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: easycv-config
  namespace: ${NS}
data:
  NEXT_PUBLIC_CONVEX_URL: "https://test-convex.convex.cloud"
  NEXT_PUBLIC_POSTHOG_KEY: ""
  LLM_PROVIDER: "ollama"
  LLM_MODEL: "llama3.2"
  OLLAMA_API_BASE: ""
EOF

ok "Secrets + ConfigMap applied"

# Frontend deployment (patched for local images)
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: easycv-frontend
  namespace: ${NS}
  labels:
    app: easycv-frontend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: easycv-frontend
  template:
    metadata:
      labels:
        app: easycv-frontend
    spec:
      containers:
        - name: frontend
          image: easycv-frontend:local
          imagePullPolicy: Never
          ports:
            - containerPort: 3000
          resources:
            requests:
              memory: "128Mi"
              cpu: "50m"
            limits:
              memory: "512Mi"
              cpu: "250m"
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
          envFrom:
            - secretRef:
                name: easycv-secrets
            - configMapRef:
                name: easycv-config
          env:
            - name: NODE_ENV
              value: "production"
            - name: PORT
              value: "3000"
      restartPolicy: Always
EOF

# Worker deployment (patched for local images)
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: easycv-worker
  namespace: ${NS}
  labels:
    app: easycv-worker
spec:
  replicas: 1
  selector:
    matchLabels:
      app: easycv-worker
  template:
    metadata:
      labels:
        app: easycv-worker
    spec:
      containers:
        - name: worker
          image: easycv-worker:local
          imagePullPolicy: Never
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "1Gi"
              cpu: "500m"
          envFrom:
            - secretRef:
                name: easycv-secrets
            - configMapRef:
                name: easycv-config
          env:
            - name: PYTHONUNBUFFERED
              value: "1"
      restartPolicy: Always
EOF

# NodePort service (maps cluster port 30000 → host 8080 via kind config)
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: easycv-frontend
  namespace: ${NS}
spec:
  type: NodePort
  selector:
    app: easycv-frontend
  ports:
    - name: http
      port: 80
      targetPort: 3000
      nodePort: 30000
EOF

ok "All manifests applied"

# ── Step 5: Wait for pods ───────────────────────────────────────────────────
info "Waiting for pods to be ready..."
kubectl wait --for=condition=ready pod -l app=easycv-frontend -n "$NS" --timeout=120s 2>/dev/null \
  && ok "Frontend pod ready" \
  || warn "Frontend pod not ready yet (may need more time — check logs)"

kubectl wait --for=condition=ready pod -l app=easycv-worker -n "$NS" --timeout=60s 2>/dev/null \
  && ok "Worker pod ready" \
  || warn "Worker pod not ready (expected — worker connects to external Convex which won't work locally)"

# ── Step 6: Print status ───────────────────────────────────────────────────
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  easyCV local k8s test running${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════${NC}"
echo ""
kubectl get pods -n "$NS" -o wide
echo ""
echo -e "  ${GREEN}Frontend:${NC}  http://localhost:8080"
echo ""
echo -e "  ${YELLOW}Useful commands:${NC}"
echo "    kubectl logs -f -l app=easycv-frontend -n ${NS}   # frontend logs"
echo "    kubectl logs -f -l app=easycv-worker   -n ${NS}   # worker logs"
echo "    kubectl get pods -n ${NS} -w                         # watch pods"
echo "    kubectl exec -it deploy/easycv-frontend -n ${NS} -- sh  # shell in"
echo "    ./test-local.sh --teardown                          # clean up"
echo ""
