//! Tapered evaluation using PeSTO's evaluation function (Rofchade).
//!
//! Tables are written from White's point of view with index 0 = a8.
//! See https://www.chessprogramming.org/PeSTO%27s_Evaluation_Function

use shakmaty::{Bitboard, Board, Chess, Color, File, Position, Rank, Role, Square};

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
pub const TEMPO_BONUS: i32 = 20;

/// Midgame/endgame score pair.
#[derive(Clone, Copy)]
struct Score {
	mg: i32,
	eg: i32,
}

impl Score {
	const fn new(mg: i32, eg: i32) -> Self {
		Self { mg, eg }
	}

	fn add(&mut self, other: Score, sign: i32) {
		self.mg += sign * other.mg;
		self.eg += sign * other.eg;
	}
}

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

/// Tapered evaluation from White's point of view: PeSTO material and piece
/// squares plus pawn structure, bishop pair, rook placement, mobility, and a
/// simple king pawn shield.
fn evaluate_board(board: &Board) -> i32 {
	let mut mg_score = 0;
	let mut eg_score = 0;

	for color in [Color::White, Color::Black] {
		let sign = if color == Color::White { 1 } else { -1 };
		for role in [
			Role::Pawn,
			Role::Knight,
			Role::Bishop,
			Role::Rook,
			Role::Queen,
			Role::King,
		] {
			let idx = role_index(role);
			let pieces = board.by_color(color) & board.by_role(role);
			for square in pieces {
				let table_sq = table_square(square, color);
				mg_score += sign * (MG_MATERIAL[idx] + MG_TABLES[idx][table_sq]);
				eg_score += sign * (EG_MATERIAL[idx] + EG_TABLES[idx][table_sq]);
			}
		}
	}

	let mut phase = game_phase(board);

	// Positional terms, each symmetric so colors cancel on mirrored boards.
	let mut extra = Score::new(0, 0);
	extra.add(pawn_structure(board), 1);
	extra.add(bishop_pair(board), 1);
	extra.add(rook_files(board), 1);
	extra.add(mobility(board), 1);
	extra.add(king_shield(board), 1);

	mg_score += extra.mg;
	eg_score += extra.eg;

	phase = phase.min(MAX_PHASE);
	(mg_score * phase + eg_score * (MAX_PHASE - phase)) / MAX_PHASE
}

/// Game phase from non-pawn material of both sides combined: 24 = pure
/// middlegame, 0 = pure endgame.
pub fn game_phase(board: &Board) -> i32 {
	let mut phase = 0;
	for color in [Color::White, Color::Black] {
		for role in [Role::Knight, Role::Bishop, Role::Rook, Role::Queen] {
			let count = (board.by_color(color) & board.by_role(role)).count();
			phase += PHASE_WEIGHTS[role_index(role)] * i32::try_from(count).unwrap_or(0);
		}
	}
	phase.min(MAX_PHASE)
}

/// Precomputed per-file bitboards and passed-pawn masks. Built once on first
/// use; every later access is a table lookup.
static FILE_BBS: std::sync::OnceLock<[Bitboard; 8]> = std::sync::OnceLock::new();
static PASSED_MASKS: std::sync::OnceLock<[Bitboard; 128]> = std::sync::OnceLock::new();

