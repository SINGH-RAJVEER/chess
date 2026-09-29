import { describe, expect, test } from "bun:test";
import type { BoardPiece, BoardResponse } from "@chess/types";
import {
	buildCapturedPieceEntries,
	formatGameTime,
	getClockTime,
	getPreviewPieces,
} from "./game-utils";

function board(overrides: Partial<BoardResponse> = {}): BoardResponse {
	return {
		id: 1,
		pieces: [],
		capturedPieces: { white: [], black: [] },
		moves: [],
		turn: "White",
		status: "Ongoing",
		mode: "vs_player",
		timeControl: 10,
		increment: 0,
		whiteTimeRemaining: 600000,
		blackTimeRemaining: 600000,
		lastMoveTime: null,
		lastMove: null,
		serverTime: 0,
		isCheck: false,
		drawOfferedBy: null,
		moveCount: 0,
		halfMoveClock: 0,
		...overrides,
	};
}

describe("buildCapturedPieceEntries", () => {
	test("keys repeat captures of the same piece distinctly", () => {
		expect(buildCapturedPieceEntries(["Pawn", "Pawn", "Queen"])).toEqual([
			{ key: "Pawn-1", piece: "Pawn" },
			{ key: "Pawn-2", piece: "Pawn" },
			{ key: "Queen-1", piece: "Queen" },
		]);
	});

	test("missing input yields no entries", () => {
		expect(buildCapturedPieceEntries(undefined)).toEqual([]);
	});
});

describe("getPreviewPieces", () => {
	const pieces: BoardPiece[] = [
		{ color: "White", piece_type: "Pawn", square: 52 },
		{ color: "Black", piece_type: "Pawn", square: 12 },
		{ color: "White", piece_type: "King", square: 60 },
		{ color: "White", piece_type: "Rook", square: 63 },
	];

	test("no pending move returns the pieces untouched", () => {
		expect(getPreviewPieces(pieces, null)).toBe(pieces);
		expect(getPreviewPieces(undefined, null)).toEqual([]);
	});

	test("a normal move slides the piece and removes captures", () => {
		const preview = getPreviewPieces(pieces, { from: 52, to: 36 });
		expect(preview.find((p) => p.square === 36)?.piece_type).toBe("Pawn");
		expect(preview.find((p) => p.square === 52)).toBeUndefined();
	});

	test("a capture removes the victim", () => {
		const preview = getPreviewPieces(pieces, { from: 52, to: 44 });
		expect(preview.find((p) => p.square === 44)?.color).toBe("White");
	});

	test("kingside castle moves king and rook", () => {
		const preview = getPreviewPieces(pieces, { from: 60, to: 62 });
		expect(preview.find((p) => p.piece_type === "King")?.square).toBe(62);
		expect(preview.find((p) => p.piece_type === "Rook")?.square).toBe(61);
	});

	test("queenside castle moves king and rook", () => {
		const kingside = pieces.filter((p) => p.square !== 63);
		const queenside: BoardPiece[] = [
			...kingside,
			{ color: "White", piece_type: "Rook", square: 56 },
		];
		const preview = getPreviewPieces(queenside, { from: 60, to: 58 });
		expect(preview.find((p) => p.piece_type === "King")?.square).toBe(58);
		expect(preview.find((p) => p.piece_type === "Rook")?.square).toBe(59);
	});
});

describe("getClockTime", () => {
	test("missing board reads zero", () => {
		expect(getClockTime(null, "White", 1000)).toBe(0);
	});

	test("untimed games never run out", () => {
		expect(getClockTime(board({ timeControl: 0 }), "White", 10 ** 15)).toBe(
			Number.MAX_SAFE_INTEGER,
		);
	});

	test("the side to move counts down while the other side holds still", () => {
		const data = board({ lastMoveTime: 900, whiteTimeRemaining: 600000 });
		expect(getClockTime(data, "White", 1000)).toBe(599900);
		expect(getClockTime(data, "Black", 1000)).toBe(600000);
	});

	test("clocks floor at zero and ignore finished games", () => {
		const data = board({ lastMoveTime: 0, whiteTimeRemaining: 500 });
		expect(getClockTime(data, "White", 10000)).toBe(0);
		const finished = board({ status: "Checkmate", lastMoveTime: 0, whiteTimeRemaining: 500 });
		expect(getClockTime(finished, "White", 10000)).toBe(500);
	});
});

describe("formatGameTime", () => {
	test("clockless games show infinity", () => {
		expect(formatGameTime(0, false)).toBe("∞");
	});

	test("formats minutes and zero-padded seconds", () => {
		expect(formatGameTime(600000, true)).toBe("10:00");
		expect(formatGameTime(61000, true)).toBe("1:01");
		expect(formatGameTime(9000, true)).toBe("0:09");
		expect(formatGameTime(-5000, true)).toBe("0:00");
	});
});
