declare global {
	interface Window {
		sixtyfourLatency?: import("@sixtyfour/types").MoveLatency;
		sixtyfourDesktop?: {
			close: () => void;
			engine?: {
				prepare: (opponent: import("@sixtyfour/types").ComputerOpponent) => Promise<void>;
				search: (request: import("@sixtyfour/types").EngineRequest) => Promise<import("@sixtyfour/types").EngineReply>;
				reset: () => Promise<void>;
				cancel: () => Promise<void>;
			};
		};
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
export function resolveApiBaseUrl(env: ApiBaseEnv, isDesktop: boolean): string {
	const configured = env.VITE_API_BASE_URL?.trim();
	if (configured) return stripSlashes(configured);
	if (isDesktop) {
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

function isDesktopRuntime(): boolean {
	return typeof window !== "undefined" && "sixtyfourDesktop" in window;
}

/** True inside the packaged Electron shell; the browser stays same-origin. */
export function isDesktop(): boolean {
	return isDesktopRuntime();
}

export function getApiBaseUrl(): string {
	const env = import.meta.env;
	return resolveApiBaseUrl(
		{
			VITE_API_BASE_URL: env.VITE_API_BASE_URL as string | undefined,
			VITE_DESKTOP_API_URL: env.VITE_DESKTOP_API_URL as string | undefined,
		},
		isDesktopRuntime(),
	);
}

export function apiUrl(path: string): string {
	return `${getApiBaseUrl()}${path}`;
}

export function getWsUrl(): string {
	return resolveWsUrl(getApiBaseUrl(), window.location.protocol, window.location.host);
}
