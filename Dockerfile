# =============================================================================
# easyCV Worker — Dockerfile
# =============================================================================
#
# Build:
#   docker build -t easycv-worker .
#
# Run (inline environment variables):
#   docker run -d --name easycv-worker \
#     -e NEXT_PUBLIC_CONVEX_URL="https://your-convex-deployment.convex.cloud" \
#     -e WORKER_SECRET="your-worker-secret" \
#     -e LLM_PROVIDER="ollama" \
#     -e OLLAMA_API_BASE="http://host.docker.internal:11434" \
#     easycv-worker
#
# Run (mount .env.local from the web directory):
#   docker run -d --name easycv-worker \
#     -v /path/to/easycv/web/.env.local:/app/.env.local:ro \
#     easycv-worker
#
# Test (process one queued job then exit):
#   docker run --rm easycv-worker --once
#
# =============================================================================

FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# ── System dependencies ─────────────────────────────────────────────────────
# LaTeX (texlive) is needed by latex.py to compile generated .tex to PDF.
RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-base \
    texlive-latex-extra \
    texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

# ── Working directory ───────────────────────────────────────────────────────
WORKDIR /app

# ── Application source ──────────────────────────────────────────────────────
# Copy the entire project first so pip can build the package.
# .dockerignore controls what gets excluded
# (e.g. .venv/, __pycache__/, web/, .git/, .env*).
COPY . .

# ── Python dependencies ─────────────────────────────────────────────────────
# Install the easycv-pipeline package and all its Python dependencies.
# Using pip (uv is not available in the slim image).
# NOTE: If you need Docker layer caching for dependencies, generate a
# pinned requirements.txt and copy it before the source code:
#   COPY requirements.txt ./
#   RUN pip install --no-cache-dir -r requirements.txt
#   COPY . .
#   RUN pip install --no-cache-dir --no-deps .
RUN pip install --no-cache-dir .

# ── Non-root user ───────────────────────────────────────────────────────────
RUN useradd --create-home --shell /bin/bash easycv
USER easycv

# ── Entry point ─────────────────────────────────────────────────────────────
# Runs backend.worker.main() as a long-lived process.
CMD ["python", "-m", "backend.worker"]
