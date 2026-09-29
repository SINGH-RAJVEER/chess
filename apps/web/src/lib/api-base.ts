declare global {
	interface Window {
		__TAURI_INTERNALS__?: unknown;
	}
}

export type ApiBaseEnv = {
	VITE_API_BASE_URL?: string;
	VITE_DESKTOP_API_URL?: string;
};

function stripSlashes(value: string): string {
	return value.trim().replace(/\/+$/, "");
}

/**
 * Pure core: explicit base wins everywhere, otherwise the packaged desktop
 * shell talks directly to the local API while the browser stays same-origin
 * behind its reverse proxy. One dist serves both.
 */
export function resolveApiBaseUrl(
	env: ApiBaseEnv,
	isTauri: boolean,
): string {
	const configured = env.VITE_API_BASE_URL?.trim();
	if (configured) return stripSlashes(configured);
	if (isTauri) {
		const desktop = env.VITE_DESKTOP_API_URL?.trim();
		return desktop ? stripSlashes(desktop) : "http://127.0.0.1:4000";
	}
	return "";
}

export function resolveWsUrl(apiBase: string, protocol: string, host: string): string {
	if (apiBase) return `${apiBase.replace(/^http/, "ws")}/api/ws`;
	const socketProtocol = protocol === "https:" ? "wss:" : "ws:";
	return `${socketProtocol}//${host}/api/ws`;
}

function isTauri(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function getApiBaseUrl(): string {
	const env = import.meta.env;
	return resolveApiBaseUrl(
		{
			VITE_API_BASE_URL: env.VITE_API_BASE_URL as string | undefined,
			VITE_DESKTOP_API_URL: env.VITE_DESKTOP_API_URL as string | undefined,
		},
		isTauri(),
	);
}

export function apiUrl(path: string): string {
	return `${getApiBaseUrl()}${path}`;
}

export function getWsUrl(): string {
	return resolveWsUrl(getApiBaseUrl(), window.location.protocol, window.location.host);
}
