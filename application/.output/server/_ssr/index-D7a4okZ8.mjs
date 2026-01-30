import { T as TSS_SERVER_FUNCTION, c as createServerFn } from "./index.mjs";
import Client from "better-sqlite3";
import { q } from "./query-BCHCwASR.mjs";
import { s as sqliteTable, i as integer, t as text, d as drizzle, a as desc, e as eq, b as and, c as inArray } from "../_libs/drizzle-orm.mjs";
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
import "../_libs/solid-js.mjs";
import "../_libs/tiny-warning.mjs";
import "../_libs/isbot.mjs";
import "../_chunks/_libs/@tanstack/solid-query.mjs";
import "../_chunks/_libs/@tanstack/query-core.mjs";
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
function piecesToFen(pieces2, turn, lastMove) {
  let fen = "";
  for (let row = 0; row < 8; row++) {
    let emptyCount = 0;
    for (let col = 0; col < 8; col++) {
      const square = getSquareFromRowCol(row, col);
      const piece = getPieceAt(pieces2, square);
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
  const whiteKing = pieces2.find(
    (p) => p.pieceType === "King" && p.color === "White"
  );
  if (whiteKing && !whiteKing.hasMoved) {
    const whiteRookK = pieces2.find(
      (p) => p.pieceType === "Rook" && p.color === "White" && p.square === 63
    );
    if (whiteRookK && !whiteRookK.hasMoved) castling += "K";
    const whiteRookQ = pieces2.find(
      (p) => p.pieceType === "Rook" && p.color === "White" && p.square === 56
    );
    if (whiteRookQ && !whiteRookQ.hasMoved) castling += "Q";
  }
  const blackKing = pieces2.find(
    (p) => p.pieceType === "King" && p.color === "Black"
  );
  if (blackKing && !blackKing.hasMoved) {
    const blackRookK = pieces2.find(
      (p) => p.pieceType === "Rook" && p.color === "Black" && p.square === 7
    );
    if (blackRookK && !blackRookK.hasMoved) castling += "k";
    const blackRookQ = pieces2.find(
      (p) => p.pieceType === "Rook" && p.color === "Black" && p.square === 0
    );
    if (blackRookQ && !blackRookQ.hasMoved) castling += "q";
  }
  fen += ` ${castling || "-"}`;
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
const games = sqliteTable("games", {
  id: integer("id").primaryKey(),
  currentTurn: text("current_turn").notNull().$type(),
  status: text("status").notNull().$type(),
  mode: text("mode").notNull().default("vs_player").$type(),
  timeControl: integer("time_control").notNull().default(10),
  // in minutes
  whiteTimeRemaining: integer("white_time_remaining").notNull().default(6e5),
  // ms (10 mins)
  blackTimeRemaining: integer("black_time_remaining").notNull().default(6e5),
  // ms
  lastMoveTime: integer("last_move_time"),
  // timestamp
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
  id: "95e928ba95487362d6afff6ca4d515806e7e351fbe6afa5f24801262b3067845",
  name: "getBoard",
  filename: "src/lib/index.ts"
}, (opts, signal) => getBoard.__executeServer(opts, signal));
const getBoard = createServerFn({
  method: "POST"
}).inputValidator((data) => data).handler(getBoard_createServerFn_handler, async ({
  data
}) => {
  try {
    const mode = data?.mode || "vs_player";
    const serverTime = Date.now();
    let currentGame = await db.query.games.findFirst({
      where: eq(games.mode, mode),
      orderBy: desc(games.updatedAt)
    });
    if (!currentGame) {
      console.log(`No ${mode} game found, creating new one`);
      const initialData = initializeGame();
      const [newGame] = await db.insert(games).values({
        currentTurn: initialData.turn,
        status: "Ongoing",
        mode,
        timeControl: mode === "vs_computer" ? 0 : 10,
        whiteTimeRemaining: mode === "vs_computer" ? Number.MAX_SAFE_INTEGER : 10 * 60 * 1e3,
        blackTimeRemaining: mode === "vs_computer" ? Number.MAX_SAFE_INTEGER : 10 * 60 * 1e3,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }).returning();
      if (newGame) {
        const piecesToInsert = initialData.pieces.map((piece) => ({
          gameId: newGame.id,
          color: piece.color,
          pieceType: piece.pieceType,
          square: piece.square,
          hasMoved: false
        }));
        await db.insert(pieces).values(piecesToInsert);
        currentGame = newGame;
      }
    }
    if (!currentGame) {
      return {
        id: 0,
        pieces: [],
        turn: "White",
        status: "Ongoing",
        moves: [],
        mode,
        timeControl: 10,
        whiteTimeRemaining: 6e5,
        blackTimeRemaining: 6e5,
        lastMoveTime: null,
        lastMove: null,
        capturedPieces: {
          white: [],
          black: []
        }
      };
    }
    const pieces$1 = await db.query.pieces.findMany({
      where: eq(pieces.gameId, currentGame.id)
    });
    if (currentGame.status === "Ongoing" && currentGame.lastMoveTime && currentGame.timeControl !== 0) {
      const now = Date.now();
      const elapsed = now - currentGame.lastMoveTime;
      const isWhiteTurn = currentGame.currentTurn === "White";
      const timeRemaining = isWhiteTurn ? currentGame.whiteTimeRemaining : currentGame.blackTimeRemaining;
      if (timeRemaining - elapsed <= 0) {
        console.log("Game timed out!");
        await db.update(games).set({
          status: "Timeout",
          updatedAt: now
        }).where(eq(games.id, currentGame.id));
        currentGame.status = "Timeout";
      }
    }
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
    const lastMove = formattedMoves.length > 0 ? {
      from: formattedMoves[formattedMoves.length - 1].from,
      to: formattedMoves[formattedMoves.length - 1].to
    } : null;
    return {
      id: currentGame.id,
      pieces: piecesResponse,
      capturedPieces,
      moves: formattedMoves,
      turn: currentGame.currentTurn,
      status: currentGame.status,
      mode: currentGame.mode,
      timeControl: currentGame.timeControl,
      whiteTimeRemaining: currentGame.whiteTimeRemaining,
      blackTimeRemaining: currentGame.blackTimeRemaining,
      lastMoveTime: currentGame.lastMoveTime,
      lastMove,
      serverTime
    };
  } catch (error) {
    console.error("Error in getBoard:", error);
    throw error;
  }
});
const getMoves_createServerFn_handler = createServerRpc({
  id: "129631420af401c96c262730d653c85520c7f45abbe9f9f1a0c226afe377ba96",
  name: "getMoves",
  filename: "src/lib/index.ts"
}, (opts, signal) => getMoves.__executeServer(opts, signal));
const getMoves = createServerFn({
  method: "POST"
}).inputValidator((data) => data).handler(getMoves_createServerFn_handler, async ({
  data: {
    square,
    gameId
  }
}) => {
  console.log(`Getting valid moves for square: ${square} in game ${gameId}`);
  try {
    const currentGame = await db.query.games.findFirst({
      where: eq(games.id, gameId)
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
    return validMoves;
  } catch (error) {
    console.error("Error in getMoves:", error);
    throw error;
  }
});
const undoMove_createServerFn_handler = createServerRpc({
  id: "5cf45770ffbf97d3683ac5adc5168882f2e630c097070095eaae54df0a1c213d",
  name: "undoMove",
  filename: "src/lib/index.ts"
}, (opts, signal) => undoMove.__executeServer(opts, signal));
const undoMove = createServerFn({
  method: "POST"
}).inputValidator((data) => data).handler(undoMove_createServerFn_handler, async ({
  data: {
    gameId
  }
}) => {
  console.log(`Undoing last move in game ${gameId}`);
  try {
    const currentGame = await db.query.games.findFirst({
      where: eq(games.id, gameId)
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
        hasMoved: false
      }).where(eq(pieces.id, movedPiece.id));
    }
    if (lastMove.capturedPieceType) {
      const capturedColor = lastMove.pieceColor === "White" ? "Black" : "White";
      await db.insert(pieces).values({
        gameId: currentGame.id,
        color: capturedColor,
        pieceType: lastMove.capturedPieceType,
        square: lastMove.toSquare,
        hasMoved: true
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
const makeMove_createServerFn_handler = createServerRpc({
  id: "1108d962036347ce5bf840bba29e0af741ec3c05516bd6276164d3217127b51f",
  name: "makeMove",
  filename: "src/lib/index.ts"
}, (opts, signal) => makeMove.__executeServer(opts, signal));
const makeMove = createServerFn({
  method: "POST"
}).inputValidator((args) => args).handler(makeMove_createServerFn_handler, async ({
  data: {
    from,
    to,
    gameId
  }
}) => {
  try {
    const currentGame = await db.query.games.findFirst({
      where: eq(games.id, gameId)
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
    const now = Date.now();
    let whiteTime = currentGame.whiteTimeRemaining;
    let blackTime = currentGame.blackTimeRemaining;
    if (currentGame.lastMoveTime && currentGame.timeControl !== 0) {
      const elapsed = now - currentGame.lastMoveTime;
      if (currentGame.currentTurn === "White") {
        whiteTime = Math.max(0, whiteTime - elapsed);
      } else {
        blackTime = Math.max(0, blackTime - elapsed);
      }
    }
    const movingPiece = pieces$1.find((p) => p.square === from);
    if (!movingPiece) throw new Error("Piece not found");
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
      createdAt: now
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
      updatedAt: now,
      lastMoveTime: now,
      whiteTimeRemaining: whiteTime,
      blackTimeRemaining: blackTime
    }).where(eq(games.id, currentGame.id));
    if (currentGame.mode === "vs_computer" && nextTurn === "Black" && newStatus === "Ongoing") {
      const fen = piecesToFen(updatedPieces, nextTurn, currentMove || void 0);
      fetch("http://127.0.0.1:8080/api/engine-move", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fen
        })
      }).then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          if (data.best_move) {
            const uciMove = data.best_move;
            const fromFile = uciMove.charCodeAt(0) - 97;
            const fromRank = 8 - parseInt(uciMove[1]);
            const toFile = uciMove.charCodeAt(2) - 97;
            const toRank = 8 - parseInt(uciMove[3]);
            const fromSquare = getSquareFromRowCol(fromRank, fromFile);
            const toSquare = getSquareFromRowCol(toRank, toFile);
            await applyMove(currentGame.id, fromSquare, toSquare);
          }
        }
      }).catch((e) => {
        console.error("Failed to get computer move:", e);
      });
    }
    return {
      success: true,
      nextTurn,
      status: newStatus,
      captured: capturedPieceType !== void 0
    };
  } catch (e) {
    console.error(e);
    throw e;
  }
});
async function applyMove(gameId, from, to) {
  const pieces$1 = await db.query.pieces.findMany({
    where: eq(pieces.gameId, gameId)
  });
  const movingPiece = pieces$1.find((p) => p.square === from);
  if (!movingPiece) return;
  const capturedPiece = pieces$1.find((p) => p.square === to);
  let capturedPieceType;
  if (capturedPiece) {
    capturedPieceType = capturedPiece.pieceType;
    await db.delete(pieces).where(and(eq(pieces.gameId, gameId), eq(pieces.square, to)));
  } else if (movingPiece.pieceType === "Pawn" && getCol(from) !== getCol(to)) {
    const capturedPawnSquare = getSquareFromRowCol(getRow(from), getCol(to));
    const enPassantPiece = pieces$1.find((p) => p.square === capturedPawnSquare);
    if (enPassantPiece) {
      capturedPieceType = enPassantPiece.pieceType;
      await db.delete(pieces).where(and(eq(pieces.gameId, gameId), eq(pieces.square, capturedPawnSquare)));
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
    }).where(and(eq(pieces.gameId, gameId), eq(pieces.square, rookFromSquare)));
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
  }).where(and(eq(pieces.gameId, gameId), eq(pieces.square, from)));
  const moveCount = await db.query.moves.findMany({
    where: eq(moves.gameId, gameId)
  });
  await db.insert(moves).values({
    gameId,
    fromSquare: from,
    toSquare: to,
    pieceType: movingPiece.pieceType,
    pieceColor: movingPiece.color,
    capturedPieceType,
    moveNumber: moveCount.length + 1,
    createdAt: Date.now()
  });
  const updatedPieces = await db.query.pieces.findMany({
    where: eq(pieces.gameId, gameId)
  });
  const nextTurn = movingPiece.color === "White" ? "Black" : "White";
  const lastMove = await db.query.moves.findFirst({
    where: eq(moves.gameId, gameId),
    orderBy: desc(moves.moveNumber)
  });
  const newStatus = getGameStatus(updatedPieces, nextTurn, lastMove);
  await db.update(games).set({
    currentTurn: nextTurn,
    status: newStatus,
    updatedAt: Date.now(),
    lastMoveTime: Date.now()
  }).where(eq(games.id, gameId));
}
const resetGame_createServerFn_handler = createServerRpc({
  id: "4180547286fb2de3eb3b3ca5e12fd7958423f6106b062ea5571396a6374ce00d",
  name: "resetGame",
  filename: "src/lib/index.ts"
}, (opts, signal) => resetGame.__executeServer(opts, signal));
const resetGame = createServerFn({
  method: "POST"
}).inputValidator((args) => args).handler(resetGame_createServerFn_handler, async ({
  data
}) => {
  const mode = data?.mode || "vs_player";
  const timeControl = data?.timeControl !== void 0 ? data.timeControl : 10;
  console.log(`Starting new game: ${mode}, ${timeControl} mins`);
  try {
    const gamesToDelete = await db.query.games.findMany({
      where: eq(games.mode, mode)
    });
    const gameIds = gamesToDelete.map((g) => g.id);
    if (gameIds.length > 0) {
      await db.delete(moves).where(inArray(moves.gameId, gameIds));
      await db.delete(pieces).where(inArray(pieces.gameId, gameIds));
      await db.delete(games).where(inArray(games.id, gameIds));
    }
    const initialData = initializeGame();
    const [newGame] = await db.insert(games).values({
      currentTurn: initialData.turn,
      status: "Ongoing",
      mode,
      timeControl,
      whiteTimeRemaining: timeControl === 0 ? Number.MAX_SAFE_INTEGER : timeControl * 60 * 1e3,
      blackTimeRemaining: timeControl === 0 ? Number.MAX_SAFE_INTEGER : timeControl * 60 * 1e3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastMoveTime: null
    }).returning();
    if (newGame) {
      const piecesToInsert = initialData.pieces.map((piece) => ({
        gameId: newGame.id,
        color: piece.color,
        pieceType: piece.pieceType,
        square: piece.square,
        hasMoved: false
      }));
      await db.insert(pieces).values(piecesToInsert);
    }
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
  q as queryClient,
  resetGame_createServerFn_handler,
  undoMove_createServerFn_handler
};
