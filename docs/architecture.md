# System Architecture

## Overview

The repository is an Nx monorepo with four runtime or buildable areas:

```text
Browser
  |
  | same-origin /api requests
  v
Web client (React 19 + Vite, port 3000)
  |
  | HTTP
  v
Go API (port 4000) ---- PostgreSQL (port 5432)
  |
  | asynchronous POST /api/engine-move
  v
Rust engine (Axum, port 8080)
  |
  | optional ONNX Runtime CUDA provider
  v
apps/dqn/model.onnx
```

The web application does not connect directly to PostgreSQL or the engine.
The API owns game state, authentication, migrations, and calls to the engine.
The engine is an internal stateless move-selection service. It keeps the ONNX
session in memory but does not persist games.

## Components

### Web client: `apps/web`

- React application with routes for sign-in, sign-up, local games, online games,
  and computer games.
- Vite serves development and preview builds on port `3000`.
- `/api` is proxied to `VITE_API_PROXY_TARGET` during Vite development and
  preview. A production reverse proxy must provide equivalent routing.
- The client polls the API once per second for active boards and matchmaking
  state; there is no WebSocket transport.
- Shared request and domain types come from `packages/types`.

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

- Rust service using Axum and `shakmaty`.
- `POST /api/engine-move` accepts FEN plus `minimax` or `dqn` opponent choice.
- Minimax uses alpha-beta search at depth five and material evaluation.
- DQN loads the ONNX model once at startup and uses policy-guided tree search.
- CUDA is attempted first; CPU is used when CUDA initialization fails.
- DQN inference failure falls back to minimax for that request.

### Training: `apps/dqn/training`

- Python project managed with `uv`.
- Generates self-play data, trains an AlphaZero-style policy/value model, and
  periodically exports checkpoints and a final ONNX model.
- The Rust input and move encodings must remain aligned with `encode.py` and
  the training model.

### Shared types: `packages/types`

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
   background engine request with the current position encoded as FEN.
4. The engine returns UCI notation, such as `e7e5` or `e1g1`.
5. The API validates and commits the engine move as a normal game mutation.
6. The client discovers the move through polling.

## Consistency and Failure Behavior

- PostgreSQL is the source of truth for users, sessions, queues, games, pieces,
  and moves.
- Game moves use row-level locking to serialize concurrent updates to one game.
- Queue matching uses a table lock to prevent two matchers from consuming the
  same queue entry.
- Engine calls are bounded by a 30-second Go HTTP client timeout. A failed or
  malformed engine response is logged and leaves the game unchanged.
- The engine's DQN path can fall back to minimax, but an unavailable engine
  does not automatically recover a pending computer move; operators should
  monitor engine availability and users may need to retry or reset a game.
- Polling is intentionally simple but creates repeated read traffic. A
  production deployment should size API and database capacity for the number
  of active games.
