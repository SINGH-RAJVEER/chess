//! Minimal UCI driver for the custom alpha-beta engine.
//!
//! This shim exists for strength testing: two builds of the engine (for
//! example the working copy versus a baseline revision) can play each other
//! under the SPRT referee in `sprt.rs`, or under any UCI match runner.
//!
//! The binary speaks UCI on stdin/stdout and is invoked with no arguments.
//! The search/eval sources are included directly via `#[path]` so this file
//! compiles unchanged against older revisions of the crate, which lets the
//! `just sprt` recipe overlay it onto a baseline checkout without patching
//! any existing file.
//!
//! Supported commands: `uci`, `isready`, `setoption`, `ucinewgame`,
//! `position` (`startpos` or `fen`, both with optional `moves`), `go` (with
//! `movetime`, `depth`, `wtime`/`btime`/`winc`/`binc` plus optional
//! `movestogo`, or bare/`infinite`), `stop`, and `quit`. Searches run
//! synchronously in the command thread; there is no pondering.

#[path = "../eval.rs"]
#[allow(
    dead_code,
    reason = "shared with the server binary, which uses the rest"
)]
mod eval;
#[path = "../search.rs"]
#[allow(
    dead_code,
    reason = "shared with the server binary, which uses the rest"
)]
mod search;

use std::io::{self, BufRead, Write};
use std::time::{Duration, Instant};

use shakmaty::fen::Fen;
use shakmaty::uci::UciMove;
use shakmaty::{CastlingMode, Chess, Position};

use search::Searcher;

/// Hard depth ceiling, matching the search stack size.
const MAX_DEPTH: i32 = 64;
/// Fallback budget for unbounded `go` / `go infinite`.
const INFINITE_MOVETIME: Duration = Duration::from_secs(24 * 3600);
/// Assumed moves remaining when the GUI sends no `movestogo`.
const DEFAULT_MOVES_LEFT: u64 = 30;

/// Clock share per move: `remaining / moves_left + increment / 2`, clamped to
/// the remaining clock minus the move overhead.
fn allocate_movetime(
    own_ms: u64,
    inc_ms: u64,
    movestogo: Option<u64>,
    overhead_ms: u64,
) -> Duration {
    let moves_left = movestogo.unwrap_or(DEFAULT_MOVES_LEFT).clamp(1, 50);
    let mut alloc = own_ms / moves_left + inc_ms / 2;
    let max = own_ms.saturating_sub(overhead_ms + 1).max(1);
    alloc = alloc.clamp(1, max);
    Duration::from_millis(alloc)
}

fn apply_uci_moves(pos: &mut Chess, moves: &[&str]) {
    for token in moves {
        match UciMove::from_ascii(token.as_bytes()) {
            Ok(uci) => match uci.to_move(pos) {
                Ok(mv) => match pos.clone().play(mv) {
                    Ok(next) => *pos = next,
                    Err(_) => {
                        eprintln!("info string illegal move {token}");
                        break;
                    }
                },
                Err(_) => {
                    eprintln!("info string illegal move {token}");
                    break;
                }
            },
            Err(_) => {
                eprintln!("info string unparseable move {token}");
                break;
            }
        }
    }
}

/// Parses the tokens after `position`, updating `pos` in place.
fn parse_position(pos: &mut Chess, tokens: &[&str]) {
    let mut i = 0;
    if tokens.first() == Some(&"startpos") {
        *pos = Chess::new();
        i += 1;
    } else if tokens.first() == Some(&"fen") {
        i += 1;
        let mut fen = String::new();
        while i < tokens.len() && tokens[i] != "moves" {
            if !fen.is_empty() {
                fen.push(' ');
            }
            fen.push_str(tokens[i]);
            i += 1;
        }
        match fen.parse::<Fen>() {
            Ok(setup) => match setup.into_position(CastlingMode::Standard) {
                Ok(p) => *pos = p,
                Err(e) => eprintln!("info string invalid position: {e}"),
            },
            Err(e) => eprintln!("info string invalid fen: {e}"),
        }
    }
    if tokens.get(i) == Some(&"moves") {
        apply_uci_moves(pos, &tokens[i + 1..]);
    }
}

/// Parses the tokens after `go`, returning `(movetime, max_depth)`.
fn parse_go(tokens: &[&str], stm_is_white: bool, overhead_ms: u64) -> (Duration, i32) {
    let mut movetime: Option<u64> = None;
    let mut depth: Option<i32> = None;
    let mut wtime: Option<u64> = None;
    let mut btime: Option<u64> = None;
    let mut winc: u64 = 0;
    let mut binc: u64 = 0;
    let mut movestogo: Option<u64> = None;

    let mut i = 0;
    while i < tokens.len() {
        let rest = &tokens[i..];
        match rest {
            ["movetime", ms, ..] => {
                movetime = ms.parse().ok();
                i += 2;
            }
            ["depth", d, ..] => {
                depth = d.parse().ok();
                i += 2;
            }
            ["wtime", ms, ..] => {
                wtime = ms.parse().ok();
                i += 2;
            }
            ["btime", ms, ..] => {
                btime = ms.parse().ok();
                i += 2;
            }
            ["winc", ms, ..] => {
                winc = ms.parse().unwrap_or(0);
                i += 2;
            }
            ["binc", ms, ..] => {
                binc = ms.parse().unwrap_or(0);
                i += 2;
            }
            ["movestogo", n, ..] => {
                movestogo = n.parse().ok();
                i += 2;
            }
            _ => {
                // Covers `infinite`, `ponder`, `nodes`, `mate`, and anything
                // else we do not implement; fall through to the defaults.
                i += 1;
            }
        }
    }

    let max_depth = depth.unwrap_or(MAX_DEPTH).clamp(1, MAX_DEPTH);
    let budget = match movetime {
        Some(ms) => Duration::from_millis(ms.max(1)),
        None => match (wtime, btime) {
            (Some(w), Some(b)) => {
                let (own, inc) = if stm_is_white { (w, winc) } else { (b, binc) };
                allocate_movetime(own, inc, movestogo, overhead_ms)
            }
            _ => INFINITE_MOVETIME,
        },
    };
    (budget, max_depth)
}

