//! Classical alpha-beta search: iterative deepening with aspiration windows,
//! principal variation search, transposition table, null-move pruning,
//! late move reductions, futility pruning, quiescence search with static
//! exchange evaluation, and killer/history move ordering.

use std::time::{Duration, Instant};

use shakmaty::zobrist::Zobrist64;
use shakmaty::{Bitboard, Chess, Color, EnPassantMode, Move, Position, Role, Square};

use crate::eval;

const MAX_PLY: usize = 64;

/// Score returned for a proven mate. Mates closer to the root score higher
/// (`MATE_SCORE - ply`) so the engine always prefers the fastest mate.
pub const MATE_SCORE: i32 = 30_000;
const MATE_BOUND: i32 = MATE_SCORE - 256;
const INF: i32 = MATE_SCORE + 1;
const TT_MB: usize = 16;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Bound {
    Exact,
    Lower,
    Upper,
}

#[derive(Clone)]
struct TtEntry {
    key: u64,
    depth: i8,
    score: i32,
    bound: Bound,
    best: Option<Move>,
}

impl Default for TtEntry {
    fn default() -> Self {
        Self {
            key: 0,
            depth: -1,
            score: 0,
            bound: Bound::Exact,
            best: None,
        }
    }
}

pub struct SearchResult {
    pub best_move: Option<Move>,
    pub score: i32,
    pub depth: i32,
    pub nodes: u64,
}

fn material_value(role: Role) -> i32 {
    const VAL: [i32; 6] = [100, 320, 330, 500, 900, 20_000];
    VAL[eval::role_index(role)]
}

/// Move-ordering score tiers: transposition-table move beats winning captures
/// beat promotions beat killers beat history-ordered quiet moves.
const TT_MOVE_SCORE: i32 = 10_000_000;
const CAPTURE_SCORE_BASE: i32 = 1_000_000;
const PROMOTION_SCORE: i32 = 900_000;
const KILLER_ONE_SCORE: i32 = 800_000;
const KILLER_TWO_SCORE: i32 = 700_000;

/// Static exchange evaluation of a capture or promotion, in centipawns.
///
/// Positive means the sequence wins material. Classic swap algorithm over a
/// simulated occupancy map, so slider x-rays are honored.
pub fn see(pos: &Chess, mv: Move) -> i32 {
    let to = mv.to();
    let board = pos.board();
    let mut sim = board.clone();

    // What the capturing piece picks up immediately.
    let mut gain = mv.capture().map(material_value).unwrap_or(0);
    let mut moving = match mv {
        Move::Normal {
            promotion: Some(promo),
            role,
            ..
        } => {
            gain += material_value(promo) - material_value(role);
            promo
        }
        _ => mv.role(),
    };

    let mut occ = board.occupied();
    occ ^= Bitboard::from(mv.from().unwrap_or(to));
    let _ = sim.remove_piece_at(mv.from().unwrap_or(to));

    // En passant removes the captured pawn from a square other than `to`.
    if let Move::EnPassant { from, to } = mv {
        let victim = Square::from_coords(to.file(), from.rank());
        occ ^= Bitboard::from(victim);
        let _ = sim.remove_piece_at(victim);
    }

    let mut side = !pos.turn();
    let mut gains = [0i32; 32];
    gains[0] = gain;
    let mut depth = 0usize;

    loop {
        depth += 1;
        // Speculative: assume the piece we just moved gets recaptured.
        gains[depth] = material_value(moving) - gains[depth - 1];

        // Prune hopeless branches; does not change the final result.
        if (-gains[depth - 1]).max(gains[depth]) < 0 {
            break;
        }

        // Least valuable attacker of `side` on `to`.
        let attackers = sim.attacks_to(to, side, occ);
        if attackers.is_empty() {
            break;
        }
        let mut next_sq = None;
        let mut next_role = None;
        for role in [
            Role::Pawn,
            Role::Knight,
            Role::Bishop,
            Role::Rook,
            Role::Queen,
        ] {
            let candidates = attackers & sim.by_role(role);
            if let Some(sq) = candidates.first() {
                next_sq = Some(sq);
                next_role = Some(role);
                break;
            }
        }
        // The king may only join the exchange if nothing can recapture it.
        if next_role.is_none() {
            let king_candidates = attackers & sim.by_role(Role::King);
            if let Some(king_sq) = king_candidates.first() {
                let remaining_occupancy = occ ^ Bitboard::from(king_sq);
                let defenders = sim.attacks_to(to, !side, remaining_occupancy);
                if defenders.is_empty() {
                    next_sq = Some(king_sq);
                    next_role = Some(Role::King);
                }
            }
        }

        match (next_sq, next_role) {
            (Some(sq), Some(role)) => {
                moving = role;
                occ ^= Bitboard::from(sq);
                let _ = sim.remove_piece_at(sq);
                side = !side;
            }
            _ => break,
        }
        if depth == 31 {
            break;
        }
    }

    // Min-max the exchange tree back to the root of the sequence.
    while depth > 1 {
        depth -= 1;
        gains[depth - 1] = -(-gains[depth - 1]).max(gains[depth]);
    }
    gains[0]
}

