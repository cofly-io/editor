# syntax=docker/dockerfile:1

FROM oven/bun:1.3.0-alpine AS builder

WORKDIR /app

RUN apk add --no-cache nodejs

COPY . .

RUN bun install --frozen-lockfile

# Build-time public variables must be supplied with --build-arg if they differ
# from their defaults. Runtime secrets are injected when the container starts.
ARG NEXT_PUBLIC_ASSETS_CDN_URL
ARG NEXT_PUBLIC_ARTICRAFT_VIEWER_URL
ARG NEXT_PUBLIC_VIEWER_FORCE_WEBGL
ENV NEXT_TELEMETRY_DISABLED=1 \
    SKIP_ENV_VALIDATION=1 \
    NEXT_PUBLIC_ASSETS_CDN_URL=$NEXT_PUBLIC_ASSETS_CDN_URL \
    NEXT_PUBLIC_ARTICRAFT_VIEWER_URL=$NEXT_PUBLIC_ARTICRAFT_VIEWER_URL \
    NEXT_PUBLIC_VIEWER_FORCE_WEBGL=$NEXT_PUBLIC_VIEWER_FORCE_WEBGL

# The app script explicitly loads the root .env.local, which is intentionally
# excluded from Docker build contexts so credentials cannot enter an image layer.
# First compile all workspace package dists (they are consumed by Next.js as
# external packages, not transpiled from source), then build the app.
RUN touch .env.local \
    && bun --cwd=packages/core run build \
    && bun --cwd=packages/viewer run build \
    && bun --cwd=packages/nodes run build \
    && bun --cwd=packages/mcp run build \
    && bun --cwd=packages/articraft-bridge run build \
    && cd apps/editor \
    && node ./node_modules/next/dist/bin/next build

FROM docker:27-cli AS docker-cli

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
    UV_CACHE_DIR=/uv-data/cache \
    PASCAL_RUNTIME_EXPORT_SOURCE=/export-source

RUN chmod 755 /bin/uv /bin/uvx \
    && apt-get update \
    && apt-get install -y --no-install-recommends zip \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs \
    && install -d -o nextjs -g nodejs /uv-data

COPY --from=builder --chown=nextjs:nodejs /app/apps/editor/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/editor/.next/static ./apps/editor/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/editor/public ./apps/editor/public
COPY --from=builder --chown=nextjs:nodejs /app/Dockerfile /app/package.json /app/bun.lock /app/turbo.json /export-source/
COPY --from=builder --chown=nextjs:nodejs /app/packages /export-source/packages
COPY --from=builder --chown=nextjs:nodejs /app/tooling /export-source/tooling
COPY --from=builder --chown=nextjs:nodejs /app/apps/runtime /export-source/apps/runtime
COPY --from=builder --chown=nextjs:nodejs /app/apps/editor/public/audios /export-source/apps/editor/public/audios
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker

USER nextjs

EXPOSE 3000

CMD ["node", "apps/editor/server.js"]
