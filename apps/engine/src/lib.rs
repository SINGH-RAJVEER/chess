//! SixtyFour chess engine crate.
//!
//! The `sixtyfour-engine` binary (`src/main.rs`) speaks UCI on stdin/stdout and
//! is spawned by the Go API once per computer move, the same way the API
//! runs Stockfish. The crate offers two opponents, selected with the UCI
//! `Opponent` option: depth-five [`minimax`] and the iterative-deepening
//! alpha-beta engine in [`search`]. There is no neural/DQN path; legacy
//! `"dqn"` requests are mapped to the custom engine by the Go caller.

pub mod eval;
pub mod minimax;
pub mod search;
#[cfg(not(target_arch = "wasm32"))]
pub mod uci;
#[cfg(target_arch = "wasm32")]
pub mod wasm;
