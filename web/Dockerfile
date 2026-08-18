# =============================================================================
# easyCV Web — Dockerfile (Next.js 16, Bun, standalone output)
# =============================================================================
#
# Build (GitLab CI or locally). The private @bytecats/ui-kit package is pulled
# from GitHub, so pass a token with read access to 4cecoder/ui-kit:
#
#   docker build \
#     --build-arg GITHUB_TOKEN \
#     --build-arg NEXT_PUBLIC_CONVEX_URL \
#     -t easycv-frontend .
#
# Run:
#   docker run -d -p 3000:3000 --env-file .env.local easycv-frontend
#
# =============================================================================

# ── Stage 1: dependencies ────────────────────────────────────────────────────
FROM oven/bun:1 AS deps

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      ca-certificates \
      openssh-client \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./

# GITHUB_TOKEN is used only in this stage (not copied into the runtime image).
ARG GITHUB_TOKEN
RUN if [ -z "$GITHUB_TOKEN" ]; then \
      echo "GITHUB_TOKEN build-arg is required to install @bytecats/ui-kit" >&2; \
      exit 1; \
    fi \
    && git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/" \
    && git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf "git@github.com:" \
    && bun install --frozen-lockfile

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM oven/bun:1 AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p public

# NEXT_PUBLIC_* is inlined into the client bundle at build time.
ARG NEXT_PUBLIC_CONVEX_URL
ENV NEXT_PUBLIC_CONVEX_URL=${NEXT_PUBLIC_CONVEX_URL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN bun run build

# ── Stage 3: production runtime ──────────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /bin/bash nextjs

USER nextjs

COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
