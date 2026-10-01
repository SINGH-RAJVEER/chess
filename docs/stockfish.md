# Stockfish Opponent

The vs computer page offers Stockfish alongside the built-in minimax and
custom alpha-beta engines. Unlike those, Stockfish is not linked into the
API: `apps/api/internal/engine/stockfish.go` drives an external Stockfish
binary over UCI.

## Difficulty Levels

Players pick a level from 1 (weakest) to 8 (full strength). Each level caps
Stockfish's `Skill Level` option, its search depth, and its think time:

| Level | Skill Level | Depth | Move time |
| --- | --- | --- | --- |
| 1 | 0 | 1 | 50 ms |
| 2 | 2 | 2 | 100 ms |
| 3 | 5 | 3 | 150 ms |
| 4 | 8 | 5 | 200 ms |
| 5 | 11 | 7 | 300 ms |
| 6 | 14 | 10 | 500 ms |
| 7 | 17 | 14 | 800 ms |
| 8 | 20 | 22 | 1500 ms |

The lower levels rely on low skill and shallow depth rather than
`UCI_LimitStrength`, because `UCI_Elo` cannot go below 1320, which is too
strong for beginners. Level 4 is the default when no level is sent.

## Request Flow

1. The client sends `game.move` with `opponent: "stockfish"` and `level`
   (1 to 8). Like `opponent`, the level is sent per move, so changing it
   mid-game applies from the next engine reply.
2. If no Stockfish binary can be resolved, the hub rejects the move with
   `stockfish is not installed on the server` before committing it. This
   avoids leaving the game waiting on a reply that cannot arrive.
3. The engine reply reuses the in-process engine path: the FEN is validated
   in Go first, because Stockfish may crash on malformed input. The search
   then takes a slot from the shared `NumCPU - 1` semaphore.
4. A fresh Stockfish process is spawned for each move with `Threads 1` and
   `Hash 16`. No skill settings or hash contents carry over between games,
   and startup costs roughly 150 ms. The process is killed if it has not
   answered within the move time plus a 10 second startup budget.
5. `bestmove (none)` maps to `no legal moves`. The API log records the
   level, reached depth, and score for each move.

The server clamps levels above 8 down to 8, and treats missing or
non-positive levels as level 4.

## Installing the Binary

The API resolves the binary from `STOCKFISH_PATH`, falling back to
`stockfish` on `PATH`.

- Local development: `devenv.nix` installs `stockfish`, so it is on `PATH`
  inside `devenv shell` and `devenv up`.
- Container: `apps/api/Dockerfile` installs Debian's `stockfish` package and
  sets `STOCKFISH_PATH=/usr/games/stockfish`, because `/usr/games` is not on
  the image's default `PATH`.

## Clients

- Web: the opponent switch on the computer page includes Stockfish. When it
  is selected, a level select appears below it. Both choices are stored in
  local storage (`chess_computer_opponent`, `chess_computer_level`).
- Mobile: the home screen opponent picker includes Stockfish with a 1 to 8
  level row. The level is passed to the game screen as the `level` route
  parameter.

## Verification

```bash
cd apps/api && CGO_ENABLED=1 go test ./internal/engine/
```

The Stockfish tests cover a legal move at levels 1 and 8, invalid FEN, a
position with no legal moves, a missing binary, and level clamping. Tests
that need the binary skip when it is not installed, so run them inside
`devenv shell` to exercise the real engine.
