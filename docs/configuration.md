# Configuration

New development databases default to `sixtyfour`. Existing installations can keep their database by explicitly setting `PGDATABASE` and `DATABASE_URL`; the rename does not move or delete database contents.

The browser stores preferences, session caches, profile images, and local computer games under `sixtyfour_` keys. On the same browser origin, it migrates earlier `chess_` keys before rendering and keeps any already saved `sixtyfour_` value. The desktop origin is now `app://sixtyfour`; storage from its former origin is separate, so existing desktop users must sign in again and their local settings and games do not carry over automatically.

The local stack loads a single root `.env` file. In a deployed environment, provide equivalent variables through the process manager or secret store. Do not put secrets in source control, browser-exposed `VITE_*` variables, or the web build output.

## API Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | None | PostgreSQL connection string. The API fails startup when absent or unreachable. |
| `HOST` | No | `0.0.0.0` | API bind host. |
| `PORT` | No | `4000` | API listen port. |
| `WEB_ORIGIN` | No | `http://localhost:3000` | Credentialed origins allowed by API CORS. Accepts a comma-separated allowlist; the API echoes a listed request origin. Google callback validation currently supports one origin, so the packaged Electron origin is not supported for Google sign-in. |
| `BETTER_AUTH_SECRET` | No | `default-secret-change-me` | HMAC secret used to sign the session cookie. Replace in every non-local environment. |
| `AUTH_BASE_URL` | No | `http://localhost:4000/api/auth` | Public API auth base URL and Google OAuth redirect base. |
| `GOOGLE_CLIENT_ID` | No | Empty | Google OAuth client ID. Both Google variables are required to enable OAuth. |
| `GOOGLE_CLIENT_SECRET` | No | Empty | Google OAuth client secret. |
| `AUTO_MIGRATE` | No | `false` | When `true`, applies pending embedded migrations before serving. |
| `REDIS_URL` | No | Empty | Redis connection URL for sharing realtime game updates across API replicas. When empty, a single-process in-memory broker is used. |

## Engine Variables

Minimax and custom computer moves are served by the `sixtyfour-engine` binary built from `apps/engine`, which the API spawns once per move over UCI. There is no engine host, port, or model path to configure. The Stockfish opponent runs its own binary the same way (see [stockfish.md](stockfish.md)).

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ENGINE_PATH` | No | `sixtyfour-engine` on `PATH`, then `apps/engine/target/release/sixtyfour-engine` | `sixtyfour-engine` binary for the `minimax` and `custom` opponents. The container image sets `/usr/local/bin/sixtyfour-engine`. When unresolvable, those moves are rejected. |
| `ENGINE_CUSTOM_MOVETIME_MS` | No | `1000` | Time budget per custom-engine move in milliseconds. Read by the API and sent as `go movetime`. |
| `ENGINE_CUSTOM_MAX_DEPTH` | No | `64` | Maximum custom-engine search depth. Read by the API and sent as `go depth`. |
| `STOCKFISH_PATH` | No | `stockfish` on `PATH` | Stockfish binary for the `stockfish` opponent. The container image sets `/usr/games/stockfish`. When unresolvable, Stockfish moves are rejected. |

Longer `ENGINE_CUSTOM_MOVETIME_MS` values make computer moves stronger but hold a search slot longer; size deployment CPU for the number of concurrent computer games rather than accepting the development defaults without measurement. The DQN variables (`CHESS_MODEL_PATH`, `DQN_SIMULATIONS`, `DQN_MOVE_TIME_MS`) and `CHESS_ENGINE_URL` were removed with the standalone engine server; the training code in `apps/dqn/training` is retained for research but no longer serves traffic.

## Web Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `VITE_API_PROXY_TARGET` | No | `http://127.0.0.1:4000` | Vite dev and preview proxy target for `/api`. |
| `VITE_API_BASE_URL` | No | Empty | Explicit API base for the web client. When empty the browser stays same-origin. |
| `VITE_DESKTOP_API_URL` | No | `http://127.0.0.1:4000` | API base for the packaged desktop shell. Consulted only under Electron when `VITE_API_BASE_URL` is empty. |

Only variables intentionally prefixed with `VITE_` are suitable for Vite client configuration. Never expose database credentials, OAuth secrets, or the auth secret through a `VITE_` variable.

## Local Example

```dotenv
DATABASE_URL=postgres://postgres@localhost:5432/sixtyfour
WEB_ORIGIN=http://localhost:3000
AUTH_BASE_URL=http://localhost:4000/api/auth
VITE_API_PROXY_TARGET=http://127.0.0.1:4000
```

For production, use HTTPS URLs, a generated high-entropy `BETTER_AUTH_SECRET`, and a managed PostgreSQL connection string.