fn main() {
    let stdin = io::stdin();
    let mut out = io::BufWriter::new(io::stdout());
    let mut pos = Chess::new();
    let mut searcher = Searcher::new();
    let mut overhead_ms: u64 = 20;

    for line in stdin.lock().lines() {
        let line = line.unwrap_or_default();
        let tokens: Vec<&str> = line.split_whitespace().collect();
        let (cmd, args) = match tokens.split_first() {
            Some((head, tail)) => (*head, tail),
            None => continue,
        };
        match cmd {
            "uci" => {
                writeln!(out, "id name SixtyFourCustom").unwrap();
                writeln!(out, "id author SixtyFour contributors").unwrap();
                writeln!(out, "option name Hash type spin default 64 min 1 max 1024").unwrap();
                writeln!(out, "option name Threads type spin default 1 min 1 max 1").unwrap();
                writeln!(
                    out,
                    "option name MoveOverhead type spin default 20 min 0 max 5000"
                )
                .unwrap();
                writeln!(out, "uciok").unwrap();
            }
            "isready" => {
                writeln!(out, "readyok").unwrap();
            }
            "setoption" => {
                // `setoption name <name> value <value>`
                let name_idx = args.iter().position(|t| *t == "name").map(|p| p + 1);
                let value_idx = args.iter().position(|t| *t == "value");
                let name = name_idx.map(|n| {
                    let end = value_idx.unwrap_or(args.len());
                    args[n..end.min(args.len())].join(" ")
                });
                let value = value_idx.map(|v| args[v + 1..].join(" "));
                match (name.as_deref(), value) {
                    (Some("MoveOverhead"), Some(v)) => match v.trim().parse() {
                        Ok(ms) => overhead_ms = ms,
                        Err(_) => eprintln!("info string bad MoveOverhead value {v}"),
                    },
                    (Some("Hash") | Some("Threads"), _) => {
                        eprintln!("info string fixed single-threaded 64MB build; ignoring option")
                    }
                    (Some(other), _) => eprintln!("info string unknown option {other}"),
                    (None, _) => eprintln!("info string malformed setoption"),
                }
            }
            "ucinewgame" => {
                // Fresh tables every game. A new searcher is used instead of
                // a clear method so this file also builds against older
                // revisions, where table clearing was test-only.
                searcher = Searcher::new();
            }
            "position" => parse_position(&mut pos, args),
            "go" => {
                let stm_is_white = pos.turn() == shakmaty::Color::White;
                let (budget, max_depth) = parse_go(args, stm_is_white, overhead_ms);
                let started = Instant::now();
                let result = searcher.search(&pos, budget, max_depth);
                let elapsed_ms = started.elapsed().as_millis();
                writeln!(
                    out,
                    "info depth {} score cp {} nodes {} time {}",
                    result.depth, result.score, result.nodes, elapsed_ms
                )
                .unwrap();
                match result.best_move {
                    Some(mv) => writeln!(out, "bestmove {}", UciMove::from_standard(mv)).unwrap(),
                    None => writeln!(out, "bestmove 0000").unwrap(),
                }
            }
            "stop" => {
                // Searches are synchronous, so there is never a search in
                // flight when a command is processed.
            }
            "quit" => break,
            _ => {}
        }
        out.flush().unwrap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn movetime_split_degrades_gracefully() {
        // Zero clock still yields a positive, minimal budget.
        assert_eq!(allocate_movetime(0, 0, None, 20), Duration::from_millis(1));
        // Overhead larger than the clock leaves 1ms, never zero.
        assert_eq!(
            allocate_movetime(50, 0, None, 1000),
            Duration::from_millis(1)
        );
        // Sudden death without increment: clock split over the horizon.
        assert_eq!(
            allocate_movetime(3000, 0, None, 0),
            Duration::from_millis(3000 / 30)
        );
        // Explicit movestogo shortens the split.
        assert_eq!(
            allocate_movetime(3000, 0, Some(5), 0),
            Duration::from_millis(600)
        );
    }

    #[test]
    fn go_parsing_prefers_explicit_movetime() {
        let (budget, depth) = parse_go(&["movetime", "250", "depth", "9"], true, 20);
        assert_eq!(budget, Duration::from_millis(250));
        assert_eq!(depth, 9);
    }

    #[test]
    fn go_parsing_uses_side_to_move_clock() {
        let (white_budget, _) = parse_go(
            &["wtime", "60000", "btime", "1000", "winc", "0", "binc", "0"],
            true,
            20,
        );
        let (black_budget, _) = parse_go(
            &["wtime", "60000", "btime", "1000", "winc", "0", "binc", "0"],
            false,
            20,
        );
        assert!(white_budget > black_budget);
        assert_eq!(black_budget, Duration::from_millis(1000 / 30));
    }
}
