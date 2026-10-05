import type { ComputerOpponent } from "./chess";
import type { EngineReply, EngineRequest, LocalEngine } from "./computer-game";

/** Small worker contract usable by browsers and mobile WebViews. */
export interface EngineWorker {
	postMessage(message: unknown): void;
	terminate(): void;
	onmessage: { handler(event: { data: unknown }): void }["handler"] | null;
	onerror: { handler(event: { message: string }): void }["handler"] | null;
}
type Pending = { resolve: (reply: EngineReply) => void; reject: (error: Error) => void; started: number; cleanup: () => void };
type State = { worker: EngineWorker; ready: Promise<void>; pending: Pending | null; rejectReady: (error: Error) => void; readyTimer: ReturnType<typeof setTimeout> };

export class WorkerEngine implements LocalEngine {
	private states = new Map<string, State>();
	constructor(private createWorker: (stockfish: boolean) => EngineWorker) {}
	private key(opponent: ComputerOpponent) { return opponent === "stockfish" ? "stockfish" : "classical"; }
	async prepare(opponent: ComputerOpponent) {
		const key = this.key(opponent);
		let state = this.states.get(key);
		if (state) return state.ready;
		const worker = this.createWorker(key === "stockfish");
		let resolveReady = () => {};
		let rejectReady = (_error: Error) => {};
		const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
		const fail = (error: Error) => {
			if (!state || this.states.get(key) !== state) return;
			clearTimeout(state.readyTimer); state.rejectReady(error);
			state.pending?.cleanup(); state.pending?.reject(error);
			state.worker.terminate(); this.states.delete(key);
		};
		state = { worker, ready, pending: null, rejectReady, readyTimer: setTimeout(() => fail(new Error("Engine initialization timed out")), 15000) };
		this.states.set(key, state);
		worker.onerror = (event) => fail(new Error(event.message));
		worker.onmessage = (event) => {
			if (typeof event.data === "string") {
				if (event.data === "uciok") { worker.postMessage("setoption name Threads value 1"); worker.postMessage("setoption name Hash value 16"); worker.postMessage("isready"); }
				if (event.data === "readyok") { clearTimeout(state.readyTimer); resolveReady(); }
				if (event.data.startsWith("bestmove ") && state.pending) {
					const pending = state.pending; state.pending = null; pending.cleanup();
					pending.resolve({ move: event.data.split(" ")[1], elapsedMs: performance.now() - pending.started });
				}
			} else {
				const message = event.data as { type: string; move: string; elapsedMs: number; error?: string };
				if (message.type === "ready") { clearTimeout(state.readyTimer); resolveReady(); }
				if (message.type === "error") { fail(new Error(message.error)); return; }
				if (message.type === "result" && state.pending) {
					const pending = state.pending; state.pending = null; pending.cleanup();
					pending.resolve({ move: message.move, elapsedMs: message.elapsedMs });
				}
			}
		};
		if (key === "stockfish") worker.postMessage("uci");
		return ready;
	}
	async search(request: EngineRequest, signal: AbortSignal): Promise<EngineReply> {
		await this.prepare(request.opponent);
		if (signal.aborted) throw new Error("Search cancelled");
		const key = this.key(request.opponent);
		const state = this.states.get(key);
		if (!state) throw new Error("Engine unavailable");
		if (state.pending) throw new Error("Engine busy");
		return new Promise((resolve, reject) => {
			const cancel = () => {
				state.pending?.cleanup(); state.pending = null;
				state.worker.terminate(); this.states.delete(key); reject(new Error("Search cancelled"));
			};
			const timer = setTimeout(cancel, 3000);
			state.pending = { resolve, reject, started: performance.now(), cleanup: () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); } };
			signal.addEventListener("abort", cancel, { once: true });
			if (key === "stockfish") {
				state.worker.postMessage(`setoption name Skill Level value ${[0, 2, 5, 8, 11, 14, 17, 20][request.level - 1]}`);
				state.worker.postMessage(`position fen ${request.fen}`);
				state.worker.postMessage("go movetime 500");
			} else state.worker.postMessage({ type: "search", ...request });
		});
	}
	reset() {
		for (const [key, state] of this.states) {
			state.worker.postMessage(key === "stockfish" ? "ucinewgame" : { type: "reset" });
		}
	}
	dispose() {
		for (const state of this.states.values()) {
			clearTimeout(state.readyTimer); state.rejectReady(new Error("Engine closed"));
			state.pending?.cleanup(); state.pending?.reject(new Error("Engine closed")); state.worker.terminate();
		}
		this.states.clear();
	}
}
