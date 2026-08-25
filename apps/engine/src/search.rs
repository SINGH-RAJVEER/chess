//! Classical alpha-beta search: iterative deepening with aspiration windows,
//! principal variation search, transposition table, null-move pruning,
//! late move reductions and pruning, futility pruning, quiescence search
//! with static exchange evaluation, and a layered move-ordering scheme:
//! transposition-table move, winning captures (MVV-LVA), killers,
//! counter-moves, then quiet moves scored by main history plus one-ply and
//! two-ply continuation history.

use std::time::{Duration, Instant};

use arrayvec::ArrayVec;
use shakmaty::zobrist::Zobrist64;
use shakmaty::{Bitboard, Chess, Color, EnPassantMode, Move, MoveList, Position, Role, Square};

use crate::eval;

const MAX_PLY: usize = 64;
const MAX_MOVES: usize = 256;
const MAX_QUIETS: usize = 96;

/// Score returned for a proven mate. Mates closer to the root score higher
/// (`MATE_SCORE - ply`) so the engine always prefers the fastest mate.
pub const MATE_SCORE: i32 = 30_000;
const MATE_BOUND: i32 = MATE_SCORE - 256;
const INF: i32 = MATE_SCORE + 1;
const TT_MB: usize = 64;

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
    age: u8,
}

