# syntax=docker/dockerfile:1

FROM oven/bun:1.3.0-alpine AS builder

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile

# Build-time public variables must be supplied with --build-arg if they differ
# from their defaults. Runtime secrets are injected when the container starts.
ARG NEXT_PUBLIC_ASSETS_CDN_URL
ARG NEXT_PUBLIC_ARTICRAFT_VIEWER_URL
ENV NEXT_TELEMETRY_DISABLED=1 \
    SKIP_ENV_VALIDATION=1 \
    NEXT_PUBLIC_ASSETS_CDN_URL=$NEXT_PUBLIC_ASSETS_CDN_URL \
    NEXT_PUBLIC_ARTICRAFT_VIEWER_URL=$NEXT_PUBLIC_ARTICRAFT_VIEWER_URL

# The app script explicitly loads the root .env.local, which is intentionally
# excluded from Docker build contexts so credentials cannot enter an image layer.
RUN touch .env.local && bun --cwd=apps/editor run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.11.28 /uv /uvx /bin/

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HOME=/tmp \
    ARTICRAFT_REPO_ROOT=/articraft \
    UV_PYTHON_INSTALL_DIR=/uv-data/python \
    UV_CACHE_DIR=/uv-data/cache

RUN chmod 755 /bin/uv /bin/uvx \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs \
    && install -d -o nextjs -g nodejs /uv-data

COPY --from=builder --chown=nextjs:nodejs /app/apps/editor/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/editor/.next/static ./apps/editor/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/editor/public ./apps/editor/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/editor/server.js"]