fn tables() -> (&'static [Bitboard; 8], &'static [Bitboard; 128]) {
	let files = FILE_BBS.get_or_init(|| {
		let mut bbs = [Bitboard::EMPTY; 8];
		for f in 0..8u32 {
			for r in 0..8u32 {
				bbs[f as usize] ^= Bitboard::from(Square::from_coords(File::new(f), Rank::new(r)));
			}
		}
		bbs
	});
	// Index 0..63: White masks (squares ahead on same and adjacent files).
	// Index 64..127: Black masks (squares behind on same and adjacent files).
	let passed = PASSED_MASKS.get_or_init(|| {
		let mut masks = [Bitboard::EMPTY; 128];
		for sq in Square::ALL {
			let f = usize::from(sq.file());
			let r = usize::from(sq.rank());
			let mut white_mask = Bitboard::EMPTY;
			let mut black_mask = Bitboard::EMPTY;
			for df in [-1i32, 0, 1] {
				let nf = f as i32 + df;
				if !(0..8).contains(&nf) {
					continue;
				}
				for nr in 0..8 {
					if nr > r {
						white_mask ^= Bitboard::from(Square::from_coords(
							File::new(nf as u32),
							Rank::new(nr as u32),
						));
					}
					if nr < r {
						black_mask ^= Bitboard::from(Square::from_coords(
							File::new(nf as u32),
							Rank::new(nr as u32),
						));
					}
				}
			}
			masks[usize::from(sq)] = white_mask;
			masks[64 + usize::from(sq)] = black_mask;
		}
		masks
	});
	(files, passed)
}

fn file_bb_of(file: File) -> Bitboard {
	tables().0[usize::from(file)]
}

/// Squares on `square`'s file (and adjacent files) strictly ahead of the pawn
/// from `white`'s perspective. Used for passed-pawn detection.
fn ahead_mask(square: Square, white: bool) -> Bitboard {
	let (_, passed) = tables();
	let idx = usize::from(square);
	if white {
		passed[idx]
	} else {
		passed[64 + idx]
	}
}

/// Zobrist keys for the pawn-only hash, indexed `[color * 64 + square]`.
/// Generated once from a fixed-seed splitmix64 stream so runs are
/// reproducible.
static PAWN_KEYS: std::sync::OnceLock<[u64; 128]> = std::sync::OnceLock::new();

fn pawn_keys() -> &'static [u64; 128] {
	PAWN_KEYS.get_or_init(|| {
		let mut keys = [0u64; 128];
		let mut state = 0x2545_F491_4F6C_DD1Du64;
		for key in &mut keys {
			state ^= state >> 30;
			state = state.wrapping_mul(0xBF58_476D_1CE4_E5B9);
			state ^= state >> 27;
			state = state.wrapping_mul(0x94D0_49BB_1331_11EB);
			state ^= state >> 31;
			*key = state;
		}
		keys
	})
}

/// Zobrist hash of the pawn placement only. Piece moves leave it untouched,
/// which is what makes the pawn-structure cache effective.
fn pawn_key(board: &Board) -> u64 {
	let keys = pawn_keys();
	let pawns = board.by_role(Role::Pawn);
	let mut hash = 0u64;
	for sq in pawns & board.by_color(Color::White) {
		hash ^= keys[usize::from(sq)];
	}
	for sq in pawns & board.by_color(Color::Black) {
		hash ^= keys[64 + usize::from(sq)];
	}
	hash
}

/// Pawn-structure terms keyed by the pawn-only Zobrist hash. Pawn moves are a
/// small fraction of searched moves, so most evaluations reuse the previous
/// entry instead of recomputing passed/doubled/isolated penalties.
const PAWN_HASH_SIZE: usize = 1 << 13;

struct PawnEntry {
	/// Zero marks an unused entry; otherwise the full pawn-only key.
	key: std::sync::atomic::AtomicU64,
	/// Midgame score in the high 32 bits, endgame in the low 32, so one
	/// atomic store publishes both halves together.
	packed: std::sync::atomic::AtomicI64,
}

impl PawnEntry {
	const fn new() -> Self {
		Self {
			key: std::sync::atomic::AtomicU64::new(0),
			packed: std::sync::atomic::AtomicI64::new(0),
		}
	}
}

static PAWN_HASH: std::sync::OnceLock<Vec<PawnEntry>> = std::sync::OnceLock::new();

fn pawn_hash() -> &'static [PawnEntry] {
	PAWN_HASH.get_or_init(|| (0..PAWN_HASH_SIZE).map(|_| PawnEntry::new()).collect())
}

fn pack_score(score: Score) -> i64 {
	(i64::from(score.mg) << 32) | (i64::from(score.eg) & 0xFFFF_FFFF)
}