pub struct Searcher {
    tt: Vec<TtEntry>,
    killers: [[Option<Move>; 2]; MAX_PLY],
    history: [[i64; 64]; 12],
    lmr: [[i32; MAX_PLY]; MAX_PLY],
    nodes: u64,
    deadline: Instant,
    aborted: bool,
    root_best: Option<Move>,
}

fn position_hash(pos: &Chess) -> u64 {
    pos.zobrist_hash::<Zobrist64>(EnPassantMode::Legal).0
}

impl Searcher {
    pub fn new() -> Self {
        let entries = (TT_MB * 1024 * 1024 / size_of::<TtEntry>()).next_power_of_two();
        let mut lmr = [[0i32; MAX_PLY]; MAX_PLY];
        for (d, row) in lmr.iter_mut().enumerate().skip(1) {
            for (m, cell) in row.iter_mut().enumerate().skip(1) {
                let reduction = (0.5 + ((d as f64).ln() * (m as f64).ln()) / 2.2).floor() as i32;
                *cell = reduction.clamp(0, d as i32 - 1);
            }
        }
        Self {
            tt: vec![TtEntry::default(); entries],
            killers: [[None; 2]; MAX_PLY],
            history: [[0; 64]; 12],
            lmr,
            nodes: 0,
            deadline: Instant::now(),
            aborted: false,
            root_best: None,
        }
    }

    /// Clears the transposition table, killers, and history.
    #[cfg(test)]
    pub fn clear(&mut self) {
        self.tt.iter_mut().for_each(|e| *e = TtEntry::default());
        self.killers = [[None; 2]; MAX_PLY];
        self.history = [[0; 64]; 12];
    }

    fn tt_index(&self, key: u64) -> usize {
        (key as usize) & (self.tt.len() - 1)
    }

    /// Searches `pos` for up to `movetime`, never exceeding `max_depth` plies.
    ///
    /// Returns the best move from the last completed iteration, falling back
    /// to the best root improvement seen in a partially completed iteration.
    pub fn search(&mut self, pos: &Chess, movetime: Duration, max_depth: i32) -> SearchResult {
        self.deadline = Instant::now() + movetime;
        self.aborted = false;
        self.nodes = 0;
        self.root_best = None;
        self.killers = [[None; 2]; MAX_PLY];
        self.history = [[0; 64]; 12];

        let mut result = SearchResult {
            best_move: pos.legal_moves().into_iter().next(),
            score: 0,
            depth: 0,
            nodes: 0,
        };
        self.root_best = result.best_move;
        let Some(_) = result.best_move else {
            return result;
        };

        let mut path: Vec<u64> = Vec::with_capacity(MAX_PLY + 1);
        path.push(position_hash(pos));
        let mut prev_score = eval::evaluate(pos);

        for depth in 1..=max_depth.clamp(1, MAX_PLY as i32) {
            // Aspiration window around the previous iteration's score.
            let mut delta = 25;
            let (mut alpha, mut beta) = (prev_score - delta, prev_score + delta);

            loop {
                let score = self.negamax(pos, depth, alpha, beta, 0, &mut path);
                if self.aborted {
                    break;
                }
                if score <= alpha {
                    delta *= 3;
                    alpha = (score - delta).max(-INF);
                } else if score >= beta {
                    delta *= 3;
                    beta = (score + delta).min(INF);
                } else {
                    prev_score = score;
                    result.score = score;
                    result.depth = depth;
                    result.best_move = self.root_best;
                    break;
                }
            }

            if self.aborted || result.score.abs() >= MATE_BOUND {
                break;
            }
        }

        result.nodes = self.nodes;
        result.best_move = self.root_best.or(result.best_move);
        result
    }

