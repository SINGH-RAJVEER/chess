# Local Development

## Prerequisites

- Nix and `devenv` for the managed local stack
- Bun `1.2.22` or a compatible Bun `1.x` release
- Go `1.25` for the API
- Rust and Cargo for the engine
- `uv` and Python `3.11+` for model training
- PostgreSQL client and server tools when running database tasks outside
  `devenv`

The repository uses Bun for TypeScript tasks, `uv` for Python tasks, and Jujutsu
(`jj`) as its primary version-control workflow.

## Initial Setup

From the repository root:

```bash
bun install
```

There is currently no committed `.env.example` file. Create `.env` manually
using the variables in [configuration.md](configuration.md), and never commit
the real file. At minimum, local API startup requires `DATABASE_URL`.

## Start the Full Stack

The recommended local path is:

```bash
just dev
```

This runs `devenv up`, which provides PostgreSQL and starts the web and API
processes. Computer moves are served in-process by the API through the Rust
engine static library (built automatically before the API starts), so there
is no separate engine process. The local service ports are:

| Service | Address |
| --- | --- |
| Web | `http://localhost:3000` |
| API | `http://localhost:4000` |
| PostgreSQL | `localhost:5432` |

The API process can apply migrations before serving when `AUTO_MIGRATE=true`.
The explicit database migration command is:

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

API recipes build the engine static library first and require a C toolchain
(`gcc` is provided by the devenv shell) with `CGO_ENABLED=1`.

The web server proxies `/api` to `http://127.0.0.1:4000` by default. Set
`VITE_API_PROXY_TARGET` in the root `.env` to point to another API during local
development.

The desktop target opens an Electron window that loads the web dev server at
`http://localhost:3000`; start `web:dev` first. See
[desktop.md](desktop.md) for build modes and Linux system dependencies.

## Checks and Builds

Run the repository-wide targets from the root (implemented as
direct `bun`, `go`, and `cargo` invocations via `package.json` and `just`):

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

API and game service tests need PostgreSQL: they use `TEST_DATABASE_URL`
when set, else `DATABASE_URL`, else a local `chess_test` database, and skip
when nothing is reachable.

The API build is a CGO-enabled Go binary linked against the Rust engine
static library (`just engine-lib` builds `apps/engine/target/release/libchess.a`
first). The web production output is written to `apps/web/dist`, which the
desktop release build embeds into the native binary.

## Computer Opponent Training (Retired)

The DQN opponent was removed when the standalone engine server was replaced
by the in-process library: minimax, the custom alpha-beta engine, and
Stockfish (installed by `devenv.nix`, see [stockfish.md](stockfish.md))
serve traffic. The Python training pipeline in `apps/dqn/training` and the
exported `apps/dqn/model.onnx` are retained for research but are no longer
loaded at runtime.

Validate the engine after changing search or evaluation:

```bash
just engine-test
just api-test
```

## Development Workflow

1. Make the smallest change in the owning application or package.
2. Run the focused test, lint, typecheck, or check target.
3. Run the affected application build.
4. Run the repository-wide checks before merging.
5. Update `/docs` whenever behavior, configuration, or an operational contract
   changes.
