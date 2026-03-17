import type { Move, Piece } from "@chess/db/schema";
import type { Color } from "@chess/types";
import { Chess, type Move as ChessMove, type Square } from "chess.js";
import { typeToPieceType } from "../utils";
import {
	algebraicToIndex,
	getCol,
	getPieceAt,
	getRow,
	getSquareFromRowCol,
	indexToAlgebraic,
} from "./board";

export function piecesToFen(pieces: Piece[], turn: Color, lastMove?: Move): string {
	let fen = "";

	for (let row = 0; row < 8; row++) {
		let emptyCount = 0;
		for (let col = 0; col < 8; col++) {
			const square = getSquareFromRowCol(row, col);
			const piece = getPieceAt(pieces, square);

			if (piece) {
				if (emptyCount > 0) {
					fen += emptyCount;
					emptyCount = 0;
				}
				let char = "";
				switch (piece.pieceType) {
					case "Pawn":
						char = "p";
						break;
					case "Knight":
						char = "n";
						break;
					case "Bishop":
						char = "b";
						break;
					case "Rook":
						char = "r";
						break;
					case "Queen":
						char = "q";
						break;
					case "King":
						char = "k";
						break;
				}
				fen += piece.color === "White" ? char.toUpperCase() : char;
			} else {
				emptyCount++;
			}
		}
		if (emptyCount > 0) {
			fen += emptyCount;
		}
		if (row < 7) {
			fen += "/";
		}
	}

	fen += ` ${turn === "White" ? "w" : "b"}`;

	let castling = "";
	const whiteKing = pieces.find((piece) => piece.pieceType === "King" && piece.color === "White");
	if (whiteKing && !whiteKing.hasMoved) {
		const whiteRookKingside = pieces.find(
			(piece) => piece.pieceType === "Rook" && piece.color === "White" && piece.square === 63,
		);
		if (whiteRookKingside && !whiteRookKingside.hasMoved) castling += "K";
		const whiteRookQueenside = pieces.find(
			(piece) => piece.pieceType === "Rook" && piece.color === "White" && piece.square === 56,
		);
		if (whiteRookQueenside && !whiteRookQueenside.hasMoved) castling += "Q";
	}

	const blackKing = pieces.find((piece) => piece.pieceType === "King" && piece.color === "Black");
	if (blackKing && !blackKing.hasMoved) {
		const blackRookKingside = pieces.find(
			(piece) => piece.pieceType === "Rook" && piece.color === "Black" && piece.square === 7,
		);
		if (blackRookKingside && !blackRookKingside.hasMoved) castling += "k";
		const blackRookQueenside = pieces.find(
			(piece) => piece.pieceType === "Rook" && piece.color === "Black" && piece.square === 0,
		);
		if (blackRookQueenside && !blackRookQueenside.hasMoved) castling += "q";
	}

	fen += ` ${castling || "-"}`;

	let enPassantSquare = "-";
	if (lastMove && lastMove.pieceType === "Pawn") {
		const fromRow = getRow(lastMove.fromSquare);
		const toRow = getRow(lastMove.toSquare);
		if (Math.abs(fromRow - toRow) === 2) {
			const enPassantRow = (fromRow + toRow) / 2;
			const enPassantCol = getCol(lastMove.fromSquare);
			const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
			enPassantSquare = `${files[enPassantCol]}${8 - enPassantRow}`;
		}
	}
	fen += ` ${enPassantSquare}`;
	fen += " 0 1";

	return fen;
}

function getChessInstance(pieces: Piece[], turn: Color, lastMove?: Move): Chess {
	return new Chess(piecesToFen(pieces, turn, lastMove));
}

export function getMoveDetails(
	pieces: Piece[],
	from: number,
	to: number,
	color: Color,
	lastMove?: Move,
): ChessMove | null {
	try {
		const chess = getChessInstance(pieces, color, lastMove);
		const fromAlgebraic = indexToAlgebraic(from);
		const toAlgebraic = indexToAlgebraic(to);

		const piece = getPieceAt(pieces, from);
		let promotion: string | undefined;
		if (piece?.pieceType === "Pawn") {
			const destinationRow = getRow(to);
			if (
				(piece.color === "White" && destinationRow === 0) ||
				(piece.color === "Black" && destinationRow === 7)
			) {
				promotion = "q";
			}
		}

		try {
			return chess.move({ from: fromAlgebraic, to: toAlgebraic, promotion });
		} catch {
			return null;
		}
	} catch (error) {
		console.error("getMoveDetails error", error);
		return null;
	}
}

export function getValidMoves(pieces: Piece[], square: number, lastMove?: Move): number[] {
	const piece = getPieceAt(pieces, square);
	if (!piece) return [];

	try {
		const chess = getChessInstance(pieces, piece.color, lastMove);
		const fromAlgebraic = indexToAlgebraic(square) as Square;
		const moves = chess.moves({ square: fromAlgebraic, verbose: true });

		return moves.map((move) => algebraicToIndex(move.to));
	} catch (error) {
		console.error("getValidMoves error", error);
		return [];
	}
}

export function getGameStatus(
	pieces: Piece[],
	turn: Color,
	lastMove?: Move,
): "Ongoing" | "Checkmate" | "Stalemate" {
	try {
		const chess = getChessInstance(pieces, turn, lastMove);
		if (chess.isCheckmate()) return "Checkmate";
		if (chess.isStalemate()) return "Stalemate";
		if (chess.isDraw()) return "Stalemate";

		return "Ongoing";
	} catch (error) {
		console.error("getGameStatus error", error);
		return "Ongoing";
	}
}

export function initializeGame(): {
	pieces: Omit<Piece, "id" | "gameId">[];
	turn: Color;
} {
	const chess = new Chess();
	const board = chess.board();
	const pieces: Omit<Piece, "id" | "gameId">[] = [];

	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			const cell = board[row][col];
			if (cell) {
				pieces.push({
					color: cell.color === "w" ? "White" : "Black",
					pieceType: typeToPieceType(cell.type),
					square: getSquareFromRowCol(row, col),
					hasMoved: false,
				});
			}
		}
	}

	return { pieces, turn: "White" };
}
