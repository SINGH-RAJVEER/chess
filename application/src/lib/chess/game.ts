import { Chess, type Move as ChessMove, type Square } from "chess.js";
import type { Color, Move, Piece } from "@chess/db/schema";
import {
  algebraicToIndex,
  getCol,
  getPieceAt,
  getRow,
  getSquareFromRowCol,
  indexToAlgebraic,
} from "./board";

export function piecesToFen(
  pieces: Piece[],
  turn: Color,
  lastMove?: Move,
): string {
  let fen = "";

  // 1. Piece placement
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

  // 2. Active color
  fen += ` ${turn === "White" ? "w" : "b"}`;

  // 3. Castling rights
  let castling = "";
  const whiteKing = pieces.find(
    (p) => p.pieceType === "King" && p.color === "White",
  );
  if (whiteKing && !whiteKing.hasMoved) {
    const whiteRookK = pieces.find(
      (p) => p.pieceType === "Rook" && p.color === "White" && p.square === 63,
    );
    if (whiteRookK && !whiteRookK.hasMoved) castling += "K";
    const whiteRookQ = pieces.find(
      (p) => p.pieceType === "Rook" && p.color === "White" && p.square === 56,
    );
    if (whiteRookQ && !whiteRookQ.hasMoved) castling += "Q";
  }

  const blackKing = pieces.find(
    (p) => p.pieceType === "King" && p.color === "Black",
  );
  if (blackKing && !blackKing.hasMoved) {
    const blackRookK = pieces.find(
      (p) => p.pieceType === "Rook" && p.color === "Black" && p.square === 7,
    );
    if (blackRookK && !blackRookK.hasMoved) castling += "k";
    const blackRookQ = pieces.find(
      (p) => p.pieceType === "Rook" && p.color === "Black" && p.square === 0,
    );
    if (blackRookQ && !blackRookQ.hasMoved) castling += "q";
  }
  fen += ` ${castling || "-"}`;

  // 4. En passant target square
  let epSquare = "-";
  if (lastMove && lastMove.pieceType === "Pawn") {
    const fromRow = getRow(lastMove.fromSquare);
    const toRow = getRow(lastMove.toSquare);
    if (Math.abs(fromRow - toRow) === 2) {
      const epRow = (fromRow + toRow) / 2;
      const epCol = getCol(lastMove.fromSquare);
      const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
      epSquare = `${files[epCol]}${8 - epRow}`;
    }
  }
  fen += ` ${epSquare}`;
  fen += " 0 1";
  return fen;
}

function getChessInstance(
  pieces: Piece[],
  turn: Color,
  lastMove?: Move,
): Chess {
  const fen = piecesToFen(pieces, turn, lastMove);
  // Chess.js might throw on invalid FEN, but our generator should be safe.
  // We can try/catch if needed.
  return new Chess(fen);
}

export function isCheck(pieces: Piece[], color: Color): boolean {
  // We need to know whose turn it is to check 'isCheck', or if the King of 'color' is in check.
  // chess.inCheck() returns true if the side to move is in check.
  // If we want to check if White is in check, we should load FEN with White to move.
  // But wait, the color passed is usually the current turn.

  try {
    const chess = getChessInstance(pieces, color); // Load with 'color' to move
    return chess.inCheck();
  } catch (e) {
    console.error("isCheck: Invalid FEN or state", e);
    return false;
  }
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
    const fromAlg = indexToAlgebraic(from);
    const toAlg = indexToAlgebraic(to);

    // Check for promotion
    const piece = getPieceAt(pieces, from);
    let promotion: string | undefined;
    if (piece?.pieceType === "Pawn") {
      const toRow = getRow(to);
      if (
        (piece.color === "White" && toRow === 0) ||
        (piece.color === "Black" && toRow === 7)
      ) {
        promotion = "q"; // Default to Queen for checking details
      }
    }

    try {
      return chess.move({ from: fromAlg, to: toAlg, promotion });
    } catch {
      return null;
    }
  } catch (e) {
    console.error("getMoveDetails error", e);
    return null;
  }
}

export function isLegalMove(
  pieces: Piece[],
  from: number,
  to: number,
  color: Color,
  lastMove?: Move,
): boolean {
  return !!getMoveDetails(pieces, from, to, color, lastMove);
}

// Get all valid moves for a piece at a square
export function getValidMoves(
  pieces: Piece[],
  square: number,
  lastMove?: Move,
): number[] {
  const piece = getPieceAt(pieces, square);
  if (!piece) return [];

  try {
    const chess = getChessInstance(pieces, piece.color, lastMove);
    const fromAlg = indexToAlgebraic(square) as Square;

    // Get moves for this square
    const moves = chess.moves({ square: fromAlg, verbose: true });

    return moves.map((m) => algebraicToIndex(m.to));
  } catch (e) {
    console.error("getValidMoves error", e);
    return [];
  }
}

export function getAllLegalMoves(
  pieces: Piece[],
  color: Color,
  lastMove?: Move,
): { from: number; to: number }[] {
  try {
    const chess = getChessInstance(pieces, color, lastMove);
    const moves = chess.moves({ verbose: true });
    return moves.map((m) => ({
      from: algebraicToIndex(m.from),
      to: algebraicToIndex(m.to),
    }));
  } catch (e) {
    console.error("getAllLegalMoves error", e);
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
    // Also check for draw by insufficient material or repetition if desired,
    // but the app only lists Ongoing, Checkmate, Stalemate, Timeout.
    // If it's a draw but not stalemate (e.g. 50 move rule), we might treat as Stalemate or Ongoing?
    // For now, let's stick to strict definitions.
    if (chess.isDraw()) return "Stalemate"; // Map other draws to Stalemate for simplicity or add "Draw" status later

    return "Ongoing";
  } catch (e) {
    console.error("getGameStatus error", e);
    return "Ongoing";
  }
}

// Initialize chess board with starting position
export function initializeGame(): {
  pieces: Omit<Piece, "id" | "gameId">[];
  turn: Color;
} {
  // We can just use the manual setup code from before as it's static and correct.
  // Or we can load chess.js default and map it.
  // Mapping chess.js default board to pieces is safer to ensure sync.

  const chess = new Chess();
  const board = chess.board(); // (Piece | null)[][]
  const pieces: Omit<Piece, "id" | "gameId">[] = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cell = board[row][col];
      if (cell) {
        pieces.push({
          color: cell.color === "w" ? "White" : "Black",
          pieceType: typeToPieceType(cell.type),
          square: getSquareFromRowCol(row, col),
          hasMoved: false, // Approximation. In new game, nothing moved.
        });
      }
    }
  }

  return { pieces, turn: "White" };
}

function typeToPieceType(type: string): Piece["pieceType"] {
  switch (type) {
    case "p":
      return "Pawn";
    case "n":
      return "Knight";
    case "b":
      return "Bishop";
    case "r":
      return "Rook";
    case "q":
      return "Queen";
    case "k":
      return "King";
    default:
      throw new Error(`Unknown piece type: ${type}`);
  }
}
