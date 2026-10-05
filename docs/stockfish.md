# Stockfish Opponent

The vs computer page offers Stockfish alongside the built-in minimax and custom alpha-beta engines. Unlike those, Stockfish is not linked into the API: `apps/api/internal/engine/stockfish.go` drives an external Stockfish binary over UCI.

## Difficulty levels

Levels 1 through 8 map to Stockfish skills 0, 2, 5, 8, 11, 14, 17, and 20. Level 4 is the default. Every level uses `go movetime 500` with no depth cap, `Threads 1`, and `Hash 16`. Depth adjusts to the position and available CPU time; lower levels use Stockfish's skill selection rather than shorter searches.

## Request flow

Browser and mobile computer games use the bundled Stockfish.js 18 lite single-thread WebAssembly build. Electron uses a persistent native Stockfish process through a narrow preload bridge. Workers prewarm when Stockfish is selected. Computer play does not require an API connection.

The API still supports `game.move` with `opponent: stockfish` and `level`. It reserves a persistent worker before committing the human move and rejects saturation or a missing binary before changing the board. Its bounded pool resets search state between games, retains it within a game, and discards canceled or failed processes. Reached depth and search time are logged.

Stockfish.js is pinned as a root development dependency; `bun run engines:local` copies its JS, WASM, license, and source information into the web build and embeds it into the mobile engine page. Desktop packaging copies the native binary and license into `resources/engines`. Build installers on the target platform with compatible native engine binaries. Nix-linked binaries require their Nix store paths; use portable binaries when distributing installers outside Nix.

## Installing the Binary

The API resolves the binary from `STOCKFISH_PATH`, falling back to `stockfish` on `PATH`.

- Local development: `devenv.nix` installs `stockfish`, so it is on `PATH` inside `devenv shell` and `devenv up`.
- Container: `apps/api/Dockerfile` installs Debian's `stockfish` package and sets `STOCKFISH_PATH=/usr/games/stockfish`, because `/usr/games` is not on the image's default `PATH`.

## Clients

- Web: the opponent switch on the computer page includes Stockfish. When it is selected, a level select appears below it. Both choices are stored in local storage (`sixtyfour_computer_opponent`, `sixtyfour_computer_level`).
- Mobile: the home screen opponent picker includes Stockfish with a 1 to 8 level row. The level is passed to the game screen as the `level` route parameter.

## Verification

```bash
just engine-bin && cd apps/api && go test ./internal/engine/
```

The Stockfish tests cover a legal move at levels 1 and 8, invalid FEN, a position with no legal moves, a missing binary, and level clamping. Tests that need the binary skip when it is not installed, so run them inside `devenv shell` to exercise the real engine.
