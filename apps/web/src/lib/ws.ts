import {
	type BoardResponse,
	RemoteMoveTracker,
	type WsClientMessage,
	type WsServerMessage,
} from "@sixtyfour/types";
import { getWsUrl } from "./api-base";

export type SocketStatus = "idle" | "connecting" | "open" | "reconnecting";

type StatusListener = (status: SocketStatus) => void;

type PendingEntry = {
	resolve: (msg: WsServerMessage) => void;
	reject: (err: Error) => void;
	timer: number;
};

type OpenWaiter = {
	timer: number;
	unsubscribe: () => void;
	reject: (err: Error) => void;
};

function nextId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type ClientMessageWithoutId<T extends WsClientMessage = WsClientMessage> = T extends unknown
	? Omit<T, "id"> & { id?: string }
	: never;

/**
 * Single shared socket for all live game traffic. Requests carry an id
 * and resolve when the matching reply arrives; server pushes (game.state,
 * queue.status, presence, offers) are fanned out to subscribers.
 * Reconnects with backoff and re-authenticates over the session cookie.
 */
class GameSocket {
	private tracker = new RemoteMoveTracker();
	markRendered(board: BoardResponse) {
		this.tracker.markRendered(board);
	}
	private ws: WebSocket | null = null;
	private pending = new Map<string, PendingEntry>();
	private openWaiters = new Set<OpenWaiter>();
	private handlers = new Set<(msg: WsServerMessage) => void>();
	private statusListeners = new Set<StatusListener>();
	private status: SocketStatus = "idle";
	private shouldRun = false;
	private reconnectTimer = 0;
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
			(this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING)
		) {
			return;
		}
		this.shouldRun = true;
		this.open();
	}

	disconnect() {
		this.shouldRun = false;
		window.clearTimeout(this.reconnectTimer);
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
			window.clearTimeout(entry.timer);
			entry.reject(new Error("Socket disconnected"));
		}
		this.pending.clear();
		for (const waiter of this.openWaiters) {
			window.clearTimeout(waiter.timer);
			waiter.unsubscribe();
			waiter.reject(new Error("Socket disconnected"));
		}
		this.openWaiters.clear();
	}

	/**
	 * Resolves once the socket is open. Pages fire their first request
	 * immediately after connect(), while the handshake is still in flight;
	 * waiting here instead of rejecting fixes that race on every page load.
	 */
	private waitForOpen(): Promise<void> {
		if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
		if (!this.shouldRun) return Promise.reject(new Error("Socket is not connected"));
		return new Promise((resolve, reject) => {
			const waiter: OpenWaiter = { timer: 0, unsubscribe: () => {}, reject };
			waiter.timer = window.setTimeout(() => {
				this.openWaiters.delete(waiter);
				waiter.unsubscribe();
				reject(new Error("Socket did not connect in time"));
			}, 15000);
			waiter.unsubscribe = this.onStatus((status) => {
				if (status === "open" || status === "idle") {
					window.clearTimeout(waiter.timer);
					this.openWaiters.delete(waiter);
					waiter.unsubscribe();
					if (status === "open") resolve();
					else reject(new Error("Socket is not connected"));
				}
			});
			this.openWaiters.add(waiter);
		});
	}

	private open() {
		this.setStatus(this.reconnectAttempts === 0 ? "connecting" : "reconnecting");
		const ws = new WebSocket(getWsUrl());
		this.ws = ws;

		ws.onopen = () => {
			this.reconnectAttempts = 0;
			this.setStatus("open");
			this.request({ type: "hello" }).catch(() => undefined);
		};

		ws.onmessage = (event) => {
			let msg: WsServerMessage;
			try {
				msg = JSON.parse(event.data) as WsServerMessage;
			} catch {
				return;
			}
			if (msg.type === "game.state") msg = { ...msg, board: this.tracker.accept(msg.board) };
			if (msg.id && this.pending.has(msg.id)) {
				const entry = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				if (entry) {
					window.clearTimeout(entry.timer);
					if (msg.type === "error") {
						entry.reject(new Error(msg.message));
					} else {
						entry.resolve(msg);
					}
					return;
				}
			}
			if (msg.type === "error" && !msg.id) {
				console.error("Game socket error:", msg.message);
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
				window.clearTimeout(entry.timer);
				entry.reject(new Error("Socket reconnecting"));
			}
			this.pending.clear();
			this.reconnectAttempts += 1;
			const delay = Math.min(500 * this.reconnectAttempts, 5000);
			this.reconnectTimer = window.setTimeout(() => this.open(), delay);
		};
	}

	request(message: ClientMessageWithoutId): Promise<WsServerMessage> {
		const id = ("id" in message && message.id) || nextId();
		const payload = { ...message, id } as WsClientMessage;
		return (async () => {
			await this.waitForOpen();
			return new Promise<WsServerMessage>((resolve, reject) => {
				if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
					reject(new Error("Socket is not connected"));
					return;
				}
				const timer = window.setTimeout(() => {
					this.pending.delete(id);
					reject(new Error("Request timed out"));
				}, 15000);
				this.pending.set(id, {
					resolve,
					reject: (error) => {
						if (payload.type === "game.move") this.tracker.cancel(payload.gameId);
						reject(error);
					},
					timer,
				});
				try {
					if (payload.type === "game.move") this.tracker.begin(payload.gameId);
					this.ws.send(JSON.stringify(payload));
				} catch (error) {
					window.clearTimeout(timer);
					this.pending.delete(id);
					reject(error instanceof Error ? error : new Error("Send failed"));
				}
			});
		})();
	}

	/** Fire-and-forget for messages whose reply arrives as a push. */
	send(message: ClientMessageWithoutId) {
		this.request(message).catch(() => undefined);
	}
}

export const gameSocket = new GameSocket();

export function boardOf(msg: WsServerMessage) {
	return msg.type === "game.state" ? msg.board : null;
}