/// Passed, doubled, and isolated pawn terms, served from the pawn hash.
///
/// The probe is lock-free and safe under concurrent evaluators (the test
/// runner runs them in parallel): the key is read before and after the packed
/// score, and the entry only counts as a hit if both reads agree. A writer
/// always zeroes the key first, so a racing reader either sees a consistent
/// entry or misses.
fn pawn_structure(board: &Board) -> Score {
	use std::sync::atomic::Ordering;

	let key = pawn_key(board);
	let idx = (key as usize) & (PAWN_HASH_SIZE - 1);
	let entry = &pawn_hash()[idx];

	let first = entry.key.load(Ordering::SeqCst);
	let packed = entry.packed.load(Ordering::SeqCst);
	let second = entry.key.load(Ordering::SeqCst);
	if first == key && second == key && key != 0 {
		return Score {
			mg: (packed >> 32) as i32,
			eg: packed as i32,
		};
	}

	let total = pawn_structure_uncached(board);
	entry.key.store(0, Ordering::SeqCst);
	entry.packed.store(pack_score(total), Ordering::SeqCst);
	entry.key.store(key, Ordering::SeqCst);
	total
}

/// Passed, doubled, and isolated pawn terms, computed directly.
fn pawn_structure_uncached(board: &Board) -> Score {
	const PASSED_MG: [i32; 6] = [5, 10, 20, 35, 60, 100];
	const PASSED_EG: [i32; 6] = [10, 20, 35, 60, 100, 150];

	let mut total = Score::new(0, 0);

	for color in [Color::White, Color::Black] {
		let sign = if color == Color::White { 1 } else { -1 };
		let ours = board.by_color(color) & board.by_role(Role::Pawn);
		let theirs = board.by_color(!color) & board.by_role(Role::Pawn);
		let mut per_file = [0i32; 8];
		for sq in ours {
			per_file[usize::from(sq.file())] += 1;
		}

		for sq in ours {
			let white = color == Color::White;
			let rank_idx = {
				let r = usize::from(sq.rank());
				if white {
					r - 1
				} else {
					6 - r
				}
			};
			// Relative rank 1..6 maps to the tables above.
			if (1..=6).contains(&rank_idx) && (theirs & ahead_mask(sq, white)).is_empty() {
				total.mg += sign * PASSED_MG[rank_idx - 1];
				total.eg += sign * PASSED_EG[rank_idx - 1];
			}

			if per_file[usize::from(sq.file())] > 1 {
				total.add(Score::new(-8, -16), sign); // doubled
			}

			let f = usize::from(sq.file());
			let neighbors = [
				f.checked_sub(1).filter(|&nf| nf < 8),
				f.checked_add(1).filter(|&nf| nf < 8),
			];
			let supported = neighbors.iter().flatten().any(|&nf| per_file[nf] > 0);
			if !supported {
				total.add(Score::new(-12, -14), sign); // isolated
			}
		}
	}
	total
}

/// Bishop pair bonus: two bishops cover both complexions.
fn bishop_pair(board: &Board) -> Score {
	let mut total = Score::new(0, 0);
	for color in [Color::White, Color::Black] {
		let bishops = board.by_color(color) & board.by_role(Role::Bishop);
		if bishops.count() >= 2 {
			total.add(
				Score::new(22, 88),
				if color == Color::White { 1 } else { -1 },
			);
		}
	}
	total
}

/// Rooks score more with fewer pawns blocking their file.
fn rook_files(board: &Board) -> Score {
	let mut total = Score::new(0, 0);
	let all_pawns = board.by_role(Role::Pawn);
	for color in [Color::White, Color::Black] {
		let sign = if color == Color::White { 1 } else { -1 };
		let rooks = board.by_color(color) & board.by_role(Role::Rook);
		let ours = board.by_color(color) & all_pawns;
		let theirs = board.by_color(!color) & all_pawns;
		for sq in rooks {
			let file_bb = file_bb_of(sq.file());
			if (ours & file_bb).is_empty() {
				if (theirs & file_bb).is_empty() {
					total.add(Score::new(30, 5), sign); // open file
				} else {
					total.add(Score::new(12, 6), sign); // semi-open file
				}
			}
		}
	}
	total
}

