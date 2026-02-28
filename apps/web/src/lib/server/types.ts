import type { Color, GameStatus, PieceType } from "@chess/types";

export type BoardResponse = {
	id: number;
	pieces: {
		color: Color;
		piece_type: PieceType;
		square: number;
	}[];
	capturedPieces: {
		white: PieceType[];
		black: PieceType[];
	};
	moves: {
		from: number;
		to: number;
		color: Color;
		pieceType: PieceType;
		captured?: PieceType;
		notation: string;
	}[];
	turn: Color;
	status: GameStatus;
	mode: "vs_player" | "vs_computer";
	timeControl: number;
	whiteTimeRemaining: number;
	blackTimeRemaining: number;
	lastMoveTime: number | null;
	lastMove: {
		from: number;
		to: number;
	} | null;
	serverTime: number;
	userColor?: Color | "Spectator";
};
