import type { Color, Move, Piece } from "../../db/schema";
import {
  getCol,
  getRow,
  getSquareFromRowCol,
  isSquareOccupied,
  isSquareOccupiedByOpponent,
} from "./board";

// Path checking helpers
export function isDiagonalPathClear(
  pieces: Piece[],
  from: number,
  to: number,
): boolean {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);

  const rowStep = toRow > fromRow ? 1 : -1;
  const colStep = toCol > fromCol ? 1 : -1;

  let currentRow = fromRow + rowStep;
  let currentCol = fromCol + colStep;

  while (currentRow !== toRow && currentCol !== toCol) {
    const currentSquare = getSquareFromRowCol(currentRow, currentCol);
    if (isSquareOccupied(pieces, currentSquare)) return false;
    currentRow += rowStep;
    currentCol += colStep;
  }

  return true;
}

export function isStraightPathClear(
  pieces: Piece[],
  from: number,
  to: number,
): boolean {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);

  // Horizontal move
  if (fromRow === toRow) {
    const start = Math.min(fromCol, toCol) + 1;
    const end = Math.max(fromCol, toCol);
    for (let col = start; col < end; col++) {
      if (isSquareOccupied(pieces, getSquareFromRowCol(fromRow, col)))
        return false;
    }
    return true;
  }

  // Vertical move
  if (fromCol === toCol) {
    const start = Math.min(fromRow, toRow) + 1;
    const end = Math.max(fromRow, toRow);
    for (let row = start; row < end; row++) {
      if (isSquareOccupied(pieces, getSquareFromRowCol(row, fromCol)))
        return false;
    }
    return true;
  }

  return false;
}

export function isValidPawnMove(
  pieces: Piece[],
  from: number,
  to: number,
  color: Color,
  lastMove?: Move,
): boolean {
  const direction = color === "White" ? -1 : 1;
  const startRow = color === "White" ? 6 : 1;
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);

  const rowDiff = toRow - fromRow;
  const colDiff = toCol - fromCol;

  // Forward move
  if (colDiff === 0) {
    if (rowDiff === direction && !isSquareOccupied(pieces, to)) {
      return true;
    }
    // Two-square move from starting position
    if (fromRow === startRow && rowDiff === 2 * direction) {
      const oneSquareForward = from + direction * 8;
      return (
        !isSquareOccupied(pieces, oneSquareForward) &&
        !isSquareOccupied(pieces, to)
      );
    }
  }

  // Normal capture
  if (Math.abs(colDiff) === 1 && rowDiff === direction) {
    if (isSquareOccupiedByOpponent(pieces, to, color)) {
      return true;
    }

    // En passant
    if (lastMove && lastMove.pieceType === "Pawn") {
      const lastFromRow = getRow(lastMove.fromSquare);
      const lastToRow = getRow(lastMove.toSquare);
      const lastToCol = getCol(lastMove.toSquare);

      const isTwoSquareMove = Math.abs(lastToRow - lastFromRow) === 2;
      const isBeside = lastToRow === fromRow && lastToCol === toCol;

      if (isTwoSquareMove && isBeside) {
        return true;
      }
    }
  }

  return false;
}

export function isValidKnightMove(
  _pieces: Piece[],
  from: number,
  to: number,
): boolean {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);

  const rowDiff = Math.abs(toRow - fromRow);
  const colDiff = Math.abs(toCol - fromCol);

  return (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);
}

export function isValidBishopMove(
  pieces: Piece[],
  from: number,
  to: number,
): boolean {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);

  const rowDiff = Math.abs(toRow - fromRow);
  const colDiff = Math.abs(toCol - fromCol);

  if (rowDiff !== colDiff) return false;

  return isDiagonalPathClear(pieces, from, to);
}

export function isValidRookMove(
  pieces: Piece[],
  from: number,
  to: number,
): boolean {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);

  if (fromRow !== toRow && fromCol !== toCol) return false;

  return isStraightPathClear(pieces, from, to);
}

export function isValidQueenMove(
  pieces: Piece[],
  from: number,
  to: number,
): boolean {
  return (
    isValidBishopMove(pieces, from, to) || isValidRookMove(pieces, from, to)
  );
}
