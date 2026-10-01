import { describe, expect, test } from "bun:test";
import type { PieceType } from "./chess";
import {
	DEFAULT_STOCKFISH_LEVEL,
	PIECE_VALUES,
	parseComputerOpponent,
	parseStockfishLevel,
} from "./chess";

describe("PIECE_VALUES", () => {
	test("values every piece type", () => {
		const types: PieceType[] = ["Pawn", "Knight", "Bishop", "Rook", "Queen", "King"];
		for (const type of types) {
			expect(typeof PIECE_VALUES[type]).toBe("number");
		}
		expect(Object.keys(PIECE_VALUES).sort()).toEqual([...types].sort());
	});
});

describe("computer opponent parsing", () => {
	test("keeps known opponents and maps legacy dqn to custom", () => {
		expect(parseComputerOpponent("stockfish")).toBe("stockfish");
		expect(parseComputerOpponent("dqn")).toBe("custom");
		expect(parseComputerOpponent(null)).toBe("minimax");
	});

	test("accepts levels 1-8 and falls back to the default", () => {
		expect(parseStockfishLevel("7")).toBe(7);
		expect(parseStockfishLevel(9)).toBe(DEFAULT_STOCKFISH_LEVEL);
		expect(parseStockfishLevel(undefined)).toBe(DEFAULT_STOCKFISH_LEVEL);
	});
});
