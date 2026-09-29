import { describe, expect, test } from "bun:test";
import type { PieceType } from "./chess";
import { PIECE_VALUES } from "./chess";

describe("PIECE_VALUES", () => {
	test("values every piece type", () => {
		const types: PieceType[] = ["Pawn", "Knight", "Bishop", "Rook", "Queen", "King"];
		for (const type of types) {
			expect(typeof PIECE_VALUES[type]).toBe("number");
		}
		expect(Object.keys(PIECE_VALUES).sort()).toEqual([...types].sort());
	});
});
