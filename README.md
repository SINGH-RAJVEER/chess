# Chess Monorepo (Nx)

A full-stack chess application.

## Workspace Packages

- `apps/web` — React web UI served by Vite/Bun
- `apps/api` - Go API app for game state, authentication, queueing, and engine orchestration
- `apps/engine` — Rust chess engine service
- `apps/dqn` — Neural opponent model, inference support, and training pipeline
- `packages/types` — Shared TypeScript types (Color, PieceType, GameStatus, etc.)

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
bunx nx run api:test
```

## Database Management

The API owns its PostgreSQL connection, queries, and embedded migrations under `apps/api/internal/database`.

Run from the repo root:

```bash
bun run api:migrate
just api-migrate
```

## Project Layout

```text
.
├── apps/
│   ├── api/                  # Go API app
│   ├── dqn/                  # Neural model and training pipeline
│   ├── web/                  # React web app
│   └── engine/               # Rust chess engine
├── packages/
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
- **Web App**: A client-side React app that calls the Go API over HTTP
- **API App**: Owns HTTP transport, authentication, queueing, game mutation/query logic, direct PostgreSQL access, app-local migrations, and engine requests. See [`docs/api.md`](docs/api.md)
- **Engine**: Pure Rust, no direct dependencies on other workspace packages (uses HTTP API)
- **DQN Opponent**: Optional ONNX policy/value search with automatic NVIDIA CUDA detection and CPU fallback. See [`docs/dqn.md`](docs/dqn.md)

## Local Dev Stack (devenv)

`devenv.nix` defines the local shell with Bun, Go, Rust, PostgreSQL, Nix LSPs, and the project process graph. It loads variables from the root `.env` when entering the shell and before starting each process. Start the local stack with `devenv up`. The API process applies the migrations embedded in `apps/api` before starting.

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
just api-migrate
```
