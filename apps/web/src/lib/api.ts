import type {
	BoardResponse,
	Color,
	DrawOfferResponse,
	DrawRespondResponse,
	GetBoardParams,
	GetMovesParams,
	JoinQueueRequest,
	MakeMoveRequest,
	MakeMoveResponse,
	QueueStatusResponse,
	ResetGameRequest,
	ResetGameResponse,
	ResignResponse,
	UndoMoveRequest,
	UndoMoveResponse,
} from "@chess/types";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		headers: {
			"Content-Type": "application/json",
			...(init?.headers || {}),
		},
		...init,
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => ({ error: response.statusText }))) as {
			error?: string;
		};
		throw new Error(body.error || response.statusText);
	}

	return (await response.json()) as T;
}

export function getBoard(params: GetBoardParams): Promise<BoardResponse> {
	const searchParams = new URLSearchParams();
	if (params.mode) searchParams.set("mode", params.mode);
	if (params.gameId !== undefined) {
		searchParams.set("gameId", String(params.gameId));
	}
	if (params.playerId) searchParams.set("playerId", params.playerId);

	return apiRequest<BoardResponse>(`/api/board?${searchParams.toString()}`);
}

export function getMoves(params: GetMovesParams): Promise<number[]> {
	const searchParams = new URLSearchParams({
		square: String(params.square),
		gameId: String(params.gameId),
	});

	return apiRequest<number[]>(`/api/moves?${searchParams.toString()}`);
}

export function getQueueStatus(playerId: string): Promise<QueueStatusResponse> {
	const searchParams = new URLSearchParams({ playerId });
	return apiRequest<QueueStatusResponse>(`/api/queue-status?${searchParams.toString()}`);
}

export function joinQueue(body: JoinQueueRequest): Promise<QueueStatusResponse> {
	return apiRequest<QueueStatusResponse>("/api/join-queue", {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export function makeMove(body: MakeMoveRequest): Promise<MakeMoveResponse> {
	return apiRequest<MakeMoveResponse>("/api/move", {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export function undoMove(body: UndoMoveRequest): Promise<UndoMoveResponse> {
	return apiRequest<UndoMoveResponse>("/api/undo", {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export function resetGame(body: ResetGameRequest): Promise<ResetGameResponse> {
	return apiRequest<ResetGameResponse>("/api/reset", {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export function resignGame(gameId: number, color: Color): Promise<ResignResponse> {
	return apiRequest<ResignResponse>("/api/resign", {
		method: "POST",
		body: JSON.stringify({ gameId, color }),
	});
}

export function offerDraw(gameId: number, color: Color): Promise<DrawOfferResponse> {
	return apiRequest<DrawOfferResponse>("/api/draw-offer", {
		method: "POST",
		body: JSON.stringify({ gameId, color }),
	});
}

export function respondToDraw(gameId: number, accept: boolean): Promise<DrawRespondResponse> {
	return apiRequest<DrawRespondResponse>("/api/draw-respond", {
		method: "POST",
		body: JSON.stringify({ gameId, accept }),
	});
}

export type SignUpRequest = {
	email: string;
	password: string;
	name: string;
};

export type SignInRequest = {
	email: string;
	password: string;
};

export type AuthResponse = {
	user: {
		id: string;
		email: string;
		name: string;
		image: string | null;
		emailVerified: boolean;
		createdAt: string;
		updatedAt: string;
	};
	session: {
		id: string;
		expiresAt: string;
		token: string;
		createdAt: string;
		updatedAt: string;
		ipAddress: string | null;
		userAgent: string | null;
		userId: string;
	};
};

export function signUp(body: SignUpRequest): Promise<AuthResponse> {
	return apiRequest<AuthResponse>("/api/auth/sign-up", {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export function signIn(body: SignInRequest): Promise<AuthResponse> {
	return apiRequest<AuthResponse>("/api/auth/sign-in", {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export function signOut(sessionId: string): Promise<{ success: boolean }> {
	return apiRequest<{ success: boolean }>("/api/auth/sign-out", {
		method: "POST",
		body: JSON.stringify({ sessionId }),
	});
}
