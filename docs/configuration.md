# Configuration

The local stack loads a single root `.env` file. In a deployed environment,
provide equivalent variables through the process manager or secret store.
Do not put secrets in source control, browser-exposed `VITE_*` variables, or
the web build output.

## API Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | None | PostgreSQL connection string. The API fails startup when absent or unreachable. |
| `HOST` | No | `0.0.0.0` | API bind host. |
| `PORT` | No | `4000` | API listen port. |
| `WEB_ORIGIN` | No | `http://localhost:3000` | Credentialed browser origin allowed by API CORS and OAuth callback validation. Accepts a comma-separated allowlist; the API echoes a listed request origin. Add `https://tauri.localhost` for the packaged desktop shell. |
| `BETTER_AUTH_SECRET` | No | `default-secret-change-me` | HMAC secret used to sign the session cookie. Replace in every non-local environment. |
| `AUTH_BASE_URL` | No | `http://localhost:4000/api/auth` | Public API auth base URL and Google OAuth redirect base. |
| `GOOGLE_CLIENT_ID` | No | Empty | Google OAuth client ID. Both Google variables are required to enable OAuth. |
| `GOOGLE_CLIENT_SECRET` | No | Empty | Google OAuth client secret. |
| `AUTO_MIGRATE` | No | `false` | When `true`, applies pending embedded migrations before serving. |
| `REDIS_URL` | No | Empty | Redis connection URL for sharing realtime game updates across API replicas. When empty, a single-process in-memory broker is used. |

## Engine Variables

Computer moves are served in-process by the API through the Rust static
library, so there is no engine host, port, or model path to configure.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ENGINE_CUSTOM_MOVETIME_MS` | No | `1000` | Time budget per custom-engine move in milliseconds. |
| `ENGINE_CUSTOM_MAX_DEPTH` | No | `64` | Maximum custom-engine search depth. |

Longer `ENGINE_CUSTOM_MOVETIME_MS` values make computer moves stronger but
hold a search slot longer; size deployment CPU for the number of concurrent
computer games rather than accepting the development defaults without
measurement. The DQN variables (`CHESS_MODEL_PATH`, `DQN_SIMULATIONS`,
`DQN_MOVE_TIME_MS`) and `CHESS_ENGINE_URL` were removed with the standalone
engine server; the training code in `apps/dqn/training` is retained for
research but no longer serves traffic.

## Web Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `VITE_API_PROXY_TARGET` | No | `http://127.0.0.1:4000` | Vite dev and preview proxy target for `/api`. |
| `VITE_API_BASE_URL` | No | Empty | Explicit API base for the web client. When empty the browser stays same-origin. |
| `VITE_DESKTOP_API_URL` | No | `http://127.0.0.1:4000` | API base for the packaged desktop shell. Consulted only under Tauri when `VITE_API_BASE_URL` is empty. |

Only variables intentionally prefixed with `VITE_` are suitable for Vite
client configuration. Never expose database credentials, OAuth secrets, or the
auth secret through a `VITE_` variable.

## Local Example

```dotenv
DATABASE_URL=postgres://postgres@localhost:5432/chess
WEB_ORIGIN=http://localhost:3000
AUTH_BASE_URL=http://localhost:4000/api/auth
VITE_API_PROXY_TARGET=http://127.0.0.1:4000
```

For production, use HTTPS URLs, a generated high-entropy
`BETTER_AUTH_SECRET`, and a managed PostgreSQL connection string.