/// Attack-count mobility for knights, bishops, rooks, and queens into squares
/// not occupied by friendly pieces or attacked by enemy pawns.
fn mobility(board: &Board) -> Score {
	const TERMS: [(Role, i32, i32, i32); 4] = [
		// (role, baseline moves, mg per extra move, eg per extra move)
		(Role::Knight, 4, 4, 4),
		(Role::Bishop, 6, 3, 4),
		(Role::Rook, 7, 2, 3),
		(Role::Queen, 10, 1, 1),
	];

	let mut total = Score::new(0, 0);
	for color in [Color::White, Color::Black] {
		let sign = if color == Color::White { 1 } else { -1 };
		let ours = board.by_color(color);
		let their_pawns = board.by_color(!color) & board.by_role(Role::Pawn);
		let mut pawn_attacks = Bitboard::EMPTY;
		for sq in their_pawns {
			pawn_attacks ^= shakmaty::attacks::attacks(
				sq,
				shakmaty::Piece {
					color: !color,
					role: Role::Pawn,
				},
				board.occupied(),
			);
		}
		let area = !ours & !pawn_attacks;

		for (role, base, w_mg, w_eg) in TERMS {
			for sq in board.by_color(color) & board.by_role(role) {
				let attacks = shakmaty::attacks::attacks(
					sq,
					shakmaty::Piece { color, role },
					board.occupied(),
				) & area;
				let count = i32::try_from(attacks.count()).unwrap_or(0);
				total.mg += sign * (count - base) * w_mg;
				total.eg += sign * (count - base) * w_eg;
			}
		}
	}
	total
}

