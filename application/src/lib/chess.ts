import type { Color, Move, Piece } from "../db/schema";

export type ChessBoard = {
  pieces: Piece[];
  turn: Color;
  status: "Ongoing" | "Checkmate" | "Stalemate";
};

// Helper functions
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

// Pseudo-legal move validation (ignores check)
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
    // (Target square attack will be checked by isLegalMove)

    return true;
  }

  return false;
}

// Path checking helpers
function isDiagonalPathClear(
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

function isStraightPathClear(
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
