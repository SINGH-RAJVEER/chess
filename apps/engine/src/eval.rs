//! Tapered evaluation using PeSTO's evaluation function (Rofchade).
//!
//! Tables are written from White's point of view with index 0 = a8.
//! See https://www.chessprogramming.org/PeSTO%27s_Evaluation_Function

use shakmaty::{Board, Chess, Color, Position, Role, Square};

/// Material values in centipawns (midgame, endgame).
const MG_MATERIAL: [i32; 6] = [82, 337, 365, 477, 1025, 0];
const EG_MATERIAL: [i32; 6] = [94, 281, 297, 512, 936, 0];

/// Game phase weights: knight/bishop = 1, rook = 2, queen = 4.
const PHASE_WEIGHTS: [i32; 6] = [0, 1, 1, 2, 4, 0];
const MAX_PHASE: i32 = 24;

type Table = [i32; 64];

const MG_PAWN_TABLE: Table = [
    0, 0, 0, 0, 0, 0, 0, 0, 98, 134, 61, 95, 68, 126, 34, -11, -6, 7, 26, 31, 65, 56, 25, -20, -14,
    13, 6, 21, 23, 12, 17, -23, -27, -2, -5, 12, 17, 6, 10, -25, -26, -4, -4, -10, 3, 3, 33, -12,
    -35, -1, -20, -23, -15, 24, 38, -22, 0, 0, 0, 0, 0, 0, 0, 0,
];

const EG_PAWN_TABLE: Table = [
    0, 0, 0, 0, 0, 0, 0, 0, 178, 173, 158, 134, 147, 132, 165, 187, 94, 100, 85, 67, 56, 53, 82,
    84, 32, 24, 13, 5, -2, 4, 17, 17, 13, 9, -3, -7, -7, -8, 3, -1, 4, 7, -6, 1, 0, -5, -1, -8, 13,
    8, 8, 10, 13, 0, 2, -7, 0, 0, 0, 0, 0, 0, 0, 0,
];

const MG_KNIGHT_TABLE: Table = [
    -167, -89, -34, -49, 61, -97, -15, -107, -73, -41, 72, 36, 23, 62, 7, -17, -47, 60, 37, 65, 84,
    129, 73, 44, -9, 17, 19, 53, 37, 69, 18, 22, -13, 4, 16, 13, 28, 19, 21, -8, -23, -9, 12, 10,
    19, 17, 25, -16, -29, -53, -12, -3, -1, 18, -14, -19, -105, -21, -58, -33, -17, -28, -19, -23,
];

const EG_KNIGHT_TABLE: Table = [
    -58, -38, -13, -28, -31, -27, -63, -99, -25, -8, -25, -2, -9, -25, -24, -52, -24, -20, 10, 9,
    -1, -9, -19, -41, -17, 3, 22, 22, 22, 11, 8, -18, -18, -6, 16, 25, 16, 17, 4, -18, -23, -3, -1,
    15, 10, -3, -20, -22, -42, -20, -10, -5, -2, -20, -23, -44, -29, -51, -23, -15, -22, -18, -50,
    -64,
];

const MG_BISHOP_TABLE: Table = [
    -29, 4, -82, -37, -25, -42, 7, -8, -26, 16, -18, -13, 30, 59, 18, -47, -16, 37, 43, 40, 35, 50,
    37, -2, -4, 5, 19, 50, 37, 37, 7, -2, -6, 13, 13, 26, 34, 12, 10, 4, 0, 15, 15, 15, 14, 27, 18,
    10, 4, 15, 16, 0, 7, 21, 33, 1, -33, -3, -14, -21, -13, -12, -39, -21,
];

const EG_BISHOP_TABLE: Table = [
    -14, -21, -11, -8, -7, -9, -17, -24, -8, -4, 7, -12, -3, -13, -4, -14, 2, -8, 0, -1, -2, 6, 0,
    4, -3, 9, 12, 9, 14, 10, 3, 2, -6, 3, 13, 19, 7, 10, -3, -9, -12, -3, 8, 10, 13, 3, -7, -15,
    -14, -18, -7, -1, 4, -9, -15, -27, -23, -9, -23, -5, -9, -16, -5, -17,
];

