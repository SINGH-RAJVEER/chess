import type { BoardResponse } from "./board";
import type { Color, GameMode, GameStatus, PieceType, PromotionPiece, QueueStatus } from "./chess";

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
	increment?: number;
};

export type JoinQueueRequest = {
	playerId: string;
	timeControl: number;
	increment?: number;
};

export type MakeMoveRequest = {
	from: number;
	to: number;
	gameId: number;
	promotion?: PromotionPiece;
};

export type UndoMoveRequest = {
	gameId: number;
};

export type ResignRequest = {
	gameId: number;
	color: Color;
};

export type DrawOfferRequest = {
	gameId: number;
	color: Color;
};

export type DrawRespondRequest = {
	gameId: number;
	accept: boolean;
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
	isCheck: boolean;
	isCheckmate: boolean;
	isCastle: boolean;
	promotion?: PieceType;
};

export type UndoMoveResponse = {
	success: boolean;
	message?: string;
};

export type ResignResponse = {
	success: boolean;
	status: GameStatus;
	winner: Color;
};

export type DrawOfferResponse = {
	success: boolean;
	drawOfferedBy: Color | null;
};

export type DrawRespondResponse = {
	success: boolean;
	status: GameStatus;
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