/// Simple king safety: pawns shielding the king one or two ranks ahead on the
/// king's file or adjacent files.
fn king_shield(board: &Board) -> Score {
	let mut total = Score::new(0, 0);
	for color in [Color::White, Color::Black] {
		let sign = if color == Color::White { 1 } else { -1 };
		let kings = board.by_color(color) & board.by_role(Role::King);
		let Some(king) = kings.first() else {
			continue;
		};
		let pawns = board.by_color(color) & board.by_role(Role::Pawn);
		let kf = usize::from(king.file());
		let kr = i32::from(king.rank());
		let dir = if color == Color::White { 1 } else { -1 };

		let mut shield = 0;
		for df in [-2i32, -1, 0, 1, 2] {
			let f = kf as i32 + df;
			if !(0..8).contains(&f) {
				continue;
			}
			for dr in [1, 2] {
				let r = kr + dr * dir;
				if !(0..8).contains(&r) {
					continue;
				}
				let sq = Square::from_coords(File::new(f as u32), Rank::new(r as u32));
				if pawns.contains(sq) {
					shield += 10;
					break; // nearest shield pawn per file is enough
				}
			}
		}
		total.mg += sign * shield;
	}
	total
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

	#[test]
	fn game_phase_counts_both_sides() {
		// Startpos: every minor/major on the board counts, regardless of color.
		let start = pos("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
		assert_eq!(game_phase(start.board()), MAX_PHASE);

		// Bare kings have no phase at all.
		let bare = pos("7k/8/8/8/8/8/8/K7 w - - 0 1");
		assert_eq!(game_phase(bare.board()), 0);
	}

	#[test]
	fn advanced_passed_pawn_outscores_early_one() {
		// Same bare-kings structure, passer on e5 versus e2: further advanced
		// must score higher through the passed-pawn table (and PSQT).
		let advanced = evaluate(&pos("8/8/8/4P3/8/8/8/K6k w - - 0 1"));
		let early = evaluate(&pos("8/8/8/8/8/8/4P3/K6k w - - 0 1"));
		assert!(advanced > early, "{advanced} should exceed {early}");
	}

	#[test]
	fn connected_pawns_beat_isolated_ones() {
		// Equal pawn counts: f2+g2 support each other, f2+h2 are both isolated
		// (no friendly pawn on an adjacent file).
		let connected = evaluate(&pos("8/8/8/8/8/8/5PP1/K6k w - - 0 1"));
		let isolated = evaluate(&pos("8/8/8/8/8/8/5P1P/K6k w - - 0 1"));
		assert!(connected > isolated, "{connected} should exceed {isolated}");
	}

	#[test]
	fn pawn_key_distinguishes_pawn_placements() {
		let keys = [
			pawn_key(pos("8/8/8/4p3/4P3/8/8/K6k w - - 0 1").board()),
			pawn_key(pos("8/8/8/8/4p3/4P3/8/K6k w - - 0 1").board()),
			pawn_key(pos("8/8/8/8/8/8/5PP1/K6k w - - 0 1").board()),
			// Same pawns with pieces added must hash identically.
			pawn_key(pos("rnbqkbnr/8/8/4p3/4P3/8/8/R3K2R w KQkq - 0 1").board()),
		];
		let mirrored = pos("8/8/8/4p3/4P3/8/8/K6k w - - 0 1");
		let white_e4_black_e5 = mirrored.board();
		assert_eq!(keys[0], pawn_key(white_e4_black_e5));
		assert_ne!(keys[0], keys[1], "different pawn ranks must differ");
		assert_ne!(keys[0], keys[2], "different pawn files must differ");
		assert_eq!(
			pawn_key(white_e4_black_e5),
			pawn_key(pos("rnbqkbnr/8/8/4p3/4P3/8/8/R3K2R w KQkq - 0 1").board()),
			"non-pawn pieces must not affect the pawn hash"
		);
	}

	#[test]
	fn pawn_hash_matches_direct_computation() {
		let fens = [
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
			"r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
			"8/2p5/3p4/KP5r/1R3p1k/8/6P1/8 w - - 0 1",
			"8/8/8/8/8/8/5PP1/K6k w - - 0 1",
			"8/8/8/8/8/8/5P1P/K6k w - - 0 1",
			"4k3/8/8/2ppp3/8/8/8/4K3 b - - 0 1",
		];

		for fen in fens {
			let game = pos(fen);
			let board = game.board();
			let direct = pawn_structure_uncached(board);
			// Cold probe (store) and warm probe (hit) must both agree.
			let stored = pawn_structure(board);
			let hit = pawn_structure(board);
			assert_eq!(stored.mg, direct.mg, "{fen}: cold mg");
			assert_eq!(stored.eg, direct.eg, "{fen}: cold eg");
			assert_eq!(hit.mg, direct.mg, "{fen}: warm mg");
			assert_eq!(hit.eg, direct.eg, "{fen}: warm eg");
		}

		// A full board evaluation is stable across repeated calls once the
		// cache is warm, which exercises the hit path inside evaluate_board.
		let game = pos(fens[1]);
		let board = game.board();
		let first = evaluate_board(board);
		for _ in 0..3 {
			assert_eq!(evaluate_board(board), first);
		}
	}
}

#[cfg(test)]
mod probe {
	use super::*;
	use shakmaty::{fen::Fen, CastlingMode};
	/// Ignored by default: reports nanoseconds per evaluation for speed tracking.
	#[test]
	#[ignore]
	fn bench_eval() {
		let p: Chess = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"
			.parse::<Fen>()
			.unwrap()
			.into_position(CastlingMode::Standard)
			.unwrap();
		let t = std::time::Instant::now();
		let mut acc = 0i64;
		for _ in 0..200_000 {
			acc += evaluate_board(p.board()) as i64;
		}
		println!(
			"eval: {:.0} ns/eval, acc {acc}",
			t.elapsed().as_nanos() as f64 / 200_000.0
		);
	}
}