    fn check_time(&mut self) {
        if self.nodes & 4095 == 0 && Instant::now() >= self.deadline {
            self.aborted = true;
        }
    }

    fn is_draw(&self, pos: &Chess, path: &[u64], hash: u64) -> bool {
        if pos.halfmoves() >= 100 || pos.is_insufficient_material() {
            return true;
        }
        // Two-fold repetition along the current search path counts as a draw.
        path[..path.len().saturating_sub(1)].contains(&hash)
    }

    fn has_non_pawn_material(pos: &Chess, color: Color) -> bool {
        let board = pos.board();
        let minors_and_majors =
            board.by_color(color) & !(board.by_role(Role::Pawn) | board.by_role(Role::King));
        !minors_and_majors.is_empty()
    }

    fn null_move_position(pos: &Chess) -> Chess {
        use shakmaty::FromSetup;

        let mut setup = shakmaty::fen::Fen::from_position(pos, EnPassantMode::Legal).into_setup();
        setup.turn = !setup.turn;
        setup.ep_square = None;
        Chess::from_setup(setup, shakmaty::CastlingMode::Standard)
            .expect("swapping turn cannot make a position illegal")
    }

    fn score_moves(&self, moves: &mut [(Move, i32)], tt_move: Option<Move>, ply: usize) {
        for entry in moves.iter_mut() {
            let m = entry.0;
            entry.1 = if Some(m) == tt_move {
                TT_MOVE_SCORE
            } else if m.is_capture() {
                let victim = eval::role_index(m.capture().unwrap_or(Role::Pawn));
                CAPTURE_SCORE_BASE + victim as i32 * 10 - eval::role_index(m.role()) as i32
            } else if m.promotion().is_some() {
                PROMOTION_SCORE
            } else if self.killers[ply][0] == Some(m) {
                KILLER_ONE_SCORE
            } else if self.killers[ply][1] == Some(m) {
                KILLER_TWO_SCORE
            } else {
                let idx = eval::role_index(m.role());
                self.history[idx][usize::from(m.to())] as i32
            };
        }
    }

    fn pick_next(moves: &mut [(Move, i32)], start: usize) -> Move {
        let mut best = start;
        for i in start + 1..moves.len() {
            if moves[i].1 > moves[best].1 {
                best = i;
            }
        }
        moves.swap(start, best);
        moves[start].0
    }

    fn store_cutoff(&mut self, m: Move, ply: usize, depth: i32) {
        if ply >= MAX_PLY {
            return;
        }
        let killers = &mut self.killers[ply];
        if killers[0] != Some(m) {
            killers[1] = killers[0];
            killers[0] = Some(m);
        }
        let bonus = (depth * depth) as i64;
        self.history[eval::role_index(m.role())][usize::from(m.to())] += bonus;
    }

