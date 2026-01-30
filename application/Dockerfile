FROM oven/bun:latest AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS build
COPY --from=install /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM base AS runner
# Copy built output
COPY --from=build /app/.output ./.output
# Copy production node_modules for native dependencies like better-sqlite3
COPY --from=install /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
