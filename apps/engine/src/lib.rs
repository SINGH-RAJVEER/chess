//! In-process chess engine library.
//!
//! The Go API links this crate as a `cdylib` and calls [`engine_best_move`]
//! over the C ABI instead of talking to a standalone HTTP server. The crate
//! supports two opponents: depth-five minimax and the iterative-deepening
//! alpha-beta engine in [`search`]. There is no neural/DQN path; legacy
//! `"dqn"` requests are mapped to the custom engine by the Go caller.
//!
//! A fresh [`search::Searcher`] is constructed per custom-engine call so
//! concurrent callers never share mutable search state.

pub mod eval;
pub mod search;
pub mod uci;

use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::time::Duration;

use shakmaty::fen::Fen;
use shakmaty::uci::UciMove;
use shakmaty::{CastlingMode, Chess, Color, Move, Position, Role};

/// Opponent selector for [`engine_best_move`]: classic depth-five minimax.
pub const OPPONENT_MINIMAX: c_int = 0;
/// Opponent selector for [`engine_best_move`]: custom alpha-beta search.
pub const OPPONENT_CUSTOM: c_int = 1;

/// Success return code for [`engine_best_move`].
pub const ENGINE_OK: c_int = 0;
/// Null pointer, empty FEN, or zero-length output buffer.
pub const ENGINE_BAD_ARGS: c_int = -1;
/// FEN that fails to parse or describes an illegal position.
pub const ENGINE_BAD_FEN: c_int = -2;
/// Legal position with no legal moves.
pub const ENGINE_NO_MOVES: c_int = -3;
/// Unknown opponent selector.
pub const ENGINE_BAD_OPPONENT: c_int = -4;
/// The call panicked; no output was written.
pub const ENGINE_PANIC: c_int = -99;

/// Time budget per custom-engine move, in milliseconds.
fn custom_movetime_ms() -> u64 {
    std::env::var("ENGINE_CUSTOM_MOVETIME_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(1000)
        .max(1)
}

/// Depth ceiling per custom-engine move.
fn custom_max_depth() -> i32 {
    std::env::var("ENGINE_CUSTOM_MAX_DEPTH")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(64)
        .clamp(1, 64)
}

fn evaluate(pos: &Chess) -> i32 {
    let mut score = 0;
    let board = pos.board();

    for (_square, piece) in board.clone() {
        let piece_val = match piece.role {
            Role::Pawn => 100,
            Role::Knight => 320,
            Role::Bishop => 330,
            Role::Rook => 500,
            Role::Queen => 900,
            Role::King => 20000,
        };

        if piece.color == Color::White {
            score += piece_val;
        } else {
            score -= piece_val;
        }
    }
    score
}

fn minimax(pos: &Chess, depth: i32, mut alpha: i32, mut beta: i32, maximizing: bool) -> i32 {
    if depth == 0 || pos.is_game_over() {
        return evaluate(pos);
    }

    let legals = pos.legal_moves();

    if maximizing {
        let mut max_eval = i32::MIN;
        for m in legals {
            let mut new_pos = pos.clone();
            new_pos.play_unchecked(m);
            let eval = minimax(&new_pos, depth - 1, alpha, beta, false);
            max_eval = max_eval.max(eval);
            alpha = alpha.max(eval);
            if beta <= alpha {
                break;
            }
        }
        max_eval
    } else {
        let mut min_eval = i32::MAX;
        for m in legals {
            let mut new_pos = pos.clone();
            new_pos.play_unchecked(m);
            let eval = minimax(&new_pos, depth - 1, alpha, beta, true);
            min_eval = min_eval.min(eval);
            beta = beta.min(eval);
            if beta <= alpha {
                break;
            }
        }
        min_eval
    }
}

fn find_best_move(pos: &Chess, depth: i32) -> Option<Move> {
    let legals = pos.legal_moves();
    if legals.is_empty() {
        return None;
    }

    let mut best_move = None;
    let maximizing = pos.turn() == Color::White;

    if maximizing {
        let mut max_eval = i32::MIN;
        for m in legals {
            let mut new_pos = pos.clone();
            new_pos.play_unchecked(m);
            let eval = minimax(&new_pos, depth - 1, i32::MIN, i32::MAX, false);
            if eval > max_eval {
                max_eval = eval;
                best_move = Some(m);
            }
        }
    } else {
        let mut min_eval = i32::MAX;
        for m in legals {
            let mut new_pos = pos.clone();
            new_pos.play_unchecked(m);
            let eval = minimax(&new_pos, depth - 1, i32::MIN, i32::MAX, true);
            if eval < min_eval {
                min_eval = eval;
                best_move = Some(m);
            }
        }
    }

    best_move
}

fn parse_position(fen: &str) -> Result<Chess, c_int> {
    let setup: Fen = fen.parse().map_err(|_| ENGINE_BAD_FEN)?;
    setup
        .into_position(CastlingMode::Standard)
        .map_err(|_| ENGINE_BAD_FEN)
}

/// Copies `value` into `buf` as a null-terminated C string.
/// Returns false when the value does not fit.
fn write_cstr(buf: *mut c_char, len: usize, value: &str) -> bool {
    if buf.is_null() || len == 0 {
        return false;
    }
    let bytes = value.as_bytes();
    if bytes.len() + 1 > len {
        return false;
    }
    // SAFETY: caller guarantees a writable buffer of `len` bytes.
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr() as *const c_char, buf, bytes.len());
        *buf.add(bytes.len()) = 0;
    }
    true
}

