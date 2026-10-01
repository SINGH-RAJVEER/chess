# DQN Computer Opponent (Retired)

The DQN opponent was removed when the standalone Rust engine server was
replaced by the in-process engine library. The vs computer page now offers
three opponents:

- Minimax runs the depth-five material search.
- Custom runs the built-in iterative-deepening alpha-beta engine (see docs/engine.md).
- Stockfish runs the external Stockfish binary at levels 1 to 8 (see docs/stockfish.md).

Stored `dqn` selections in browser local storage migrate to `custom`, and
the API maps any remaining `dqn` requests to the custom engine, so old
clients keep playing without errors.

## Retained Research Artifacts

- `apps/dqn/training` contains the PyTorch model, position and move encoding,
  self-play, and training code. It is no longer part of any build or runtime
  path.
- `apps/dqn/model.onnx` is the last exported network. Nothing loads it.
- `apps/dqn/Dockerfile` still builds the training container for research use.

## Why It Was Removed

Serving DQN required a long-lived ONNX Runtime session with CUDA fallback,
which fit a stateful sidecar process but not the in-process library model:
every search would have reloaded the model and reinitialized the GPU
session. The custom alpha-beta engine (see docs/engine.md) is stateless per
call and within a few hundred Elo for casual play, so it became the default
strong opponent while operations collapsed to a single API binary.
