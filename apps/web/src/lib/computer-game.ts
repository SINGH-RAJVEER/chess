import { ArchiveSync, ComputerGame, type LocalEngine, moveLatency } from "@sixtyfour/types";
import { WorkerEngine } from "../../../../libs/types/src/worker-engine";
import { apiUrl } from "./api-base";

window.sixtyfourLatency = moveLatency;

function createEngine(): LocalEngine {
	const native = window.sixtyfourDesktop?.engine;
	if (native)
		return {
			prepare: (opponent) => native.prepare(opponent),
			search: async (request, signal) => {
				if (signal.aborted) throw new Error("Search cancelled");
				const cancel = () => {
					void native.cancel().catch(() => {});
				};
				signal.addEventListener("abort", cancel, { once: true });
				try {
					return await native.search(request);
				} finally {
					signal.removeEventListener("abort", cancel);
				}
			},
			reset: () => {
				void native.reset().catch(() => {});
			},
			dispose: () => {
				void native.cancel().catch(() => {});
			},
		};
	return new WorkerEngine(
		(stockfish) =>
			new Worker(
				`/engines/${stockfish ? "stockfish-18-lite-single.js" : "classical-worker.js"}`,
			),
	);
}

export function createComputerGame(onError: (error: Error) => void) {
	const archive = new ArchiveSync(async (value) => {
		const response = await fetch(apiUrl("/api/computer-games"), {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: value,
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) throw new Error("Archive synchronization failed");
	});
	const game = new ComputerGame(
		createEngine(),
		{
			read: async () => {
				const value = localStorage.getItem("sixtyfour_local_computer_game");
				if (value) archive.update(value);
				return value;
			},
			write: async (value) => {
				localStorage.setItem("sixtyfour_local_computer_game", value);
				archive.update(value);
			},
		},
		onError,
	);
	let account: string | null = null;
	let generation = 0;
	async function synchronize(userID: string | null) {
		if (account === userID) return;
		account = userID;
		const current = ++generation;
		archive.setEnabled(false);
		if (!userID) return;
		const initial = await game.request({ type: "board.get" });
		if (initial.type === "game.state" && initial.board.moveCount === 0) {
			try {
				const response = await fetch(apiUrl("/api/computer-games/latest"), {
					credentials: "include",
					signal: AbortSignal.timeout(5000),
				});
				const value = response.ok ? await response.json() : null;
				if (value && current === generation)
					await game.restoreArchive(JSON.stringify(value), initial.board);
			} catch {
				/* The local game remains available offline. */
			}
		}
		if (current === generation) archive.setEnabled(true);
	}
	return { game, archive, synchronize };
}