    fn negamax(
        &mut self,
        pos: &Chess,
        mut depth: i32,
        mut alpha: i32,
        mut beta: i32,
        ply: usize,
        path: &mut Vec<u64>,
    ) -> i32 {
        self.nodes += 1;
        self.check_time();
        if self.aborted || ply >= MAX_PLY - 1 {
            return eval::evaluate(pos);
        }

        // Mate distance pruning: never look for mates slower than one already
        // proven reachable at this ply.
        alpha = alpha.max(-MATE_SCORE + ply as i32);
        beta = beta.min(MATE_SCORE - ply as i32 - 1);
        if alpha >= beta {
            return alpha;
        }

        let hash = position_hash(pos);
        let in_check = !pos.checkers().is_empty();

        // Checks extend the search so forcing lines are not cut off by depth.
        if in_check {
            depth += 1;
        }

        if depth <= 0 {
            return self.quiescence(pos, alpha, beta, ply);
        }

        if ply > 0 && self.is_draw(pos, path, hash) {
            return 0;
        }

        // Transposition table probe. Mate scores are stored relative to the
        // node they were found at, so convert them for this ply.
        let tt_move = {
            let entry = &self.tt[self.tt_index(hash)];
            if entry.key == hash {
                let score = Self::tt_score_for_ply(entry.score, ply);
                if ply > 0 && entry.depth as i32 >= depth {
                    match entry.bound {
                        Bound::Exact => return score,
                        Bound::Lower => alpha = alpha.max(score),
                        Bound::Upper => beta = beta.min(score),
                    }
                    if alpha >= beta {
                        return score;
                    }
                }
                entry.best
            } else {
                None
            }
        };

        let stand_pat = eval::evaluate(pos);

        // Reverse futility pruning: comfortably ahead even before searching.
        if !in_check
            && depth <= 5
            && stand_pat.saturating_sub(80 * depth) >= beta
            && stand_pat.abs() < MATE_BOUND
            && beta.abs() < MATE_BOUND
        {
            return stand_pat;
        }

        // Null move pruning: give the opponent a free move; if we still beat
        // beta, the real threat is strong enough to cut off here.
        if !in_check
            && depth >= 3
            && ply > 0
            && stand_pat >= beta
            && beta.abs() < MATE_BOUND
            && Self::has_non_pawn_material(pos, pos.turn())
        {
            let null_pos = Self::null_move_position(pos);
            let reduction = 3 + depth / 4;
            let score = -self.negamax(
                &null_pos,
                depth - 1 - reduction,
                -beta,
                -beta + 1,
                ply + 1,
                path,
            );
            if self.aborted {
                return 0;
            }
            if score >= beta && score.abs() < MATE_BOUND {
                return score;
            }
        }

        let mut scored: Vec<(Move, i32)> = pos.legal_moves().into_iter().map(|m| (m, 0)).collect();

        if scored.is_empty() {
            return if in_check {
                -MATE_SCORE + ply as i32
            } else {
                0
            };
        }

        self.score_moves(&mut scored, tt_move, ply);

        let mut best_score = -INF;
        let mut best_move: Option<Move> = None;
        let mut bound = Bound::Upper;

        for idx in 0..scored.len() {
            let m = Self::pick_next(&mut scored, idx);
            let quiet = !m.is_capture() && m.promotion().is_none();

            // Futility pruning: skip quiet moves that cannot raise alpha.
            if quiet
                && idx > 0
                && !in_check
                && depth <= 6
                && best_score > -INF
                && stand_pat.saturating_add(130 * depth) <= alpha
                && alpha.abs() < MATE_BOUND
            {
                continue;
            }

            let mut child = pos.clone();
            child.play_unchecked(m);
            path.push(position_hash(&child));

            let score = if idx == 0 {
                -self.negamax(&child, depth - 1, -beta, -alpha, ply + 1, path)
            } else {
                // Late move reductions for quiet moves searched late.
                let mut reduction = 0;
                if quiet && depth >= 3 && idx >= 4 && !in_check {
                    reduction = self.lmr[(depth as usize).min(MAX_PLY - 1)][(idx).min(MAX_PLY - 1)];
                }

                let mut s = -self.negamax(
                    &child,
                    depth - 1 - reduction,
                    -alpha - 1,
                    -alpha,
                    ply + 1,
                    path,
                );

                // A reduced search that raised alpha deserves a full-depth look.
                if !self.aborted && s > alpha && reduction > 0 {
                    s = -self.negamax(&child, depth - 1, -alpha - 1, -alpha, ply + 1, path);
                }
                // Zero-window probe beat alpha: research with the full window.
                if !self.aborted && s > alpha && s < beta {
                    s = -self.negamax(&child, depth - 1, -beta, -alpha, ply + 1, path);
                }
                s
            };

            path.pop();

            if self.aborted {
                return 0;
            }

            if score > best_score {
                best_score = score;
                best_move = Some(m);
                if score > alpha {
                    alpha = score;
                    bound = Bound::Exact;
                    if ply == 0 {
                        self.root_best = Some(m);
                    }
                    if alpha >= beta {
                        if quiet {
                            self.store_cutoff(m, ply, depth);
                        }
                        bound = Bound::Lower;
                        break;
                    }
                }
            }
        }

        let index = self.tt_index(hash);
        self.tt[index] = TtEntry {
            key: hash,
            depth: depth.clamp(0, 127) as i8,
            score: Self::tt_score_at_ply(best_score, ply),
            bound,
            best: best_move,
        };

        best_score
    }

    /// Converts a mate score found at `ply` into a ply-independent form for
    /// storage. Non-mate scores pass through unchanged.
    fn tt_score_at_ply(score: i32, ply: usize) -> i32 {
        if score >= MATE_BOUND {
            score + ply as i32
        } else if score <= -MATE_BOUND {
            score - ply as i32
        } else {
            score
        }
    }

    /// Inverse of [`Self::tt_score_at_ply`] for reading at the current ply.
    fn tt_score_for_ply(score: i32, ply: usize) -> i32 {
        if score >= MATE_BOUND {
            score - ply as i32
        } else if score <= -MATE_BOUND {
            score + ply as i32
        } else {
            score
        }
    }

