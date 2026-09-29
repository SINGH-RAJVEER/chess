# Classical Chess Engine

The `custom` opponent is a self-contained classical chess engine
(`apps/engine/src/search.rs`, `apps/engine/src/eval.rs`). It requires no
model files, no GPU, and no network access. The same crate also provides the
`minimax` opponent and is linked directly into the Go API as a static
library (C symbol `engine_best_move` in `src/lib.rs`); there is no engine
HTTP server.

The design follows the published architecture of strong hobby engines
(Berserk 12, Ethereal, Viridithas): a selective alpha-beta search over a
tapered handcrafted evaluation.

## Evaluation

- Tapered PeSTO base: midgame/endgame material values and piece-square tables,
  blended by game phase (non-pawn material of both sides, 24 = pure
  middlegame, 0 = bare endgame).
- Passed pawns scored by relative rank (midgame and endgame tables).
- Doubled and isolated pawn penalties. These pawn-structure terms are cached
  in an 8K-entry pawn hash table keyed by a pawn-only Zobrist hash, so
  non-pawn moves reuse the previous score instead of recomputing it.
- Bishop pair bonus.
- Rook bonuses for open and semi-open files.
- Mobility: attack counts for knights, bishops, rooks, and queens into squares
  not occupied by friendly pieces or attacked by enemy pawns.
- Simple king safety: pawn shield count on the king's file and adjacent files.
- Flat tempo bonus (20 cp) added after tapering from the side to move's
  perspective.
- Per-file bitboards and passed-pawn masks are precomputed once (OnceLock
  tables); evaluation runs in roughly 170 nanoseconds per position with a
  warm pawn cache.

## Search

- Iterative deepening with aspiration windows (delta starts at 9 cp and grows
  by a quarter of itself on each re-search).
- Principal variation search with zero-window probes and full-window
  re-searches; internal iterative reductions when no table move exists.
- Transposition table: 64 MB, Zobrist-hashed entries, age-aware replacement,
  stored best moves, and ply-relative mate scores so they stay accurate across
  probes at different depths.
- Move ordering: transposition-table move first, then MVV-LVA captures,
  promotions, killer moves (two per ply), counter-moves, then quiet moves
  scored by main history plus one-ply and two-ply continuation history. All
  history tables use the standard gravity update (`bonus - value * bonus /
  16384`) with bonus/malus applied on beta cutoffs.
- Pruning: null-move pruning via side-to-move swap (adaptive R), reverse
  futility pruning scaled by depth and the improving flag, razoring at shallow
  depth, futility pruning of late quiet moves, late move pruning (move-count
  tables by depth and improving flag), SEE-based pruning of losing captures,
  late move reductions adjusted by node type, improving flag, and history,
  mate distance pruning, and check extensions.
- Quiescence search: stand-pat except while in check (where all evasions are
  generated and mate is detected), capture/promotion ordering by static
  exchange evaluation (SEE), delta pruning, and skipping outright losing
  captures.
- Draw awareness: insufficient material, the fifty-move rule, and two-fold
  repetition along the current search path.
- Time control: node-count-checked deadline. Root moves that completed and
  improved the score before an abort are still used, matching standard
  iterative-deepening practice.

Board representation uses `shakmaty` copy-make positions with stack-allocated
move lists (no heap allocation per search node). On commodity hardware the
engine reaches roughly 2.5 to 4 million nodes per second in release mode;
because the search prunes selectively, reached depth is not comparable to an
unpruned search — strength must be judged by play quality, not raw depth.

## API Integration

The Go API calls `engine_best_move(fen, opponent, ...)` in-process through
`apps/api/internal/engine` (CGO). The opponent selector is `0` for minimax
(depth five, time budgets ignored) or `1` for custom; the Go bridge maps
legacy `dqn` requests to custom. A `0` movetime or depth selects the
`ENGINE_CUSTOM_MOVETIME_MS` / `ENGINE_CUSTOM_MAX_DEPTH` defaults. The call
writes the best move as UCI text into the caller buffer and optionally
returns `engine=custom depth .. score .. .. nodes` diagnostics. A fresh
`Searcher` is constructed per call, so concurrent games never share mutable
search state; a Go-side semaphore bounds parallel searches.

## Configuration

Optional environment variables loaded from the root `.env`:

- `ENGINE_CUSTOM_MOVETIME_MS`: time budget per move in milliseconds.
  Default `1000`.
- `ENGINE_CUSTOM_MAX_DEPTH`: maximum search depth. Default `64`.

## Verification

```bash
just engine-test
```

Tests cover evaluation symmetry and each positional term (passed pawns,
connected versus isolated pawns), game-phase counting, SEE exchange values
including en passant, mate-in-one and forced mate-in-two finding with playback,
hanging-piece avoidance, deterministic search results, draw scoring, and a
tactical regression suite of uniquely-forced positions (Scholar's mate,
WAC.005). Fixed-depth searches keep those tests deterministic regardless of
machine load.

Two ignored benchmarks track speed (`just engine-bench` runs both):

```bash
cargo test bench_middlegame --release -- --nocapture --ignored
cargo test bench_eval --release -- --nocapture --ignored
```

The API side (FEN encoding, move lookup, board formatting, and the
minimax FFI call) is benchmarked with `just api-bench`, which runs the Go
benchmarks in `apps/api/internal/game` without needing a database.

## Strength Measurement (SPRT)

Tactical suites cannot prove Elo gains. Self-play SPRT against the previous
revision is the required check before claiming a strength improvement.

The engine speaks UCI in two forms. `chess --uci` (see `src/uci.rs`) is the
full frontend for match runners such as fastchess or cutechess: worker-thread
search with `stop`/`ponderhit`, streaming `info`, node limits, and time
management. `src/bin/uci.rs` is a minimal driver kept deliberately small so
it also compiles against old revisions, where the newer search APIs do not
exist yet; the `just sprt-baseline` recipe overlays it onto a baseline
checkout to build a cross-revision opponent without patching old code.

`src/bin/sprt.rs` is a concurrent SPRT referee. It plays opening pairs from
`book/openings.book` (24 balanced lines, each with colors swapped) at fixed
movetime, adjudicates mates, stalemates, threefold repetition, the
fifty-move rule, insufficient material, resigns, and overruns, then runs a
trinomial Wald SPRT on game scores and prints `PASSED`, `FAILED`, or
`INCONCLUSIVE` with an Elo estimate.

Compare two ready-made binaries (positional arguments after `--`):

```bash
just sprt -- --engine-a ./apps/engine/target/release/uci \
    --engine-b /tmp/chess-baseline/uci \
    --book apps/engine/book/openings.book \
    --movetime 100 --elo0 0 --elo1 10 --max-games 5000 --concurrency 8
```

Compare the working copy against a baseline revision in one command
(arguments are positional):

```bash
just sprt-baseline bcfa3bba9059 100 0 10 0.05 0.05 5000 8
```

`just sprt-baseline` exits 0 only when the match log contains `sprt:
PASSED`. Long matches print progress every 10 games; the full transcript
goes to `sprt-<baseline>.log` in the repo root.

## Future Work

- Texel tuning of the evaluation weights against self-play game results.
- Singular extensions, probcut, and capture history.
- Phase 4 (optional): efficiently updatable NNUE evaluation trained on
  self-play data. The seam is already isolated: `eval::evaluate` is the only
  function the search calls for static evaluation.
