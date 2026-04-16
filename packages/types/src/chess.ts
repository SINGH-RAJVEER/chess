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

export type QueueStatus = "idle" | "queued" | "matched";

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
