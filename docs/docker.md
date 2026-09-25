# Docker Deployment

Each app ships a Dockerfile. Build from the repository root because the API
image compiles the Rust engine static library first.

## Services

| Service | Dockerfile | Port | Notes |
| --- | --- | --- | --- |
| db | postgres:17-alpine image | 5432 (internal) | Data persisted in the `pgdata` volume |
| api | apps/api/Dockerfile | 4000 | Multi-stage Rust + Go build; CGO-enabled binary on debian-slim; runs migrations on boot when AUTO_MIGRATE=true |
| web | apps/web/Dockerfile | 3000 | Bun build, served by vite preview; proxies /api to the api service |
| train | apps/dqn/Dockerfile | none | Optional training container under the "train" profile with NVIDIA GPU reservation |

## Usage

    docker build -f apps/api/Dockerfile -t chess-api .
    docker build -f apps/web/Dockerfile -t chess-web .

The web UI is available at http://localhost:3000. The api is reachable directly at http://localhost:4000.

Run a training job without starting the serving stack:

    docker compose run --build train

## Configuration

Secrets are passed through environment variables from the host shell (or an .env file next to docker-compose.yml):

- BETTER_AUTH_SECRET - auth signing secret
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET - OAuth credentials
- AUTO_MIGRATE - set to false in production and run migrations explicitly via bun run api:migrate

See configuration.md for the full list of variables per app.
