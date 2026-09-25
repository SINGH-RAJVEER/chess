//! SPRT referee for engine-vs-engine strength testing.
//!
//! Plays pairs of games (each opening with colors swapped) between two UCI
//! engine binaries and runs a sequential probability ratio test on the
//! results. Clocks, adjudication, and repetition/50-move detection all live
//! here; the engines only see `position` + `go movetime`.
//!
//! ```sh
//! cargo run --release --bin sprt -- \
//!     --engine-a ./target/release/uci \
//!     --engine-b /tmp/opencode/chess-baseline/apps/engine/target/release/uci \
//!     --book book/openings.book --movetime 100 --elo0 0 --elo1 10 \
//!     --concurrency 8 --max-games 2000
//! ```
//!
//! Statistics: trinomial Wald SPRT on game scores (win = 1, draw = 0.5,
//! loss = 0, from engine A's perspective). Under hypothesis "true score is
//! s", the mean game score is approximately normal with pooled variance `v`,
//! so each game contributes `(s1 - s0) * (x - (s1 + s0) / 2) / v` to the
//! log-likelihood ratio, where `s0`/`s1` are the expected scores at elo0/elo1
//! through the logistic curve. Bounds are `ln((1-beta)/alpha)` and
//! `ln(beta/(1-alpha))`. The variance estimate is floored so a lucky streak
//! in the first games cannot stop the test early.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use shakmaty::fen::Fen;
use shakmaty::uci::UciMove;
#[cfg(test)]
use shakmaty::CastlingMode;
use shakmaty::{Chess, Color, EnPassantMode, Move, Position};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

#[derive(Debug)]
struct Config {
    engine_a: String,
    engine_b: String,
    book: String,
    movetime_ms: u64,
    elo0: f64,
    elo1: f64,
    alpha: f64,
    beta: f64,
    max_games: usize,
    concurrency: usize,
    max_halfmoves: usize,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            engine_a: String::new(),
            engine_b: String::new(),
            book: "book/openings.book".to_string(),
            movetime_ms: 100,
            elo0: 0.0,
            elo1: 10.0,
            alpha: 0.05,
            beta: 0.05,
            max_games: 2000,
            concurrency: 4,
            max_halfmoves: 400,
        }
    }
}

fn parse_args() -> Result<Config, String> {
    let mut cfg = Config::default();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        let (key, value) = match args[i].as_str() {
            "--engine-a" | "--engine-b" | "--book" | "--movetime" | "--elo0" | "--elo1"
            | "--alpha" | "--beta" | "--max-games" | "--concurrency" | "--max-halfmoves" => {
                let v = args
                    .get(i + 1)
                    .ok_or(format!("{} needs a value", args[i]))?;
                (args[i].as_str(), v.clone())
            }
            other => return Err(format!("unknown argument: {other}")),
        };
        match key {
            "--engine-a" => cfg.engine_a = value,
            "--engine-b" => cfg.engine_b = value,
            "--book" => cfg.book = value,
            "--movetime" => cfg.movetime_ms = value.parse().map_err(|_| "bad --movetime")?,
            "--elo0" => cfg.elo0 = value.parse().map_err(|_| "bad --elo0")?,
            "--elo1" => cfg.elo1 = value.parse().map_err(|_| "bad --elo1")?,
            "--alpha" => cfg.alpha = value.parse().map_err(|_| "bad --alpha")?,
            "--beta" => cfg.beta = value.parse().map_err(|_| "bad --beta")?,
            "--max-games" => cfg.max_games = value.parse().map_err(|_| "bad --max-games")?,
            "--concurrency" => {
                cfg.concurrency = value
                    .parse::<usize>()
                    .map_err(|_| "bad --concurrency")?
                    .max(1)
            }
            "--max-halfmoves" => {
                cfg.max_halfmoves = value.parse().map_err(|_| "bad --max-halfmoves")?
            }
            _ => unreachable!(),
        }
        i += 2;
    }
    if cfg.engine_a.is_empty() || cfg.engine_b.is_empty() {
        return Err("--engine-a and --engine-b are required".to_string());
    }
    Ok(cfg)
}