    fn quiescence(&mut self, pos: &Chess, mut alpha: i32, beta: i32, ply: usize) -> i32 {
        self.nodes += 1;
        self.check_time();
        if self.aborted {
            return 0;
        }

        let in_check = !pos.checkers().is_empty();
        let stand_pat = eval::evaluate(pos);

        // Stand-pat is unsound while in check: the position may be mated, so
        // all evasions must be searched instead.
        if !in_check {
            if stand_pat >= beta || ply >= MAX_PLY - 1 {
                return stand_pat;
            }
            if stand_pat > alpha {
                alpha = stand_pat;
            }
        } else if ply >= MAX_PLY - 1 {
            return eval::evaluate(pos);
        }

        let moves: Vec<Move> = pos.legal_moves().into_iter().collect();

        if moves.is_empty() {
            return if in_check {
                -MATE_SCORE + ply as i32
            } else {
                stand_pat
            };
        }

        // Out of check only captures and promotions are searched; while in
        // check every evasion must be considered.
        let mut scored: Vec<(Move, i32)> = moves
            .into_iter()
            .filter(|m| in_check || m.is_capture() || m.promotion().is_some())
            .map(|m| (m, 0))
            .collect();

        if scored.is_empty() {
            return stand_pat;
        }

        // Order captures by SEE so winning ones come first.
        for entry in scored.iter_mut() {
            entry.1 = if in_check { 0 } else { see(pos, entry.0) };
        }
        scored.sort_by_key(|(_, s)| std::cmp::Reverse(*s));

        let mut best = stand_pat;
        for (m, see_score) in scored {
            // Delta pruning plus skipping outright losing captures.
            if !in_check {
                let gained = m.capture().map(material_value).unwrap_or(0)
                    + m.promotion().map(|_| 800).unwrap_or(0);
                if see_score < 0 && stand_pat.saturating_add(gained) + 200 <= alpha {
                    continue;
                }
            }

            let mut child = pos.clone();
            child.play_unchecked(m);
            let score = -self.quiescence(&child, -beta, -alpha, ply + 1);
            if self.aborted {
                return 0;
            }
            if score > best {
                best = score;
                if score > alpha {
                    alpha = score;
                    if alpha >= beta {
                        break;
                    }
                }
            }
        }
        best
    }
}

impl Default for Searcher {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shakmaty::{fen::Fen, CastlingMode};

    fn pos(fen: &str) -> Chess {
        fen.parse::<Fen>()
            .expect("valid fen")
            .into_position(CastlingMode::Standard)
            .expect("legal position")
    }

    fn searcher() -> Searcher {
        Searcher::new()
    }

    fn uci(result: &SearchResult) -> String {
        let m = result.best_move.expect("engine returns a move");
        shakmaty::uci::UciMove::from_standard(m).to_string()
    }

