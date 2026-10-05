# System Architecture

## Overview

Computer games use local engines on web, mobile, and desktop. Signed-in web and mobile clients can restore an archived game when their current game has no moves, then synchronize later changes in the background. Revision checks prevent a delayed restore from replacing a changed local game. Remote game clients reject older board revisions and record move latency from submission through the rendered board, with separate engine and render timings.

The repository is a Bun-workspace monorepo with five runtime or buildable areas:

```text
Web client (React 19 + Vite, port 3000) ──┐ same-origin /api
										  ├─> Go API (port 4000) ---- PostgreSQL (port 5432)
Mobile client (Expo, iOS + Android) ──────┘ API over LAN (EXPO_PUBLIC_API_URL)
	|
	| persistent worker leases over UCI (stdin/stdout)
	v
sixtyfour-engine binary (ENGINE_PATH; minimax + custom alpha-beta)
	or Stockfish binary (STOCKFISH_PATH)
```

The API owns live multiplayer state, authentication, and migrations. Computer games own their rules and saves locally, with native Electron engines and WebAssembly workers in browsers and mobile WebViews. Signed-in players archive local games through authenticated background HTTP requests. The API also retains a bounded persistent UCI pool for legacy server computer-game requests. Engines never access the database or network.

## Components

### Web client: `apps/web`

- React application with routes for sign-in, sign-up, local games, online games, and computer games.
- Vite serves development and preview builds on port `3000`.
- `/api` is proxied to `VITE_API_PROXY_TARGET` during Vite development and preview. A production reverse proxy must provide equivalent routing.
- The client holds one persistent WebSocket (`GET /api/ws`) for server game traffic: matchmaking, board pushes, moves, draw/takeback/rematch offers, presence, and timeout notifications. REST remains for auth, health checks, and the initial page load; game mutations go over the socket for push latency instead of 1s polling.
- Shared request and domain types come from `libs/types`.

### Mobile client: `apps/mobile`

- Expo (SDK 57) iOS and Android app with sign in, local, computer, and online games against the same Go API.
- Authenticates with the raw session token from sign-in, stored in SecureStore and sent as a cookie header, instead of relying on platform cookie jars.
- See [mobile.md](mobile.md) for setup, commands, and monorepo notes.

### Desktop client: `apps/desktop`

- Electron shell that renders the web client in a native window without duplicating UI code.
- Development loads the Vite dev server at `http://localhost:3000`, so the API proxy and hot reload behave as in the browser.
- Release builds embed the static output of `apps/web/dist` into the binary.
- See [desktop.md](desktop.md) for build modes and system dependencies.

### API: `apps/api`

- Go `net/http` server assembled in `cmd/api/main.go`.
- `internal/httpapi` owns routes, JSON decoding, CORS, and panic recovery.
- `internal/auth` owns password hashing, sessions, cookies, and Google OAuth.
- `internal/game` owns chess-rule validation, clocks, queue matching, game mutations, and engine orchestration.
- `internal/database` opens PostgreSQL and applies embedded SQL migrations.
- A game mutation locks the game row, validates the resulting position with `github.com/notnil/chess`, updates pieces and moves transactionally, and advances the game status.

### Engine: `apps/engine`

- Rust crate using `shakmaty`, built as the `sixtyfour-engine` UCI binary and as WebAssembly. Native adapters retain persistent processes.
- Accepts a FEN plus a `minimax` or `custom` opponent choice (the UCI `Opponent` option); legacy `dqn` requests map to `custom`. The `stockfish` choice runs the Stockfish binary through the same UCI runner at one of eight difficulty levels (see [stockfish.md](stockfish.md)).
- Minimax uses iterative-deepening alpha-beta search and material evaluation within the 500 ms budget.
- Custom runs an iterative-deepening alpha-beta search with quiescence, transposition table, and PeSTO evaluation (see docs/engine.md).
- No HTTP server, no GPU dependency, no model files. Worker leases in the Go wrapper reserve bounded CPU capacity before a human move is committed.

### Training: `apps/dqn/training`

- Python project managed with `uv`.
- Generates self-play data, trains an AlphaZero-style policy/value model, and periodically exports checkpoints and a final ONNX model.
- The Rust input and move encodings must remain aligned with `encode.py` and the training model.

