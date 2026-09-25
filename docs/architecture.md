# System Architecture

## Overview

The repository is a Bun-workspace monorepo with five runtime or buildable areas:

```text
Web client (React 19 + Vite, port 3000) ──┐ same-origin /api
                                          ├─> Go API (port 4000) ---- PostgreSQL (port 5432)
Mobile client (Expo, iOS + Android) ──────┘ API over LAN (EXPO_PUBLIC_API_URL)
```
  |
  | in-process CGO call into the Rust static library
  v
Engine library (minimax + custom alpha-beta, no network hop)
```

Neither client connects directly to PostgreSQL or the engine.
The API owns game state, authentication, migrations, and computer moves.
The engine is linked into the API process as a static library; it keeps no
persistent state between moves (a fresh searcher is constructed per call)
and never touches the network or the database.

## Components

### Web client: `apps/web`

- React application with routes for sign-in, sign-up, local games, online games,
  and computer games.
- Vite serves development and preview builds on port `3000`.
- `/api` is proxied to `VITE_API_PROXY_TARGET` during Vite development and
  preview. A production reverse proxy must provide equivalent routing.
- The client polls the API once per second for active boards and matchmaking
  state; there is no WebSocket transport.
- Shared request and domain types come from `libs/types`.

### Mobile client: `apps/mobile`

- Expo (SDK 57) iOS and Android app with sign in, local, computer, and
  online games against the same Go API.
- Authenticates with the raw session token from sign-in, stored in
  SecureStore and sent as a cookie header, instead of relying on platform
  cookie jars.
- See [mobile.md](mobile.md) for setup, commands, and monorepo notes.

### Desktop client: `apps/desktop`

- Tauri 2 shell that renders the web client in a native window without
  duplicating UI code.
- Development loads the Vite dev server at `http://localhost:3000`, so the API
  proxy and hot reload behave as in the browser.
- Release builds embed the static output of `apps/web/dist` into the binary.
- See [desktop.md](desktop.md) for build modes and system dependencies.

### API: `apps/api`

- Go `net/http` server assembled in `cmd/api/main.go`.
- `internal/httpapi` owns routes, JSON decoding, CORS, and panic recovery.
- `internal/auth` owns password hashing, sessions, cookies, and Google OAuth.
- `internal/game` owns chess-rule validation, clocks, queue matching, game
  mutations, and engine orchestration.
- `internal/database` opens PostgreSQL and applies embedded SQL migrations.
- A game mutation locks the game row, validates the resulting position with
  `github.com/notnil/chess`, updates pieces and moves transactionally, and
  advances the game status.

### Engine: `apps/engine`

- Rust library using `shakmaty`, linked into the Go API via CGO
  (`apps/api/internal/engine`, C symbol `engine_best_move`).
- Accepts a FEN plus a `minimax` or `custom` opponent choice; legacy `dqn`
  requests map to `custom`.
- Minimax uses alpha-beta search at depth five and material evaluation.
- Custom runs an iterative-deepening alpha-beta search with quiescence,
  transposition table, and PeSTO evaluation (see docs/engine.md).
- No HTTP server, no GPU dependency, no model files. A semaphore in the Go
  wrapper bounds concurrent searches so computer games cannot starve the API.

### Training: `apps/dqn/training`

- Python project managed with `uv`.
- Generates self-play data, trains an AlphaZero-style policy/value model, and
  periodically exports checkpoints and a final ONNX model.
- The Rust input and move encodings must remain aligned with `encode.py` and
  the training model.

### Shared types: `libs/types`

The package defines the TypeScript representation of colors, pieces, game
statuses, modes, queue states, board responses, and API request/response
payloads. It is a compile-time contract for the web client; the Go API has its
own runtime types and does not import this package.

## Request Flows

### Local game

1. The web client requests `GET /api/board?mode=vs_player`.
2. The API finds or creates a local player game and returns pieces, moves,
   clocks, turn, status, and derived display data.
3. The client requests legal destinations with `GET /api/moves`.
4. The client submits a move to `POST /api/move`.
5. The API validates the move and commits the state change in one transaction.
6. The client refreshes the board immediately and continues its one-second
   polling loop.

### Online matchmaking

1. An authenticated client submits `POST /api/join-queue` with player ID,
   time control, and increment.
2. The API locks the queue table, removes an existing entry for that player,
   and either queues the player or pairs it with the oldest compatible entry.
3. The client polls `GET /api/queue-status` until the result is `matched`.
4. Both clients poll their board and submit moves through the same game API.

### Computer game

1. The client requests a `vs_computer` board. Computer games use an unlimited
   clock (`timeControl: 0`).
2. The human move is committed by the API.
3. If the game remains active and it is Black's turn, the API starts a
   background in-process engine call with the current position encoded as FEN.
4. The engine returns UCI notation, such as `e7e5` or `e1g1`.
5. The API validates and commits the engine move as a normal game mutation.
6. The client discovers the move through polling.

## Consistency and Failure Behavior

- PostgreSQL is the source of truth for users, sessions, queues, games, pieces,
  and moves.
- Game moves use row-level locking to serialize concurrent updates to one game.
- Queue matching uses a table lock to prevent two matchers from consuming the
  same queue entry.
- Engine calls run in-process behind a semaphore sized to `NumCPU - 1`. A
  saturated engine reports `engine busy`, which is logged and leaves the game
  unchanged, exactly like a failed remote call used to.
- An unavailable or panicking engine call does not automatically recover a
  pending computer move; operators should monitor API logs and users may need
  to retry or reset a game.
- Polling is intentionally simple but creates repeated read traffic. A
  production deployment should size API and database capacity for the number
  of active games.
