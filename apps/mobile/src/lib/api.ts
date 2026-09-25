import type {
	AuthResponse,
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
import * as SecureStore from "expo-secure-store";
import { getApiBaseUrl } from "./config";

export { getApiBaseUrl, getApiBaseUrlForDisplay } from "./config";

const TOKEN_KEY = "chess_session_token";

let cachedToken: string | null | undefined;

export async function loadAuthToken(): Promise<string | null> {
	if (cachedToken !== undefined) return cachedToken;
	try {
		cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
	} catch {
		cachedToken = null;
	}
	return cachedToken;
}

export async function saveAuthToken(token: string | null): Promise<void> {
	cachedToken = token;
	try {
		if (token) {
			await SecureStore.setItemAsync(TOKEN_KEY, token);
		} else {
			await SecureStore.deleteItemAsync(TOKEN_KEY);
		}
	} catch {
		// SecureStore is unavailable (e.g. restricted device); the in-memory
		// token still authenticates requests for the life of the session.
	}
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
	const token = await loadAuthToken();
	const response = await fetch(`${getApiBaseUrl()}${path}`, {
		headers: {
			"Content-Type": "application/json",
			...(token ? { Cookie: `better-auth.session_token=${token}` } : {}),
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

export async function signIn(email: string, password: string): Promise<AuthResponse> {
	const data = await apiRequest<AuthResponse>("/api/auth/sign-in", {
		method: "POST",
		body: JSON.stringify({ email, password }),
	});
	await saveAuthToken(data.session.token);
	return data;
}

export async function signUp(email: string, password: string, name: string): Promise<AuthResponse> {
	const data = await apiRequest<AuthResponse>("/api/auth/sign-up", {
		method: "POST",
		body: JSON.stringify({ email, password, name }),
	});
	await saveAuthToken(data.session.token);
	return data;
}

export async function signOut(): Promise<void> {
	try {
		await apiRequest("/api/auth/sign-out", { method: "POST" });
	} catch {
		// Signing out is best-effort; the local token is cleared regardless.
	}
	await saveAuthToken(null);
}

export function getSession(): Promise<AuthResponse | null> {
	return apiRequest<AuthResponse>("/api/auth/get-session").catch(() => null);
}
