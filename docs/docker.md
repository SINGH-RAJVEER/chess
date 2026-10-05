# Container Deployment

Images are built and run with Podman (rootless). The `podman` CLI ships in the devenv shell. Each app directory carries its own Dockerfile; there is no compose file, so containers are wired together on one Podman network.

Base images are fully qualified (`docker.io/...`) because Podman, unlike Docker, does not assume Docker Hub for short names.

Rootless Podman needs subordinate UID/GID ranges for your user. On NixOS this is `users.users.<name>.subUidRanges` and `subGidRanges`; without them, container creation fails. Ports `3000`/`4000` are unprivileged, so no extra setup is needed to publish them.

## Images

| Image | Dockerfile | Build context | Notes |
| --- | --- | --- | --- |
| `sixtyfour-api` | apps/api/Dockerfile | repository root | Multi-stage Rust + Go build; pure Go API plus the `sixtyfour-engine` binary on debian-slim; runs migrations on boot when `AUTO_MIGRATE=true` |
| `sixtyfour-web` | apps/web/Dockerfile | repository root | Bun build, served by vite preview; proxies `/api` to `VITE_API_PROXY_TARGET` |
| `sixtyfour-train` | apps/dqn/Dockerfile | apps/dqn | Optional training container for research; see below for GPU use |

`podman build` honors `.dockerignore`, same as Docker.

## Serving Stack

Create one network so the containers resolve each other by name:

```bash
podman network create sixtyfour
```

PostgreSQL:

```bash
podman run -d --name db --network sixtyfour \
	-e POSTGRES_USER=sixtyfour \
	-e POSTGRES_PASSWORD=sixtyfour \
	-e POSTGRES_DB=sixtyfour \
	-v sixtyfour-pgdata:/var/lib/postgresql/data \
	docker.io/library/postgres:17-alpine
```

API (build from the repository root, since it also compiles the Rust `sixtyfour-engine` binary). The image installs that binary at `/usr/local/bin/sixtyfour-engine` with `ENGINE_PATH` pointing to it, plus Debian's `stockfish` package with `STOCKFISH_PATH=/usr/games/stockfish` for the Stockfish opponent:

```bash
podman build -f apps/api/Dockerfile -t sixtyfour-api .
podman run -d --name api --network sixtyfour -p 4000:4000 \
	-e DATABASE_URL=postgres://sixtyfour:sixtyfour@db:5432/sixtyfour?sslmode=disable \
	-e BETTER_AUTH_SECRET=<secret> \
	-e AUTO_MIGRATE=true \
	sixtyfour-api
```

Web:

```bash
podman build -f apps/web/Dockerfile -t sixtyfour-web .
podman run -d --name web --network sixtyfour -p 3000:3000 sixtyfour-web
```

The web image defaults to `VITE_API_PROXY_TARGET=http://api:4000`, which resolves on the `sixtyfour` network because the API container is named `api`. Pass `-e VITE_API_PROXY_TARGET=<api-url>` when the API has a different name or address. The UI is available at http://localhost:3000 and the API directly at http://localhost:4000.

Stop everything with `podman stop web api db` and remove containers with `podman rm web api db`. The `sixtyfour-pgdata` volume keeps the database across restarts; `podman volume rm sixtyfour-pgdata` deletes it.

## Training Container

```bash
podman build -f apps/dqn/Dockerfile -t sixtyfour-train apps/dqn
podman run --rm sixtyfour-train
```

GPU training needs a CDI device pass-through instead of Docker's `--gpus` flag, which requires the NVIDIA container toolkit and CDI configured on the host:

```bash
podman run --rm --device nvidia.com/gpu=all sixtyfour-train
```

## Configuration

Pass secrets as environment variables at `podman run` time:

- BETTER_AUTH_SECRET - auth signing secret
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET - OAuth credentials
- AUTO_MIGRATE - set to false in production and run migrations explicitly via bun run api:migrate

See configuration.md for the full list of variables per app.
