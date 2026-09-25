# Build with podman from the repository root:
#   podman build -f apps/web/Dockerfile -t chess-web .
#
# Run on the same podman network as the API so the default
# VITE_API_PROXY_TARGET=http://api:4000 resolves (see docs/docker.md).
# Override it at runtime with -e VITE_API_PROXY_TARGET=<api-url> when the
# API container has a different name or address.
FROM docker.io/oven/bun:1
WORKDIR /app
COPY package.json bun.lock biome.json ./
COPY libs/types/package.json libs/types/package.json
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile
COPY libs/types libs/types
COPY apps/web apps/web
RUN cd apps/web && bun run build
WORKDIR /app/apps/web
ENV VITE_API_PROXY_TARGET=http://api:4000 \
	HOST=0.0.0.0 \
	PORT=3000
EXPOSE 3000
CMD ["bun", "x", "--bun", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]
