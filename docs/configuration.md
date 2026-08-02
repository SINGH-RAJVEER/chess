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
| `CHESS_ENGINE_URL` | No | `http://127.0.0.1:8080` | Base URL used for asynchronous engine requests. |
| `WEB_ORIGIN` | No | `http://localhost:3000` | Credentialed browser origin allowed by API CORS and OAuth callback validation. |
| `BETTER_AUTH_SECRET` | No | `default-secret-change-me` | HMAC secret used to sign the session cookie. Replace in every non-local environment. |
| `AUTH_BASE_URL` | No | `http://localhost:4000/api/auth` | Public API auth base URL and Google OAuth redirect base. |
| `GOOGLE_CLIENT_ID` | No | Empty | Google OAuth client ID. Both Google variables are required to enable OAuth. |
| `GOOGLE_CLIENT_SECRET` | No | Empty | Google OAuth client secret. |
| `AUTO_MIGRATE` | No | `false` | When `true`, applies pending embedded migrations before serving. |

## Engine Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ENGINE_HOST` | No | `0.0.0.0` | Engine bind host. |
| `ENGINE_PORT` | No | `8080` | Engine listen port. |
| `CHESS_MODEL_PATH` | No | `apps/dqn/model.onnx` | ONNX model path. Relative paths are resolved from the engine process working directory. |
| `DQN_SIMULATIONS` | No | `20000` | Maximum policy-guided simulations for one DQN move. |
| `DQN_MOVE_TIME_MS` | No | `500000` | Maximum DQN search duration in milliseconds. |

The engine attempts CUDA and falls back to CPU. `DQN_SIMULATIONS` and
`DQN_MOVE_TIME_MS` can make DQN requests expensive; set deployment-specific
limits rather than accepting the development defaults without measurement.

## Web Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `VITE_API_PROXY_TARGET` | No | `http://127.0.0.1:4000` | Vite dev and preview proxy target for `/api`. |

Only variables intentionally prefixed with `VITE_` are suitable for Vite
client configuration. Never expose database credentials, OAuth secrets, or the
auth secret through a `VITE_` variable.

## Local Example

```dotenv
DATABASE_URL=postgres://postgres@localhost:5432/chess
WEB_ORIGIN=http://localhost:3000
AUTH_BASE_URL=http://localhost:4000/api/auth
VITE_API_PROXY_TARGET=http://127.0.0.1:4000
CHESS_ENGINE_URL=http://127.0.0.1:8080
```

For production, use HTTPS URLs, a generated high-entropy
`BETTER_AUTH_SECRET`, a managed PostgreSQL connection string, and a private
engine address.
