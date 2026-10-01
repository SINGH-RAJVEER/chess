export type Color = "White" | "Black";

export type PieceType = "Pawn" | "Knight" | "Bishop" | "Rook" | "Queen" | "King";

export type PromotionPiece = "Queen" | "Rook" | "Bishop" | "Knight";

export type GameStatus =
	| "Ongoing"
	| "Checkmate"
	| "Stalemate"
	| "Timeout"
	| "Resignation"
	| "Draw"
	| "InsufficientMaterial"
	| "ThreefoldRepetition"
	| "FiftyMoveRule";

export type GameMode = "vs_player" | "vs_computer";

export type ComputerOpponent = "minimax" | "custom" | "stockfish";

/** Stockfish strength from 1 (weakest) to 8 (full strength). */
export type StockfishLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const STOCKFISH_LEVELS: readonly StockfishLevel[] = [1, 2, 3, 4, 5, 6, 7, 8];

export const DEFAULT_STOCKFISH_LEVEL: StockfishLevel = 4;

/** Parses a stored or routed level, falling back to the default. */
export function parseStockfishLevel(value: unknown): StockfishLevel {
	const level = Number(value);
	return STOCKFISH_LEVELS.find((candidate) => candidate === level) ?? DEFAULT_STOCKFISH_LEVEL;
}

/** Parses a stored or routed opponent; legacy "dqn" maps to custom. */
export function parseComputerOpponent(value: unknown): ComputerOpponent {
	if (value === "stockfish") return "stockfish";
	if (value === "custom" || value === "dqn") return "custom";
	return "minimax";
}

export type QueueStatus = "idle" | "queued" | "matched";

export type QueueStatusResponse = {
	status: QueueStatus;
	timeControl?: number;
	gameId?: number;
};

export type UserColor = Color | "Spectator";

export type DrawOfferStatus = "none" | "offered" | "accepted" | "declined";

export const PIECE_VALUES: Record<PieceType, number> = {
	Pawn: 1,
	Knight: 3,
	Bishop: 3,
	Rook: 5,
	Queen: 9,
	King: 0,
};
