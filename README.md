# Chess

Chess is a full-stack chess application with local games, online matchmaking, authentication, computer opponents, and a browser-based interface.

## What Is Included

- `apps/web`: React and Vite browser application.
- `apps/api`: Go HTTP API for authentication, game state, matchmaking, clocks, migrations, and engine orchestration.
- `apps/engine`: Rust service that selects computer moves with minimax or DQN.
- `apps/dqn`: ONNX model, inference support, and Python training pipeline.
- `packages/types`: Shared TypeScript domain and API types.
- `docs`: Detailed architecture, development, API, operations, data model, and security documentation.

## How It Works

The browser calls the Go API over HTTP. The API stores users and games in PostgreSQL, validates chess moves, and matches online players. For computer games, the API sends the current position to the Rust engine. The engine uses the bundled ONNX model for DQN games and falls back to minimax when necessary.

The local stack uses these ports:

| Service | Port |
| --- | --- |
| Web | `3000` |
| API | `4000` |
| Engine | `8080` |
| PostgreSQL | `5432` |

## Quick Start

Prerequisites: Nix, devenv, and Bun.

```bash
bun install
just dev
```

Open `http://localhost:3000`. The local stack starts PostgreSQL, the API, the engine, and the web application. Configuration is loaded from a root `.env` file; `DATABASE_URL` is required by the API.

## Common Commands

```bash
bun run build       # Build all projects
bun run test        # Test all projects
bun run lint        # Lint all projects
bun run typecheck   # Typecheck TypeScript projects
bun run check       # Run project checks
bun run format      # Format project files
bun run clean       # Remove build outputs
just api-migrate    # Apply PostgreSQL migrations
```

Run one project with Nx:

```bash
bunx nx run web:dev
bunx nx run api:dev
bunx nx run engine:dev
```

## Documentation

The detailed documentation is split by audience and concern:

- [Architecture](docs/architecture.md): services, ownership, and request flows.
- [Development](docs/development.md): setup, local workflows, checks, and training.
- [Configuration](docs/configuration.md): environment variables and defaults.
- [API reference](docs/api-reference.md): HTTP routes and payloads.
- [Data model](docs/data-model.md): PostgreSQL tables and migrations.
- [Operations](docs/operations.md): release, deployment, health, and incidents.
- [Security](docs/security.md): authentication, trust boundaries, and hardening.
- [API implementation notes](docs/api.md): Go API structure and compatibility details.
- [Computer opponent notes](docs/dqn.md): DQN inference, GPU fallback, and model training.

Production deployment guidance and known implementation gaps are documented in the operations and security guides. The repository does not include a reverse proxy, container image, deployment manifest, backup system, or monitoring stack.
