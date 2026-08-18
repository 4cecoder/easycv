# =============================================================================
# easyCV Web — Dockerfile (Next.js 16, Bun, standalone output)
# =============================================================================
#
# Build:
#   DOCKER_BUILDKIT=1 docker build --ssh default \
#     --build-arg NEXT_PUBLIC_CONVEX_URL=https://your-convex.convex.cloud \
#     -t easycv-frontend .
#
# Run:
#   docker run -d -p 3000:3000 \
#     -e NEXT_PUBLIC_CONVEX_URL="https://your-convex.convex.cloud" \
#     -e APP_URL="https://your-app.com" \
#     -e STRIPE_SECRET_KEY="sk_..." \
#     easycv-frontend
#
# =============================================================================

# ── Stage 1: dependencies ────────────────────────────────────────────────────
FROM oven/bun:1 AS deps

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssh-client \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p ~/.ssh && ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null

COPY package.json bun.lock ./

RUN --mount=type=ssh bun install --frozen-lockfile

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM oven/bun:1 AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/public

ARG NEXT_PUBLIC_CONVEX_URL="http://127.0.0.1:3210"
ENV NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN bun run build

# ── Stage 3: production runtime ──────────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash nextjs
USER nextjs

COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nextjs /app/public ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
