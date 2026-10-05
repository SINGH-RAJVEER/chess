import { expect, test } from "bun:test";
import { NativeEngine } from "./engine.cjs";

test("native engine reuses its process and honors a timed search", async () => {
	const engine = new NativeEngine("", false);
	try {
		await engine.prepare("minimax");
		const process = engine.workers.get("classical").process;
		for (const opponent of ["minimax", "custom"]) {
			const reply = await engine.search({ fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", opponent, level: 4 });
			expect(reply.move).toMatch(/^[a-h][1-8][a-h][1-8]/);
			expect(reply.elapsedMs).toBeLessThan(800);
			expect(engine.workers.get("classical").process.pid).toBe(process.pid);
		}
	} finally { engine.dispose(); }
});