// ---------------------------------------------------------------------------
// Opening book
// ---------------------------------------------------------------------------

/// Lines of UCI moves from the start position; `#` starts a comment.
fn load_book(path: &str) -> Result<Vec<Vec<String>>, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("cannot read {path}: {e}"))?;
    let mut lines = Vec::new();
    for (n, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let moves: Vec<String> = line.split_whitespace().map(str::to_string).collect();
        if moves.is_empty() {
            continue;
        }
        // Validate every line at startup: any illegal move aborts the match.
        let mut pos = Chess::default();
        for m in &moves {
            let uci = UciMove::from_ascii(m.as_bytes())
                .map_err(|_| format!("{path}:{}: unparseable move {m}", n + 1))?;
            let legal = uci
                .to_move(&pos)
                .map_err(|_| format!("{path}:{}: illegal move {m}", n + 1))?;
            pos.play_unchecked(legal);
        }
        lines.push(moves);
    }
    if lines.is_empty() {
        return Err(format!("{path}: no openings found"));
    }
    Ok(lines)
}

// ---------------------------------------------------------------------------
// Engine driver
// ---------------------------------------------------------------------------

struct EngineReply {
    best: Option<Move>,
    /// Last reported score from the engine's perspective: centipawns, or a
    /// mate distance in moves (positive = engine mates).
    score_cp: Option<i32>,
    score_mate: Option<i32>,
}

struct Engine {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

fn spawn_engine(path: &str) -> Result<Engine, String> {
    let mut child = Command::new(path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("cannot spawn {path}: {e}"))?;
    let stdin = child.stdin.take().ok_or("no engine stdin")?;
    let stdout = child
        .stdout
        .take()
        .map(BufReader::new)
        .ok_or("no engine stdout")?;
    let mut engine = Engine {
        child,
        stdin,
        stdout,
    };
    engine.send("uci")?;
    engine.expect_prefix("uciok", Duration::from_secs(10))?;
    engine.send("isready")?;
    engine.expect_prefix("readyok", Duration::from_secs(10))?;
    Ok(engine)
}

impl Engine {
    fn send(&mut self, line: &str) -> Result<(), String> {
        writeln!(self.stdin, "{line}").map_err(|e| format!("engine write failed: {e}"))
    }

    fn expect_prefix(&mut self, prefix: &str, timeout: Duration) -> Result<(), String> {
        let deadline = Instant::now() + timeout;
        let mut line = String::new();
        loop {
            if Instant::now() > deadline {
                return Err(format!("timeout waiting for {prefix}"));
            }
            line.clear();
            match self.stdout.read_line(&mut line) {
                Ok(0) => return Err("engine closed stdout".to_string()),
                Ok(_) => {
                    if line.trim_start().starts_with(prefix) {
                        return Ok(());
                    }
                }
                Err(e) => return Err(format!("engine read failed: {e}")),
            }
        }
    }

