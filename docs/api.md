# API

`apps/api` is the Go HTTP API for the chess application and preserves the web client's `/api` contract.

## Structure

```text
apps/api/
├── cmd/api/                  # Process entry point and dependency wiring
├── internal/auth/            # Email/password auth, sessions, cookies, and auth SQL
├── internal/config/          # Environment configuration and defaults
├── internal/database/        # PostgreSQL connection, runner, and embedded migrations
├── internal/game/            # Chess rules, game services, queueing, and game SQL
├── internal/httpapi/         # Router, middleware, validation, and JSON handlers
├── go.mod
└── project.json
```

The database is owned by this app. `internal/database` opens PostgreSQL and applies its embedded, ordered SQL migrations; auth and game queries remain close to their features. Nothing is exported as a shared monorepo database package.

## Commands

Run from the repository root:

```bash
bunx nx run api:dev
bunx nx run api:build
bunx nx run api:test
bunx nx run api:lint
just api-migrate
```

Run directly from `apps/api`:

```bash
CGO_ENABLED=0 go run ./cmd/api
CGO_ENABLED=0 go run ./cmd/api -migrate
CGO_ENABLED=0 go test ./...
```

Set `AUTO_MIGRATE=true` to apply pending app-local migrations when the server starts. `devenv up` runs migrations explicitly before starting the API.

## Configuration

- `DATABASE_URL`: required PostgreSQL connection string
- `HOST`: HTTP bind host, default `0.0.0.0`
- `PORT`: HTTP port, default `4000`
- `CHESS_ENGINE_URL`: engine base URL, default `http://127.0.0.1:8080`
- `WEB_ORIGIN`: allowed credentialed browser origin, default `http://localhost:3000`
- `BETTER_AUTH_SECRET`: session-cookie signing secret
- `AUTO_MIGRATE`: set to `true` to migrate during startup

The process uses the repository's existing auth, game, queue, piece, and move tables. Its embedded migration can initialize an empty database and can also adopt a database previously migrated by Drizzle.

## API Compatibility

The Go app implements health, board, legal move, game mutation, matchmaking, draw, resignation, and email/password session endpoints under `/api`. Computer moves use `POST {CHESS_ENGINE_URL}/api/engine-move` asynchronously. The frontend polls until the selected minimax or DQN move is persisted.

Both Vite development and preview proxy `/api` to `VITE_API_PROXY_TARGET`. Production deployments must provide the same routing when Vite is not serving the frontend.

Google social sign-in is not implemented in the Go app. `POST /api/auth/sign-in/social` returns `501` with a clear error; email/password authentication and the web client's session flow are supported.
