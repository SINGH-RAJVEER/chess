# Local computer games

Computer play has a 500 ms search budget. Iterative deepening chooses the reached depth from the position and available CPU. Stockfish levels change skill while keeping the same time budget. The UI shows the human move immediately, then validates and displays the engine result. The budget bounds engine work; startup, messaging, and painting can add time to the visible reply.

## Execution and state

`libs/types/src/computer-game.ts` owns chess.js rules, legal destinations, SAN history, revisions, cancellation, saves, and engine orchestration. Browser engines run in persistent workers; the Rust engines compile to WebAssembly and Stockfish uses its pinned lite single-thread build. Electron uses persistent native Rust and Stockfish processes through preload IPC. Mobile bundles the same worker code in a hidden WebView, with engine work off the React Native UI thread.

Opponent selection prewarms its worker. Native engines and Stockfish workers run a short initialization search so their evaluation data loads before a human move. The API also warms its bounded process pool during startup. Reset, takeback, leaving the game, or changing opponents cancels pending work. An engine reply can apply only to the revision that started it, and its move must pass rule validation. Worker crashes surface as errors; takeback or a new game permits recovery.

Browser and desktop saves use `sixtyfour_local_computer_game` in localStorage. Mobile uses `computer-game.json` in the app's document directory. Reloading replays SAN, retaining castling, en passant, repetition, and promotion rules. A save with Black to move resumes its search. Invalid saves report an error and permit a fresh game.

Signed-in users upload saves after a one-second debounce through authenticated archive endpoints. Failures retry after 15 seconds while the screen is active. Durable local saves remain available offline and unfinished histories resume on restart. Remote recovery runs only for an empty unchanged game; it cannot overwrite moves played while downloading. Local games and backups are unrated.

## Builds and diagnostics

`bun run engines:local` builds Rust for `wasm32-unknown-unknown`, runs the Cargo-lock-matched wasm-bindgen CLI, copies Stockfish JS/WASM and GPL license/source information, and embeds mobile assets. Web build/dev and mobile dev/typecheck commands run it automatically. Unchanged sources and existing assets skip rebuilding. Generated assets are ignored by version control. Run in devenv; the first build installs the WASM target and CLI. `WASM_TOOLCHAIN` and `WASM_BINDGEN` select existing compatible tools.

`bun run engines:desktop` copies native engines for the current platform into the desktop resources. Development can use `ENGINE_PATH` and `STOCKFISH_PATH`; packaging accepts `DESKTOP_ENGINE_PATH` for a prebuilt Rust engine and `STOCKFISH_PATH` for native Stockfish. Automatic native Stockfish resolution skips npm's Stockfish.js launcher. Distributed installers require compatible portable binaries; Nix-linked executables depend on their store paths. Browser and mobile builds ship Stockfish.js source and license references with the assets.

In the browser or Electron console, `window.sixtyfourLatency.summary()` reports bounded local/server samples with p50, p95, engine median, and median overhead. End-to-end timing uses one client clock and ends after React commits the board and its animation-frame callback runs. This callback approximates presentation time; it does not measure display hardware latency. Server logs expose worker acquisition, database commit, move processing, and engine duration.

`bun run test:browser` checks offline play and restoration, reset cancellation, and the embedded mobile engine page. Set `ELECTRON_EXECUTABLE` to include the native IPC test. `bun run benchmark:latency` exercises an isolated API through WebSockets with configurable sample count, opponent, and concurrency. Localhost results do not include internet RTT or physical phone performance.

On 2026-10-06, a local API benchmark with 10 opening-move samples per opponent and concurrency 2 measured the following submission-to-reply times after startup warming. This benchmark ends at WebSocket receipt; browser diagnostics also include the render callback.

| Opponent | Median | p95 | Median time beyond engine search |
| --- | --- | --- | --- |
| Default | 508.8 ms | 511.8 ms | 6.5 ms |
| Custom | 510.4 ms | 512.6 ms | 7.1 ms |
| Stockfish | 510.1 ms | 511.4 ms | 5.8 ms |

Offline browser tests confirmed both Default and Stockfish complete moves and resume saved games with the API unavailable. The native Electron IPC test and bundled mobile engine-page test also passed. Browser timing samples were limited to two replies per opponent, so they are functional checks rather than a device performance baseline. Android Metro export and the web container build passed; physical Android/iOS performance and portable installers remain unverified.
