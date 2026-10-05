# API

`apps/api` is the Go HTTP API for SixtyFour and preserves the web client's `/api` contract.

## Structure

```text
apps/api/
├── cmd/api/                  # Process entry point and dependency wiring
├── internal/auth/            # Email/password auth, sessions, cookies, and auth SQL
├── internal/config/          # Environment configuration and defaults
├── internal/database/        # PostgreSQL connection, runner, and embedded migrations
├── internal/engine/          # UCI runner for the sixtyfour-engine and Stockfish binaries
├── internal/game/            # Chess rules, game services, queueing, and game SQL
├── internal/httpapi/         # Router, middleware, validation, and JSON handlers
└── go.mod
```

The database is owned by this app. `internal/database` opens PostgreSQL and applies its embedded, ordered SQL migrations; auth and game queries remain close to their features. Nothing is exported as a shared monorepo database package.

## Commands

Run from the repository root:

```bash
just api-dev
just api-build
just api-test
just api-lint
just api-migrate
```

Run directly from `apps/api`:

```bash
CGO_ENABLED=0 go run ./cmd/api
CGO_ENABLED=0 go run ./cmd/api -migrate
CGO_ENABLED=0 go test ./...
```

Set `AUTO_MIGRATE=true` to apply pending app-local migrations when the server starts. `devenv up` runs migrations explicitly before starting the API.

The API is pure Go and builds without a C toolchain. Computer moves come
from child processes: `internal/engine` spawns the `sixtyfour-engine` binary
(`apps/engine`, built by `just engine-bin`) per move for minimax and custom,
and the binary from `STOCKFISH_PATH` (or `PATH`) for the `stockfish`
opponent. Legacy `dqn` opponent values map to the custom engine. Inside the
repository the API finds `apps/engine/target/release/sixtyfour-engine` without
configuration; elsewhere set `ENGINE_PATH`. The engine tests and the
computer-reply game test need that binary, so build it before
`go test ./...`. See [engine.md](engine.md) and [stockfish.md](stockfish.md).

## Configuration

- `DATABASE_URL`: required PostgreSQL connection string
- `HOST`: HTTP bind host, default `0.0.0.0`
- `PORT`: HTTP port, default `4000`
- `WEB_ORIGIN`: allowed credentialed browser origin, default `http://localhost:3000`
- `BETTER_AUTH_SECRET`: session-cookie signing secret
- `AUTH_BASE_URL`: public auth URL, default `http://localhost:4000/api/auth`
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `AUTO_MIGRATE`: set to `true` to migrate during startup

The process uses the repository's existing auth, game, queue, piece, and move tables. Its embedded migration can initialize an empty database and can also adopt a database previously migrated by Drizzle.

## API Compatibility

The Go app implements health, board, legal move, game mutation, matchmaking, draw, resignation, and email/password session endpoints under `/api`. Computer moves are selected by a `sixtyfour-engine` child process (minimax or custom alpha-beta) on a background goroutine. The frontend polls until the engine move is persisted.

Both Vite development and preview proxy `/api` to `VITE_API_PROXY_TARGET`. Production deployments must provide the same routing when Vite is not serving the frontend.

Google OAuth starts at `POST /api/auth/sign-in/social` and completes at `GET /api/auth/callback/google`. Configure the Google OAuth client with this authorized redirect URI:

```text
${AUTH_BASE_URL}/callback/google
```

For local development this is `http://localhost:4000/api/auth/callback/google`. OAuth callback redirects are restricted to `WEB_ORIGIN`; Google accounts are linked to existing users only by a Google-verified email address.