const MG_ROOK_TABLE: Table = [
    32, 42, 32, 51, 63, 9, 31, 43, 27, 32, 58, 62, 80, 67, 26, 44, -5, 19, 26, 36, 17, 45, 61, 16,
    -24, -11, 7, 26, 24, 35, -8, -20, -36, -26, -12, -1, 9, -7, 6, -23, -45, -25, -16, -17, 3, 0,
    -5, -33, -44, -16, -20, -9, -1, 11, -6, -71, -19, -13, 1, 17, 16, 7, -37, -26,
];

const EG_ROOK_TABLE: Table = [
    13, 10, 18, 15, 12, 12, 8, 5, 11, 13, 13, 11, -3, 3, 8, 3, 7, 7, 7, 5, 4, -3, -5, -3, 4, 3, 13,
    1, 2, 1, -1, 2, 3, 5, 8, 4, -5, -6, -8, -11, -4, 0, -5, -1, -7, -12, -8, -16, -6, -6, 0, 2, -9,
    -9, -11, -3, -9, 2, 3, -1, -5, -13, 4, -20,
];

const MG_QUEEN_TABLE: Table = [
    -28, 0, 29, 12, 59, 44, 43, 45, -24, -39, -5, 1, -16, 57, 28, 54, -13, -17, 7, 8, 29, 56, 47,
    57, -27, -27, -16, -16, -1, 17, -2, 1, -9, -26, -9, -10, -2, -4, 3, -3, -14, 2, -11, -2, -5, 2,
    14, 5, -35, -8, 11, 2, 8, 15, -3, 1, -1, -18, -9, 10, -15, -25, -31, -50,
];

const EG_QUEEN_TABLE: Table = [
    -9, 22, 22, 27, 27, 19, 10, 20, -17, 20, 32, 41, 58, 25, 30, 0, -20, 6, 9, 49, 47, 35, 19, 9,
    3, 22, 24, 45, 57, 40, 57, 36, -18, 28, 19, 47, 31, 34, 39, 23, -16, -27, 15, 6, 9, 17, 10, 5,
    -22, -23, -30, -16, -16, -23, -36, -32, -33, -28, -22, -43, -5, -32, -20, -41,
];

const MG_KING_TABLE: Table = [
    -65, 23, 16, -15, -56, -34, 2, 13, 29, -1, -20, -7, -8, -4, -38, -29, -9, 24, 2, -16, -20, 6,
    22, -22, -17, -20, -12, -27, -30, -25, -14, -36, -49, -1, -27, -39, -46, -44, -33, -51, -14,
    -14, -22, -46, -44, -30, -15, -27, 1, 7, -8, -64, -43, -16, 9, 8, -15, 36, 12, -54, 8, -28, 24,
    14,
];

const EG_KING_TABLE: Table = [
    -74, -35, -18, -18, -11, 15, 4, -17, -12, 17, 14, 17, 17, 38, 23, 11, 10, 17, 23, 15, 20, 45,
    44, 13, -8, 22, 24, 27, 26, 33, 26, 3, -18, -4, 21, 24, 27, 23, 9, -11, -19, -3, 11, 21, 23,
    16, 7, -9, -27, -11, 4, 13, 14, 4, -5, -17, -53, -34, -21, -11, -28, -14, -24, -43,
];

const MG_TABLES: [Table; 6] = [
    MG_PAWN_TABLE,
    MG_KNIGHT_TABLE,
    MG_BISHOP_TABLE,
    MG_ROOK_TABLE,
    MG_QUEEN_TABLE,
    MG_KING_TABLE,
];

const EG_TABLES: [Table; 6] = [
    EG_PAWN_TABLE,
    EG_KNIGHT_TABLE,
    EG_BISHOP_TABLE,
    EG_ROOK_TABLE,
    EG_QUEEN_TABLE,
    EG_KING_TABLE,
];

/// Tempo bonus for the side to move, in centipawns.
pub const TEMPO_BONUS: i32 = 10;

pub fn role_index(role: Role) -> usize {
    match role {
        Role::Pawn => 0,
        Role::Knight => 1,
        Role::Bishop => 2,
        Role::Rook => 3,
        Role::Queen => 4,
        Role::King => 5,
    }
}

/// Table index for a square from White's point of view (tables start at a8),
/// or Black's point of view (tables mirrored vertically).
fn table_square(square: Square, color: Color) -> usize {
    let s = square as usize;
    if color == Color::White {
        s ^ 56
    } else {
        s
    }
}

/// Static evaluation in centipawns from the point of view of the side to move.
///
/// Positive scores favor the side to move.
pub fn evaluate(pos: &Chess) -> i32 {
    evaluate_board(pos.board()) * turn_sign(pos.turn()) + TEMPO_BONUS
}

