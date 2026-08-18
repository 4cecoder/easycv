# =============================================================================
# easyCV Web — Dockerfile (Next.js 16, Bun, standalone output)
# =============================================================================
#
# Prerequisites:
#   This project depends on the private GitHub package "@bytecats/ui-kit".
#   The build requires SSH access to clone it.  You have two options:
#
#   1. SSH agent forwarding (recommended for local builds):
#        DOCKER_BUILDKIT=1 docker build \
#          --ssh default \
#          -t easycv-web .
#
#   2. Pre-build step — copy the dependency into node_modules locally:
#        bun install              # resolves the GitHub dep on your machine
#        cp -r node_modules/@bytecats /tmp/ui-kit-cache
#        docker build --ssh default -t easycv-web .
#
# Build:
#   docker build --ssh default -t easycv-web .
#
# Run:
#   docker run -d --name easycv-web \
#     -p 3000:3000 \
#     -e NEXT_PUBLIC_CONVEX_URL="https://your-deployment.convex.cloud" \
#     -e APP_URL="https://your-app.com" \
#     -e STRIPE_SECRET_KEY="sk_..." \
#     easycv-web
#
# =============================================================================

# ── Stage 1: dependencies ────────────────────────────────────────────────────
# Install all production + dev dependencies in a dedicated layer so that
# source-code changes don't force a full reinstall.
FROM oven/bun:1 AS deps

WORKDIR /app

# SSH client is needed for the private GitHub dependency.
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Create a known-hosts entry so git doesn't prompt for verification.
RUN mkdir -p ~/.ssh && ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null

# Copy only dependency manifests first for maximum layer caching.
COPY package.json bun.lock ./

# Install with SSH agent forwarded via BuildKit.
# --frozen-lockfile ensures the lockfile is respected exactly.
RUN --mount=type=ssh bun install --frozen-lockfile

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM oven/bun:1 AS build

WORKDIR /app

# Copy dependencies from the previous stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy source code and config.
COPY . .

# Next.js standalone mode requires this env var.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the Next.js application.
# The standalone output mode produces a self-contained server in
# .next/standalone plus static assets in .next/static.
RUN bun run build

# ── Stage 3: production runtime ──────────────────────────────────────────────
# Use a slim Node image for the final runtime — much smaller than the full
# Bun image and sufficient to run the Next.js standalone server.
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install wget for healthcheck (not present in slim by default).
RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security.
RUN useradd --create-home --shell /bin/bash nextjs
USER nextjs

# Copy the standalone server and static assets produced by the build.
# Standalone output structure:
#   .next/standalone/   → self-contained Node server with bundled deps
#   .next/static/       → CSS, JS, and other static assets (copied in)
#   public/             → public directory files (copied in)
#
# The standalone server.js expects to find .next/ and public/ relative to CWD.
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nextjs /app/public ./public

EXPOSE 3000

# Healthcheck: verify the server responds on port 3000.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Run the standalone Next.js server.
# The standalone output bundles everything under .next/standalone,
# and server.js is the entry point.
CMD ["node", "server.js"]
