import { describe, expect, test } from "bun:test";
import { getPieceUnicode, promotionChoices, squareCol, squareLabel, squareRow } from "./pieces";

describe("getPieceUnicode", () => {
	test("covers all twelve piece colors", () => {
		expect(getPieceUnicode("White", "King")).toBe("♔");
		expect(getPieceUnicode("White", "Queen")).toBe("♕");
		expect(getPieceUnicode("White", "Rook")).toBe("♖");
		expect(getPieceUnicode("White", "Bishop")).toBe("♗");
		expect(getPieceUnicode("White", "Knight")).toBe("♘");
		expect(getPieceUnicode("White", "Pawn")).toBe("♙");
		expect(getPieceUnicode("Black", "King")).toBe("♚");
		expect(getPieceUnicode("Black", "Queen")).toBe("♛");
		expect(getPieceUnicode("Black", "Rook")).toBe("♜");
		expect(getPieceUnicode("Black", "Bishop")).toBe("♝");
		expect(getPieceUnicode("Black", "Knight")).toBe("♞");
		expect(getPieceUnicode("Black", "Pawn")).toBe("♟");
	});
});

describe("square helpers", () => {
	test("row and column split the index", () => {
		expect([squareRow(0), squareCol(0)]).toEqual([0, 0]);
		expect([squareRow(63), squareCol(63)]).toEqual([7, 7]);
		expect([squareRow(52), squareCol(52)]).toEqual([6, 4]);
	});

	test("labels map the corners", () => {
		expect(squareLabel(0)).toBe("a8");
		expect(squareLabel(7)).toBe("h8");
		expect(squareLabel(56)).toBe("a1");
		expect(squareLabel(63)).toBe("h1");
		expect(squareLabel(52)).toBe("e2");
	});
});

describe("promotionChoices", () => {
	test("offers queen, rook, bishop, knight with matching glyphs", () => {
		const choices = promotionChoices("White");
		expect(choices.map((choice) => choice.type)).toEqual(["Queen", "Rook", "Bishop", "Knight"]);
		for (const choice of choices) {
			expect(choice.glyph).toBe(getPieceUnicode("White", choice.type));
		}
		expect(promotionChoices("Black")[0]?.glyph).toBe(getPieceUnicode("Black", "Queen"));
	});
});
