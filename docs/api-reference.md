# HTTP API Reference

The API is served under `/api` by the Go service. JSON errors use the shape
`{"error":"message"}`. The API currently returns many service errors as HTTP
500, including some invalid domain requests; clients should display the error
message and operators should treat unexpected 500 responses as actionable.

## Health

### `GET /api/health`

Returns `{"ok":true}` when the API process is serving. This endpoint does not
verify PostgreSQL or engine reachability at request time.

The engine separately exposes `GET /api/health`, which includes `ok`,
`dqn_available`, and `execution_provider`.

## Board and Moves

### `GET /api/board`

Query parameters:

- `mode`: `vs_player` or `vs_computer`; defaults to `vs_player`.
- `gameId`: optional game ID.
- `playerId`: optional player ID used to find the player's current online game.

The response includes the game ID, pieces, move history, current turn, status,
clock values, user color, check state, draw state, and server timestamp.
Square indexes are integers from `0` through `63`, using the same mapping as the
Go and TypeScript clients.

### `GET /api/moves?square={square}&gameId={gameId}`

Returns an array of legal destination square indexes for the selected piece.
Both query parameters are required.

### `POST /api/move`

Request:

```json
{
    "gameId": 12,
    "from": 52,
    "to": 36,
    "promotion": "Queen",
    "opponent": "dqn"
}
```

`promotion` is optional and may be `Queen`, `Rook`, `Bishop`, or `Knight`.
`opponent` is optional and may be `minimax` or `dqn`; it is used for computer
games. The API validates the position and move server-side.

Response fields include `success`, `nextTurn`, `status`, `captured`, `isCheck`,
`isCheckmate`, and `isCastle`, with `promotion` when applicable.

### `POST /api/reset`

Creates a new game. Request fields are `mode`, `timeControl` in minutes, and
optional `increment` in seconds. `timeControl: 0` creates an untimed game.

### `POST /api/undo`

Request: `{"gameId":12}`. Removes the most recent move and restores the prior
piece state. The client uses two requests for a computer-game takeback when
both the human and engine moves should be undone.

### `POST /api/resign`

Request: `{"gameId":12,"color":"White"}`. Marks the game as `Resignation`
and returns the opposing color as `winner`.

### `POST /api/draw-offer`

Request: `{"gameId":12,"color":"White"}`. Stores the offering color while
the game remains ongoing.

### `POST /api/draw-respond`

Request: `{"gameId":12,"accept":true}`. An accepted offer changes status to
`Draw`; a declined offer clears the offer and leaves the game ongoing.

## Matchmaking

### `POST /api/join-queue`

Request fields:

```json
{
    "playerId": "user-id",
    "timeControl": 10,
    "increment": 0
}
```

Returns one of `queued` or `matched`; a matched response includes `gameId`.
Players are matched by equal time control and increment.

### `GET /api/queue-status?playerId={playerId}`

Returns `idle`, `queued`, or `matched`. A queued response includes the selected
time control; a matched response includes `gameId`.

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

## Engine API

The engine is an internal service and should not be publicly exposed.

### `POST /api/engine-move`

Request:

```json
{
    "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "opponent": "minimax"
}
```

The response contains `best_move` in UCI notation, `engine`, and optional
`execution_provider`. Invalid FEN or positions return 400. A DQN inference
failure reports `minimax_fallback` and returns the fallback move.
