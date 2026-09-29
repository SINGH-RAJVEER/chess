import { describe, expect, test } from "bun:test";
import {
	BOARD_THEMES,
	calculateMaterialAdvantage,
	getFileLabel,
	getPieceImageUrl,
	getPieceUnicode,
	getRankLabel,
	getSquareColor,
} from "./themes";

describe("getPieceUnicode", () => {
	test("covers all twelve piece colors", () => {
		expect(getPieceUnicode("White", "King")).toBe("♔");
		expect(getPieceUnicode("White", "Pawn")).toBe("♙");
		expect(getPieceUnicode("Black", "King")).toBe("♚");
		expect(getPieceUnicode("Black", "Pawn")).toBe("♟");
	});
});

describe("getPieceImageUrl", () => {
	test("points at the theme directory with color and piece codes", () => {
		expect(getPieceImageUrl("cburnett", "White", "Knight")).toBe(
			"https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/wN.svg",
		);
		expect(getPieceImageUrl("cburnett", "Black", "Queen")).toContain("/bQ.svg");
	});
});

describe("getSquareColor", () => {
	const theme = BOARD_THEMES.green;

	test("a1 is dark and h1 is light", () => {
		expect(getSquareColor(theme, 7, 0)).toBe(theme.dark);
		expect(getSquareColor(theme, 7, 7)).toBe(theme.light);
	});

	test("check beats selection beats last move", () => {
		const all = { isCheck: true, isSelected: true, isLastMove: true };
		expect(getSquareColor(theme, 0, 0, all)).toBe(theme.checkColor);
		expect(getSquareColor(theme, 0, 0, { isSelected: true, isLastMove: true })).toBe(
			theme.selectedLight,
		);
		expect(getSquareColor(theme, 0, 1, { isSelected: true, isLastMove: true })).toBe(
			theme.selectedDark,
		);
		expect(getSquareColor(theme, 0, 0, { isLastMove: true })).toBe(theme.lastMoveLight);
	});
});

describe("board labels", () => {
	test("files and ranks map the edges", () => {
		expect(getFileLabel(0)).toBe("a");
		expect(getFileLabel(7)).toBe("h");
		expect(getRankLabel(0)).toBe("8");
		expect(getRankLabel(7)).toBe("1");
	});

	test("out-of-range indexes label nothing", () => {
		expect(getFileLabel(8)).toBe("");
		expect(getRankLabel(-1)).toBe("");
	});
});

describe("calculateMaterialAdvantage", () => {
	test("scores captures from White's perspective", () => {
		expect(calculateMaterialAdvantage({ white: [], black: [] })).toBe(0);
		expect(calculateMaterialAdvantage({ white: [], black: ["Queen"] })).toBe(9);
		expect(calculateMaterialAdvantage({ white: ["Rook"], black: [] })).toBe(-5);
		expect(calculateMaterialAdvantage({ white: ["Pawn"], black: ["Knight", "Pawn"] })).toBe(3);
	});
});
