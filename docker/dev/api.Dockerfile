FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/engine/package.json apps/engine/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/db/package.json packages/db/package.json

RUN bun install --frozen-lockfile

COPY . .

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["bun", "run", "dev"]
