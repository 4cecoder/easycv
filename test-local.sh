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

# ── Check prereqs ────────────────────────────────────────# ── Step 1: Build Docker images locally ─────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  info "Building frontend image..."
  docker build \
    --build-arg NEXT_PUBLIC_CONVEX_URL="http://127.0.0.1:3210" \
    -t easycv-frontend:local -f web/Dockerfile web/ \
    2>&1 | tail -5
  ok "Frontend image built"

  info "Building worker image..."
  docker build -t easycv-worker:local -f Dockerfile . \
    2>&1 | tail -5
  ok "Worker image built"
else
  info "Skipping Docker build (--skip-build)"
  docker image inspect easycv-frontend:local &>/dev/null || die "easycv-frontend:local not found. Run without --skip-build first."
  docker image inspect easycv-worker:local   &>/dev/null || die "easycv-worker:local not found. Run without --skip-build first."
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
kind load docker-image ghcr.io/get-convex/convex-backend:latest   --name "$CLUSTER_NAME" 2>/dev/null || true
kind load docker-image ghcr.io/get-convex/convex-dashboard:latest --name "$CLUSTER_NAME" 2>/dev/null || true
ok "Images loaded"

# ── Step 4: Apply k8s manifests ─────────────────────────────────────────────
info "Applying manifests..."

kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -

# Persistent Storage for Convex
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: convex-data-pvc
  namespace: ${NS}
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
EOF

LOCAL_WORKER_SECRET="test-secret-local-$(openssl rand -hex 8)"
LOCAL_INSTANCE_SECRET="0000000000000000000000000000000000000000000000000000000000000001"

# Secrets
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: easycv-secrets
  namespace: ${NS}
type: Opaque
data:
  INSTANCE_SECRET: $(echo -n "$LOCAL_INSTANCE_SECRET" | base64)
  POSTGRES_URL: $(echo -n '' | base64)
  CONVEX_SELF_HOSTED_ADMIN_KEY: $(echo -n "easycv-local|${LOCAL_INSTANCE_SECRET}" | base64)
  CONVEX_URL: $(echo -n 'http://convex-backend:3210' | base64)
  APP_URL: $(echo -n 'http://localhost:8080' | base64)
  STRIPE_SECRET_KEY: $(echo -n 'sk_test_fake' | base64)
  STRIPE_WEBHOOK_SECRET: $(echo -n 'whsec_fake' | base64)
  STRIPE_PRICE_ID: $(echo -n 'price_fake' | base64)
  STRIPE_PRO_PRICE_ID: $(echo -n 'price_fake_pro' | base64)
  WORKER_SECRET: $(echo -n "$LOCAL_WORKER_SECRET" | base64)
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
  INSTANCE_NAME: "easycv-local"
  CONVEX_CLOUD_ORIGIN: "http://127.0.0.1:3210"
  CONVEX_SITE_ORIGIN: "http://127.0.0.1:3211"
  CONVEX_URL: "http://convex-backend:3210"
  CONVEX_SITE_URL: "http://convex-backend:3211"
  NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210"
  NEXT_PUBLIC_POSTHOG_KEY: ""
  LLM_PROVIDER: "ollama"
  LLM_MODEL: "llama3.2"
  OLLAMA_API_BASE: ""
EOF

# Convex Backend Deployment + Service
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: convex-backend
  namespace: ${NS}
  labels:
    app: convex-backend
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: convex-backend
  template:
    metadata:
      labels:
        app: convex-backend
    spec:
      containers:
        - name: convex-backend
          image: ghcr.io/get-convex/convex-backend:latest
          imagePullPolicy: IfNotPresent
          ports:
            - name: api
              containerPort: 3210
            - name: site
              containerPort: 3211
          env:
            - name: DATA_DIR
              value: "/convex/data"
            - name: INSTANCE_NAME
              value: "easycv-local"
            - name: INSTANCE_SECRET
              value: "$LOCAL_INSTANCE_SECRET"
            - name: CONVEX_CLOUD_ORIGIN
              value: "http://127.0.0.1:3210"
            - name: CONVEX_SITE_ORIGIN
              value: "http://127.0.0.1:3211"
            - name: DO_NOT_REQUIRE_SSL
              value: "true"
          volumeMounts:
            - name: convex-data
              mountPath: /convex/data
          resources:
            requests:
              memory: "128Mi"
              cpu: "50m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
      volumes:
        - name: convex-data
          persistentVolumeClaim:
            claimName: convex-data-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: convex-backend
  namespace: ${NS}