impl Default for TtEntry {
    fn default() -> Self {
        Self {
            key: 0,
            depth: -1,
            score: 0,
            bound: Bound::Exact,
            best: None,
            age: 0,
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

/// Gravity bonus/malus magnitude for history updates at a given depth.
fn stat_bonus(depth: i32) -> i32 {
    (4 * depth * depth + 120 * depth - 120).clamp(0, 1896)
}

/// Linear-history update: pull toward `bonus` so values cannot run away.
/// The gravity divisor is 2^14, matching Berserk/Ethereal convention.
fn update_history(entry: &mut i32, bonus: i32) {
    *entry += bonus - *entry * bonus.abs() / 16384;
}

/// Move-ordering score tiers: transposition-table move beats winning captures
/// beat promotions beat killers beat counter-moves beat history-ordered quiets.
const TT_MOVE_SCORE: i32 = 10_000_000;
const CAPTURE_SCORE_BASE: i32 = 1_000_000;
const PROMOTION_SCORE: i32 = 900_000;
const KILLER_ONE_SCORE: i32 = 800_000;
const KILLER_TWO_SCORE: i32 = 700_000;
const COUNTER_MOVE_SCORE: i32 = 600_000;

/// Flat index into a continuation-history table for the transition from
/// `prev` to `cur`. Tables are laid out as [prev_piece][prev_to][cur_piece]
/// [cur_to] flattened to one dimension.
fn cont_index(prev: Move, cur: Move) -> usize {
    let prev_key = eval::role_index(prev.role()) * 64 + usize::from(prev.to());
    let cur_key = eval::role_index(cur.role()) * 64 + usize::from(cur.to());
    prev_key * (12 * 64) + cur_key
}
const CONT_TABLE_LEN: usize = 12 * 64 * 12 * 64;

pub struct Searcher {
    tt: Vec<TtEntry>,
    tt_age: u8,
    killers: [[Option<Move>; 2]; MAX_PLY],
    /// Butterfly history keyed by [mover piece type][to square].
    main_history: [[i32; 64]; 12],
    /// One- and two-ply continuation histories.
    cont_history: [Vec<i32>; 2],
    /// Counter-move table keyed by [previous mover piece type][previous to].
    counters: [[Option<Move>; 64]; 12],
    /// Static evaluation per ply, used for the improving flag.
    evals: [i32; MAX_PLY],
    /// Move played at each ply, for one- and two-ply continuation history.
    move_stack: [Option<Move>; MAX_PLY],
    lmr: [[i32; MAX_PLY]; MAX_PLY],
    nodes: u64,
    deadline: Instant,
    aborted: bool,
    root_best: Option<Move>,
}

fn position_hash(pos: &Chess) -> u64 {
    pos.zobrist_hash::<Zobrist64>(EnPassantMode::Legal).0
}

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

impl Searcher {
    pub fn new() -> Self {
        let entries = (TT_MB * 1024 * 1024 / size_of::<TtEntry>()).next_power_of_two();
        let mut lmr = [[0i32; MAX_PLY]; MAX_PLY];
        for (d, row) in lmr.iter_mut().enumerate().skip(1) {
            for (m, cell) in row.iter_mut().enumerate().skip(1) {
                let reduction =
                    (0.25 + ((d as f64).ln() * (m as f64).ln()) / 2.1872).floor() as i32;
                *cell = reduction.clamp(0, d as i32 - 1);
            }
        }
        Self {
            tt: vec![TtEntry::default(); entries],
            tt_age: 0,
            killers: [[None; 2]; MAX_PLY],
            main_history: [[0; 64]; 12],
            cont_history: [vec![0; CONT_TABLE_LEN], vec![0; CONT_TABLE_LEN]],
            counters: [[None; 64]; 12],
            evals: [0; MAX_PLY],
            move_stack: [None; MAX_PLY],
            lmr,
            nodes: 0,
            deadline: Instant::now(),
            aborted: false,
            root_best: None,
        }
    }

    /// Clears the transposition table, killers, and all history tables.
    #[cfg(test)]
    pub fn clear(&mut self) {
        self.tt.iter_mut().for_each(|e| *e = TtEntry::default());
        self.killers = [[None; 2]; MAX_PLY];
        self.main_history = [[0; 64]; 12];
        self.cont_history = [vec![0; CONT_TABLE_LEN], vec![0; CONT_TABLE_LEN]];
        self.counters = [[None; 64]; 12];
    }

    fn tt_index(&self, key: u64) -> usize {
        (key as usize) & (self.tt.len() - 1)
    }

    /// Searches `pos` for up to `movetime`, never exceeding `max_depth` plies.
    ///
    /// Returns the best move from the last completed iteration; root moves
    /// that completed and improved before an abort still count.
    pub fn search(&mut self, pos: &Chess, movetime: Duration, max_depth: i32) -> SearchResult {
        self.deadline = Instant::now() + movetime;
        self.aborted = false;
        self.nodes = 0;
        self.root_best = None;
        self.killers = [[None; 2]; MAX_PLY];
        self.tt_age = self.tt_age.wrapping_add(1);

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

        let mut path: ArrayVec<u64, MAX_PLY> = ArrayVec::new();
        path.push(position_hash(pos));
        let mut prev_score = eval::evaluate(pos);

        for depth in 1..=max_depth.clamp(1, MAX_PLY as i32) {
            // Aspiration window around the previous iteration's score.
            let mut delta = 9;
            let (mut alpha, mut beta) = (prev_score - delta, prev_score + delta);

            loop {
                let score = self.negamax(pos, depth, alpha, beta, 0, true, None, &mut path);
                if self.aborted {
                    break;
                }
                if score <= alpha {
                    delta += delta / 4;
                    alpha = score - delta;
                } else if score >= beta {
                    delta += delta / 4;
                    beta = score + delta;
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
        if self.nodes & 2047 == 0 && Instant::now() >= self.deadline {
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

    fn history_of(&self, prev: Option<Move>, prev_prev: Option<Move>, m: Move) -> i32 {
        let piece = eval::role_index(m.role());
        let to = usize::from(m.to());
        let mut h = self.main_history[piece][to];
        if let Some(pm) = prev {
            h += self.cont_history[0][cont_index(pm, m)];
        }
        if let Some(ppm) = prev_prev {
            h += self.cont_history[1][cont_index(ppm, m)];
        }
        h
    }

    fn update_quiet_history(
        &mut self,
        prev: Option<Move>,
        prev_prev: Option<Move>,
        m: Move,
        bonus: i32,
    ) {
        let piece = eval::role_index(m.role());
        let to = usize::from(m.to());
        update_history(&mut self.main_history[piece][to], bonus);
        if let Some(pm) = prev {
            let idx = cont_index(pm, m);
            update_history(&mut self.cont_history[0][idx], bonus);
        }
        if let Some(ppm) = prev_prev {
            let idx = cont_index(ppm, m);
            update_history(&mut self.cont_history[1][idx], bonus);
        }
    }

    fn score_moves(
        &self,
        moves: &MoveList,
        scores: &mut [i32; MAX_MOVES],
        tt_move: Option<Move>,
        prev: Option<Move>,
        prev_prev: Option<Move>,
        ply: usize,
    ) {
        let counter =
            prev.and_then(|pm| self.counters[eval::role_index(pm.role())][usize::from(pm.to())]);
        for (i, &m) in moves.iter().enumerate() {
            scores[i] = if Some(m) == tt_move {
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
            } else if Some(m) == counter {
                COUNTER_MOVE_SCORE
            } else {
                self.history_of(prev, prev_prev, m)
            };
        }
    }

    fn pick_next(moves: &mut MoveList, scores: &mut [i32; MAX_MOVES], start: usize) -> Move {
        let mut best = start;
        for i in start + 1..moves.len() {
            if scores[i] > scores[best] {
                best = i;
            }
        }
        moves.swap(start, best);
        scores.swap(start, best);
        moves[start]
    }

    fn store_cutoff(
        &mut self,
        m: Move,
        prev: Option<Move>,
        prev_prev: Option<Move>,
        tried_quiets: &[Option<Move>],
        ply: usize,
        depth: i32,
    ) {
        if ply < MAX_PLY {
            let killers = &mut self.killers[ply];
            if killers[0] != Some(m) {
                killers[1] = killers[0];
                killers[0] = Some(m);
            }
        }
        if let Some(pm) = prev {
            self.counters[eval::role_index(pm.role())][usize::from(pm.to())] = Some(m);
        }

        let bonus = stat_bonus(depth);
        self.update_quiet_history(prev, prev_prev, m, bonus);
        for other in tried_quiets.iter().flatten() {
            if *other != m {
                self.update_quiet_history(prev, prev_prev, *other, -bonus);
            }
        }
    }

    #[allow(clippy::too_many_arguments)] // mirrors a classic search stack
    fn negamax(
        &mut self,
        pos: &Chess,
        mut depth: i32,
        mut alpha: i32,
        mut beta: i32,
        ply: usize,
        is_pv: bool,
        prev_move: Option<Move>,
        path: &mut ArrayVec<u64, MAX_PLY>,
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
        self.move_stack[ply] = prev_move;
        let prev_prev = ply.checked_sub(2).and_then(|p| self.move_stack[p]);

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
        let mut tt_hit = false;
        let tt_move = {
            let entry = &self.tt[self.tt_index(hash)];
            if entry.key == hash {
                tt_hit = true;
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

        // Internal iterative reduction: without a TT move, ordering will be
        // poor, so search one ply shallower first.
        if is_pv && tt_move.is_none() && depth >= 4 && !in_check {
            depth -= 1;
        }

        let stand_pat = eval::evaluate(pos);
        self.evals[ply] = stand_pat;
        let improving = ply >= 2 && self.evals[ply] > self.evals[ply - 2];

        // Reverse futility pruning: comfortably ahead even before searching.
        if !in_check
            && !is_pv
            && depth <= 6
            && stand_pat.saturating_sub(67 * depth + 112 * i32::from(improving)) >= beta
            && stand_pat.abs() < MATE_BOUND
            && beta.abs() < MATE_BOUND
        {
            return stand_pat;
        }

        // Razoring: hopelessly behind at shallow depth, drop to quiescence.
        if !is_pv && !in_check && depth <= 5 && stand_pat + 200 * depth <= alpha {
            return self.quiescence(pos, alpha, beta, ply);
        }

        // Null move pruning: give the opponent a free move; if we still beat
        // beta, the real threat is strong enough to cut off here.
        if !in_check
            && !is_pv
            && depth >= 3
            && ply > 0
            && stand_pat >= beta
            && beta.abs() < MATE_BOUND
            && Self::has_non_pawn_material(pos, pos.turn())
        {
            let null_pos = Self::null_move_position(pos);
            let r = 4 + depth / 5 + ((stand_pat - beta) / 191).min(3);
            let score = -self.negamax(
                &null_pos,
                depth - 1 - r,
                -beta,
                -beta + 1,
                ply + 1,
                false,
                None,
                path,
            );
            if self.aborted {
                return 0;
            }
            if score >= beta && score.abs() < MATE_BOUND {
                return score;
            }
        }

        let mut moves: MoveList = pos.legal_moves();

        if moves.is_empty() {
            return if in_check {
                -MATE_SCORE + ply as i32
            } else {
                0
            };
        }

        let mut scores = [0i32; MAX_MOVES];
        self.score_moves(&moves, &mut scores, tt_move, prev_move, prev_prev, ply);

        let mut best_score = -INF;
        let mut best_move: Option<Move> = None;
        let mut bound = Bound::Upper;
        let mut quiets: ArrayVec<Option<Move>, MAX_QUIETS> = ArrayVec::new();

        for idx in 0..moves.len() {
            let m = Self::pick_next(&mut moves, &mut scores, idx);
            let quiet = !m.is_capture() && m.promotion().is_none();

            // Late move pruning: skip remaining quiets when plenty have been
            // tried already at low depth.
            if quiet
                && !is_pv
                && !in_check
                && depth <= 8
                && idx > 0
                && (quiets.len() as i32) >= lmp_count(improving, depth)
            {
                continue;
            }

            // SEE pruning of losing captures: they almost never fail high
            // even after reductions.
            if !quiet
                && !in_check
                && depth <= 8
                && idx > 0
                && best_score > -INF
                && see(pos, m) < -22 * depth * depth
            {
                continue;
            }

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
                -self.negamax(
                    &child,
                    depth - 1,
                    -beta,
                    -alpha,
                    ply + 1,
                    is_pv,
                    Some(m),
                    path,
                )
            } else {
                // Late move reductions for quiet moves searched late.
                let mut reduction = 0;
                if quiet && depth >= 3 && idx >= 4 && !in_check {
                    reduction = self.lmr[(depth as usize).min(MAX_PLY - 1)][(idx).min(MAX_PLY - 1)];
                    reduction += i32::from(!is_pv);
                    reduction += i32::from(!improving);
                    let hist = self.history_of(None, None, m);
                    reduction -= hist / 6000;
                    reduction = reduction.clamp(0, depth - 1);
                }

                let mut s = -self.negamax(
                    &child,
                    depth - 1 - reduction,
                    -alpha - 1,
                    -alpha,
                    ply + 1,
                    false,
                    Some(m),
                    path,
                );

                // A reduced search that raised alpha deserves a full-depth look.
                if !self.aborted && s > alpha && reduction > 0 {
                    s = -self.negamax(
                        &child,
                        depth - 1,
                        -alpha - 1,
                        -alpha,
                        ply + 1,
                        false,
                        Some(m),
                        path,
                    );
                }
                // Zero-window probe beat alpha: research with the full window.
                if !self.aborted && s > alpha && s < beta {
                    s = -self.negamax(
                        &child,
                        depth - 1,
                        -beta,
                        -alpha,
                        ply + 1,
                        is_pv,
                        Some(m),
                        path,
                    );
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
                            self.store_cutoff(m, prev_move, prev_prev, &quiets, ply, depth);
                        }
                        bound = Bound::Lower;
                        break;
                    }
                }
            }

            if quiet && quiets.len() < MAX_QUIETS {
                let _ = quiets.try_push(Some(m));
            }
        }

        // Transposition table store with age-aware replacement.
        let index = self.tt_index(hash);
        let entry = &mut self.tt[index];
        if entry.key != hash && entry.age == self.tt_age && entry.depth as i32 > depth && !tt_hit {
            return best_score;
        }
        *entry = TtEntry {
            key: hash,
            depth: depth.clamp(0, 127) as i8,
            score: Self::tt_score_at_ply(best_score, ply),
            bound,
            best: best_move,
            age: self.tt_age,
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
            return stand_pat;
        }

        let all_moves: MoveList = pos.legal_moves();

        if all_moves.is_empty() {
            return if in_check {
                -MATE_SCORE + ply as i32
            } else {
                stand_pat
            };
        }

        // Out of check only captures and promotions are searched; while in
        // check every evasion must be considered.
        let mut moves: MoveList = all_moves
            .iter()
            .copied()
            .filter(|m| in_check || m.is_capture() || m.promotion().is_some())
            .collect();
        let mut scores = [0i32; MAX_MOVES];

        if moves.is_empty() {
            return stand_pat;
        }

        // Order captures by SEE so winning ones come first.
        for (i, &m) in moves.iter().enumerate() {
            scores[i] = if in_check { 0 } else { see(pos, m) };
        }

        let mut best = stand_pat;
        let mut idx = 0usize;
        while idx < moves.len() {
            let m = Self::pick_next(&mut moves, &mut scores, idx);
            idx += 1;

            // Delta pruning plus skipping outright losing captures.
            if !in_check {
                let gained = m.capture().map(material_value).unwrap_or(0)
                    + m.promotion().map(|_| 800).unwrap_or(0);
                let s = scores[idx - 1];
                if s < 0 && stand_pat.saturating_add(gained) + 200 <= alpha {
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

fn lmp_count(improving: bool, depth: i32) -> i32 {
    let d = depth as f64;
    if improving {
        (2.0767 + 0.3743 * d * d) as i32
    } else {
        (3.8733 + 0.7124 * d * d) as i32
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

    /// Tactical smoke suite from the Win At Chess set (known best moves).
    /// These guard against search regressions; they are not a strength proof.
    #[test]
    fn solves_tactical_suite() {
        let cases: [(&str, &str); 2] = [
            // Scholar's mate: Qxf7# is mate immediately.
            (
                "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w kq - 4 4",
                "f3f7",
            ),
            // WAC.005: Qxh7+ forces Kf8 then Qxf7#.
            (
                "r1bq2rk/pp3pbp/2p1p1pQ/7P/3P4/2PB1N2/PK3PPR/8 w - - 0 1",
                "h6h7",
            ),
        ];
        for (fen, expected) in cases {
            let p = pos(fen);
            // Fixed depth keeps the result deterministic regardless of
            // machine speed or parallel test load.
            let result = searcher().search(&p, Duration::from_secs(60), 9);
            assert_eq!(uci(&result), expected, "failed on {fen}");
        }
    }
}

#[cfg(test)]
mod bench {
    use super::*;
    use shakmaty::{fen::Fen, CastlingMode};

    /// Ignored by default: reports depth/nps on Kiwipete for speed tracking.
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
