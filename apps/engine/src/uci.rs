//! UCI protocol frontend, served by the `sixtyfour-engine` binary to the Go API
//! and to engine testing tools (fastchess, cutechess, OpenBench).
//!
//! The search runs on a worker thread so `stop`, `isready`, `ponderhit` and
//! `quit` stay responsive while thinking. Info lines stream back over a
//! channel; the completed [`Searcher`] is handed back with the result so the
//! transposition table and histories persist across moves.
//!
//! Both opponents use iterative deepening on the search thread. A `position`
//! command that fails to parse makes the next `go` answer
//! `info string error invalid position` and `bestmove 0000` instead of
//! searching a stale position.

use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use shakmaty::fen::Fen;
use shakmaty::uci::UciMove;
use shakmaty::{CastlingMode, Chess, Move, Position};

use crate::minimax;
use crate::search::{self, IterationInfo, Searcher};

const ENGINE_NAME: &str = "SixtyFour";
const ENGINE_AUTHOR: &str = "Rajveer Singh";
const MAX_DEPTH: i32 = 64;
const INFINITE_MOVETIME: Duration = Duration::from_secs(86400);
const DEFAULT_MOVE_OVERHEAD_MS: u64 = 10;
const DEFAULT_HASH_MB: usize = 64;

fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[derive(Clone, Debug, Default)]
struct GoLimits {
    ponder: bool,
    infinite: bool,
    movetime_ms: Option<u64>,
    depth: Option<i32>,
    nodes: Option<u64>,
    wtime_ms: Option<u64>,
    btime_ms: Option<u64>,
    winc_ms: Option<u64>,
    binc_ms: Option<u64>,
    movestogo: Option<u64>,
}

struct ResolvedLimits {
    movetime: Duration,
    max_depth: i32,
    node_limit: Option<u64>,
}

/// Engine behind `go`, selected with `setoption name Opponent`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum Opponent {
    #[default]
    Custom,
    Minimax,
}

impl Opponent {
    fn parse(value: &str) -> Option<Self> {
        match value.to_ascii_lowercase().as_str() {
            "custom" => Some(Self::Custom),
            "minimax" => Some(Self::Minimax),
            _ => None,
        }
    }
}

struct EngineOptions {
    move_overhead_ms: u64,
    opponent: Opponent,
}

impl Default for EngineOptions {
    fn default() -> Self {
        Self {
            move_overhead_ms: DEFAULT_MOVE_OVERHEAD_MS,
            opponent: Opponent::default(),
        }
    }
}

enum SearchOutput {
    Info(String),
    Done(Box<SearchOutcome>),
}

struct SearchOutcome {
    searcher: Option<Searcher>,
    best: Option<Move>,
    ponder: Option<Move>,
    #[allow(dead_code)]
    score: i32,
    #[allow(dead_code)]
    depth: i32,
}

struct ActiveSearch {
    handle: Option<JoinHandle<()>>,
    out_rx: Receiver<SearchOutput>,
    stop: Arc<AtomicBool>,
    limits: GoLimits,
    pondering: bool,
    ponderhit: bool,
    held_result: Option<SearchOutcome>,
    pending_readyok: bool,
}

fn uci_move_to_string(m: Move) -> String {
    UciMove::from_standard(m).to_string()
}

fn format_score(score: i32) -> String {
    if search::is_mate_score(score) {
        let plies = search::mate_in_plies(score);
        let moves = (plies.abs() + 1) / 2;
        format!("mate {}", moves * plies.signum())
    } else {
        format!("cp {score}")
    }
}

fn format_info(info: &IterationInfo) -> String {
    let ms = info.elapsed.as_millis().max(1);
    let nps = info.nodes.saturating_mul(1000) / ms as u64;
    let pv: Vec<String> = info.pv.iter().map(|m| uci_move_to_string(*m)).collect();
    format!(
        "info depth {} score {} nodes {} time {} nps {} pv {}",
        info.depth,
        format_score(info.score),
        info.nodes,
        ms,
        nps,
        pv.join(" ")
    )
}

