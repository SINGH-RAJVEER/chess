import {
	ArchiveSync,
	ComputerGame,
	type ComputerOpponent,
	type EngineReply,
	type EngineRequest,
	type LocalEngine,
} from "@sixtyfour/types";
import { File, Paths } from "expo-file-system";
import { getApiBaseUrl, loadAuthToken } from "./api";

export class MobileEngine implements LocalEngine {
	private inject: ((script: string) => void) | null = null;
	private ready: Promise<void>;
	private resolveReady = () => {};
	private rejectReady = (_error: Error) => {};
	private nextId = 0;
	private pending = new Map<
		number,
		{
			resolve: (value: EngineReply) => void;
			reject: (error: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	constructor() {
		this.ready = new Promise((resolve, reject) => {
			this.resolveReady = resolve;
			this.rejectReady = reject;
		});
	}
	attach(inject: (script: string) => void) {
		this.inject = inject;
	}
	receive(data: string) {
		try {
			const message = JSON.parse(data);
			if (message.type === "ready") {
				this.resolveReady();
				return;
			}
			const pending = this.pending.get(message.id);
			if (!pending) return;
			clearTimeout(pending.timer);
			this.pending.delete(message.id);
			if (message.error) pending.reject(new Error(message.error));
			else pending.resolve(message.reply);
		} catch (error) {
			this.fail(error instanceof Error ? error : new Error(String(error)));
		}
	}
	fail(error: Error) {
		this.rejectReady(error);
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
	}
	private async request(message: Record<string, unknown>): Promise<EngineReply> {
		await this.ready;
		return new Promise((resolve, reject) => {
			const id = ++this.nextId;
			this.pending.set(id, {
				resolve,
				reject,
				timer: setTimeout(() => {
					this.pending.delete(id);
					reject(new Error("Engine request timed out"));
				}, 15000),
			});
			this.inject?.(
				`window.sixtyfourEngineRequest(${JSON.stringify({ ...message, id })}); true;`,
			);
		});
	}
	async prepare(opponent: ComputerOpponent) {
		await this.request({ type: "prepare", opponent });
	}
	async search(request: EngineRequest, signal: AbortSignal): Promise<EngineReply> {
		if (signal.aborted) throw new Error("Search cancelled");
		const cancel = () => this.dispose();
		signal.addEventListener("abort", cancel, { once: true });
		try {
			return await this.request({ type: "search", request });
		} finally {
			signal.removeEventListener("abort", cancel);
		}
	}
	reset() {
		void this.request({ type: "reset" }).catch(() => {});
	}
	dispose() {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(new Error("Search cancelled"));
		}
		this.pending.clear();
		this.inject?.(`window.sixtyfourEngineRequest({type:"cancel",id:0}); true;`);
	}
}

export function createComputerGame(engine: MobileEngine, onError: (error: Error) => void) {
	const archive = new ArchiveSync(async (value) => {
		const token = await loadAuthToken();
		if (!token) throw new Error("Sign in required");
		const response = await fetch(`${getApiBaseUrl()}/api/computer-games`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: `better-auth.session_token=${token}`,
			},
			body: value,
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) throw new Error("Archive synchronization failed");
	});
	const game = new ComputerGame(
		engine,
		{
			read: async () => {
				const file = new File(Paths.document, "computer-game.json");
				return file.exists ? file.text() : null;
			},
			write: async (value) => {
				new File(Paths.document, "computer-game.json").write(value);
				archive.update(value);
			},
		},
		onError,
	);
	return { game, archive };
}
