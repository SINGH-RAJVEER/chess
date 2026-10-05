# Local Development

## Prerequisites

- Nix and `devenv` for the managed local stack
- Bun `1.2.22` or a compatible Bun `1.x` release
- Go `1.25` for the API
- Rust and Cargo for the engine
- `uv` and Python `3.11+` for model training
- PostgreSQL client and server tools when running database tasks outside `devenv`

The repository uses Bun for TypeScript tasks, `uv` for Python tasks, and Jujutsu (`jj`) as its primary version-control workflow.

## Initial Setup

From the repository root:

```bash
bun install
```

There is currently no committed `.env.example` file. Create `.env` manually using the variables in [configuration.md](configuration.md), and never commit the real file. At minimum, local API startup requires `DATABASE_URL`.

## Start the Full Stack

The recommended local path is:

```bash
just dev
```

This runs `devenv up`, which provides PostgreSQL and starts the web and API processes. Computer moves are served by the `sixtyfour-engine` binary, built automatically before the API starts and spawned by the API once per move, so there is no long-running engine process. The local service ports are:

| Service | Address |
| --- | --- |
| Web | `http://localhost:3000` |
| API | `http://localhost:4000` |
| PostgreSQL | `localhost:5432` |

The API process can apply migrations before serving when `AUTO_MIGRATE=true`. The explicit database migration command is:

```bash
just api-migrate
```

Do not run `just dev` with `sudo`; PostgreSQL refuses to run as root.

## Run Services Separately

```bash
just web-dev
just api-dev
just engine-dev     # UCI probe on stdin, not a server
just desktop-dev
```

The API is pure Go. `api-dev`, `api-build`, `api-test`, `api-check`, and `api-bench` build the `sixtyfour-engine` binary first (`just engine-bin`), which the API finds at `apps/engine/target/release/sixtyfour-engine` without extra configuration. Set `ENGINE_PATH` to use a binary elsewhere.

The web server proxies `/api` to `http://127.0.0.1:4000` by default. Set `VITE_API_PROXY_TARGET` in the root `.env` to point to another API during local development.

The desktop target opens an Electron window that loads the web dev server at `http://localhost:3000`; start `web:dev` first. See [desktop.md](desktop.md) for build modes and Linux system dependencies.

## Checks and Builds

Run the repository-wide targets from the root (implemented as direct `bun`, `go`, and `cargo` invocations via `package.json` and `just`):

```bash
bun run build
bun run test
bun run lint
bun run typecheck
bun run check
bun run format
```

Useful focused targets include:

```bash
just api-test
just engine-test
just web-test
just mobile-test
just web-typecheck
just api-migrate
```

API and game service tests need PostgreSQL: they use `TEST_DATABASE_URL` when set, else `DATABASE_URL`, else a local `sixtyfour_test` database, and skip when nothing is reachable.

The API build is a pure Go binary (`CGO_ENABLED=0`); the engine ships beside it as `apps/engine/target/release/sixtyfour-engine` (`just engine-bin`), and both must be deployed together. The web production output is written to `apps/web/dist`, which the desktop release build embeds into the native binary.

## Computer Opponent Training (Retired)

The DQN opponent was removed when the standalone engine server was retired: minimax, the custom alpha-beta engine, and Stockfish (installed by `devenv.nix`, see [stockfish.md](stockfish.md)) serve traffic. The Python training pipeline in `apps/dqn/training` and the exported `apps/dqn/model.onnx` are retained for research but are no longer loaded at runtime.

Validate the engine after changing search or evaluation:

```bash
just engine-test
just api-test
```

## Development Workflow

Use tabs for indentation and display each tab at a width of 4. `.editorconfig` defines the editor settings, Biome uses tab indentation with `indentWidth: 4`, and the engine's `rustfmt.toml` enables `hard_tabs` with `tab_spaces = 4`. Go uses `gofmt`. Keep Markdown prose on full lines without an artificial line-length limit. Spaces used to align comments and text diagrams are alignment rather than indentation.

`bun run format` writes formatting changes across the TypeScript workspaces and root scripts, then formats the Go API and Rust engine. Generated lockfiles may restore their generator's indentation when refreshed; normalize their indentation before committing them.

1. Make the smallest change in the owning application or package.
2. Run the focused test, lint, typecheck, or check target.
3. Run the affected application build.
4. Run the repository-wide checks before merging.
5. Update `/docs` whenever behavior, configuration, or an operational contract changes.
