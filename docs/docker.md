# Docker Deployment

Each app ships a Dockerfile and `docker-compose.yml` at the repository root wires them together with PostgreSQL.

## Services

| Service | Dockerfile | Port | Notes |
| --- | --- | --- | --- |
| db | postgres:17-alpine image | 5432 (internal) | Data persisted in the `pgdata` volume |
| engine | apps/engine/Dockerfile | 8080 (internal) | Multi-stage Rust build; mounts apps/dqn/model.onnx read-only at /models/model.onnx. Falls back to minimax if CUDA is unavailable |
| api | apps/api/Dockerfile | 4000 | Static CGO-free Go binary on alpine; runs migrations on boot when AUTO_MIGRATE=true |
| web | apps/web/Dockerfile | 3000 | Bun build, served by vite preview; proxies /api to the api service |
| train | apps/dqn/Dockerfile | none | Optional training container under the "train" profile with NVIDIA GPU reservation |

## Usage

    docker compose up --build

The web UI is available at http://localhost:3000. The api is reachable directly at http://localhost:4000; the engine is only reachable from inside the compose network.

Run a training job without starting the serving stack:

    docker compose run --build train

## Configuration

Secrets are passed through environment variables from the host shell (or an .env file next to docker-compose.yml):

- BETTER_AUTH_SECRET - auth signing secret
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET - OAuth credentials
- AUTO_MIGRATE - set to false in production and run migrations explicitly via bun run api:migrate

See configuration.md for the full list of variables per app.
