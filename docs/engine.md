# Custom Alpha-Beta Engine

The `custom` opponent is a self-contained classical chess engine inside the Rust
engine service (`apps/engine/src/search.rs`, `apps/engine/src/eval.rs`). It
requires no model files, no GPU, and no network access.

The design follows the published architecture of strong hobby engines
(Berserk 12, Ethereal, Viridithas): a selective alpha-beta search over a
tapered handcrafted evaluation.

## Evaluation

- Tapered PeSTO base: midgame/endgame material values and piece-square tables,
  blended by game phase (non-pawn material of both sides, 24 = pure
  middlegame, 0 = bare endgame).
- Passed pawns scored by relative rank (midgame and endgame tables).
- Doubled and isolated pawn penalties.
- Bishop pair bonus.
- Rook bonuses for open and semi-open files.
- Mobility: attack counts for knights, bishops, rooks, and queens into squares
  not occupied by friendly pieces or attacked by enemy pawns.
- Simple king safety: pawn shield count on the king's file and adjacent files.
- Flat tempo bonus (20 cp) added after tapering from the side to move's
  perspective.
- Per-file bitboards and passed-pawn masks are precomputed once (OnceLock
  tables); evaluation runs in roughly 250 nanoseconds per position.

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

`POST /api/engine-move` accepts `"opponent": "custom"` alongside `minimax`
and `dqn`. The response's `engine` field is `custom`, and its
`execution_provider` field carries a diagnostic string with reached depth,
search score in centipawns, and node count instead of an ONNX provider name.

## Configuration

Optional environment variables loaded from the root `.env`:

- `ENGINE_CUSTOM_MOVETIME_MS`: time budget per move in milliseconds.
  Default `1000`.
- `ENGINE_CUSTOM_MAX_DEPTH`: maximum search depth. Default `64`.

## Verification

```bash
bunx nx run engine:test
```

Tests cover evaluation symmetry and each positional term (passed pawns,
connected versus isolated pawns), game-phase counting, SEE exchange values
including en passant, mate-in-one and forced mate-in-two finding with playback,
hanging-piece avoidance, deterministic search results, draw scoring, and a
tactical regression suite of uniquely-forced positions (Scholar's mate,
WAC.005). Fixed-depth searches keep those tests deterministic regardless of
machine load.

Two ignored benchmarks track speed:

```bash
cargo test bench_middlegame --release -- --nocapture --ignored
cargo test bench_eval --release -- --nocapture --ignored
```

For rigorous strength measurement, self-play SPRT testing with fastchess or
OpenBench and a varied opening book is the recommended next step; tactical
suites alone cannot prove Elo gains.

## Future Work

- Texel tuning of the evaluation weights against self-play game results.
- Singular extensions, probcut, and capture history.
- A pawn-hash table caching pawn-structure terms.
- Phase 4 (optional): efficiently updatable NNUE evaluation trained on
  self-play data. The seam is already isolated: `eval::evaluate` is the only
  function the search calls for static evaluation.
