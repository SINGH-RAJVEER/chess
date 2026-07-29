# DQN Computer Opponent

The vs computer page supports two opponents:

- Minimax runs the existing depth-five material search.
- DQN runs the ONNX neural policy/value model with policy-guided tree search.

The toggle is stored in browser local storage and is sent with every player move. If the DQN model cannot be loaded or inference fails, the engine logs the error and safely uses minimax for that move.

The Rust engine exposes `POST /api/engine-move` through Axum on port `8080`. The endpoint accepts the current FEN and opponent selection, then returns the selected move in UCI notation.

## Model Files

- `apps/dqn/model.onnx` is the model loaded by the Rust engine.
- `apps/dqn/training` contains the PyTorch model, position and move encoding, self-play, and training code.
- The Rust inference encoding in `apps/engine/src/neural.rs` must remain aligned with `apps/dqn/training/encode.py`.

The current network uses 14 input planes, a 4,672-entry move policy, and a scalar position value. Although the UI calls the opponent DQN, the supplied training implementation is an AlphaZero-style policy/value network rather than a textbook single-output deep Q-network.

## GPU Selection

The engine attempts to create an ONNX Runtime CUDA session first. Successful CUDA initialization means neural inference runs on NVIDIA GPU device 0. If CUDA initialization fails, the engine creates a CPU session instead.

`devenv.nix` includes the CUDA toolkit and cuDNN on Linux and adds their libraries, plus the NixOS NVIDIA driver library path, to `LD_LIBRARY_PATH`. The host must also have a working NVIDIA driver. Verify it before starting the stack:

```bash
nvidia-smi
devenv up
```

The `just dev` recipe enables the unfree CUDA packages through an impure devenv evaluation. On multi-user Nix installations, the account running `devenv` must be listed in `nix.settings.trusted-users` because devenv supplies restricted Nix evaluation settings. Do not run the stack with `sudo`: PostgreSQL refuses to run as root.

The engine startup log reports the active provider:

```text
[engine] DQN model loaded from ... with CUDA provider
```

If the driver, CUDA libraries, or GPU are unavailable, it instead reports the CUDA error and `CPU provider`. This fallback allows development on non-NVIDIA systems.

## Configuration

The engine reads these optional environment variables:

- `CHESS_MODEL_PATH`: absolute or working-directory-relative ONNX model path. The default is `apps/dqn/model.onnx` in the workspace.
- `DQN_SIMULATIONS`: maximum policy-guided search simulations per move. The default is `200`.
- `DQN_MOVE_TIME_MS`: maximum neural search time per move in milliseconds. The default is `1500`.

Add overrides to the root `.env`, which is loaded by `devenv` and the workspace processes.

## Verification

Run the engine tests and start the engine from the repository root:

```bash
bunx nx run engine:test
bunx nx run engine:dev
```

To inspect provider selection directly, send a DQN request to the running engine:

```bash
curl -X POST http://127.0.0.1:8080/api/engine-move \
    -H 'Content-Type: application/json' \
    -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","opponent":"dqn"}'
```

The response contains `engine: "dqn"` and `execution_provider: "CUDA"` when GPU inference is active.
