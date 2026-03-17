import type { Color, GameMode, GameStatus, PieceType, UserColor } from "./chess";

export type BoardPiece = {
	color: Color;
	piece_type: PieceType;
	square: number;
};

export type BoardMove = {
	from: number;
	to: number;
	color: Color;
	pieceType: PieceType;
	captured?: PieceType;
	notation: string;
};

export type BoardResponse = {
	id: number;
	pieces: BoardPiece[];
	capturedPieces: {
		white: PieceType[];
		black: PieceType[];
	};
	moves: BoardMove[];
	turn: Color;
	status: GameStatus;
	mode: GameMode;
	timeControl: number;
	whiteTimeRemaining: number;
	blackTimeRemaining: number;
	lastMoveTime: number | null;
	lastMove: {
		from: number;
		to: number;
	} | null;
	serverTime: number;
	userColor?: UserColor;
};