/// Clock-based time budget for the side to move, in milliseconds.
fn clock_budget(limits: &GoLimits, stm_is_white: bool, overhead_ms: u64) -> Option<u64> {
    let (left, inc) = if stm_is_white {
        (limits.wtime_ms?, limits.winc_ms.unwrap_or(0))
    } else {
        (limits.btime_ms?, limits.binc_ms.unwrap_or(0))
    };
    // Moves to go, defaulting to a full-game estimate when sudden death.
    let mtg = limits.movestogo.unwrap_or(30).clamp(1, 60);
    let mut ms = left / mtg + inc / 2;
    // Never risk flagging: keep overhead plus a small margin on the clock.
    let reserve = overhead_ms + 25;
    ms = ms.min(left.saturating_sub(reserve));
    Some(ms.max(1))
}

fn resolve_limits(limits: &GoLimits, pos: &Chess, options: &EngineOptions) -> ResolvedLimits {
    let max_depth = limits.depth.unwrap_or(MAX_DEPTH).clamp(1, MAX_DEPTH);
    if limits.infinite {
        return ResolvedLimits {
            movetime: INFINITE_MOVETIME,
            max_depth,
            node_limit: limits.nodes,
        };
    }
    if let Some(ms) = limits.movetime_ms {
        return ResolvedLimits {
            movetime: Duration::from_millis(ms.max(1)),
            max_depth,
            node_limit: limits.nodes,
        };
    }
    if let Some(ms) = clock_budget(limits, pos.turn().is_white(), options.move_overhead_ms) {
        return ResolvedLimits {
            movetime: Duration::from_millis(ms),
            max_depth,
            node_limit: limits.nodes,
        };
    }
    // `go depth`, `go nodes`, or bare `go`: think briefly with no clock.
    ResolvedLimits {
        movetime: if limits.depth.is_some() || limits.nodes.is_some() {
            INFINITE_MOVETIME
        } else {
            Duration::from_millis(100)
        },
        max_depth,
        node_limit: limits.nodes,
    }
}

fn parse_position(args: &str) -> Option<Chess> {
    let mut tokens = args.split_whitespace();
    let mut pos = match tokens.next()? {
        "startpos" => Chess::default(),
        "fen" => {
            let fields: Vec<&str> = tokens.by_ref().take(6).collect();
            if fields.len() < 6 {
                return None;
            }
            fields
                .join(" ")
                .parse::<Fen>()
                .ok()?
                .into_position(CastlingMode::Standard)
                .ok()?
        }
        _ => return None,
    };
    // Optional trailing `moves ...` applies to both startpos and fen.
    let rest: Vec<&str> = tokens.collect();
    let moves = match rest.iter().position(|t| *t == "moves") {
        Some(i) => &rest[i + 1..],
        None => &[],
    };
    for token in moves {
        let uci = UciMove::from_ascii(token.as_bytes()).ok()?;
        let m = uci.to_move(&pos).ok()?;
        pos.play_unchecked(m);
    }
    Some(pos)
}

fn parse_go(args: &str) -> GoLimits {
    let mut limits = GoLimits::default();
    let mut tokens = args.split_whitespace().peekable();
    while let Some(token) = tokens.next() {
        let mut value = || tokens.next().and_then(|v| v.parse::<u64>().ok());
        match token {
            "ponder" => limits.ponder = true,
            "infinite" => limits.infinite = true,
            "movetime" => limits.movetime_ms = value(),
            "depth" => limits.depth = value().map(|v| v.clamp(1, MAX_DEPTH as u64) as i32),
            "nodes" => limits.nodes = value(),
            "wtime" => limits.wtime_ms = value(),
            "btime" => limits.btime_ms = value(),
            "winc" => limits.winc_ms = value(),
            "binc" => limits.binc_ms = value(),
            "movestogo" => limits.movestogo = value(),
            // Root move restriction is accepted and ignored.
            "searchmoves" => {
                while tokens
                    .next_if(|t| {
                        UciMove::from_ascii(t.as_bytes()).is_ok()
                            || (*t != "ponder"
                                && *t != "infinite"
                                && *t != "movetime"
                                && *t != "depth"
                                && *t != "nodes"
                                && *t != "wtime"
                                && *t != "btime"
                                && *t != "winc"
                                && *t != "binc"
                                && *t != "movestogo"
                                && *t != "searchmoves")
                    })
                    .is_some()
                {}
            }
            _ => {}
        }
    }
    limits
}

