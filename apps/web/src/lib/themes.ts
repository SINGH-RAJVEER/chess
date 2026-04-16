import type { Color, PieceType } from "@chess/types";

export type BoardTheme = {
	name: string;
	light: string;
	dark: string;
	lastMoveLight: string;
	lastMoveDark: string;
	selectedLight: string;
	selectedDark: string;
	checkColor: string;
};

export type PieceTheme = {
	name: string;
	type: "svg" | "unicode";
};

export const BOARD_THEMES: Record<string, BoardTheme> = {
	green: {
		name: "Green",
		light: "#ffffdd",
		dark: "#86a666",
		lastMoveLight: "#f6f669",
		lastMoveDark: "#baca44",
		selectedLight: "#f6f669",
		selectedDark: "#baca44",
		checkColor: "#e04040",
	},
	brown: {
		name: "Brown",
		light: "#f0d9b5",
		dark: "#b58863",
		lastMoveLight: "#ced26b",
		lastMoveDark: "#aaa23a",
		selectedLight: "#ced26b",
		selectedDark: "#aaa23a",
		checkColor: "#e04040",
	},
	blue: {
		name: "Blue",
		light: "#dee3e6",
		dark: "#8ca2ad",
		lastMoveLight: "#c8d8a0",
		lastMoveDark: "#90a858",
		selectedLight: "#c8d8a0",
		selectedDark: "#90a858",
		checkColor: "#e04040",
	},
	purple: {
		name: "Purple",
		light: "#e8dff0",
		dark: "#9070a0",
		lastMoveLight: "#d0c0e0",
		lastMoveDark: "#7050a0",
		selectedLight: "#d0c0e0",
		selectedDark: "#7050a0",
		checkColor: "#e04040",
	},
	wood: {
		name: "Wood",
		light: "#e6c88c",
		dark: "#a67c52",
		lastMoveLight: "#d4c45c",
		lastMoveDark: "#918028",
		selectedLight: "#d4c45c",
		selectedDark: "#918028",
		checkColor: "#e04040",
	},
	grey: {
		name: "Grey",
		light: "#cccccc",
		dark: "#777777",
		lastMoveLight: "#c8d8a0",
		lastMoveDark: "#90a858",
		selectedLight: "#c8d8a0",
		selectedDark: "#90a858",
		checkColor: "#e04040",
	},
	ic: {
		name: "Tournament",
		light: "#ececec",
		dark: "#c1c18e",
		lastMoveLight: "#f2f27a",
		lastMoveDark: "#c8c840",
		selectedLight: "#f2f27a",
		selectedDark: "#c8c840",
		checkColor: "#e04040",
	},
	midnight: {
		name: "Midnight",
		light: "#465876",
		dark: "#2a3a50",
		lastMoveLight: "#546f9a",
		lastMoveDark: "#3a5070",
		selectedLight: "#546f9a",
		selectedDark: "#3a5070",
		checkColor: "#e04040",
	},
	coral: {
		name: "Coral",
		light: "#f2d1b5",
		dark: "#d08070",
		lastMoveLight: "#e8c070",
		lastMoveDark: "#c09040",
		selectedLight: "#e8c070",
		selectedDark: "#c09040",
		checkColor: "#e04040",
	},
};

export const PIECE_THEMES: Record<string, PieceTheme> = {
	cburnett: { name: "Cburnett", type: "svg" },
	merida: { name: "Merida", type: "svg" },
	alpha: { name: "Alpha", type: "svg" },
	california: { name: "California", type: "svg" },
	staunty: { name: "Staunty", type: "svg" },
	tatiana: { name: "Tatiana", type: "svg" },
	maestro: { name: "Maestro", type: "svg" },
	kosal: { name: "Kosal", type: "svg" },
	cardinal: { name: "Cardinal", type: "svg" },
	chessnut: { name: "Chessnut", type: "svg" },
	pixel: { name: "Pixel", type: "svg" },
	horsey: { name: "Horsey", type: "svg" },
	unicode: { name: "Unicode", type: "unicode" },
};

const PIECE_CHAR_MAP: Record<PieceType, string> = {
	King: "K",
	Queen: "Q",
	Rook: "R",
	Bishop: "B",
	Knight: "N",
	Pawn: "P",
};

const PIECE_UNICODE: Record<Color, Record<PieceType, string>> = {
	White: {
		Pawn: "\u2659",
		Knight: "\u2658",
		Bishop: "\u2657",
		Rook: "\u2656",
		Queen: "\u2655",
		King: "\u2654",
	},
	Black: {
		Pawn: "\u265F",
		Knight: "\u265E",
		Bishop: "\u265D",
		Rook: "\u265C",
		Queen: "\u265B",
		King: "\u265A",
	},
};

export function getPieceImageUrl(theme: string, color: Color, piece: PieceType): string {
	const colorChar = color === "White" ? "w" : "b";
	const pieceChar = PIECE_CHAR_MAP[piece];
	return `https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/${theme}/${colorChar}${pieceChar}.svg`;
}

export function getPieceUnicode(color: Color, piece: PieceType): string {
	return PIECE_UNICODE[color][piece];
}

export function getSquareColor(
	theme: BoardTheme,
	row: number,
	col: number,
	options?: {
		isLastMove?: boolean;
		isSelected?: boolean;
		isCheck?: boolean;
	},
): string {
	const isDark = (row + col) % 2 === 1;

	if (options?.isCheck) {
		return theme.checkColor;
	}
	if (options?.isSelected) {
		return isDark ? theme.selectedDark : theme.selectedLight;
	}
	if (options?.isLastMove) {
		return isDark ? theme.lastMoveDark : theme.lastMoveLight;
	}
	return isDark ? theme.dark : theme.light;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

export function getFileLabel(col: number): string {
	return FILES[col] ?? "";
}

export function getRankLabel(row: number): string {
	return RANKS[row] ?? "";
}

export const MATERIAL_ORDER: PieceType[] = ["Queen", "Rook", "Bishop", "Knight", "Pawn"];

export function calculateMaterialAdvantage(capturedPieces: {
	white: PieceType[];
	black: PieceType[];
}): number {
	const PIECE_VALUES: Record<PieceType, number> = {
		Pawn: 1,
		Knight: 3,
		Bishop: 3,
		Rook: 5,
		Queen: 9,
		King: 0,
	};

	const whiteCapturedValue = capturedPieces.white.reduce((sum, p) => sum + PIECE_VALUES[p], 0);
	const blackCapturedValue = capturedPieces.black.reduce((sum, p) => sum + PIECE_VALUES[p], 0);

	return blackCapturedValue - whiteCapturedValue;
}
