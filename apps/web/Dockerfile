FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock biome.json nx.json ./
COPY packages/types/package.json packages/types/package.json
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile
COPY packages/types packages/types
COPY apps/web apps/web
RUN cd apps/web && bun run build
WORKDIR /app/apps/web
ENV VITE_API_PROXY_TARGET=http://api:4000 \
	HOST=0.0.0.0 \
	PORT=3000
EXPOSE 3000
CMD ["bun", "x", "--bun", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]