fn turn_sign(turn: Color) -> i32 {
    if turn == Color::White {
        1
    } else {
        -1
    }
}

/// Tapered material + piece-square evaluation from White's point of view.
fn evaluate_board(board: &Board) -> i32 {
    let mut mg_score = 0;
    let mut eg_score = 0;
    let mut phase = 0;

    for (square, piece) in board.clone() {
        let idx = role_index(piece.role);
        let table_sq = table_square(square, piece.color);
        let sign = if piece.color == Color::White { 1 } else { -1 };

        mg_score += sign * (MG_MATERIAL[idx] + MG_TABLES[idx][table_sq]);
        eg_score += sign * (EG_MATERIAL[idx] + EG_TABLES[idx][table_sq]);
        phase += PHASE_WEIGHTS[idx];
    }

    phase = phase.min(MAX_PHASE);
    (mg_score * phase + eg_score * (MAX_PHASE - phase)) / MAX_PHASE
}

#[cfg(test)]
mod tests {
    use super::*;
    use shakmaty::fen::Fen;

    fn pos(fen: &str) -> Chess {
        fen.parse::<Fen>()
            .expect("valid fen")
            .into_position(shakmaty::CastlingMode::Standard)
            .expect("legal position")
    }

    #[test]
    fn startpos_is_equal() {
        // Piece-square terms cancel perfectly on the start position, so the
        // score is exactly the tempo bonus for White.
        let p = pos("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        assert_eq!(evaluate_board(p.board()), 0);
        assert_eq!(evaluate(&p), TEMPO_BONUS);
    }

    #[test]
    fn tempo_gives_side_to_move_small_edge() {
        // Equal-material position where the piece-square terms cancel exactly:
        // kings only. Both king tables are symmetric under mirroring for the
        // relevant squares? Not guaranteed, so compare against the raw board
        // score instead.
        let p = pos("8/8/4k3/8/8/4K3/8/8 w - - 0 1");
        let expected = evaluate_board(p.board()) + TEMPO_BONUS;
        assert_eq!(evaluate(&p), expected);

        let mut black_to_move = p;
        black_to_move = black_to_move.swap_turn().expect("swap turn");
        let expected_black = -evaluate_board(black_to_move.board()) + TEMPO_BONUS;
        assert_eq!(evaluate(&black_to_move), expected_black);
    }

    #[test]
    fn extra_queen_wins_material() {
        let white_up = pos("8/8/8/4k3/8/8/4K3/4Q3 w - - 0 1");
        let eval_white = evaluate(&white_up);

        let black_up = pos("8/8/8/4K3/8/8/4k3/4q3 b - - 0 1");
        let eval_black = evaluate(&black_up);

        assert!(eval_white > 800, "queen up should score high: {eval_white}");
        assert!(eval_black > 800, "queen up should score high: {eval_black}");
    }

    #[test]
    fn mirrored_position_evaluates_equal() {
        // Color-swapped vertical mirror must score identically from each
        // side-to-move's perspective.
        let white_pawn = pos("8/8/8/4p3/4P3/8/8/K6k w - - 0 1");
        let black_pawn = pos("k6K/8/8/4P3/4p3/8/8/8 b - - 0 1");
        let a = evaluate(&white_pawn);
        let b = evaluate(&black_pawn);
        assert_eq!(a, b, "mirrored positions must evaluate equal: {a} vs {b}");
    }

    #[test]
    fn tapered_eval_prefers_endgame_king_activity() {
        // With Black's king fixed on e8, a centralized White king must
        // outscore a cornered one in a bare endgame (endgame table dominant).
        let central = evaluate(&pos("4k3/8/8/8/4K3/8/8/8 w - - 0 1"));
        let corner = evaluate(&pos("4k3/8/8/8/8/8/8/K7 w - - 0 1"));
        assert!(
            central > corner,
            "centralized king should beat cornered king: {central} vs {corner}"
        );
    }

    #[test]
    fn piece_on_good_square_beats_bad_square() {
        // Knight on e5 outranks knight on b1 for identical otherwise-bare boards.
        let good = evaluate(&pos("8/8/8/4N3/8/8/8/K6k w - - 0 1"));
        let bad = evaluate(&pos("8/8/8/8/8/8/8/NK5k w - - 0 1"));
        assert!(good > bad, "{good} should exceed {bad}");
    }
}
