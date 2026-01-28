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
function getRow(square) {
  return Math.floor(square / 8);
}
function getCol(square) {
  return square % 8;
}
function getSquareFromRowCol(row, col) {
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
function isValidPawnMove(pieces2, from, to, color) {
  const direction = color === "White" ? -1 : 1;
  const startRow = color === "White" ? 6 : 1;
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);
  const rowDiff = toRow - fromRow;
  const colDiff = Math.abs(toCol - fromCol);
  if (colDiff === 0) {
    if (rowDiff === direction && !isSquareOccupied(pieces2, to)) {
      return true;
    }
    if (fromRow === startRow && rowDiff === 2 * direction) {
      const oneSquareForward = from + direction * 8;
      return !isSquareOccupied(pieces2, oneSquareForward) && !isSquareOccupied(pieces2, to);
    }
  }
  if (colDiff === 1 && rowDiff === direction) {
    return isSquareOccupiedByOpponent(pieces2, to, color);
  }
  return false;
}
function isValidKnightMove(pieces2, from, to, color) {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);
  const rowDiff = Math.abs(toRow - fromRow);
  const colDiff = Math.abs(toCol - fromCol);
  return rowDiff === 2 && colDiff === 1 || rowDiff === 1 && colDiff === 2;
}
function isValidBishopMove(pieces2, from, to, color) {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);
  const rowDiff = Math.abs(toRow - fromRow);
  const colDiff = Math.abs(toCol - fromCol);
  if (rowDiff !== colDiff) return false;
  return isDiagonalPathClear(pieces2, from, to);
}
function isValidRookMove(pieces2, from, to, color) {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);
  if (fromRow !== toRow && fromCol !== toCol) return false;
  return isStraightPathClear(pieces2, from, to);
}
function isValidQueenMove(pieces2, from, to, color) {
  return isValidBishopMove(pieces2, from, to) || isValidRookMove(pieces2, from, to);
}
function isValidKingMove(pieces2, from, to, color) {
  const fromRow = getRow(from);
  const fromCol = getCol(from);
  const toRow = getRow(to);
  const toCol = getCol(to);
  const rowDiff = Math.abs(toRow - fromRow);
  const colDiff = Math.abs(toCol - fromCol);
  return rowDiff <= 1 && colDiff <= 1 && (rowDiff > 0 || colDiff > 0);
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
      if (isSquareOccupied(pieces2, getSquareFromRowCol(fromRow, col))) return false;
    }
    return true;
  }
  if (fromCol === toCol) {
    const start = Math.min(fromRow, toRow) + 1;
    const end = Math.max(fromRow, toRow);
    for (let row = start; row < end; row++) {
      if (isSquareOccupied(pieces2, getSquareFromRowCol(row, fromCol))) return false;
    }
    return true;
  }
  return false;
}
function isValidMove(pieces2, from, to, color) {
  const piece = getPieceAt(pieces2, from);
  if (!piece || piece.color !== color) return false;
  if (isSquareOccupiedByColor(pieces2, to, color)) return false;
  switch (piece.pieceType) {
    case "Pawn":
      return isValidPawnMove(pieces2, from, to, color);
    case "Knight":
      return isValidKnightMove(pieces2, from, to);
    case "Bishop":
      return isValidBishopMove(pieces2, from, to);
    case "Rook":
      return isValidRookMove(pieces2, from, to);
    case "Queen":
      return isValidQueenMove(pieces2, from, to);
    case "King":
      return isValidKingMove(pieces2, from, to);
    default:
      return false;
  }
}
function getValidMoves(pieces2, square) {
  const piece = getPieceAt(pieces2, square);
  if (!piece) return [];
  const validMoves = [];
  for (let to = 0; to < 64; to++) {
    if (isValidMove(pieces2, square, to, piece.color)) {
      validMoves.push(to);
    }
  }
  return validMoves;
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
const getBoard_createServerFn_handler = createServerRpc({
  id: "075bb97a5df53025c3a5cac3463aa1757848b60aac35966d56b3f5f04c96a880",
  name: "getBoard",
  filename: "src/lib/game-api.ts"
}, (opts, signal) => getBoard.__executeServer(opts, signal));
const getBoard = createServerFn({
  method: "GET"
}).handler(getBoard_createServerFn_handler, async () => {
  console.log("Getting board from database...");
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
        status: "Ongoing"
      };
    }
    const pieces$1 = await db.query.pieces.findMany({
      where: eq(pieces.gameId, currentGame.id)
    });
    const moveHistory = await db.query.moves.findMany({
      where: eq(moves.gameId, currentGame.id)
    });
    const capturedPieces = {
      white: [],
      black: []
    };
    moveHistory.forEach((move) => {
      if (move.capturedPieceType) {
        if (move.pieceColor === "White") {
          capturedPieces.black.push(move.capturedPieceType);
        } else {
          capturedPieces.white.push(move.capturedPieceType);
        }
      }
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
      turn: currentGame.currentTurn,
      status: currentGame.status
    };
  } catch (error) {
    console.error("Error in getBoard:", error);
    throw error;
  }
});
const getMoves_createServerFn_handler = createServerRpc({
  id: "7f22913cc8d51a01984f7bf48fae2f2d31d571b490a9d584529e84f9899ea385",
  name: "getMoves",
  filename: "src/lib/game-api.ts"
}, (opts, signal) => getMoves.__executeServer(opts, signal));
const getMoves = createServerFn({
  method: "GET"
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
    const validMoves = getValidMoves(pieces$1, square);
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
    if (!isValidMove(pieces$1, from, to, currentGame.currentTurn)) {
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
    }
    await db.update(pieces).set({
      square: to,
      hasMoved: true
    }).where(and(eq(pieces.gameId, currentGame.id), eq(pieces.square, from)));
    await db.insert(moves).values({
      gameId: currentGame.id,
      fromSquare: from,
      toSquare: to,
      pieceType: movingPiece.pieceType,
      pieceColor: movingPiece.color,
      capturedPieceType,
      moveNumber: 1,
      // TODO: Implement proper move numbering
      createdAt: Date.now()
    });
    const nextTurn = currentGame.currentTurn === "White" ? "Black" : "White";
    await db.update(games).set({
      currentTurn: nextTurn,
      updatedAt: Date.now()
    }).where(eq(games.id, currentGame.id));
    console.log(`Move completed successfully. Next turn: ${nextTurn}`);
    return {
      success: true,
      nextTurn,
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
  resetGame_createServerFn_handler
};
