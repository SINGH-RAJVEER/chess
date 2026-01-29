import type { Color, Move, Piece } from "../../db/schema";
import {
  getCol,
  getPieceAt,
  getRow,
  getSquareFromRowCol,
  isSquareOccupied,
  isSquareOccupiedByColor,
} from "./board";
import {
  isValidBishopMove,
  isValidKnightMove,
  isValidPawnMove,
  isValidQueenMove,
  isValidRookMove,
} from "./moves";

export function isSquareAttacked(
  pieces: Piece[],
  square: number,
  attackerColor: Color,
): boolean {
  for (const piece of pieces) {
    if (piece.color !== attackerColor) continue;

    const from = piece.square;
    const to = square;

    // For pawns, only diagonal attacks count
    if (piece.pieceType === "Pawn") {
      const direction = piece.color === "White" ? -1 : 1;
      const fromRow = getRow(from);
      const fromCol = getCol(from);
      const toRow = getRow(to);
      const toCol = getCol(to);
      if (toRow === fromRow + direction && Math.abs(toCol - fromCol) === 1) {
        return true;
      }
      continue;
    }

    if (isPseudoLegalMove(pieces, from, to, piece.color)) {
      return true;
    }
  }
  return false;
}

export function isValidKingMove(
  _pieces: Piece[],
  from: number,
  to: number,
  color: Color,
  currentPieces: Piece[],
): boolean {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);

  const rowDiff = Math.abs(toRow - fromRow);
  const colDiff = Math.abs(toCol - fromCol);

  if (rowDiff <= 1 && colDiff <= 1 && (rowDiff > 0 || colDiff > 0)) {
    return true;
  }

  // Castling
  if (rowDiff === 0 && colDiff === 2) {
    const king = getPieceAt(currentPieces, from);
    if (!king || king.hasMoved) return false;

    // Check if king is currently in check
    if (
      isSquareAttacked(
        currentPieces,
        from,
        color === "White" ? "Black" : "White",
      )
    )
      return false;

    const isKingside = toCol === 6;
    const rookCol = isKingside ? 7 : 0;
    const rookSquare = getSquareFromRowCol(fromRow, rookCol);
    const rook = getPieceAt(currentPieces, rookSquare);

    if (!rook || rook.pieceType !== "Rook" || rook.hasMoved) return false;

    // Check if path is clear
    const step = isKingside ? 1 : -1;
    for (let col = fromCol + step; col !== rookCol; col += step) {
      if (isSquareOccupied(currentPieces, getSquareFromRowCol(fromRow, col)))
        return false;
    }

    // Check if squares king passes through are attacked
    if (
      isSquareAttacked(
        currentPieces,
        getSquareFromRowCol(fromRow, fromCol + step),
        color === "White" ? "Black" : "White",
      )
    )
      return false;

    return true;
  }

  return false;
}

export function isPseudoLegalMove(
  pieces: Piece[],
  from: number,
  to: number,
  color: Color,
  lastMove?: Move,
): boolean {
  const piece = getPieceAt(pieces, from);
  if (!piece || piece.color !== color) return false;

  if (isSquareOccupiedByColor(pieces, to, color)) return false;

  switch (piece.pieceType) {
    case "Pawn":
      return isValidPawnMove(pieces, from, to, color, lastMove);
    case "Knight":
      return isValidKnightMove(pieces, from, to);
    case "Bishop":
      return isValidBishopMove(pieces, from, to);
    case "Rook":
      return isValidRookMove(pieces, from, to);
    case "Queen":
      return isValidQueenMove(pieces, from, to);
    case "King":
      return isValidKingMove(pieces, from, to, color, pieces);
    default:
      return false;
  }
}

export function isCheck(pieces: Piece[], color: Color): boolean {
  const king = pieces.find((p) => p.pieceType === "King" && p.color === color);
  if (!king) return false;
  return isSquareAttacked(
    pieces,
    king.square,
    color === "White" ? "Black" : "White",
  );
}

export function simulateMove(
  pieces: Piece[],
  from: number,
  to: number,
): Piece[] {
  const movingPiece = getPieceAt(pieces, from);
  if (!movingPiece) return pieces;

  // Clone pieces
  let nextPieces = pieces
    .filter((p) => p.square !== to) // Handle regular capture
    .map((p) => ({ ...p }));

  const pieceInNext = nextPieces.find((p) => p.square === from);
  if (pieceInNext) {
    // En passant capture
    if (
      movingPiece.pieceType === "Pawn" &&
      getCol(from) !== getCol(to) &&
      !isSquareOccupied(pieces, to)
    ) {
      const capturedPawnSquare = getSquareFromRowCol(getRow(from), getCol(to));
      nextPieces = nextPieces.filter((p) => p.square !== capturedPawnSquare);
    }

    pieceInNext.square = to;
    pieceInNext.hasMoved = true;

    // Handle Castling (move the rook)
    if (
      movingPiece.pieceType === "King" &&
      Math.abs(getCol(to) - getCol(from)) === 2
    ) {
      const isKingside = getCol(to) === 6;
      const rookFromCol = isKingside ? 7 : 0;
      const rookToCol = isKingside ? 5 : 3;
      const rookFromSquare = getSquareFromRowCol(getRow(from), rookFromCol);
      const rookToSquare = getSquareFromRowCol(getRow(from), rookToCol);
      const rook = nextPieces.find((p) => p.square === rookFromSquare);
      if (rook) {
        rook.square = rookToSquare;
        rook.hasMoved = true;
      }
    }
  }

  return nextPieces;
}

