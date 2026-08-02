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

This runs `devenv up`, which provides PostgreSQL and starts the web, API, and
engine processes. The local service ports are:

| Service | Address |
| --- | --- |
| Web | `http://localhost:3000` |
| API | `http://localhost:4000` |
| Engine | `http://localhost:8080` |
| PostgreSQL | `localhost:5432` |

The API process can apply migrations before serving when `AUTO_MIGRATE=true`.
The explicit database migration command is:

```bash
just api-migrate
```

Do not run `just dev` with `sudo`; PostgreSQL refuses to run as root.

## Run Services Separately

```bash
bunx nx run web:dev
bunx nx run api:dev
bunx nx run engine:dev
```

The web server proxies `/api` to `http://127.0.0.1:4000` by default. Set
`VITE_API_PROXY_TARGET` in the root `.env` to point to another API during local
development.

## Checks and Builds

Run the repository-wide Nx targets from the root:

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
bunx nx run api:test
bunx nx run engine:test
bunx nx run web:typecheck
bunx nx run api:migrate
```

The API build is a CGO-free Go binary. The engine release build is produced by
Cargo. The web production output is written to `apps/web/dist`.

## Training the Computer Opponent

```bash
cd apps/dqn/training
uv sync
uv run python train.py --device cpu
```

For CUDA-enabled PyTorch, install the matching wheel as described in
`apps/dqn/training/train.py`. The convenience script `train.sh` also discovers
the NixOS NVIDIA driver library path before invoking `uv`.

The final training export is `apps/dqn/model.onnx`, which the Rust engine loads
at startup. Validate the engine after replacing the model:

```bash
bunx nx run engine:test
bunx nx run engine:dev
curl http://127.0.0.1:8080/api/health
```

## Development Workflow

1. Make the smallest change in the owning application or package.
2. Run the focused test, lint, typecheck, or check target.
3. Run the affected application build.
4. Run the repository-wide checks before merging.
5. Update `/docs` whenever behavior, configuration, or an operational contract
   changes.
