import type { BoardResponse } from "./board";
import type { Color, GameMode, GameStatus, PieceType, QueueStatus } from "./chess";

export type GetBoardParams = {
	mode?: GameMode;
	gameId?: number;
	playerId?: string;
};

export type GetMovesParams = {
	square: number;
	gameId: number;
};

export type GetQueueStatusParams = {
	playerId: string;
};

export type ResetGameRequest = {
	mode: GameMode;
	timeControl: number;
};

export type JoinQueueRequest = {
	playerId: string;
	timeControl: number;
};

export type MakeMoveRequest = {
	from: number;
	to: number;
	gameId: number;
};

export type UndoMoveRequest = {
	gameId: number;
};

export type QueueStatusResponse = {
	status: QueueStatus;
	timeControl?: number;
	gameId?: number;
};

export type ResetGameResponse = {
	success: boolean;
};

export type MakeMoveResponse = {
	success: boolean;
	nextTurn: Color;
	status: GameStatus;
	captured: boolean;
};

export type UndoMoveResponse = {
	success: boolean;
	message?: string;
};

export type CapturedPieces = {
	white: PieceType[];
	black: PieceType[];
};

export type HealthResponse = {
	ok: true;
};

export type ApiErrorResponse = {
	error: string;
};

export type BoardApiResponse = BoardResponse;

export type AuthUser = {
	id: string;
	email: string;
	name: string;
	image: string | null;
	emailVerified: boolean;
	createdAt: string;
	updatedAt: string;
};

export type AuthSession = {
	id: string;
	expiresAt: string;
	token: string;
	createdAt: string;
	updatedAt: string;
	ipAddress: string | null;
	userAgent: string | null;
	userId: string;
};

export type AuthResponse = {
	user: AuthUser;
	session: AuthSession;
};