    /// Sends `position` + `go movetime` and waits for `bestmove`. Returns the
    /// parsed move plus the last info score seen.
    fn go(&mut self, moves: &[String], movetime: Duration) -> Result<EngineReply, String> {
        if moves.is_empty() {
            self.send("position startpos")?;
        } else {
            self.send(&format!("position startpos moves {}", moves.join(" ")))?;
        }
        self.send(&format!("go movetime {}", movetime.as_millis()))?;

        let deadline = Instant::now() + movetime + Duration::from_secs(20);
        let mut reply = EngineReply {
            best: None,
            score_cp: None,
            score_mate: None,
        };
        // Rebuild the position locally so the reply move can be validated.
        let mut pos = Chess::default();
        for m in moves {
            let uci = UciMove::from_ascii(m.as_bytes())
                .map_err(|_| format!("unparseable played move {m}"))?;
            let legal = uci
                .to_move(&pos)
                .map_err(|_| format!("illegal played move {m}"))?;
            pos.play_unchecked(legal);
        }

        let mut line = String::new();
        loop {
            if Instant::now() > deadline {
                let _ = self.child.kill();
                return Err("engine move timeout".to_string());
            }
            line.clear();
            match self.stdout.read_line(&mut line) {
                Ok(0) => return Err("engine closed stdout mid-search".to_string()),
                Ok(_) => {}
                Err(e) => return Err(format!("engine read failed: {e}")),
            }
            let text = line.trim();
            if let Some(info) = text.strip_prefix("info ") {
                parse_info_score(info, &mut reply);
            } else if let Some(rest) = text.strip_prefix("bestmove") {
                let token = rest.split_whitespace().next().unwrap_or("");
                if token != "0000" {
                    let uci = UciMove::from_ascii(token.as_bytes())
                        .map_err(|_| format!("engine sent unparseable move {token}"))?;
                    reply.best = uci.to_move(&pos).ok();
                    if reply.best.is_none() {
                        return Err(format!("engine sent illegal move {token}"));
                    }
                }
                return Ok(reply);
            }
        }
    }
}

fn parse_info_score(info: &str, reply: &mut EngineReply) {
    let mut tokens = info.split_whitespace().peekable();
    while let Some(token) = tokens.next() {
        if token == "score" {
            match tokens.next() {
                Some("cp") => {
                    if let Some(v) = tokens.next().and_then(|v| v.parse().ok()) {
                        reply.score_cp = Some(v);
                        reply.score_mate = None;
                    }
                }
                Some("mate") => {
                    if let Some(v) = tokens.next().and_then(|v| v.parse().ok()) {
                        reply.score_mate = Some(v);
                        reply.score_cp = None;
                    }
                }
                _ => {}
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Game play and adjudication
// ---------------------------------------------------------------------------

/// Game result from engine A's perspective.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum GameResult {
    WinA,
    Draw,
    WinB,
}

impl GameResult {
    fn score_a(self) -> f64 {
        match self {
            GameResult::WinA => 1.0,
            GameResult::Draw => 0.5,
            GameResult::WinB => 0.0,
        }
    }
}

fn position_key(pos: &Chess) -> String {
    let fen = Fen::from_position(pos, EnPassantMode::Legal).to_string();
    // Board + side to move + castling + en passant; clocks excluded.
    fen.split_whitespace().take(4).collect::<Vec<_>>().join(" ")
}

struct GameState {
    pos: Chess,
    /// UCI history from the start position (book line + played moves).
    history: Vec<String>,
    seen: Vec<String>,
    halfmove_clock: u32,
    /// Last reported scores per side, oldest first (engine's own perspective).
    scores_white: VecDeque<i32>,
    scores_black: VecDeque<i32>,
}

impl GameState {
    fn new(book_line: &[String]) -> Result<Self, String> {
        let mut pos = Chess::default();
        for m in book_line {
            let uci =
                UciMove::from_ascii(m.as_bytes()).map_err(|_| format!("bad book move {m}"))?;
            let legal = uci
                .to_move(&pos)
                .map_err(|_| format!("bad book move {m}"))?;
            pos.play_unchecked(legal);
        }
        let mut state = Self {
            pos,
            history: book_line.to_vec(),
            seen: Vec::new(),
            halfmove_clock: 0,
            scores_white: VecDeque::new(),
            scores_black: VecDeque::new(),
        };
        state.seen.push(position_key(&state.pos));
        Ok(state)
    }

    fn push(&mut self, m: Move, uci: &str) {
        if m.is_zeroing() {
            self.halfmove_clock = 0;
        } else {
            self.halfmove_clock += 1;
        }
        self.pos.play_unchecked(m);
        self.history.push(uci.to_string());
        self.seen.push(position_key(&self.pos));
    }

    fn record_score(&mut self, stm: Color, reply: &EngineReply) {
        // Normalize to centipawns; large mate magnitudes keep their sign.
        let score = match (reply.score_cp, reply.score_mate) {
            (_, Some(m)) => m.signum() * 100_000,
            (Some(cp), _) => cp,
            (None, None) => return,
        };
        let queue = if stm == Color::White {
            &mut self.scores_white
        } else {
            &mut self.scores_black
        };
        queue.push_back(score);
        while queue.len() > 8 {
            queue.pop_front();
        }
    }

    fn resign_loser(&self) -> Option<Color> {
        for (color, queue) in [
            (Color::White, &self.scores_white),
            (Color::Black, &self.scores_black),
        ] {
            if queue.len() >= 3 && queue.iter().rev().take(3).all(|&s| s <= -900) {
                return Some(color);
            }
        }
        None
    }

    fn agreed_draw(&self) -> bool {
        if self.pos.fullmoves().get() < 30 {
            return false;
        }
        let quiet =
            |q: &VecDeque<i32>| q.len() >= 8 && q.iter().rev().take(8).all(|&s| s.abs() <= 25);
        quiet(&self.scores_white) && quiet(&self.scores_black)
    }

    fn repetitions(&self) -> usize {
        let key = position_key(&self.pos);
        self.seen.iter().filter(|&k| *k == key).count()
    }
}

/// Plays one game. `white_is_a` selects which engine has White.
fn play_game(
    white: &mut Engine,
    black: &mut Engine,
    white_is_a: bool,
    book_line: &[String],
    cfg: &Config,
) -> Result<GameResult, String> {
    let mut state = GameState::new(book_line)?;
    white.send("ucinewgame")?;
    black.send("ucinewgame")?;

    let movetime = Duration::from_millis(cfg.movetime_ms.max(1));

    loop {
        if state.history.len() as u64 >= cfg.max_halfmoves as u64 + book_line.len() as u64 {
            return Ok(GameResult::Draw);
        }
        let stm = state.pos.turn();
        let engine = if stm == Color::White {
            &mut *white
        } else {
            &mut *black
        };
        let reply = engine.go(&state.history, movetime)?;

        let Some(m) = reply.best else {
            // No legal moves: mate or stalemate.
            if state.pos.is_checkmate() {
                return Ok(if stm == Color::White {
                    if white_is_a {
                        GameResult::WinB
                    } else {
                        GameResult::WinA
                    }
                } else if white_is_a {
                    GameResult::WinA
                } else {
                    GameResult::WinB
                });
            }
            return Ok(GameResult::Draw);
        };

        state.record_score(stm, &reply);
        let uci = UciMove::from_standard(m).to_string();
        state.push(m, &uci);

        if state.pos.is_insufficient_material() {
            return Ok(GameResult::Draw);
        }
        if state.halfmove_clock >= 100 {
            return Ok(GameResult::Draw);
        }
        if state.repetitions() >= 3 {
            return Ok(GameResult::Draw);
        }
        if let Some(loser) = state.resign_loser() {
            let a_lost = (loser == Color::White) == white_is_a;
            return Ok(if a_lost {
                GameResult::WinB
            } else {
                GameResult::WinA
            });
        }
        if state.agreed_draw() {
            return Ok(GameResult::Draw);
        }
    }
}

// ---------------------------------------------------------------------------
// SPRT statistics
// ---------------------------------------------------------------------------

fn logistic_elo_to_score(elo: f64) -> f64 {
    1.0 / (1.0 + 10f64.powf(-elo / 400.0))
}

fn score_to_elo(score: f64) -> f64 {
    -400.0 * (1.0 / score - 1.0).log10()
}

struct Sprt {
    elo0: f64,
    elo1: f64,
    upper: f64,
    lower: f64,
    wins: u64,
    draws: u64,
    losses: u64,
    scores: Vec<f64>,
    llr: f64,
}

impl Sprt {
    fn new(elo0: f64, elo1: f64, alpha: f64, beta: f64) -> Self {
        Self {
            elo0,
            elo1,
            upper: ((1.0 - beta) / alpha).ln(),
            lower: (beta / (1.0 - alpha)).ln(),
            wins: 0,
            draws: 0,
            losses: 0,
            scores: Vec::new(),
            llr: 0.0,
        }
    }

    fn games(&self) -> u64 {
        self.wins + self.draws + self.losses
    }

    fn observe(&mut self, result: GameResult) {
        match result {
            GameResult::WinA => self.wins += 1,
            GameResult::Draw => self.draws += 1,
            GameResult::WinB => self.losses += 1,
        }
        // Start the test after a few games so the variance estimate exists.
        if self.games() < 10 {
            return;
        }
        let s0 = logistic_elo_to_score(self.elo0);
        let s1 = logistic_elo_to_score(self.elo1);
        // Pooled variance of game scores, floored against early-stop luck.
        self.scores.push(result.score_a());
        let n = self.scores.len() as f64;
        let mean = self.scores.iter().sum::<f64>() / n;
        let var =
            (self.scores.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0)).max(0.02);
        self.llr += (s1 - s0) * (result.score_a() - (s1 + s0) / 2.0) / var;
    }

    fn verdict(&self) -> Option<bool> {
        if self.llr >= self.upper {
            Some(true)
        } else if self.llr <= self.lower {
            Some(false)
        } else {
            None
        }
    }

    fn elo_estimate(&self) -> (f64, f64) {
        let n = self.games() as f64;
        if n < 1.0 || self.wins + self.losses == 0 {
            return (0.0, f64::INFINITY);
        }
        let s = (self.wins as f64 + self.draws as f64 / 2.0) / n;
        let s = s.clamp(0.001, 0.999);
        let var = (self.scores.iter().map(|x| (x - s).powi(2)).sum::<f64>() / n.max(1.0)).max(1e-6);
        // Delta method: d(elo)/d(score) at the estimate.
        let slope = 400.0 / (std::f64::consts::LN_10 * s * (1.0 - s));
        (score_to_elo(s), 1.96 * slope * (var / n).sqrt())
    }
}

// ---------------------------------------------------------------------------
// Match driver
// ---------------------------------------------------------------------------

fn main() {
    if let Err(error) = run() {
        eprintln!("sprt: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let cfg = parse_args()?;
    let book = load_book(&cfg.book)?;
    println!(
        "sprt: A={} B={} book={} ({} lines) movetime={}ms elo0={} elo1={} alpha={} beta={} max_games={} concurrency={}",
        cfg.engine_a,
        cfg.engine_b,
        cfg.book,
        book.len(),
        cfg.movetime_ms,
        cfg.elo0,
        cfg.elo1,
        cfg.alpha,
        cfg.beta,
        cfg.max_games,
        cfg.concurrency,
    );

    let next_pair = AtomicUsize::new(0);
    let stop = AtomicBool::new(false);
    let (tx, rx) = mpsc::channel::<(usize, GameResult)>();
    let max_pairs = cfg.max_games.div_ceil(2);

    std::thread::scope(|scope| {
        let (stop_ref, pairs_ref, book_ref, cfg_ref) = (&stop, &next_pair, &book, &cfg);
        for _ in 0..cfg.concurrency {
            let tx = tx.clone();
            scope.spawn(move || {
                let mut engine_a = match spawn_engine(&cfg_ref.engine_a) {
                    Ok(e) => e,
                    Err(e) => {
                        let _ = tx.send((usize::MAX, GameResult::Draw));
                        eprintln!("worker: {e}");
                        return;
                    }
                };
                let mut engine_b = match spawn_engine(&cfg_ref.engine_b) {
                    Ok(e) => e,
                    Err(e) => {
                        let _ = tx.send((usize::MAX, GameResult::Draw));
                        eprintln!("worker: {e}");
                        return;
                    }
                };
                loop {
                    if stop_ref.load(Ordering::Relaxed) {
                        break;
                    }
                    let pair = pairs_ref.fetch_add(1, Ordering::Relaxed);
                    if pair >= max_pairs {
                        break;
                    }
                    let line = &book_ref[pair % book_ref.len()];
                    // Game 1: A has White. Game 2: B has White.
                    for white_is_a in [true, false] {
                        if stop_ref.load(Ordering::Relaxed) {
                            break;
                        }
                        let (white, black) = if white_is_a {
                            (&mut engine_a, &mut engine_b)
                        } else {
                            (&mut engine_b, &mut engine_a)
                        };
                        match play_game(white, black, white_is_a, line, cfg_ref) {
                            Ok(result) => {
                                let _ = tx.send((pair, result));
                            }
                            Err(error) => {
                                eprintln!("worker: game error: {error}; respawning engines");
                                match (
                                    spawn_engine(&cfg_ref.engine_a),
                                    spawn_engine(&cfg_ref.engine_b),
                                ) {
                                    (Ok(a), Ok(b)) => {
                                        engine_a = a;
                                        engine_b = b;
                                    }
                                    _ => {
                                        let _ = tx.send((usize::MAX, GameResult::Draw));
                                        return;
                                    }
                                }
                            }
                        }
                    }
                }
            });
        }
        let mut sprt = Sprt::new(cfg.elo0, cfg.elo1, cfg.alpha, cfg.beta);
        let started = Instant::now();
        let mut poisoned = false;
        for (pair, result) in rx {
            if pair == usize::MAX {
                poisoned = true;
                break;
            }
            sprt.observe(result);
            let n = sprt.games();
            if n.is_multiple_of(10) || sprt.verdict().is_some() {
                let (elo, err) = sprt.elo_estimate();
                println!(
                    "sprt: {n} games W{} D{} L{} llr={:.2} elo={elo:.1}+/-{err:.1} elapsed={:.0}s",
                    sprt.wins,
                    sprt.draws,
                    sprt.losses,
                    sprt.llr,
                    started.elapsed().as_secs_f64(),
                );
            }
            if let Some(passed) = sprt.verdict() {
                stop.store(true, Ordering::Relaxed);
                let (elo, err) = sprt.elo_estimate();
                if passed {
                    println!("sprt: PASSED — engine A is stronger (elo={elo:.1}+/-{err:.1})");
                } else {
                    println!("sprt: FAILED — engine A is not stronger (elo={elo:.1}+/-{err:.1})");
                }
                return Ok(());
            }
            if n >= cfg.max_games as u64 {
                stop.store(true, Ordering::Relaxed);
                let (elo, err) = sprt.elo_estimate();
                println!("sprt: INCONCLUSIVE after {n} games (elo={elo:.1}+/-{err:.1})");
                return Ok(());
            }
        }
        if poisoned {
            return Err("an engine failed to spawn; match aborted".to_string());
        }
        Ok(())
    })?;
    drop(tx);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_shipped_book() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/book/openings.book");
        let book = load_book(path).expect("book must load");
        assert!(
            book.len() >= 10,
            "need at least 10 openings, got {}",
            book.len()
        );
    }

    #[test]
    fn position_keys_distinguish_rights() {
        let a: Chess = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"
            .parse::<Fen>()
            .unwrap()
            .into_position(CastlingMode::Standard)
            .unwrap();
        let b: Chess = "r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1"
            .parse::<Fen>()
            .unwrap()
            .into_position(CastlingMode::Standard)
            .unwrap();
        assert_ne!(position_key(&a), position_key(&b));
    }

    #[test]
    fn sprt_bounds_match_wald() {
        let sprt = Sprt::new(0.0, 10.0, 0.05, 0.05);
        assert!((sprt.upper - 2.944).abs() < 0.01, "upper {}", sprt.upper);
        assert!((sprt.lower + 2.944).abs() < 0.01, "lower {}", sprt.lower);
    }

    #[test]
    fn sprt_passes_on_all_wins() {
        let mut sprt = Sprt::new(0.0, 10.0, 0.05, 0.05);
        for _ in 0..60 {
            sprt.observe(GameResult::WinA);
            if sprt.verdict() == Some(true) {
                return;
            }
        }
        panic!("all-wins run should pass, llr={}", sprt.llr);
    }

    #[test]
    fn elo_estimate_centers_draws() {
        let mut sprt = Sprt::new(0.0, 10.0, 0.05, 0.05);
        for _ in 0..100 {
            sprt.observe(GameResult::Draw);
        }
        let (elo, _) = sprt.elo_estimate();
        assert!(elo.abs() < 1.0, "elo {elo}");
    }
}