### Shared types: `libs/types`

The package defines the TypeScript representation of colors, pieces, game statuses, modes, queue states, board responses, and API request/response payloads. It is a compile-time contract for the web client; the Go API has its own runtime types and does not import this package.

## Request Flows

### Local game

1. The web client requests `game.new` (or `board.get` to resume) over the socket with `mode: vs_player`.
2. The API finds or creates a local player game and pushes pieces, moves, clocks, turn, status, and derived display data.
3. The client reads legal destinations from the committed board snapshot without another network request. `moves.get` remains available for protocol compatibility.
4. The client submits a move with `game.move`.
5. The API validates the move and commits the state change in one transaction, then pushes the new board to the room.

### Online matchmaking

1. An authenticated client opens `/api/ws` (session cookie on web, token query plus `hello` on mobile) and submits `queue.join` with time control and increment.
2. The API locks the queue table, removes an existing entry for that player, and either queues the player (`queue.status: queued`) or pairs it with the oldest compatible entry.
3. Both players receive `game.matched` plus a full `game.state` push over their sockets; the waiting opponent is woken even if it joined first.
4. Moves, resignations, draw offers, takeback requests, and rematch offers are socket messages; the server broadcasts fresh `game.state` to the game room after every committed mutation, with per-viewer `userColor`.
5. Takebacks and rematches require opponent consent (`game.undo.request` / `game.rematch.offer` plus accept/decline). Unilateral undo is disabled in rated games. `queue.leave` cancels a search.
6. Presence (`whiteOnline`/`blackOnline`) is pushed on join, leave, and disconnect. A 1s server ticker re-checks active rooms so timeouts and engine replies are pushed even if a notification is missed.

### Computer game

1. The client restores its local SAN history and validates it with `chess.js`. A missing save starts a new unlimited-clock game.
2. Selecting an opponent prewarms its engine. Human moves are validated locally, saved, and shown immediately.
3. The local engine receives the current FEN and searches for at most 500 ms. Workers keep the UI thread responsive.
4. The result must belong to the current revision and pass local rule validation before it is applied, saved, and rendered.
5. Undo, reset, leaving the page, and changing the opponent cancel pending search work. Late results are ignored.
6. Signed-in games upload after a debounce. Offline writes remain durable and retry later; recovery downloads cannot overwrite a move played during the request. See [local-computer-games.md](local-computer-games.md).

## Consistency and Failure Behavior

- PostgreSQL is authoritative for live server games, users, sessions, and queues. Local computer games use a durable device save; server archives are unrated backups.
- Game moves use row-level locking to serialize concurrent updates to one game.
- Rated PvP moves are authorized by color ownership: the server rejects moves from spectators and from the side that is not to move. Anonymous local and computer games allow the connected client to move.
- Queue matching uses a table lock to prevent two matchers from consuming the same queue entry.
- Server search concurrency is `max(1, min(GOMAXPROCS - 1, 4))`. A saturated pool reports `engine busy` before committing the human move.
- The realtime hub rejects a computer move up front when the selected engine binary cannot be found. An engine process that crashes, or is killed after overrunning its move budget, fails only that move; the pending computer move is not retried automatically, so operators should monitor API logs and users may need to retry or reset a game.
- Game play is websocket-only. The legacy REST game endpoints (`/api/board`, `/api/moves`, `/api/queue-status`, `/api/move`, `/api/undo`, `/api/resign`, `/api/draw-offer`, `/api/draw-respond`, `/api/reset`, `/api/join-queue`) were removed; REST remains for auth, health checks, and page loads.
- Each API process runs one hub (`internal/realtime`) fanning out to per-game rooms; PostgreSQL stays the source of truth, so a reconnected client resumes with `game.join` and gets the latest state. Committed move snapshots carry a monotonic game revision and legal destinations. The broker delivers that snapshot once per commit; the hub personalizes `userColor` without querying PostgreSQL per subscriber. Older revisions are discarded by the hub and clients. Every mutation is announced through a `Broker`: the in-memory default for a single replica, or Redis pub/sub (`REDIS_URL`) so any replica's subscribers converge on pushes in a multi-replica deployment.
