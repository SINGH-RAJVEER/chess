import type { Color, Piece } from "../../db/schema";

export function getRow(square: number): number {
  return Math.floor(square / 8);
}

export function getCol(square: number): number {
  return square % 8;
}

export function getSquareFromRowCol(row: number, col: number): number {
  if (row < 0 || row > 7 || col < 0 || col > 7) return -1;
  return row * 8 + col;
}

export function getPieceAt(pieces: Piece[], square: number): Piece | undefined {
  return pieces.find((p) => p.square === square);
}

export function isSquareOccupied(pieces: Piece[], square: number): boolean {
  return getPieceAt(pieces, square) !== undefined;
}

export function isSquareOccupiedByColor(
  pieces: Piece[],
  square: number,
  color: Color,
): boolean {
  const piece = getPieceAt(pieces, square);
  return piece !== undefined && piece.color === color;
}

export function isSquareOccupiedByOpponent(
  pieces: Piece[],
  square: number,
  color: Color,
): boolean {
  const piece = getPieceAt(pieces, square);
  return piece !== undefined && piece.color !== color;
}
