FROM oven/bun:1.3 AS build

WORKDIR /workspace
COPY . .

ARG BUN_REGISTRY=https://registry.npmmirror.com
RUN printf '[install]\nregistry = "%s"\n' "$BUN_REGISTRY" > bunfig.toml \
  && bun install --filter pascal-runtime

ARG RUNTIME_BASE_PATH
ENV RUNTIME_BASE_PATH=$RUNTIME_BASE_PATH \
  NEXT_PUBLIC_RUNTIME_DECODER_ASSETS_PATH=runtime-decoders \
  NEXT_PUBLIC_VIEWER_ASSET_BASE_PATH=$RUNTIME_BASE_PATH
RUN bun run --cwd apps/runtime build

FROM node:22-bookworm-slim

WORKDIR /app
ARG RUNTIME_BASE_PATH
ENV NODE_ENV=production \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  RUNTIME_BASE_PATH=$RUNTIME_BASE_PATH \
  NEXT_PUBLIC_RUNTIME_DECODER_ASSETS_PATH=runtime-decoders \
  NEXT_PUBLIC_VIEWER_ASSET_BASE_PATH=$RUNTIME_BASE_PATH

COPY --from=build /workspace/apps/runtime/.next/standalone ./
COPY --from=build /workspace/apps/runtime/.next/static ./apps/runtime/.next/static
COPY --from=build /workspace/apps/runtime/public ./apps/runtime/public
COPY --from=build /workspace/apps/editor/public/environment/small_hangar_01_1k.hdr ./apps/runtime/public/environment/small_hangar_01_1k.hdr
COPY --from=build /workspace/apps/runtime/node_modules/three/examples/jsm/libs/basis ./apps/runtime/public/runtime-decoders/basis
COPY --from=build /workspace/apps/runtime/node_modules/three/examples/jsm/libs/draco ./apps/runtime/public/runtime-decoders/draco

EXPOSE 3000
CMD ["node", "apps/runtime/server.js"]
