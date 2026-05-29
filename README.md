# Chess Monorepo (Turborepo)

A full-stack chess application.

## Workspace Packages

- `apps/web` — React web UI served by Vite/Bun
- `apps/api` — Hono API app for game state, queueing, and engine orchestration
- `apps/engine` — Rust chess engine service
- `packages/types` — Shared TypeScript types (Color, PieceType, GameStatus, etc.)
- `packages/db` — Database schema, migrations, and Drizzle ORM client

## Prerequisites

- Nix with flakes enabled
- direnv (`direnv allow` once on first clone)

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

The `packages/db` workspace is the single source of truth for schema, migrations, Drizzle config, and DB connection defaults.

Run from the repo root:

```bash
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
│   │   ├── drizzle/         # Generated SQL migrations + metadata
│   │   ├── drizzle.config.ts
│   │   └── src/
│   │       ├── config.ts    # DB env + path resolution
│   │       ├── index.ts     # DB client & package exports
│   │       └── schema.ts    # Drizzle table definitions
│   └── types/               # Shared types (@chess/types)
│       └── src/
│           ├── board.ts     # Board types
│           ├── chess.ts     # Game types
│           └── index.ts     # Main export
├── package.json             # Root workspace config
├── turbo.json               # Turbo build configuration
├── justfile                 # Dev task runner
└── flake.nix                # Nix dev shell (PostgreSQL + toolchain)
```

## Architecture

- **Shared Types Package**: All domain types (Color, PieceType, GameStatus, etc.) are defined in `@chess/types` and imported across projects
- **Database Package**: Schema, migrations, Drizzle config, and client initialization live in `@chess/db`; application code imports from this package
- **Web App**: A client-side React app that calls the Hono API over HTTP
- **API App**: Owns queueing, game mutation/query logic, DB access, and engine requests
- **Engine**: Pure Rust, no direct dependencies on other workspace packages (uses HTTP API)

## Local Dev Stack (Nix + direnv)

PostgreSQL is managed automatically by the Nix flake. Entering the project directory via direnv starts the database cluster. All services run on:

- `web` → port `3000`
- `api` → port `4000`
- `engine` → port `8080`
- `db` (PostgreSQL) → port `5432`

Run the full local stack with a single command:

```bash
just
```