/// Raw call parameters for [`engine_best_move_inner`]. Only ever handled on
/// the calling thread for the duration of one FFI call.
#[derive(Clone, Copy)]
struct BestMoveArgs {
    fen_ptr: *const c_char,
    opponent: c_int,
    movetime_ms: u64,
    max_depth: c_int,
    out_buf: *mut c_char,
    out_len: usize,
    info_buf: *mut c_char,
    info_len: usize,
}

// SAFETY: values are only dereferenced on the calling thread during the call.
unsafe impl Send for BestMoveArgs {}

fn engine_best_move_inner(args: BestMoveArgs) -> c_int {
    let BestMoveArgs {
        fen_ptr,
        opponent,
        movetime_ms,
        max_depth,
        out_buf,
        out_len,
        info_buf,
        info_len,
    } = args;
    if fen_ptr.is_null() || out_buf.is_null() || out_len == 0 {
        return ENGINE_BAD_ARGS;
    }
    // SAFETY: caller guarantees a valid null-terminated FEN string.
    let fen = match unsafe { CStr::from_ptr(fen_ptr) }.to_str() {
        Ok(fen) if !fen.is_empty() => fen,
        _ => return ENGINE_BAD_ARGS,
    };
    let position = match parse_position(fen) {
        Ok(position) => position,
        Err(code) => return code,
    };

    let (best_move, engine, info) = match opponent {
        OPPONENT_MINIMAX => (find_best_move(&position, 5), "minimax", String::new()),
        OPPONENT_CUSTOM => {
            let budget_ms = if movetime_ms == 0 {
                custom_movetime_ms()
            } else {
                movetime_ms.max(1)
            };
            let depth = if max_depth <= 0 {
                custom_max_depth()
            } else {
                max_depth.clamp(1, 64)
            };
            let mut searcher = search::Searcher::new();
            let result = searcher.search(&position, Duration::from_millis(budget_ms), depth);
            (
                result.best_move,
                "custom",
                format!(
                    "depth {} score {} {} nodes",
                    result.depth, result.score, result.nodes
                ),
            )
        }
        _ => return ENGINE_BAD_OPPONENT,
    };

    match best_move {
        Some(mv) => {
            let uci = UciMove::from_standard(mv).to_string();
            if !write_cstr(out_buf, out_len, &uci) {
                return ENGINE_BAD_ARGS;
            }
            if !info_buf.is_null() && info_len > 0 && !info.is_empty() {
                let detail = format!("engine={engine} {info}");
                // Info is diagnostic only; a too-small buffer must not fail the move.
                write_cstr(info_buf, info_len, &detail);
            }
            let _ = CString::new(engine);
            ENGINE_OK
        }
        None => ENGINE_NO_MOVES,
    }
}

