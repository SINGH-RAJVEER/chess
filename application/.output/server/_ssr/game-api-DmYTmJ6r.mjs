import { T as TSS_SERVER_FUNCTION, c as createServerFn } from "./index.mjs";
import Client from "better-sqlite3";
import { s as sqliteTable, i as integer, t as text, d as drizzle, a as desc, e as eq, b as and } from "../_libs/drizzle-orm.mjs";
import "../_chunks/_libs/@tanstack/history.mjs";
import "../_chunks/_libs/@tanstack/router-core.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/tiny-invariant.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
import "node:http";
import "node:stream";
import "node:https";
import "node:http2";
import "../_libs/solid-js.mjs";
import "../_libs/tiny-warning.mjs";
import "../_libs/isbot.mjs";
const createServerRpc = (serverFnMeta, splitImportFn) => {
  const url = "/_serverFn/" + serverFnMeta.id;
  return Object.assign(splitImportFn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true
  });
};
function getRow(square) {
  return Math.floor(square / 8);
}
function getCol(square) {
  return square % 8;
}
function getSquareFromRowCol(row, col) {
  if (row < 0 || row > 7 || col < 0 || col > 7) return -1;
  return row * 8 + col;
}
function getPieceAt(pieces2, square) {
  return pieces2.find((p) => p.square === square);
}
function isSquareOccupied(pieces2, square) {
  return getPieceAt(pieces2, square) !== void 0;
}
function isSquareOccupiedByColor(pieces2, square, color) {
  const piece = getPieceAt(pieces2, square);
  return piece !== void 0 && piece.color === color;
}
function isSquareOccupiedByOpponent(pieces2, square, color) {
  const piece = getPieceAt(pieces2, square);
  return piece !== void 0 && piece.color !== color;
}
function isDiagonalPathClear(pieces2, from, to) {
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
    if (isSquareOccupied(pieces2, currentSquare)) return false;
    currentRow += rowStep;
    currentCol += colStep;
  }
  return true;
}
function isStraightPathClear(pieces2, from, to) {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);
  if (fromRow === toRow) {
    const start = Math.min(fromCol, toCol) + 1;
    const end = Math.max(fromCol, toCol);
    for (let col = start; col < end; col++) {
      if (isSquareOccupied(pieces2, getSquareFromRowCol(fromRow, col)))
        return false;
    }
    return true;
  }
  if (fromCol === toCol) {
    const start = Math.min(fromRow, toRow) + 1;
    const end = Math.max(fromRow, toRow);
    for (let row = start; row < end; row++) {
      if (isSquareOccupied(pieces2, getSquareFromRowCol(row, fromCol)))
        return false;
    }
    return true;
  }
  return false;
}
function isValidPawnMove(pieces2, from, to, color, lastMove) {
  const direction = color === "White" ? -1 : 1;
  const startRow = color === "White" ? 6 : 1;
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);
  const rowDiff = toRow - fromRow;
  const colDiff = toCol - fromCol;
  if (colDiff === 0) {
    if (rowDiff === direction && !isSquareOccupied(pieces2, to)) {
      return true;
    }
    if (fromRow === startRow && rowDiff === 2 * direction) {
      const oneSquareForward = from + direction * 8;
      return !isSquareOccupied(pieces2, oneSquareForward) && !isSquareOccupied(pieces2, to);
    }
  }
  if (Math.abs(colDiff) === 1 && rowDiff === direction) {
    if (isSquareOccupiedByOpponent(pieces2, to, color)) {
      return true;
    }
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
function isValidKnightMove(_pieces, from, to) {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);
  const rowDiff = Math.abs(toRow - fromRow);
  const colDiff = Math.abs(toCol - fromCol);
  return rowDiff === 2 && colDiff === 1 || rowDiff === 1 && colDiff === 2;
}
function isValidBishopMove(pieces2, from, to) {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);
  const rowDiff = Math.abs(toRow - fromRow);
  const colDiff = Math.abs(toCol - fromCol);
  if (rowDiff !== colDiff) return false;
  return isDiagonalPathClear(pieces2, from, to);
}
function isValidRookMove(pieces2, from, to) {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);
  if (fromRow !== toRow && fromCol !== toCol) return false;
  return isStraightPathClear(pieces2, from, to);
}
function isValidQueenMove(pieces2, from, to) {
  return isValidBishopMove(pieces2, from, to) || isValidRookMove(pieces2, from, to);
}
function isSquareAttacked(pieces2, square, attackerColor) {
  for (const piece of pieces2) {
    if (piece.color !== attackerColor) continue;
    const from = piece.square;
    const to = square;
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
    if (isPseudoLegalMove(pieces2, from, to, piece.color)) {
      return true;
    }
  }
  return false;
}
function isValidKingMove(_pieces, from, to, color, currentPieces) {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);
  const rowDiff = Math.abs(toRow - fromRow);
  const colDiff = Math.abs(toCol - fromCol);
  if (rowDiff <= 1 && colDiff <= 1 && (rowDiff > 0 || colDiff > 0)) {
    return true;
  }
  if (rowDiff === 0 && colDiff === 2) {
    const king = getPieceAt(currentPieces, from);
    if (!king || king.hasMoved) return false;
    if (isSquareAttacked(
      currentPieces,
      from,
      color === "White" ? "Black" : "White"
    ))
      return false;
    const isKingside = toCol === 6;
    const rookCol = isKingside ? 7 : 0;
    const rookSquare = getSquareFromRowCol(fromRow, rookCol);
    const rook = getPieceAt(currentPieces, rookSquare);
    if (!rook || rook.pieceType !== "Rook" || rook.hasMoved) return false;
    const step = isKingside ? 1 : -1;
    for (let col = fromCol + step; col !== rookCol; col += step) {
      if (isSquareOccupied(currentPieces, getSquareFromRowCol(fromRow, col)))
        return false;
    }
    if (isSquareAttacked(
      currentPieces,
      getSquareFromRowCol(fromRow, fromCol + step),
      color === "White" ? "Black" : "White"
    ))
      return false;
    return true;
  }
  return false;
}
function isPseudoLegalMove(pieces2, from, to, color, lastMove) {
  const piece = getPieceAt(pieces2, from);
  if (!piece || piece.color !== color) return false;
  if (isSquareOccupiedByColor(pieces2, to, color)) return false;
  switch (piece.pieceType) {
    case "Pawn":
      return isValidPawnMove(pieces2, from, to, color, lastMove);
    case "Knight":
      return isValidKnightMove(pieces2, from, to);
    case "Bishop":
      return isValidBishopMove(pieces2, from, to);
    case "Rook":
      return isValidRookMove(pieces2, from, to);
    case "Queen":
      return isValidQueenMove(pieces2, from, to);
    case "King":
      return isValidKingMove(pieces2, from, to, color, pieces2);
    default:
      return false;
  }
}
function isCheck(pieces2, color) {
  const king = pieces2.find((p) => p.pieceType === "King" && p.color === color);
  if (!king) return false;
  return isSquareAttacked(
    pieces2,
    king.square,
    color === "White" ? "Black" : "White"
  );
}
function simulateMove(pieces2, from, to) {
  const movingPiece = getPieceAt(pieces2, from);
  if (!movingPiece) return pieces2;
  let nextPieces = pieces2.filter((p) => p.square !== to).map((p) => ({ ...p }));
  const pieceInNext = nextPieces.find((p) => p.square === from);
  if (pieceInNext) {
    if (movingPiece.pieceType === "Pawn" && getCol(from) !== getCol(to) && !isSquareOccupied(pieces2, to)) {
      const capturedPawnSquare = getSquareFromRowCol(getRow(from), getCol(to));
      nextPieces = nextPieces.filter((p) => p.square !== capturedPawnSquare);
    }
    pieceInNext.square = to;
    pieceInNext.hasMoved = true;
    if (movingPiece.pieceType === "King" && Math.abs(getCol(to) - getCol(from)) === 2) {
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
function isLegalMove(pieces2, from, to, color, lastMove) {
  if (!isPseudoLegalMove(pieces2, from, to, color, lastMove)) return false;
  const nextPieces = simulateMove(pieces2, from, to);
  return !isCheck(nextPieces, color);
}
function getValidMoves(pieces2, square, lastMove) {
  const piece = getPieceAt(pieces2, square);
  if (!piece) return [];
  const validMoves = [];
  for (let to = 0; to < 64; to++) {
    if (isLegalMove(pieces2, square, to, piece.color, lastMove)) {
      validMoves.push(to);
    }
  }
  return validMoves;
}
function getAllLegalMoves(pieces2, color, lastMove) {
  const moves2 = [];
  for (const piece of pieces2) {
    if (piece.color !== color) continue;
    const pieceMoves = getValidMoves(pieces2, piece.square, lastMove);
    for (const to of pieceMoves) {
      moves2.push({ from: piece.square, to });
    }
  }
  return moves2;
}
function getGameStatus(pieces2, turn, lastMove) {
  const moves2 = getAllLegalMoves(pieces2, turn, lastMove);
  if (moves2.length > 0) return "Ongoing";
  if (isCheck(pieces2, turn)) {
    return "Checkmate";
  }
  return "Stalemate";
}
function initializeGame() {
  const pieces2 = [];
  for (let col = 0; col < 8; col++) {
    pieces2.push({
      color: "White",
      pieceType: "Pawn",
      square: getSquareFromRowCol(6, col),
      hasMoved: false
    });
    pieces2.push({
      color: "Black",
      pieceType: "Pawn",
      square: getSquareFromRowCol(1, col),
      hasMoved: false
    });
  }
  pieces2.push({
    color: "White",
    pieceType: "Rook",
    square: getSquareFromRowCol(7, 0),
    hasMoved: false
  });
  pieces2.push({
    color: "White",
    pieceType: "Rook",
    square: getSquareFromRowCol(7, 7),
    hasMoved: false
  });
  pieces2.push({
    color: "Black",
    pieceType: "Rook",
    square: getSquareFromRowCol(0, 0),
    hasMoved: false
  });
  pieces2.push({
    color: "Black",
    pieceType: "Rook",
    square: getSquareFromRowCol(0, 7),
    hasMoved: false
  });
  pieces2.push({
    color: "White",
    pieceType: "Knight",
    square: getSquareFromRowCol(7, 1),
    hasMoved: false
  });
  pieces2.push({
    color: "White",
    pieceType: "Knight",
    square: getSquareFromRowCol(7, 6),
    hasMoved: false
  });
  pieces2.push({
    color: "Black",
    pieceType: "Knight",
    square: getSquareFromRowCol(0, 1),
    hasMoved: false
  });
  pieces2.push({
    color: "Black",
    pieceType: "Knight",
    square: getSquareFromRowCol(0, 6),
    hasMoved: false
  });
  pieces2.push({
    color: "White",
    pieceType: "Bishop",
    square: getSquareFromRowCol(7, 2),
    hasMoved: false
  });
  pieces2.push({
    color: "White",
    pieceType: "Bishop",
    square: getSquareFromRowCol(7, 5),
    hasMoved: false
  });
  pieces2.push({
    color: "Black",
    pieceType: "Bishop",
    square: getSquareFromRowCol(0, 2),
    hasMoved: false
  });
  pieces2.push({
    color: "Black",
    pieceType: "Bishop",
    square: getSquareFromRowCol(0, 5),
    hasMoved: false
  });
  pieces2.push({
    color: "White",
    pieceType: "Queen",
    square: getSquareFromRowCol(7, 3),
    hasMoved: false
  });
  pieces2.push({
    color: "Black",
    pieceType: "Queen",
    square: getSquareFromRowCol(0, 3),
    hasMoved: false
  });
  pieces2.push({
    color: "White",
    pieceType: "King",
    square: getSquareFromRowCol(7, 4),
    hasMoved: false
  });
  pieces2.push({
    color: "Black",
    pieceType: "King",
    square: getSquareFromRowCol(0, 4),
    hasMoved: false
  });
  return { pieces: pieces2, turn: "White" };
}
const games = sqliteTable("games", {
  id: integer("id").primaryKey(),
  currentTurn: text("current_turn").notNull().$type(),
  status: text("status").notNull().$type(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});
const pieces = sqliteTable("pieces", {
  id: integer("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => games.id),
  color: text("color").notNull().$type(),
  pieceType: text("piece_type").notNull().$type(),
  square: integer("square").notNull(),
  hasMoved: integer("has_moved", { mode: "boolean" }).default(false).notNull()
});
const moves = sqliteTable("moves", {
  id: integer("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => games.id),
  fromSquare: integer("from_square").notNull(),
  toSquare: integer("to_square").notNull(),
  pieceType: text("piece_type").notNull().$type(),
  pieceColor: text("piece_color").notNull().$type(),
  capturedPieceType: text("captured_piece_type").$type(),
  moveNumber: integer("move_number").notNull(),
  createdAt: integer("created_at").notNull()
});
const schema = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  games,
  moves,
  pieces
}, Symbol.toStringTag, { value: "Module" }));
const database = new Client("chess.db");
const db = drizzle(database, { schema });
const getBoard_createServerFn_handler = createServerRpc({
  id: "075bb97a5df53025c3a5cac3463aa1757848b60aac35966d56b3f5f04c96a880",
  name: "getBoard",
  filename: "src/lib/game-api.ts"
}, (opts, signal) => getBoard.__executeServer(opts, signal));
const getBoard = createServerFn({
  method: "POST"
}).handler(getBoard_createServerFn_handler, async () => {
  try {
    let currentGame = await db.query.games.findFirst({
      orderBy: desc(games.updatedAt)
    });
    if (!currentGame) {
      console.log("No game found, creating new one");
      const initialData = initializeGame();
      const [newGame] = await db.insert(games).values({
        currentTurn: initialData.turn,
        status: "Ongoing",
        createdAt: Date.now(),
        updatedAt: Date.now()
      }).returning();
      if (newGame) {
        console.log(`Created new game with ID ${newGame.id}`);
        const piecesToInsert = initialData.pieces.map((piece) => ({
          gameId: newGame.id,
          color: piece.color,
          pieceType: piece.pieceType,
          square: piece.square,
          hasMoved: false
        }));
        await db.insert(pieces).values(piecesToInsert);
        console.log(`Inserted ${piecesToInsert.length} pieces for game ${newGame.id}`);
        currentGame = newGame;
      }
    }
    if (!currentGame) {
      console.error("Failed to create or retrieve game");
      return {
        pieces: [],
        turn: "White",
        status: "Ongoing",
        moves: []
      };
    }
    const pieces$1 = await db.query.pieces.findMany({
      where: eq(pieces.gameId, currentGame.id)
    });
    const moveHistory = await db.query.moves.findMany({
      where: eq(moves.gameId, currentGame.id),
      orderBy: moves.moveNumber
    });
    const capturedPieces = {
      white: [],
      black: []
    };
    const formattedMoves = moveHistory.map((move) => {
      const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const fromFile = files[getCol(move.fromSquare)];
      const fromRank = 8 - getRow(move.fromSquare);
      const toFile = files[getCol(move.toSquare)];
      const toRank = 8 - getRow(move.toSquare);
      let notation = "";
      if (move.pieceType !== "Pawn") {
        notation += move.pieceType === "Knight" ? "N" : move.pieceType[0];
      }
      notation += `${fromFile}${fromRank}-${toFile}${toRank}`;
      if (move.capturedPieceType) {
        if (move.pieceColor === "White") {
          capturedPieces.black.push(move.capturedPieceType);
        } else {
          capturedPieces.white.push(move.capturedPieceType);
        }
      }
      return {
        from: move.fromSquare,
        to: move.toSquare,
        color: move.pieceColor,
        pieceType: move.pieceType,
        captured: move.capturedPieceType || void 0,
        notation
      };
    });
    const piecesResponse = pieces$1.map((piece) => ({
      color: piece.color,
      piece_type: piece.pieceType,
      square: piece.square
    }));
    console.log(`Retrieved game ${currentGame.id} with ${pieces$1.length} pieces, turn: ${currentGame.currentTurn}`);
    return {
      pieces: piecesResponse,
      capturedPieces,
      moves: formattedMoves,
      turn: currentGame.currentTurn,
      status: currentGame.status
    };
  } catch (error) {
    console.error("Error in getBoard:", error);
    throw error;
  }
});
const undoMove_createServerFn_handler = createServerRpc({
  id: "794ae25fdbad27267eddca374cd262923ce3a47f4b66b732f323ab20dcc22590",
  name: "undoMove",
  filename: "src/lib/game-api.ts"
}, (opts, signal) => undoMove.__executeServer(opts, signal));
const undoMove = createServerFn({
  method: "POST"
}).handler(undoMove_createServerFn_handler, async () => {
  console.log("Undoing last move");
  try {
    const currentGame = await db.query.games.findFirst({
      orderBy: desc(games.updatedAt)
    });
    if (!currentGame) {
      throw new Error("No game found");
    }
    const lastMove = await db.query.moves.findFirst({
      where: eq(moves.gameId, currentGame.id),
      orderBy: desc(moves.moveNumber)
    });
    if (!lastMove) {
      return {
        success: false,
        message: "No moves to undo"
      };
    }
    const movedPiece = await db.query.pieces.findFirst({
      where: and(eq(pieces.gameId, currentGame.id), eq(pieces.square, lastMove.toSquare))
    });
    if (movedPiece) {
      await db.update(pieces).set({
        square: lastMove.fromSquare,
        pieceType: lastMove.pieceType,
        // Restore original type (e.g. Pawn instead of Queen)
        hasMoved: false
        // Simplified heuristic: assume undoing implies it hasn't moved. 
        // Ideally we check if it had moved before, but we don't track that history.
        // For start squares, this is safe. For mid-game, it might grant castling rights back incorrectly if we moved, went back, moved again.
        // But standard undo usually allows re-try.
      }).where(eq(pieces.id, movedPiece.id));
    }
    if (lastMove.capturedPieceType) {
      const capturedColor = lastMove.pieceColor === "White" ? "Black" : "White";
      let captureSquare = lastMove.toSquare;
      if (lastMove.pieceType === "Pawn" && lastMove.capturedPieceType === "Pawn") {
        const fromRow = getRow(lastMove.fromSquare);
        const toRow = getRow(lastMove.toSquare);
        const fromCol = getCol(lastMove.fromSquare);
        const toCol = getCol(lastMove.toSquare);
      }
      await db.insert(pieces).values({
        gameId: currentGame.id,
        color: capturedColor,
        pieceType: lastMove.capturedPieceType,
        square: captureSquare,
        hasMoved: true
        // Captured pieces have likely moved, or it doesn't matter much.
      });
    }
    if (lastMove.pieceType === "King" && Math.abs(lastMove.fromSquare - lastMove.toSquare) === 2) {
      const isKingside = getCol(lastMove.toSquare) === 6;
      const rookCol = isKingside ? 7 : 0;
      const rookLandedCol = isKingside ? 5 : 3;
      const row = getRow(lastMove.fromSquare);
      const rookLandedSquare = getSquareFromRowCol(row, rookLandedCol);
      const rookOriginalSquare = getSquareFromRowCol(row, rookCol);
      await db.update(pieces).set({
        square: rookOriginalSquare,
        hasMoved: false
      }).where(and(eq(pieces.gameId, currentGame.id), eq(pieces.square, rookLandedSquare), eq(pieces.pieceType, "Rook")));
    }
    await db.delete(moves).where(eq(moves.id, lastMove.id));
    await db.update(games).set({
      currentTurn: lastMove.pieceColor,
      status: "Ongoing",
      updatedAt: Date.now()
    }).where(eq(games.id, currentGame.id));
    return {
      success: true
    };
  } catch (e) {
    console.error("Undo failed:", e);
    throw e;
  }
});
const getMoves_createServerFn_handler = createServerRpc({
  id: "7f22913cc8d51a01984f7bf48fae2f2d31d571b490a9d584529e84f9899ea385",
  name: "getMoves",
  filename: "src/lib/game-api.ts"
}, (opts, signal) => getMoves.__executeServer(opts, signal));
const getMoves = createServerFn({
  method: "POST"
}).inputValidator((square) => square).handler(getMoves_createServerFn_handler, async ({
  data: square
}) => {
  console.log(`Getting valid moves for square: ${square}`);
  try {
    const currentGame = await db.query.games.findFirst({
      orderBy: desc(games.updatedAt)
    });
    if (!currentGame) {
      console.log("No game found");
      return [];
    }
    const pieces$1 = await db.query.pieces.findMany({
      where: eq(pieces.gameId, currentGame.id)
    });
    const lastMove = await db.query.moves.findFirst({
      where: eq(moves.gameId, currentGame.id),
      orderBy: desc(moves.moveNumber)
    });
    const validMoves = getValidMoves(pieces$1, square, lastMove);
    console.log(`Found ${validMoves.length} valid moves for square ${square}`);
    return validMoves;
  } catch (error) {
    console.error("Error in getMoves:", error);
    throw error;
  }
});
const makeMove_createServerFn_handler = createServerRpc({
  id: "972086331ae1ccaf15884371b3d836c8b8cb9863f2467b06d69aa6f6555bec6c",
  name: "makeMove",
  filename: "src/lib/game-api.ts"
}, (opts, signal) => makeMove.__executeServer(opts, signal));
const makeMove = createServerFn({
  method: "POST"
}).inputValidator((args) => args).handler(makeMove_createServerFn_handler, async ({
  data: {
    from,
    to
  }
}) => {
  console.log(`Making move from ${from} to ${to}`);
  try {
    const currentGame = await db.query.games.findFirst({
      orderBy: desc(games.updatedAt)
    });
    if (!currentGame) {
      throw new Error("No game found");
    }
    if (currentGame.status !== "Ongoing") {
      throw new Error("Game is not ongoing");
    }
    const pieces$1 = await db.query.pieces.findMany({
      where: eq(pieces.gameId, currentGame.id)
    });
    const lastMove = await db.query.moves.findFirst({
      where: eq(moves.gameId, currentGame.id),
      orderBy: desc(moves.moveNumber)
    });
    if (!isLegalMove(pieces$1, from, to, currentGame.currentTurn, lastMove)) {
      throw new Error("Invalid move");
    }
    const movingPiece = pieces$1.find((p) => p.square === from);
    if (!movingPiece || movingPiece.color !== currentGame.currentTurn) {
      throw new Error("No valid piece found at that square");
    }
    const capturedPiece = pieces$1.find((p) => p.square === to);
    let capturedPieceType;
    if (capturedPiece) {
      capturedPieceType = capturedPiece.pieceType;
      await db.delete(pieces).where(and(eq(pieces.gameId, currentGame.id), eq(pieces.square, to)));
    } else if (movingPiece.pieceType === "Pawn" && getCol(from) !== getCol(to)) {
      const capturedPawnSquare = getSquareFromRowCol(getRow(from), getCol(to));
      const enPassantPiece = pieces$1.find((p) => p.square === capturedPawnSquare);
      if (enPassantPiece) {
        capturedPieceType = enPassantPiece.pieceType;
        await db.delete(pieces).where(and(eq(pieces.gameId, currentGame.id), eq(pieces.square, capturedPawnSquare)));
      }
    }
    if (movingPiece.pieceType === "King" && Math.abs(getCol(to) - getCol(from)) === 2) {
      const isKingside = getCol(to) === 6;
      const rookFromCol = isKingside ? 7 : 0;
      const rookToCol = isKingside ? 5 : 3;
      const rookFromSquare = getSquareFromRowCol(getRow(from), rookFromCol);
      const rookToSquare = getSquareFromRowCol(getRow(from), rookToCol);
      await db.update(pieces).set({
        square: rookToSquare,
        hasMoved: true
      }).where(and(eq(pieces.gameId, currentGame.id), eq(pieces.square, rookFromSquare)));
    }
    let finalPieceType = movingPiece.pieceType;
    if (movingPiece.pieceType === "Pawn") {
      const targetRow = movingPiece.color === "White" ? 0 : 7;
      if (getRow(to) === targetRow) {
        finalPieceType = "Queen";
      }
    }
    await db.update(pieces).set({
      square: to,
      hasMoved: true,
      pieceType: finalPieceType
    }).where(and(eq(pieces.gameId, currentGame.id), eq(pieces.square, from)));
    const moveCount = await db.query.moves.findMany({
      where: eq(moves.gameId, currentGame.id)
    });
    await db.insert(moves).values({
      gameId: currentGame.id,
      fromSquare: from,
      toSquare: to,
      pieceType: movingPiece.pieceType,
      pieceColor: movingPiece.color,
      capturedPieceType,
      moveNumber: moveCount.length + 1,
      createdAt: Date.now()
    });
    const updatedPieces = await db.query.pieces.findMany({
      where: eq(pieces.gameId, currentGame.id)
    });
    const nextTurn = currentGame.currentTurn === "White" ? "Black" : "White";
    const currentMove = await db.query.moves.findFirst({
      where: eq(moves.gameId, currentGame.id),
      orderBy: desc(moves.moveNumber)
    });
    const newStatus = getGameStatus(updatedPieces, nextTurn, currentMove);
    await db.update(games).set({
      currentTurn: nextTurn,
      status: newStatus,
      updatedAt: Date.now()
    }).where(eq(games.id, currentGame.id));
    console.log(`Move completed successfully. Next turn: ${nextTurn}, Status: ${newStatus}`);
    return {
      success: true,
      nextTurn,
      status: newStatus,
      captured: capturedPieceType !== void 0
    };
  } catch (error) {
    console.error("Error in makeMove:", error);
    throw error;
  }
});
const resetGame_createServerFn_handler = createServerRpc({
  id: "614b8f455b0bec4996eb16fc2e9a0377d9b5aca3671eb868a2af8c02e22f2c72",
  name: "resetGame",
  filename: "src/lib/game-api.ts"
}, (opts, signal) => resetGame.__executeServer(opts, signal));
const resetGame = createServerFn({
  method: "POST"
}).handler(resetGame_createServerFn_handler, async () => {
  console.log("Resetting game in database");
  try {
    await db.delete(moves);
    await db.delete(pieces);
    await db.delete(games);
    console.log("Game reset successfully");
    return {
      success: true
    };
  } catch (error) {
    console.error("Error in resetGame:", error);
    throw error;
  }
});
export {
  getBoard_createServerFn_handler,
  getMoves_createServerFn_handler,
  makeMove_createServerFn_handler,
  resetGame_createServerFn_handler,
  undoMove_createServerFn_handler
};