export function isLegalMove(
  pieces: Piece[],
  from: number,
  to: number,
  color: Color,
  lastMove?: Move,
): boolean {
  if (!isPseudoLegalMove(pieces, from, to, color, lastMove)) return false;

  const nextPieces = simulateMove(pieces, from, to);
  return !isCheck(nextPieces, color);
}

// Get all valid moves for a piece
export function getValidMoves(
  pieces: Piece[],
  square: number,
  lastMove?: Move,
): number[] {
  const piece = getPieceAt(pieces, square);
  if (!piece) return [];

  const validMoves: number[] = [];

  for (let to = 0; to < 64; to++) {
    if (isLegalMove(pieces, square, to, piece.color, lastMove)) {
      validMoves.push(to);
    }
  }

  return validMoves;
}

export function getAllLegalMoves(
  pieces: Piece[],
  color: Color,
  lastMove?: Move,
): { from: number; to: number }[] {
  const moves: { from: number; to: number }[] = [];
  for (const piece of pieces) {
    if (piece.color !== color) continue;
    const pieceMoves = getValidMoves(pieces, piece.square, lastMove);
    for (const to of pieceMoves) {
      moves.push({ from: piece.square, to });
    }
  }
  return moves;
}

export function getGameStatus(
  pieces: Piece[],
  turn: Color,
  lastMove?: Move,
): "Ongoing" | "Checkmate" | "Stalemate" {
  const moves = getAllLegalMoves(pieces, turn, lastMove);
  if (moves.length > 0) return "Ongoing";

  if (isCheck(pieces, turn)) {
    return "Checkmate";
  }
  return "Stalemate";
}

// Initialize chess board with starting position
export function initializeGame(): {
  pieces: Omit<Piece, "id" | "gameId">[];
  turn: Color;
} {
  const pieces: Omit<Piece, "id" | "gameId">[] = [];

  // Pawns
  for (let col = 0; col < 8; col++) {
    pieces.push({
      color: "White",
      pieceType: "Pawn",
      square: getSquareFromRowCol(6, col),
      hasMoved: false,
    });
    pieces.push({
      color: "Black",
      pieceType: "Pawn",
      square: getSquareFromRowCol(1, col),
      hasMoved: false,
    });
  }

  // Rooks
  pieces.push({
    color: "White",
    pieceType: "Rook",
    square: getSquareFromRowCol(7, 0),
    hasMoved: false,
  });
  pieces.push({
    color: "White",
    pieceType: "Rook",
    square: getSquareFromRowCol(7, 7),
    hasMoved: false,
  });
  pieces.push({
    color: "Black",
    pieceType: "Rook",
    square: getSquareFromRowCol(0, 0),
    hasMoved: false,
  });
  pieces.push({
    color: "Black",
    pieceType: "Rook",
    square: getSquareFromRowCol(0, 7),
    hasMoved: false,
  });

  // Knights
  pieces.push({
    color: "White",
    pieceType: "Knight",
    square: getSquareFromRowCol(7, 1),
    hasMoved: false,
  });
  pieces.push({
    color: "White",
    pieceType: "Knight",
    square: getSquareFromRowCol(7, 6),
    hasMoved: false,
  });
  pieces.push({
    color: "Black",
    pieceType: "Knight",
    square: getSquareFromRowCol(0, 1),
    hasMoved: false,
  });
  pieces.push({
    color: "Black",
    pieceType: "Knight",
    square: getSquareFromRowCol(0, 6),
    hasMoved: false,
  });

  // Bishops
  pieces.push({
    color: "White",
    pieceType: "Bishop",
    square: getSquareFromRowCol(7, 2),
    hasMoved: false,
  });
  pieces.push({
    color: "White",
    pieceType: "Bishop",
    square: getSquareFromRowCol(7, 5),
    hasMoved: false,
  });
  pieces.push({
    color: "Black",
    pieceType: "Bishop",
    square: getSquareFromRowCol(0, 2),
    hasMoved: false,
  });
  pieces.push({
    color: "Black",
    pieceType: "Bishop",
    square: getSquareFromRowCol(0, 5),
    hasMoved: false,
  });

  // Queens
  pieces.push({
    color: "White",
    pieceType: "Queen",
    square: getSquareFromRowCol(7, 3),
    hasMoved: false,
  });
  pieces.push({
    color: "Black",
    pieceType: "Queen",
    square: getSquareFromRowCol(0, 3),
    hasMoved: false,
  });

  // Kings
  pieces.push({
    color: "White",
    pieceType: "King",
    square: getSquareFromRowCol(7, 4),
    hasMoved: false,
  });
  pieces.push({
    color: "Black",
    pieceType: "King",
    square: getSquareFromRowCol(0, 4),
    hasMoved: false,
  });

  return { pieces, turn: "White" };
}
