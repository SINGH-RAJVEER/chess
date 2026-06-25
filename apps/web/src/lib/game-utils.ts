import type { BoardPiece, BoardResponse, Color, PieceType } from "@chess/types";

export type PendingMove = { from: number; to: number };

export type CapturedPieceEntry = { key: string; piece: PieceType };

export function buildCapturedPieceEntries(
	capturedPieces: PieceType[] | undefined,
): CapturedPieceEntry[] {
	const counts = new Map<PieceType, number>();
	return (capturedPieces ?? []).map((piece) => {
		const occurrence = (counts.get(piece) ?? 0) + 1;
		counts.set(piece, occurrence);
		return { key: `${piece}-${occurrence}`, piece };
	});
}

export function getPreviewPieces(
	pieces: BoardPiece[] | undefined,
	pendingMove: PendingMove | null,
): BoardPiece[] {
	const basePieces = pieces ?? [];
	if (!pendingMove) return basePieces;

	const movingPiece = basePieces.find((piece) => piece.square === pendingMove.from);
	const isCastle =
		movingPiece?.piece_type === "King" && Math.abs(pendingMove.to - pendingMove.from) === 2;

	if (isCastle) {
		const rowStart = Math.floor(pendingMove.from / 8) * 8;
		const isKingside = pendingMove.to > pendingMove.from;
		const rookFrom = rowStart + (isKingside ? 7 : 0);
		const rookTo = rowStart + (isKingside ? 5 : 3);

		return basePieces.map((piece) => {
			if (piece.square === pendingMove.from) return { ...piece, square: pendingMove.to };
			if (piece.square === rookFrom && piece.piece_type === "Rook") {
				return { ...piece, square: rookTo };
			}
			return piece;
		});
	}

	return basePieces
		.filter((piece) => piece.square !== pendingMove.to)
		.map((piece) =>
			piece.square === pendingMove.from ? { ...piece, square: pendingMove.to } : piece,
		);
}

export function getClockTime(boardData: BoardResponse | null, color: Color, now: number) {
	if (!boardData) return 0;
	if (boardData.timeControl === 0) return Number.MAX_SAFE_INTEGER;

	const lastMoveTime = boardData.lastMoveTime;
	const isActiveClock =
		boardData.turn === color && boardData.status === "Ongoing" && lastMoveTime != null;
	const remaining = color === "White" ? boardData.whiteTimeRemaining : boardData.blackTimeRemaining;

	if (!isActiveClock) return remaining;
	return Math.max(0, remaining - (now - lastMoveTime));
}

export function formatGameTime(ms: number, hasClock: boolean) {
	if (!hasClock) return "\u221E";
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
