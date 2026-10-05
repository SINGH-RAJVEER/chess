import { ArchiveSync, ComputerGame, moveLatency, type LocalEngine } from "@sixtyfour/types";
import { WorkerEngine } from "../../../../libs/types/src/worker-engine";
import { apiUrl } from "./api-base";

window.sixtyfourLatency = moveLatency;

function createEngine(): LocalEngine {
	const native = window.sixtyfourDesktop?.engine;
	if (native) return {
		prepare: (opponent) => native.prepare(opponent),
		search: async (request, signal) => {
			if (signal.aborted) throw new Error("Search cancelled");
			const cancel = () => { void native.cancel(); };
			signal.addEventListener("abort", cancel, { once: true });
			try { return await native.search(request); } finally { signal.removeEventListener("abort", cancel); }
		},
		reset: () => { void native.reset(); },
		dispose: () => { void native.cancel(); },
	};
	return new WorkerEngine((stockfish) => new Worker(`/engines/${stockfish ? "stockfish-18-lite-single.js" : "classical-worker.js"}`));
}

export function createComputerGame(onError: (error: Error) => void) {
	const archive = new ArchiveSync(async (value) => {
		const response = await fetch(apiUrl("/api/computer-games"), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: value, signal: AbortSignal.timeout(5000) });
		if (!response.ok) throw new Error("Archive synchronization failed");
	});
	const game = new ComputerGame(createEngine(), {
		read: async () => localStorage.getItem("sixtyfour_local_computer_game"),
		write: async (value) => { localStorage.setItem("sixtyfour_local_computer_game", value); archive.update(value); },
	}, onError);
	return { game, archive };
}
