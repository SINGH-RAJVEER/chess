# Chess Monorepo (Turborepo)

A full-stack chess application.

## Workspace Packages

- `apps/web` — React web UI served by Vite/Bun
- `apps/api` — Hono API app for game state, queueing, and engine orchestration
- `apps/engine` — Rust chess engine service
- `packages/types` — Shared TypeScript types (Color, PieceType, GameStatus, etc.)
- `packages/db` — Database schema, migrations, and Drizzle ORM client

## Prerequisites

- Bun `>= 1.0`
- Rust toolchain (`cargo`, `rustfmt`, `clippy`)
- PostgreSQL database

## Install dependencies

```bash
bun install
```

## Run from root

```bash
bun run dev        # Start all workspace dev tasks
bun run build      # Build all packages
bun run test       # Test all packages
bun run lint       # Lint all packages
bun run format     # Format all packages
bun run typecheck  # Check types
bun run check      # Biome check
bun run clean      # Clean all output
```

## Run a single workspace package

```bash
bunx turbo run dev --filter=@chess/application
bunx turbo run dev --filter=@chess/api
bunx turbo run dev --filter=@chess/engine
bunx turbo run build --filter=@chess/db
```

## Database Management

Run from the `apps/api` folder:

```bash
cd apps/api
bun run db:generate  # Generate migrations from schema changes
bun run db:migrate   # Apply pending migrations
bun run db:studio    # Open Drizzle Studio UI
```

## Project Layout

```text
.
├── apps/
│   ├── api/                  # Hono API app
│   ├── web/                  # React web app
│   └── engine/               # Rust chess engine
├── packages/
│   ├── db/                  # Database layer (@chess/db)
│   │   ├── drizzle/
│   │   └── src/
│   │       ├── index.ts     # DB client & schema exports
│   │       └── schema.ts    # Drizzle table definitions
│   └── types/               # Shared types (@chess/types)
│       └── src/
│           ├── board.ts     # Board types
│           ├── chess.ts     # Game types
│           └── index.ts     # Main export
├── package.json             # Root workspace config
├── turbo.json               # Turbo build configuration
└── docker/dev/docker-compose.yml  # Local dev environment
```

## Architecture

- **Shared Types Package**: All domain types (Color, PieceType, GameStatus, etc.) are defined in `@chess/types` and imported across projects
- **Database Package**: Schema, migrations, and client initialization live in `@chess/db`; application code imports from this package
- **Web App**: A client-side React app that calls the Hono API over HTTP
- **API App**: Owns queueing, game mutation/query logic, DB access, and engine requests
- **Engine**: Pure Rust, no direct dependencies on other workspace packages (uses HTTP API)

## Docker Dev Stack

- `application` serves the React frontend on port `3000`
- `api` serves the Hono backend on port `4000`
- `engine` serves the Rust chess engine on port `8080`
- `db` serves PostgreSQL on port `5432`

Run the full local stack with:

```bash
just docker-up
```