fn spawn_search(
    mut searcher: Searcher,
    pos: Chess,
    resolved: ResolvedLimits,
    out_tx: Sender<SearchOutput>,
	wake: Sender<String>,
	opponent: Opponent,
) -> (JoinHandle<()>, Arc<AtomicBool>) {
    searcher.set_node_limit(resolved.node_limit);
    // A fresh flag per search closes the race where `stop` arrives between
    // the `go` command and the worker thread starting.
    let stop = Arc::new(AtomicBool::new(false));
    searcher.set_stop_flag(Arc::clone(&stop));
    let stop_for_thread = Arc::clone(&stop);
    let handle = thread::spawn(move || {
        let mut report = |info: &IterationInfo| {
                let _ = out_tx.send(SearchOutput::Info(format_info(info)));
				let _ = wake.send(String::new());
		};
		let result = if opponent == Opponent::Minimax {
			minimax::search(&pos, resolved.movetime, resolved.max_depth, &stop_for_thread, resolved.node_limit, &mut report)
		} else {
			searcher.search_with_reporter(&pos, resolved.movetime, resolved.max_depth, report)
		};
        // Ponder move: second move of the final principal variation.
        let pv = searcher.collect_pv(&pos);
        let ponder = pv.get(1).copied().filter(|m| {
            let mut after = pos.clone();
            if let Some(best) = result.best_move {
                after.play_unchecked(best);
                after.legal_moves().contains(m)
            } else {
                false
            }
        });
        let _ = out_tx.send(SearchOutput::Done(Box::new(SearchOutcome {
            searcher: Some(searcher),
            best: result.best_move,
            ponder,
            score: result.score,
            depth: result.depth,
        })));
		let _ = wake.send(String::new());
        drop(stop_for_thread);
    });
    (handle, stop)
}

fn print_bestmove(outcome: &SearchOutcome) {
    match outcome.best {
        Some(best) => match outcome.ponder {
            Some(ponder) => println!(
                "bestmove {} ponder {}",
                uci_move_to_string(best),
                uci_move_to_string(ponder)
            ),
            None => println!("bestmove {}", uci_move_to_string(best)),
        },
        None => println!("bestmove 0000"),
    }
}

fn send_command_help() {
    eprintln!("[uci] commands: uci, isready, setoption, ucinewgame, position, go, stop, quit");
}