    #[test]
    fn see_scores_exchanges_correctly() {
        let parse = |p: &Chess, uci: &str| {
            shakmaty::uci::UciMove::from_ascii(uci.as_bytes())
                .expect("valid uci")
                .to_move(p)
                .expect("legal move")
        };

        // Free pawn on a5: +100.
        let p = pos("4k3/8/8/p7/8/8/8/R3K3 w Q - 0 1");
        assert_eq!(see(&p, parse(&p, "a1a5")), 100);

        // Pawn on a5 defended by the rook on a8: win pawn, lose rook = -400.
        let p = pos("r3k3/8/8/p7/8/8/8/R3K3 w Q - 0 1");
        assert_eq!(see(&p, parse(&p, "a1a5")), 100 - 500);

        // Bishop takes knight on f6, pawn recaptures from g7: 320 - 330 = -10.
        let p = pos("4k3/5pp1/5n2/8/8/2B5/8/4K3 w - - 0 1");
        assert_eq!(see(&p, parse(&p, "c3f6")), -10);

        // Quiet moves score zero.
        let p = pos("4k3/8/8/8/8/8/3R4/4K3 w - - 0 1");
        assert_eq!(see(&p, parse(&p, "d2d4")), 0);

        // En passant captures count the victim pawn even though it is not on
        // the destination square: +100.
        let p = pos("6k1/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
        assert_eq!(see(&p, parse(&p, "e5d6")), 100);
    }

    #[test]
    fn deterministic_on_same_position() {
        let p = pos("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4");
        let mut engine = searcher();
        let a = engine.search(&p, Duration::from_secs(2), 5);
        engine.clear();
        let b = engine.search(&p, Duration::from_secs(2), 5);
        assert_eq!(uci(&a), uci(&b));
        assert_eq!(a.score, b.score);
    }

    #[test]
    fn finds_mate_in_one() {
        // Back-rank mate: Ra8#.
        let p = pos("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
        let result = searcher().search(&p, Duration::from_secs(5), 6);
        assert_eq!(uci(&result), "a1a8");
        assert!(
            result.score >= MATE_BOUND,
            "mate score expected, got {}",
            result.score
        );
    }

    #[test]
    fn finds_forced_mate_in_two() {
        // Two-rook ladder: 1.Rb7 Kg8 2.Rc8# (or equivalent order).
        let p = pos("7k/8/8/8/8/8/1R6/2R4K w - - 0 1");
        let mut engine = searcher();
        let result = engine.search(&p, Duration::from_secs(10), 8);
        assert!(
            result.score >= MATE_BOUND,
            "forced mate expected, got {}",
            result.score
        );

        // Follow the engine until the game ends; it must deliver mate.
        let mut board = p;
        let mut plies = 0;
        while !board.is_game_over() && plies < 5 {
            let r = engine.search(&board, Duration::from_secs(5), 8);
            let m = r.best_move.expect("move available");
            board.play_unchecked(m);
            plies += 1;
        }
        assert!(board.is_game_over(), "game should end within 5 plies");
        assert_eq!(
            board.outcome(),
            shakmaty::Outcome::Known(shakmaty::KnownOutcome::Decisive {
                winner: Color::White
            })
        );
    }

    #[test]
    fn avoids_leaving_queen_hanging() {
        // Black rook attacks the white queen on d1; the queen must move away
        // or be defended such that White keeps close to its material.
        let p = pos("3r2k1/5ppp/8/8/8/8/5PPP/3QR1K1 w - - 0 1");
        let result = searcher().search(&p, Duration::from_secs(5), 8);
        let chosen = result.best_move.expect("move available");

        // Worst-case black reply must not win more than a pawn's worth.
        let mut after = p.clone();
        after.play_unchecked(chosen);

        let initial_white = material_count(p.board().clone(), Color::White);
        let mut worst_for_white = i32::MAX;
        for reply in after.legal_moves() {
            let mut reply_pos = after.clone();
            reply_pos.play_unchecked(reply);
            worst_for_white =
                worst_for_white.min(material_count(reply_pos.board().clone(), Color::White));
        }
        assert!(
            initial_white - worst_for_white <= 100,
            "white lost more than a pawn; engine hung the queen"
        );
    }

    fn material_count(board: shakmaty::Board, color: Color) -> i32 {
        let mut total = 0;
        for (_square, piece) in board {
            if piece.color == color {
                total += material_value(piece.role);
            }
        }
        total
    }

    #[test]
    fn takes_the_hanging_rook() {
        // Queen on b5 can capture the undefended rook on h5; that dominates
        // all quiet alternatives.
        let p = pos("6k1/8/8/1Q5r/8/8/8/6K1 w - - 0 1");
        let result = searcher().search(&p, Duration::from_secs(5), 6);
        assert_eq!(uci(&result), "b5h5");
    }

    #[test]
    fn scores_bare_kings_as_draw() {
        let p = pos("7k/8/8/8/8/8/8/K7 w - - 0 1");
        let result = searcher().search(&p, Duration::from_secs(2), 6);
        assert_eq!(result.score, 0);
    }
}

#[cfg(test)]
mod bench {
    use super::*;
    use shakmaty::{fen::Fen, CastlingMode};
    #[test]
    #[ignore]
    fn bench_middlegame() {
        let p: Chess = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"
            .parse::<Fen>()
            .unwrap()
            .into_position(CastlingMode::Standard)
            .unwrap();
        let mut s = Searcher::new();
        let t = std::time::Instant::now();
        let r = s.search(&p, Duration::from_secs(10), 32);
        println!(
            "depth {} score {} nodes {} in {:.2}s => {:.0} knps, move {}",
            r.depth,
            r.score,
            r.nodes,
            t.elapsed().as_secs_f64(),
            r.nodes as f64 / t.elapsed().as_secs_f64() / 1000.0,
            shakmaty::uci::UciMove::from_standard(r.best_move.unwrap())
        );
    }
}
