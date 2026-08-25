# Custom Alpha-Beta Engine

The `custom` opponent is a self-contained classical chess engine inside the Rust
engine service (`apps/engine/src/search.rs`, `apps/engine/src/eval.rs`). It
requires no model files, no GPU, and no network access.

## Architecture

- Evaluation: tapered PeSTO evaluation (midgame/endgame piece-square tables,
  material values, tempo bonus) from the side to move's perspective.
- Search: iterative deepening negamax with aspiration windows and principal
  variation search (PVS).
- Transposition table: 16 MB, Zobrist-hashed entries with always-replace
  storage and stored best moves; mate scores are stored ply-relative so they
  stay accurate across probes at different depths.
- Move ordering: transposition-table move first, then MVV-LVA captures,
  promotions, killer moves (two per ply), and a history heuristic table.
- Pruning: null-move pruning via side-to-move swap, reverse futility pruning,
  futility pruning of late quiet moves, late move reductions (LMR), mate
  distance pruning, and check extensions.
- Quiescence search: stand-pat with capture/promotion ordering by static
  exchange evaluation (SEE), delta pruning, and skipping outright losing
  captures.
- Draw awareness: insufficient material, the fifty-move rule, and two-fold
  repetition along the current search path.
- Time control: node-count-checked deadline. Root moves that completed and
  improved the score before an abort are still used, matching standard
  iterative-deepening practice.

Board representation uses `shakmaty` copy-make positions. The engine reaches
roughly depth 18 on middlegame positions in 10 seconds on commodity hardware
(about 3.5 million nodes per second in release mode).

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

Tests cover evaluation symmetry, SEE exchange values, mate-in-one and forced
mate-in-two finding, hanging-piece avoidance, deterministic search results,
and draw scoring. An ignored benchmark test (`bench_middlegame`) reports
depth, nodes, and nodes per second on the Kiwipete position; run it with
`cargo test bench_middlegame --release -- --nocapture --ignored`.

## Future Work

Phase 4 (optional) is an efficiently updatable NNUE evaluation trained on
self-play data, following the Berserk/Viridithas recipe. The search already
exposes the seam for it: `eval::evaluate` is the only function the search
calls for static evaluation.
