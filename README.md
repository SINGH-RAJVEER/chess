# SixtyFour

SixtyFour is a full-stack chess application with local games, online matchmaking, authentication, computer opponents, and a browser-based interface.

The project and package namespace is `sixtyfour`. The clients display `SixtyFour`, and the favicon and app icons use `64`.

## What Is Included

- `apps/web`: React and Vite browser application.
- `apps/mobile`: Expo iOS and Android app with the same playable core.
- `apps/desktop`: Electron desktop shell around the web application.
- `apps/api`: Go HTTP API for authentication, game state, matchmaking, clocks, migrations, and engine orchestration.
- `apps/engine`: Rust UCI engine (minimax + custom alpha-beta), built as the `sixtyfour-engine` binary the API keeps in a bounded pool. A Stockfish opponent with eight difficulty levels runs alongside it.
- `apps/dqn`: retired DQN training pipeline and model, kept for research.
- `libs/types`: Shared TypeScript domain and API types.
- `docs`: Detailed architecture, development, API, operations, data model, and security documentation.

## How It Works

The browser calls the Go API over HTTP. The API stores users and games in PostgreSQL, validates chess moves, and matches online players. Computer games run locally with a 500 ms budget and dynamic depth: native engines in Electron and WebAssembly workers in browsers and mobile. Device saves are durable; signed-in archives sync in the background. Server computer-game requests use a bounded persistent worker pool. See [local computer games](docs/local-computer-games.md).

The local stack uses these ports:

| Service | Port |
| --- | --- |
| Web | `3000` |
| API | `4000` |
| PostgreSQL | `5432` |

Prerequisites: Nix, devenv, Bun, and Rust plus a C linker (`gcc` from devenv) for the engine binary. The Go API itself is pure Go.

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

Run one project with just:

```bash
just web-dev
just api-dev
just engine-dev
just desktop-dev
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
- [Stockfish opponent](docs/stockfish.md): difficulty levels, binary setup, and request flow.
- [Computer opponent notes](docs/dqn.md): retired DQN opponent and model training.
- [Desktop](docs/desktop.md): Electron desktop shell and build modes.

Production deployment guidance and known implementation gaps are documented in the operations and security guides. Podman-ready Dockerfiles live next to each app (see [Docker deployment](docs/docker.md)). The repository does not include a reverse proxy, deployment manifest, backup system, or monitoring stack.
