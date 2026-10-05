//! Classic fixed-depth minimax with alpha-beta pruning and a material-only
//! evaluation. This is the "minimax" computer opponent; the UCI frontend
//! selects it with `setoption name Opponent value minimax`.

use shakmaty::{Chess, Color, Move, Position, Role};
use std::sync::atomic::{AtomicBool, Ordering};
use crate::search::{IterationInfo, SearchResult};
use web_time::{Duration, Instant};

/// Search depth used when `go` does not specify one.
pub const DEFAULT_DEPTH: i32 = 5;

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

/// Returns the best move for the side to move at `depth` plies, or `None`
/// when the position has no legal moves.
pub fn best_move(pos: &Chess, depth: i32) -> Option<Move> {
    let legals = pos.legal_moves();
    if legals.is_empty() {
        return None;
    }

    let depth = depth.max(1);
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

/// Iterative deepening preserves the last completed iteration on timeout.
pub fn search(
	pos: &Chess,
	budget: Duration,
	max_depth: i32,
	stop: &AtomicBool,
	node_limit: Option<u64>,
	mut report: impl FnMut(&IterationInfo),
) -> SearchResult {
	struct Limits<'a> {
		deadline: Instant,
		stop: &'a AtomicBool,
		nodes: u64,
		node_limit: Option<u64>,
	}
	fn visit(pos: &Chess, depth: i32, mut alpha: i32, mut beta: i32, limits: &mut Limits) -> Result<i32, ()> {
		limits.nodes += 1;
		if limits.stop.load(Ordering::Relaxed)
			|| limits.node_limit.is_some_and(|n| limits.nodes >= n)
			|| (limits.nodes & 63 == 0 && Instant::now() >= limits.deadline) {
			return Err(());
		}
		if depth == 0 || pos.is_game_over() { return Ok(evaluate(pos)); }
		let white = pos.turn() == Color::White;
		let mut best = if white { i32::MIN } else { i32::MAX };
		for m in pos.legal_moves() {
			let mut next = pos.clone();
			next.play_unchecked(m);
			let score = visit(&next, depth - 1, alpha, beta, limits)?;
			if white { best = best.max(score); alpha = alpha.max(best); }
			else { best = best.min(score); beta = beta.min(best); }
			if beta <= alpha { break; }
		}
		Ok(best)
	}
	let start = Instant::now();
	let mut limits = Limits { deadline: start + budget, stop, nodes: 0, node_limit };
	let mut moves = pos.legal_moves();
	let mut result = SearchResult { best_move: moves.first().copied(), score: 0, depth: 0, nodes: 0 };
	if moves.is_empty() { return result; }
	'deepening: for depth in 1..=max_depth.clamp(1, 64) {
		let white = pos.turn() == Color::White;
		let mut best_score = if white { i32::MIN } else { i32::MAX };
		let mut best = None;
		let (mut alpha, mut beta) = (i32::MIN, i32::MAX);
		for m in &moves {
			if Instant::now() >= limits.deadline || stop.load(Ordering::Relaxed) { break 'deepening; }
			let mut next = pos.clone();
			next.play_unchecked(*m);
			let Ok(score) = visit(&next, depth - 1, alpha, beta, &mut limits) else { break 'deepening; };
			if best.is_none() || (white && score > best_score) || (!white && score < best_score) {
				best = Some(*m); best_score = score;
			}
			if white { alpha = alpha.max(best_score); } else { beta = beta.min(best_score); }
		}
		result.best_move = best;
		result.score = best_score;
		result.depth = depth;
		report(&IterationInfo { depth, score: if white { best_score } else { -best_score }, nodes: limits.nodes, elapsed: start.elapsed(), pv: best.into_iter().collect() });
		if let Some(index) = moves.iter().position(|m| Some(*m) == best) { moves.swap(0, index); }
	}
	result.nodes = limits.nodes;
	result
}

#[cfg(test)]
mod tests {
    use super::*;
    use shakmaty::fen::Fen;
    use shakmaty::CastlingMode;

    fn position(fen: &str) -> Chess {
        fen.parse::<Fen>()
            .unwrap()
            .into_position(CastlingMode::Standard)
            .unwrap()
    }

    #[test]
    fn answers_startpos() {
        let pos = Chess::default();
        let mv = best_move(&pos, DEFAULT_DEPTH).expect("legal move");
        assert!(pos.legal_moves().contains(&mv));
    }

    #[test]
    fn takes_a_hanging_queen() {
        // White to move; the black queen on d5 is en prise to the e4 pawn.
        let pos = position("rnb1kbnr/pppp1ppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3");
        let mv = best_move(&pos, 2).expect("legal move");
        assert_eq!(
            shakmaty::uci::UciMove::from_standard(mv).to_string(),
            "e4d5"
        );
    }

    #[test]
    fn reports_no_moves_for_stalemate() {
        let pos = position("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
        assert!(best_move(&pos, DEFAULT_DEPTH).is_none());
    }
}
