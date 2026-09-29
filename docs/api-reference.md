# HTTP API Reference

The API is served under `/api` by the Go service. JSON errors use the shape
`{"error":"message"}`. The API currently returns many service errors as HTTP
500, including some invalid domain requests; clients should display the error
message and operators should treat unexpected 500 responses as actionable.

Game play is websocket-only over `GET /api/ws` (see Realtime below); the
legacy REST game endpoints were removed and return 404. REST remains for
health and authentication.

## Health

### `GET /api/health`

Returns `{"ok":true}` when the API process is serving. This endpoint does not
verify PostgreSQL reachability at request time. Computer moves are served
in-process by the linked Rust engine; there is no separate engine service or
engine health endpoint.

## Realtime (`GET /api/ws`)

One persistent socket per client carries all game traffic as JSON messages.
Every client message carries an opaque `id` for request/response correlation;
server pushes (`game.state`, `queue.status`, `presence`, offers) arrive
without an id and are applied immediately. Web authenticates with the session
cookie on upgrade; mobile passes `?token=` and a `hello` message with the
stored session token.

Client messages:

- `hello` (`token?`) — authenticate / re-authenticate.
- `queue.join` (`timeControl`, `increment?`), `queue.leave`, `queue.get` —
  matchmaking. Match responses arrive as `game.matched` plus `game.state`.
- `game.new` (`mode`, `timeControl?`, `increment?`, `opponent?`) — create a
  local or computer game. Rated online games use `queue.join` instead.
- `game.join` / `game.leave` (`gameId`) — subscribe to a game room for
  pushes; doubles as reconnect resume.
- `board.get` (`gameId?`, `mode?`) and `moves.get` (`gameId`, `square`) —
  one-shot reads answered with `game.state` and `moves.result`.
- `game.move` (`gameId`, `from`, `to`, `promotion?`, `opponent?`) — the
  server rejects moves from spectators and from the side not to move.
  Anonymous local and computer games allow the connected client to move.
- `game.resign` (`gameId`), `game.draw.offer` / `game.draw.respond`
  (`gameId`, `accept`) — draw and resign flow through room broadcasts.
- `game.undo.request` / `game.undo.respond` (`gameId`, `accept`) — rated
  games require opponent consent; computer and anonymous boards apply
  immediately.
- `game.rematch.offer` / `game.rematch.respond` (`gameId`, `accept`) —
  creates a new game with swapped colors on accept.
- `ping` — answered with `pong`.

Server pushes include `game.state` (full board, per-viewer `userColor`),
`game.matched`, `queue.status`, `presence` (`whiteOnline`/`blackOnline`),
`game.draw.offered`, `game.undo.requested` / `game.undo.result`,
`game.rematch.offered`, `game.over`, and `error`. A 1s server ticker
re-checks active rooms so timeouts and engine replies are pushed even if a
notification is missed. Square indexes are integers from `0` through `63`.

## Authentication

### `POST /api/auth/sign-up`

Accepts `email`, `password`, and `name`. Passwords must be 8 to 128 characters.
Successful registration creates a seven-day session and sets the HTTP-only
`better-auth.session_token` cookie.

### `POST /api/auth/sign-in`

Accepts `email` and `password`. Successful sign-in creates a seven-day session
and sets the session cookie.

### `GET /api/auth/get-session`

Reads the session cookie and returns the current user and session, or null
values when no valid session exists.

### `POST /api/auth/sign-out`

Deletes the current session and clears the cookie. A `sessionId` in the request
body can be used by compatibility clients.

### Google OAuth

`POST /api/auth/sign-in/social` accepts `{"provider":"google"}` and returns a
Google authorization URL. Google redirects to
`GET /api/auth/callback/google`, which sets a session cookie and redirects to
`WEB_ORIGIN`. Configure `${AUTH_BASE_URL}/callback/google` in the Google OAuth
client.

## Engine Selection

Computer moves are computed in-process by the Rust engine static library
(`apps/engine`, bridged through `apps/api/internal/engine`); there is no
engine HTTP service.

The Go bridge accepts a FEN plus `minimax` or `custom` (legacy `dqn` maps to
`custom`), selects the move, and returns UCI notation such as `e7e5`. Invalid
or illegal positions surface as engine errors and leave the game unchanged.
For the custom opponent, the API log records reached depth, score, and node
count as diagnostics.
