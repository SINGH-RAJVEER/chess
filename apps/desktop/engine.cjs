const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { delimiter, join } = require("node:path");

class NativeEngine {
	constructor(resources, packaged = false) {
		this.resources = resources;
		this.packaged = packaged;
		this.workers = new Map();
	}
	path(stockfish) {
		if (!this.packaged && (stockfish ? process.env.STOCKFISH_PATH : process.env.ENGINE_PATH))
			return stockfish ? process.env.STOCKFISH_PATH : process.env.ENGINE_PATH;
		const extension = process.platform === "win32" ? ".exe" : "";
		const root = this.packaged ? join(this.resources, "engines") : join(__dirname, "engines");
		const bundled = join(root, (stockfish ? "stockfish" : "sixtyfour-engine") + extension);
		if (existsSync(bundled)) return bundled;
		if (this.packaged) throw new Error("Bundled engine is missing");
		if (!stockfish)
			return join(__dirname, "../engine/target/release/sixtyfour-engine") + extension;
		for (const directory of (process.env.PATH || "").split(delimiter)) {
			if (directory.split(/[\\/]/).includes("node_modules")) continue;
			const candidate = join(directory, `stockfish${extension}`);
			if (existsSync(candidate)) return candidate;
		}
		throw new Error("Native Stockfish is not installed");
	}
	async prepare(opponent) {
		if (!["minimax", "custom", "stockfish"].includes(opponent))
			throw new Error("Invalid opponent");
		const key = opponent === "stockfish" ? "stockfish" : "classical";
		const existing = this.workers.get(key);
		if (existing) return existing.ready;
		const process = spawn(this.path(key === "stockfish"), [], {
			stdio: ["pipe", "pipe", "ignore"],
		});
		const state = { process, ready: null, pending: null, buffer: "", warming: true };
		this.workers.set(key, state);
		state.ready = new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => fail(new Error("Engine initialization timed out")),
				15000,
			);
			const fail = (error) => {
				clearTimeout(timer);
				reject(error);
				state.pending?.reject(error);
				state.pending?.cleanup();
				process.kill();
				if (this.workers.get(key) === state) this.workers.delete(key);
			};
			process.on("error", fail);
			process.on("exit", () => fail(new Error("Engine exited")));
			process.stdout.on("data", (chunk) => {
				state.buffer += chunk.toString();
				for (
					let index = state.buffer.indexOf("\n");
					index !== -1;
					index = state.buffer.indexOf("\n")
				) {
					const line = state.buffer.slice(0, index).trim();
					state.buffer = state.buffer.slice(index + 1);
					if (line === "uciok")
						process.stdin.write(
							"setoption name Threads value 1\nsetoption name Hash value 16\nisready\n",
						);
					if (line === "readyok") {
						if (state.warming)
							process.stdin.write("position startpos\ngo movetime 1\n");
					}
					if (line.startsWith("bestmove ") && state.warming) {
						state.warming = false;
						clearTimeout(timer);
						resolve();
						continue;
					}
					if (line.startsWith("bestmove ") && state.pending) {
						const pending = state.pending;
						state.pending = null;
						pending.cleanup();
						pending.resolve({
							move: line.split(" ")[1],
							elapsedMs: performance.now() - pending.started,
						});
					}
				}
			});
			process.stdin.on("error", fail);
			process.stdin.write("uci\n");
		});
		return state.ready;
	}
	async search(request) {
		const { fen, opponent, level } = request;
		if (
			typeof fen !== "string" ||
			fen.length > 200 ||
			/[\r\n]/.test(fen) ||
			fen.trim().split(/\s+/).length !== 6
		)
			throw new Error("Invalid position");
		await this.prepare(opponent);
		const state = this.workers.get(opponent === "stockfish" ? "stockfish" : "classical");
		if (!state || state.pending) throw new Error("Engine busy");
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.dispose();
				reject(new Error("Engine search timed out"));
			}, 3000);
			state.pending = {
				resolve,
				reject,
				started: performance.now(),
				cleanup: () => clearTimeout(timer),
			};
			const strength = Math.max(1, Math.min(8, Number(level) || 4));
			const option =
				opponent === "stockfish"
					? `setoption name Skill Level value ${[0, 2, 5, 8, 11, 14, 17, 20][strength - 1]}\n`
					: `setoption name Opponent value ${opponent}\n`;
			state.process.stdin.write(`${option}position fen ${fen}\ngo movetime 500\n`);
		});
	}
	reset() {
		for (const state of this.workers.values()) state.process.stdin.write("ucinewgame\n");
	}
	dispose() {
		for (const state of this.workers.values()) {
			state.pending?.cleanup();
			state.pending?.reject(new Error("Search cancelled"));
			state.process.kill();
		}
		this.workers.clear();
	}
}

module.exports = { NativeEngine };
