# Chess Monorepo (Nx)

A full-stack chess application.

## Workspace Packages

- `apps/web` — React web UI served by Vite/Bun
- `apps/api` — Hono API app for game state, queueing, and engine orchestration
- `apps/engine` — Rust chess engine service
- `apps/dqn` — Neural opponent model, inference support, and training pipeline
- `packages/types` — Shared TypeScript types (Color, PieceType, GameStatus, etc.)
- `packages/database` — Database schema, migrations, and Drizzle ORM client

## Prerequisites

- Nix
- devenv

## Install dependencies

```bash
bun install
```

## Environment

Use a single `.env` file at the repository root. The API, DB tooling, web dev server, engine process, and `devenv` all load variables from that file.

## Run from root

```bash
devenv up          # Start PostgreSQL, web, api, and engine
bun run dev        # Start workspace dev tasks without managed services
bun run build      # Build all packages
bun run test       # Test all packages
bun run lint       # Lint all packages
bun run format     # Format all packages
bun run typecheck  # Check types
bun run check      # Biome check
bun run clean      # Clean all output
bun run affected:build  # Build only affected projects
```

## Run a single workspace package

```bash
bunx nx run web:dev
bunx nx run api:dev
bunx nx run engine:dev
bunx nx run database:database:generate
```

## Database Management

The `packages/database` workspace is the single source of truth for schema, migrations, Drizzle config, and DB connection defaults.

Run from the repo root:

```bash
bun run database:generate  # Generate migrations from schema changes
bun run database:migrate   # Apply pending migrations
bun run database:studio    # Open Drizzle Studio UI
```

## Project Layout

```text
.
├── apps/
│   ├── api/                  # Hono API app
│   ├── dqn/                  # Neural model and training pipeline
│   ├── web/                  # React web app
│   └── engine/               # Rust chess engine
├── packages/
│   ├── database/            # Database layer (@chess/database)
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
├── nx.json                  # Nx task graph, cache, and input configuration
├── justfile                 # Dev task runner
└── devenv.nix               # devenv shell, services, and processes
```

## Architecture

- **Shared Types Package**: All domain types (Color, PieceType, GameStatus, etc.) are defined in `@chess/types` and imported across projects
- **Database Package**: Schema, migrations, Drizzle config, and client initialization live in `@chess/database`; application code imports from this package
- **Web App**: A client-side React app that calls the Hono API over HTTP
- **API App**: Owns queueing, game mutation/query logic, DB access, and engine requests
- **Engine**: Pure Rust, no direct dependencies on other workspace packages (uses HTTP API)
- **DQN Opponent**: Optional ONNX policy/value search with automatic NVIDIA CUDA detection and CPU fallback. See [`docs/dqn.md`](docs/dqn.md)

## Local Dev Stack (devenv)

`devenv.nix` defines the local shell with Bun, Rust, PostgreSQL, Nix LSPs, and the project process graph. It loads variables from the root `.env` when entering the shell and before starting each process. Start the local stack with `devenv up`.

All services run on:

- `web` → port `3000`
- `api` → port `4000`
- `engine` → port `8080`
- `db` (PostgreSQL) → port `5432`

Run the full local stack with a single command:

```bash
just dev
```

Database-only maintenance commands are still available:

```bash
just database-start
just database-stop
just database-migrate
just database-studio
```