pub fn run() -> std::io::Result<()> {
    // Forwards stdin lines to the main loop so info output keeps streaming.
    // (`Stdin` is shared behind a mutex; the lock itself must stay local.)
    let (cmd_tx, cmd_rx) = mpsc::channel::<String>();
    let input_tx = cmd_tx.clone();
    thread::spawn(move || {
        let stdin = std::io::stdin();
        let mut input = stdin.lock();
        let mut line = String::new();
        loop {
            line.clear();
            match input.read_line(&mut line) {
                Ok(0) => break, // EOF
                Ok(_) => {
                    if input_tx.send(line.clone()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
		let _ = input_tx.send("quit".into());
    });

    let mut out = std::io::BufWriter::new(std::io::stdout());
    // `None` while a search owns the searcher on its worker thread. It starts
    // with a 1 MB table and grows to `hash_mb` on the first alpha-beta `go`,
    // so a process that only runs minimax (one API move) stays small.
    let mut searcher: Option<Searcher> = Some(Searcher::with_hash_mb(1));
    let mut hash_mb = DEFAULT_HASH_MB;
    let mut hash_sized = false;
    let mut pos = Chess::default();
    // False after a `position` command that failed to parse, until the next
    // valid one; `go` must not search the stale position meanwhile.
    let mut position_ok = true;
    let mut options = EngineOptions::default();
    let mut active: Option<ActiveSearch> = None;

    // Returns the searcher to idle state, printing bestmove unless held.
    macro_rules! finish_search {
        ($outcome:expr, $hold:expr) => {{
            let mut outcome: SearchOutcome = $outcome;
            searcher = outcome.searcher.take();
            if $hold {
                if let Some(search) = active.as_mut() {
                    search.held_result = Some(outcome);
                    search.handle = None;
                }
            } else {
                print_bestmove(&outcome);
                let _ = out.flush();
                if let Some(search) = active.as_mut() {
                    search.held_result = None;
                    search.handle = None;
                    if search.pending_readyok {
                        search.pending_readyok = false;
                        println!("readyok");
                        let _ = out.flush();
                    }
                }
            }
        }};
    }

    loop {
        // Drain search output without blocking GUI input for long.
        if let Some(search) = active.as_mut() {
            loop {
                match search.out_rx.try_recv() {
                    Ok(SearchOutput::Info(line)) => {
                        println!("{line}");
                        let _ = out.flush();
                    }
                    Ok(SearchOutput::Done(outcome)) => {
                        let outcome = *outcome;
                        if let Some(handle) = search.handle.take() {
                            let _ = handle.join();
                        }
                        if search.pondering && !search.ponderhit {
                            // Hold the result until ponderhit or stop.
                            let mut outcome = outcome;
                            searcher = outcome.searcher.take();
                            search.held_result = Some(outcome);
                        } else {
                            finish_search!(outcome, false);
                            active = None;
                        }
                        break;
                    }
                    Err(mpsc::TryRecvError::Empty) => break,
                    Err(mpsc::TryRecvError::Disconnected) => {
                        if let Some(handle) = search.handle.take() {
                            let _ = handle.join();
                        }
                        if search.held_result.is_none() {
                            active = None;
                        }
                        break;
                    }
                }
            }
        }

        let line = match cmd_rx.recv() {
            Ok(line) => line,
            Err(_) => break,
        };

        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let (command, args) = match line.split_once(char::is_whitespace) {
            Some((c, a)) => (c, a.trim()),
            None => (line, ""),
        };

        match command {
            "uci" => {
                println!("id name {} {}", ENGINE_NAME, version());
                println!("id author {}", ENGINE_AUTHOR);
                println!("option name Hash type spin default 64 min 1 max 1024");
                println!("option name Clear Hash type button");
                println!(
                    "option name Move Overhead type spin default {} min 0 max 1000",
                    DEFAULT_MOVE_OVERHEAD_MS
                );
                println!("option name Ponder type check default true");
                println!("option name Opponent type combo default custom var custom var minimax");
                println!("uciok");
                let _ = out.flush();
            }
            "isready" => {
                if active.as_ref().is_some_and(|s| s.handle.is_some()) {
                    if let Some(search) = active.as_mut() {
                        search.pending_readyok = true;
                    }
                } else {
                    println!("readyok");
                    let _ = out.flush();
                }
            }
            "setoption" => {
                // `setoption name <name> [value <value>]`
                let rest = args.strip_prefix("name").unwrap_or(args).trim();
                let (name, value) = match rest.split_once("value") {
                    Some((n, v)) => (n.trim(), v.trim()),
                    None => (rest, ""),
                };
                match name.to_ascii_lowercase().as_str() {
                    "hash" => {
                        if let (Some(searcher), Ok(mb)) =
                            (searcher.as_mut(), value.parse::<usize>())
                        {
                            searcher.set_hash_mb(mb);
                            hash_mb = mb;
                            hash_sized = true;
                        }
                    }
                    "clear hash" => {
                        if let Some(searcher) = searcher.as_mut() {
                            searcher.clear();
                        }
                    }
                    "move overhead" | "moveoverhead" => {
                        if let Ok(ms) = value.parse::<u64>() {
                            options.move_overhead_ms = ms.min(1000);
                        }
                    }
                    "ponder" => {}
                    "opponent" => match Opponent::parse(value) {
                        Some(opponent) => options.opponent = opponent,
                        None => eprintln!("[uci] unknown opponent: {value}"),
                    },
                    _ => eprintln!("[uci] unknown option: {name}"),
                }
            }
            "ucinewgame" => {
                if active.is_none() {
                    if let Some(searcher) = searcher.as_mut() {
                        searcher.clear();
                    }
                }
            }
            "position" => {
                if active.is_none() {
                    match parse_position(args) {
                        Some(next) => {
                            pos = next;
                            position_ok = true;
                        }
                        None => {
                            position_ok = false;
                            eprintln!("[uci] invalid position: {args}");
                        }
                    }
                }
            }
            "go" => {
                if active.is_some() {
                    continue;
                }
                if !position_ok {
                    println!("info string error invalid position");
                    println!("bestmove 0000");
                    let _ = out.flush();
                    continue;
                }
                if pos.legal_moves().is_empty() {
                    println!("bestmove 0000");
                    let _ = out.flush();
                    continue;
                }
                let limits = parse_go(args);
                let pondering = limits.ponder;
                let resolved = resolve_limits(&limits, &pos, &options);
                let (out_tx, out_rx) = mpsc::channel::<SearchOutput>();
                let Some(mut owned) = searcher.take() else {
                    continue;
                };
                if !hash_sized && options.opponent == Opponent::Custom {
                    owned.set_hash_mb(hash_mb);
                    hash_sized = true;
                }
                let (handle, stop) = spawn_search(owned, pos.clone(), resolved, out_tx, cmd_tx.clone(), options.opponent);
                active = Some(ActiveSearch {
                    handle: Some(handle),
                    out_rx,
                    stop,
                    limits,
                    pondering,
                    ponderhit: false,
                    held_result: None,
                    pending_readyok: false,
                });
            }
            "stop" => {
                if let Some(search) = active.as_mut() {
                    search.stop.store(true, Ordering::Relaxed);
                    // If the ponder result is already held, emit it now.
                    if let Some(mut outcome) = search.held_result.take() {
                        print_bestmove(&outcome);
                        let _ = out.flush();
                        searcher = outcome.searcher.take();
                        if search.pending_readyok {
                            search.pending_readyok = false;
                            println!("readyok");
                            let _ = out.flush();
                        }
                        active = None;
                    }
                }
            }
            "ponderhit" => {
                if let Some(search) = active.as_mut() {
                    if search.pondering && !search.ponderhit {
                        search.ponderhit = true;
                        if let Some(mut outcome) = search.held_result.take() {
                            // Ponder search already finished: convert to a
                            // normal search so the clocked limits apply.
                            let limits = GoLimits {
                                ponder: false,
                                ..search.limits.clone()
                            };
                            let resolved = resolve_limits(&limits, &pos, &options);
                            let (out_tx, out_rx) = mpsc::channel::<SearchOutput>();
                            let Some(owned) = outcome.searcher.take() else {
                                continue;
                            };
                            let (handle, stop) = spawn_search(owned, pos.clone(), resolved, out_tx, cmd_tx.clone(), options.opponent);
                            search.handle = Some(handle);
                            search.out_rx = out_rx;
                            search.stop = stop;
                            search.limits = limits;
                            search.pondering = false;
                        }
                        // Otherwise the running search keeps its (infinite)
                        // budget until `stop`; acceptable for ponder-on games.
                    }
                }
            }
            "quit" => {
                if let Some(search) = active.as_mut() {
                    search.stop.store(true, Ordering::Relaxed);
                    if let Some(handle) = search.handle.take() {
                        let _ = handle.join();
                    }
                }
                break;
            }
            "help" => send_command_help(),
            _ => eprintln!("[uci] unknown command: {command}"),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use shakmaty::Color;

    fn startpos() -> Chess {
        Chess::default()
    }

    #[test]
    fn parses_startpos_with_moves() {
        let pos = parse_position("startpos moves e2e4 e7e5 g1f3").expect("valid");
        assert_eq!(pos.turn(), Color::Black);
        assert_eq!(pos.fullmoves().get(), 2);
    }

    #[test]
    fn parses_fen_with_moves() {
        let pos = parse_position(
            "fen rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2 moves g1f3",
        )
        .expect("valid");
        assert_eq!(pos.turn(), Color::Black);
    }

    #[test]
    fn rejects_invalid_position() {
        assert!(parse_position("fen not-a-fen").is_none());
        assert!(parse_position("startpos moves e2e9").is_none());
        assert!(parse_position("bogus").is_none());
    }

    #[test]
    fn parses_opponent_option() {
        assert_eq!(Opponent::parse("Minimax"), Some(Opponent::Minimax));
        assert_eq!(Opponent::parse("custom"), Some(Opponent::Custom));
        assert_eq!(Opponent::parse("stockfish"), None);
    }

    #[test]
    fn parses_go_time_control() {
        let limits = parse_go("wtime 60000 btime 60000 winc 1000 binc 1000");
        assert_eq!(limits.wtime_ms, Some(60000));
        assert_eq!(limits.binc_ms, Some(1000));
        assert!(!limits.ponder);
    }

    #[test]
    fn parses_go_movetime_depth_nodes() {
        let limits = parse_go("movetime 500");
        assert_eq!(limits.movetime_ms, Some(500));
        let limits = parse_go("depth 12 nodes 100000 ponder");
        assert_eq!(limits.depth, Some(12));
        assert_eq!(limits.nodes, Some(100000));
        assert!(limits.ponder);
    }

    #[test]
    fn clock_budget_splits_time_and_keeps_reserve() {
        let limits = GoLimits {
            wtime_ms: Some(60000),
            btime_ms: Some(60000),
            winc_ms: Some(0),
            binc_ms: Some(0),
            ..GoLimits::default()
        };
        let ms = clock_budget(&limits, true, 10).expect("budget");
        assert!((1..=60000 - 10 - 25).contains(&ms), "budget {ms}");
        // Nearly-flagged clock still yields a usable minimum.
        let limits = GoLimits {
            wtime_ms: Some(20),
            btime_ms: Some(20),
            ..GoLimits::default()
        };
        assert_eq!(clock_budget(&limits, true, 10), Some(1));
    }

    #[test]
    fn formats_mate_scores_as_moves_to_mate() {
        assert_eq!(format_score(search::MATE_SCORE), "mate 0");
        assert_eq!(format_score(search::MATE_SCORE - 1), "mate 1");
        assert_eq!(format_score(search::MATE_SCORE - 3), "mate 2");
        assert_eq!(format_score(-(search::MATE_SCORE - 1)), "mate -1");
        assert_eq!(format_score(137), "cp 137");
    }

    #[test]
    fn formats_info_lines() {
        let info = IterationInfo {
            depth: 9,
            score: 42,
            nodes: 123456,
            elapsed: Duration::from_millis(250),
            pv: vec![],
        };
        let line = format_info(&info);
        assert!(line.starts_with("info depth 9 score cp 42 nodes 123456 time 250 nps "));
        assert!(line.ends_with(" pv "), "line: {line}");
    }

    #[test]
    fn search_reports_iterations_and_pv() {
        let mut searcher = Searcher::new();
        let pos = startpos();
        let mut iters = 0;
        let result = searcher.search_with_reporter(&pos, Duration::from_millis(100), 4, |info| {
            iters += 1;
            assert!(!info.pv.is_empty());
            assert_eq!(info.depth as usize, iters);
        });
        assert!(result.best_move.is_some());
        assert!(iters >= 1, "at least depth 1 must complete");
        let pv = searcher.collect_pv(&pos);
        assert!(!pv.is_empty());
        assert_eq!(pv[0], result.best_move.unwrap());
    }

    #[test]
    fn external_stop_aborts_search() {
        let mut searcher = Searcher::new();
        let stop = Arc::new(AtomicBool::new(false));
        searcher.set_stop_flag(Arc::clone(&stop));
        let pos = startpos();
        let handle = std::thread::spawn(move || searcher.search(&pos, Duration::from_secs(60), 64));
        std::thread::sleep(Duration::from_millis(200));
        stop.store(true, Ordering::Relaxed);
        let result = handle.join().expect("search thread");
        // Aborted well before the 60s budget: still a legal move.
        assert!(result.best_move.is_some());
        assert!(result.nodes < 10_000_000, "nodes: {}", result.nodes);
        let reply = result.best_move.unwrap();
        assert!(startpos().legal_moves().contains(&reply));
    }

    #[test]
    fn node_limit_aborts_search() {
        let mut searcher = Searcher::new();
        searcher.set_node_limit(Some(100));
        let pos = startpos();
        let result = searcher.search(&pos, Duration::from_secs(60), 64);
        assert!(result.best_move.is_some());
        assert!(result.nodes < 100_000, "nodes: {}", result.nodes);
    }
}
