# Container Deployment

Images are built and run with Podman (rootless). The `podman` CLI ships in
the devenv shell. Each app directory carries its own Dockerfile; there is no
compose file, so containers are wired together on one Podman network.

Base images are fully qualified (`docker.io/...`) because Podman, unlike
Docker, does not assume Docker Hub for short names.

Rootless Podman needs subordinate UID/GID ranges for your user. On NixOS
this is `users.users.<name>.subUidRanges` and `subGidRanges`; without them,
container creation fails. Ports `3000`/`4000` are unprivileged, so no extra
setup is needed to publish them.

## Images

| Image | Dockerfile | Build context | Notes |
| --- | --- | --- | --- |
| `chess-api` | apps/api/Dockerfile | repository root | Multi-stage Rust + Go build; CGO-enabled binary on debian-slim; runs migrations on boot when `AUTO_MIGRATE=true` |
| `chess-web` | apps/web/Dockerfile | repository root | Bun build, served by vite preview; proxies `/api` to `VITE_API_PROXY_TARGET` |
| `chess-train` | apps/dqn/Dockerfile | apps/dqn | Optional training container for research; see below for GPU use |

`podman build` honors `.dockerignore`, same as Docker.

## Serving Stack

Create one network so the containers resolve each other by name:

```bash
podman network create chess
```

PostgreSQL:

```bash
podman run -d --name db --network chess \
    -e POSTGRES_USER=chess \
    -e POSTGRES_PASSWORD=chess \
    -e POSTGRES_DB=chess \
    -v chess-pgdata:/var/lib/postgresql/data \
    docker.io/library/postgres:17-alpine
```

API (build from the repository root, since it compiles the Rust engine
static library first). The image also installs Debian's `stockfish` package
and sets `STOCKFISH_PATH=/usr/games/stockfish` for the Stockfish opponent:

```bash
podman build -f apps/api/Dockerfile -t chess-api .
podman run -d --name api --network chess -p 4000:4000 \
    -e DATABASE_URL=postgres://chess:chess@db:5432/chess?sslmode=disable \
    -e BETTER_AUTH_SECRET=<secret> \
    -e AUTO_MIGRATE=true \
    chess-api
```

Web:

```bash
podman build -f apps/web/Dockerfile -t chess-web .
podman run -d --name web --network chess -p 3000:3000 chess-web
```

The web image defaults to `VITE_API_PROXY_TARGET=http://api:4000`, which
resolves on the `chess` network because the API container is named `api`.
Pass `-e VITE_API_PROXY_TARGET=<api-url>` when the API has a different name
or address. The UI is available at http://localhost:3000 and the API
directly at http://localhost:4000.

Stop everything with `podman stop web api db` and remove containers with
`podman rm web api db`. The `chess-pgdata` volume keeps the database across
restarts; `podman volume rm chess-pgdata` deletes it.

## Training Container

```bash
podman build -f apps/dqn/Dockerfile -t chess-train apps/dqn
podman run --rm chess-train
```

GPU training needs a CDI device pass-through instead of Docker's `--gpus`
flag, which requires the NVIDIA container toolkit and CDI configured on the
host:

```bash
podman run --rm --device nvidia.com/gpu=all chess-train
```

## Configuration

Pass secrets as environment variables at `podman run` time:

- BETTER_AUTH_SECRET - auth signing secret
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET - OAuth credentials
- AUTO_MIGRATE - set to false in production and run migrations explicitly via bun run api:migrate

See configuration.md for the full list of variables per app.
