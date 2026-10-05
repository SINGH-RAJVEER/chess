import { describe, expect, test } from "bun:test";
import { ComputerGame, type EngineReply, type EngineRequest, type LocalEngine } from "./computer-game";

class TestEngine implements LocalEngine {
	resolve: ((reply: EngineReply) => void) | null = null;
	signal: AbortSignal | null = null;
	request: EngineRequest | null = null;
	async prepare() {}
	search(request: EngineRequest, signal: AbortSignal) {
		this.request = request; this.signal = signal;
		return new Promise<EngineReply>((resolve) => { this.resolve = resolve; });
	}
	reset() {}
	dispose() {}
}
async function setup(moves: string[] = []) {
	const engine = new TestEngine();
	let saved = JSON.stringify({ version: 1, id: 1, revision: moves.length, moves, opponent: "minimax", level: 4 });
	const errors: string[] = [];
	const game = new ComputerGame(engine, { read: async () => saved, write: async (value) => { saved = value; } }, (error) => errors.push(error.message));
	game.connect(); await game.request({ type: "board.get" }); await Promise.resolve();
	return { game, engine, errors, saved: () => JSON.parse(saved) };
}
describe("local computer games", () => {
	test("commits the human move immediately and validates the engine reply", async () => {
		const { game, engine, saved } = await setup();
		expect(game.board().legalMoves?.[52]).toContain(36);
		await game.request({ type: "game.move", gameId: 1, from: 52, to: 36 });
		expect(game.board().turn).toBe("Black");
		expect(game.board().moveCount).toBe(1);
		engine.resolve?.({ move: "e7e5", elapsedMs: 500 });
		await Bun.sleep(0);
		expect(game.board().turn).toBe("White");
		expect(saved().moves).toEqual(["e4", "e5"]);
		game.disconnect();
	});
	test("undo cancels search and discards its delayed result", async () => {
		const { game, engine } = await setup();
		await game.request({ type: "game.move", gameId: 1, from: 52, to: 36 });
		await game.request({ type: "game.undo.request", gameId: 1 });
		expect(engine.signal?.aborted).toBe(true);
		engine.resolve?.({ move: "e7e5", elapsedMs: 500 }); await Bun.sleep(0);
		expect(game.board().moveCount).toBe(0);
		expect(game.board().turn).toBe("White");
		game.disconnect();
	});
	test("restores en passant and castling rights from move history", async () => {
		const { game } = await setup(["e4", "a6", "e5", "d5"]);
		expect(game.board().legalMoves?.[28]).toContain(19);
		await game.request({ type: "game.move", gameId: 1, from: 28, to: 19 });
		expect(game.board().capturedPieces.black).toEqual(["Pawn"]);
		expect(game.board().pieces.some((piece) => piece.square === 27)).toBe(false);
		game.disconnect();
	});
	test("illegal engine moves cannot mutate the board", async () => {
		const { game, engine, errors } = await setup();
		await game.request({ type: "game.move", gameId: 1, from: 52, to: 36 });
		engine.resolve?.({ move: "e7e1", elapsedMs: 500 }); await Bun.sleep(0);
		expect(game.board().moveCount).toBe(1);
		expect(errors.length).toBe(1);
		game.disconnect();
	});
	test("resumes a pending computer move after restart", async () => {
		const { game, engine } = await setup(["e4"]);
		expect(engine.request?.fen).toContain(" b ");
		engine.resolve?.({ move: "e7e5", elapsedMs: 500 }); await Bun.sleep(0);
		expect(game.board().moveCount).toBe(2);
		game.disconnect();
	});
});
