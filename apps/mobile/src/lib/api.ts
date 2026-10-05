import type { AuthResponse } from "@sixtyfour/types";
import * as SecureStore from "expo-secure-store";
import { getApiBaseUrl } from "./config";

export { getApiBaseUrl, getApiBaseUrlForDisplay } from "./config";

const TOKEN_KEY = "sixtyfour_session_token";

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