/// Selects the best move for `fen` and writes it as null-terminated UCI text
/// into `out_buf` (e.g. `e7e5`, `e1g1`, `e7e8q`).
///
/// * `opponent` is [`OPPONENT_MINIMAX`] or [`OPPONENT_CUSTOM`].
/// * `movetime_ms`/`max_depth` bound custom-engine searches; pass `0` for
///   the `ENGINE_CUSTOM_MOVETIME_MS` / `ENGINE_CUSTOM_MAX_DEPTH` defaults.
///   They are ignored for minimax.
/// * `info_buf` is optional diagnostic text (`engine=custom depth ..`);
///   pass null when it is not needed.
///
/// Returns [`ENGINE_OK`] on success, otherwise one of the negative
/// `ENGINE_*` codes. Never panics across the boundary.
#[no_mangle]
#[allow(
    clippy::too_many_arguments,
    reason = "C ABI exposes one call with all parameters"
)]
pub extern "C" fn engine_best_move(
    fen_ptr: *const c_char,
    opponent: c_int,
    movetime_ms: u64,
    max_depth: c_int,
    out_buf: *mut c_char,
    out_len: usize,
    info_buf: *mut c_char,
    info_len: usize,
) -> c_int {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        engine_best_move_inner(BestMoveArgs {
            fen_ptr,
            opponent,
            movetime_ms,
            max_depth,
            out_buf,
            out_len,
            info_buf,
            info_len,
        })
    })) {
        Ok(code) => code,
        Err(_) => ENGINE_PANIC,
    }
}

#[cfg(test)]
mod ffi_tests {
    use super::*;
    use std::ffi::CString;

    const STARTPOS: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    fn call(fen: &str, opponent: c_int) -> (c_int, String) {
        let c_fen = CString::new(fen).unwrap();
        let mut out = vec![0 as c_char; 16];
        let mut info = vec![0 as c_char; 128];
        let code = engine_best_move(
            c_fen.as_ptr(),
            opponent,
            50,
            4,
            out.as_mut_ptr(),
            out.len(),
            info.as_mut_ptr(),
            info.len(),
        );
        let text = unsafe { CStr::from_ptr(out.as_ptr()) }
            .to_string_lossy()
            .into_owned();
        (code, text)
    }

    #[test]
    fn minimax_answers_startpos() {
        let (code, uci) = call(STARTPOS, OPPONENT_MINIMAX);
        assert_eq!(code, ENGINE_OK);
        assert!(uci.len() >= 4, "expected UCI move, got {uci:?}");
    }

    #[test]
    fn custom_answers_startpos_with_limited_budget() {
        let (code, uci) = call(STARTPOS, OPPONENT_CUSTOM);
        assert_eq!(code, ENGINE_OK);
        assert!(uci.len() >= 4, "expected UCI move, got {uci:?}");
    }

    #[test]
    fn rejects_bad_fen_and_opponent() {
        let (code, _) = call("not a fen", OPPONENT_MINIMAX);
        assert_eq!(code, ENGINE_BAD_FEN);
        let (code, _) = call(STARTPOS, 42);
        assert_eq!(code, ENGINE_BAD_OPPONENT);
    }

    #[test]
    fn reports_no_moves_for_stalemate() {
        // Black to move, stalemate: 7k/5Q2/6K1/8/8/8/8/8 b - - 0 1.
        let (code, _) = call("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", OPPONENT_MINIMAX);
        assert_eq!(code, ENGINE_NO_MOVES);
    }
}
