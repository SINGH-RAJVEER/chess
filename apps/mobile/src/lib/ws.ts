import type { WsClientMessage, WsServerMessage } from "@chess/types";
import { getApiBaseUrl, loadAuthToken } from "./api";

export type SocketStatus = "idle" | "connecting" | "open" | "reconnecting";

type PendingEntry = {
	resolve: (msg: WsServerMessage) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

function nextId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function wsUrl(token: string | null): string {
	const base = getApiBaseUrl().replace(/^http/, "ws");
	return token ? `${base}/api/ws?token=${encodeURIComponent(token)}` : `${base}/api/ws`;
}

type StatusListener = (status: SocketStatus) => void;
type ClientMessageWithoutId<T extends WsClientMessage = WsClientMessage> = T extends unknown
	? Omit<T, "id"> & { id?: string }
	: never;

/**
 * Shared socket for mobile game traffic. Authenticates with the stored
 * session token (SecureStore) since RN has no cookie jar, reconnects with
 * backoff when the app backgrounds or the network drops.
 */
class GameSocket {
	private ws: WebSocket | null = null;
	private pending = new Map<string, PendingEntry>();
	private handlers = new Set<(msg: WsServerMessage) => void>();
	private statusListeners = new Set<StatusListener>();
	private status: SocketStatus = "idle";
	private shouldRun = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectAttempts = 0;

	getStatus(): SocketStatus {
		return this.status;
	}

	onStatus(listener: StatusListener): () => void {
		this.statusListeners.add(listener);
		listener(this.status);
		return () => {
			this.statusListeners.delete(listener);
		};
	}

	private setStatus(status: SocketStatus) {
		this.status = status;
		for (const listener of this.statusListeners) {
			try {
				listener(status);
			} catch {
				// Listener errors must not break the socket.
			}
		}
	}

	subscribe(handler: (msg: WsServerMessage) => void): () => void {
		this.handlers.add(handler);
		return () => {
			this.handlers.delete(handler);
		};
	}

	connect() {
		if (
			this.shouldRun &&
			this.ws &&
			(this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
		) {
			return;
		}
		this.shouldRun = true;
		void this.open();
	}

	disconnect() {
		this.shouldRun = false;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
		this.reconnectAttempts = 0;
		if (this.ws) {
			try {
				this.ws.close();
			} catch {
				// Closing a broken socket is best-effort.
			}
			this.ws = null;
		}
		this.setStatus("idle");
		for (const [, entry] of this.pending) {
			clearTimeout(entry.timer);
			entry.reject(new Error("Socket disconnected"));
		}
		this.pending.clear();
	}

	private async open() {
		this.setStatus(this.reconnectAttempts === 0 ? "connecting" : "reconnecting");
		const token = await loadAuthToken().catch(() => null);
		const ws = new WebSocket(wsUrl(token));

		ws.onopen = () => {
			this.reconnectAttempts = 0;
			this.setStatus("open");
			this.request({ type: "hello", token: token ?? undefined }).catch(() => undefined);
		};

		ws.onmessage = (event) => {
			let msg: WsServerMessage;
			try {
				msg = JSON.parse(String(event.data)) as WsServerMessage;
			} catch {
				return;
			}
			if (msg.id && this.pending.has(msg.id)) {
				const entry = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				if (entry) {
					clearTimeout(entry.timer);
					if (msg.type === "error") {
						entry.reject(new Error(msg.message));
					} else {
						entry.resolve(msg);
					}
					return;
				}
			}
			for (const handler of this.handlers) {
				try {
					handler(msg);
				} catch (error) {
					console.error("Game socket handler failed:", error);
				}
			}
		};

		ws.onerror = () => {
			try {
				ws.close();
			} catch {
				// The close handler drives the reconnect.
			}
		};

		ws.onclose = () => {
			if (this.ws !== ws) return;
			this.ws = null;
			if (!this.shouldRun) {
				this.setStatus("idle");
				return;
			}
			this.setStatus("reconnecting");
			for (const [, entry] of this.pending) {
				clearTimeout(entry.timer);
				entry.reject(new Error("Socket reconnecting"));
			}
			this.pending.clear();
			this.reconnectAttempts += 1;
			const delay = Math.min(500 * this.reconnectAttempts, 5000);
			this.reconnectTimer = setTimeout(() => void this.open(), delay);
		};

		this.ws = ws;
	}

	request(message: ClientMessageWithoutId): Promise<WsServerMessage> {
		const id = ("id" in message && message.id) || nextId();
		const payload = { ...message, id } as WsClientMessage;
		return new Promise((resolve, reject) => {
			if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
				reject(new Error("Socket is not connected"));
				return;
			}
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error("Request timed out"));
			}, 15000);
			this.pending.set(id, { resolve, reject, timer });
			try {
				this.ws.send(JSON.stringify(payload));
			} catch (error) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(error instanceof Error ? error : new Error("Send failed"));
			}
		});
	}
}

export const gameSocket = new GameSocket();
