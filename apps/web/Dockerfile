# Build with podman from the repository root:
#   podman build -f apps/web/Dockerfile -t sixtyfour-web .
#
# Run on the same podman network as the API so the default
# VITE_API_PROXY_TARGET=http://api:4000 resolves (see docs/docker.md).
# Override it at runtime with -e VITE_API_PROXY_TARGET=<api-url> when the
# API container has a different name or address.
FROM docker.io/library/rust:1.97-slim-trixie AS builder
COPY --from=docker.io/oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
ENV WASM_TOOLCHAIN=1.97
WORKDIR /app
COPY package.json bun.lock biome.json ./
COPY libs/types/package.json libs/types/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/engine/package.json apps/engine/package.json
RUN bun install --frozen-lockfile
COPY libs/types libs/types
COPY apps/web apps/web
COPY apps/engine apps/engine
COPY scripts scripts
RUN cd apps/web && bun run build
FROM docker.io/oven/bun:1
WORKDIR /app
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/apps/web apps/web
WORKDIR /app/apps/web
ENV VITE_API_PROXY_TARGET=http://api:4000 \
	HOST=0.0.0.0 \
	PORT=3000
EXPOSE 3000
CMD ["bun", "x", "--bun", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]
