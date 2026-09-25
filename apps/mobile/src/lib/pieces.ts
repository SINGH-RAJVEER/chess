import type { Color, PieceType, PromotionPiece } from "@chess/types";

const PIECE_UNICODE: Record<Color, Record<PieceType, string>> = {
	White: {
		Pawn: "♙",
		Knight: "♘",
		Bishop: "♗",
		Rook: "♖",
		Queen: "♕",
		King: "♔",
	},
	Black: {
		Pawn: "♟",
		Knight: "♞",
		Bishop: "♝",
		Rook: "♜",
		Queen: "♛",
		King: "♚",
	},
};

export function getPieceUnicode(color: Color, piece: PieceType): string {
	return PIECE_UNICODE[color][piece];
}

export function squareRow(square: number): number {
	return Math.floor(square / 8);
}

export function squareCol(square: number): number {
	return square % 8;
}

export function squareLabel(square: number): string {
	const files = "abcdefgh";
	return `${files[squareCol(square)]}${8 - squareRow(square)}`;
}

const PROMOTION_CHOICES: PromotionPiece[] = ["Queen", "Rook", "Bishop", "Knight"];

export function promotionChoices(color: Color): { type: PromotionPiece; glyph: string }[] {
	return PROMOTION_CHOICES.map((type) => ({ type, glyph: getPieceUnicode(color, type) }));
}