spec:
  type: NodePort
  selector:
    app: convex-backend
  ports:
    - name: api
      port: 3210
      targetPort: 3210
      nodePort: 32100
    - name: site
      port: 3211
      targetPort: 3211
      nodePort: 32110
EOF

# Convex Dashboard Deployment + Service
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: convex-dashboard
  namespace: ${NS}
  labels:
    app: convex-dashboard
spec:
  replicas: 1
  selector:
    matchLabels:
      app: convex-dashboard
  template:
    metadata:
      labels:
        app: convex-dashboard
    spec:
      containers:
        - name: convex-dashboard
          image: ghcr.io/get-convex/convex-dashboard:latest
          imagePullPolicy: IfNotPresent
          ports:
            - name: dashboard
              containerPort: 6791
          env:
            - name: PORT
              value: "6791"
            - name: HOSTNAME
              value: "0.0.0.0"
            - name: NEXT_PUBLIC_CONVEX_URL
              value: "http://127.0.0.1:3210"
          resources:
            requests:
              memory: "64Mi"
              cpu: "25m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: convex-dashboard
  namespace: ${NS}
spec:
  type: NodePort
  selector:
    app: convex-dashboard
  ports:
    - name: dashboard
      port: 6791
      targetPort: 6791
      nodePort: 30791
EOF

ok "Convex backend + dashboard manifests applied"

# Wait for Convex backend to be ready
info "Waiting for Convex backend to be ready..."
kubectl rollout status deployment/convex-backend -n "$NS" --timeout=60s
ok "Convex backend is live"

# Push schema to self-hosted Convex backend
info "Pushing Convex schema & functions to self-hosted backend..."
(cd web && CONVEX_SELF_HOSTED_URL="http://127.0.0.1:3210" CONVEX_SELF_HOSTED_ADMIN_KEY="easycv-local|${LOCAL_INSTANCE_SECRET}" bunx convex dev --once 2>&1 | tail -4) || warn "Schema push completed with warnings"
ok "Convex schema & functions initialized"

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
            - name: CONVEX_URL
              value: "http://convex-backend:3210"
            - name: CONVEX_SITE_URL
              value: "http://convex-backend:3211"
            - name: NEXT_PUBLIC_CONVEX_URL
              value: "http://127.0.0.1:3210"
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
            - name: CONVEX_URL
              value: "http://convex-backend:3210"
            - name: NEXT_PUBLIC_CONVEX_URL
              value: "http://convex-backend:3210"
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
kubectl wait --for=condition=ready pod -l app=convex-backend -n "$NS" --timeout=60s 2>/dev/null \
  && ok "Convex backend ready"

kubectl wait --for=condition=ready pod -l app=convex-dashboard -n "$NS" --timeout=60s 2>/dev/null \
  && ok "Convex dashboard ready"

kubectl wait --for=condition=ready pod -l app=easycv-frontend -n "$NS" --timeout=120s 2>/dev/null \
  && ok "Frontend pod ready" \
  || warn "Frontend pod still initializing"

kubectl wait --for=condition=ready pod -l app=easycv-worker -n "$NS" --timeout=60s 2>/dev/null \
  && ok "Worker pod ready"

# ── Step 6: Print status ───────────────────────────────────────────────────
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  easyCV self-hosted local k8s test running${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════${NC}"
echo ""
kubectl get pods -n "$NS" -o wide
echo ""
echo -e "  ${GREEN}Frontend UI:${NC}        http://localhost:8080"
echo -e "  ${GREEN}Convex Dashboard:${NC}   http://localhost:6791"
echo -e "  ${GREEN}Convex Backend API:${NC} http://localhost:3210"
echo ""
echo -e "  ${YELLOW}Useful commands:${NC}"
echo "    kubectl logs -f -l app=convex-backend  -n ${NS}   # Convex backend logs"
echo "    kubectl logs -f -l app=easycv-frontend -n ${NS}   # Frontend logs"
echo "    kubectl logs -f -l app=easycv-worker   -n ${NS}   # Worker logs"
echo "    ./test-local.sh --teardown                         # Clean up"
echo ""

