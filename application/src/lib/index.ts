import { createServerFn } from "@tanstack/solid-start";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  getCol,
  getGameStatus,
  getRow,
  getSquareFromRowCol,
  getValidMoves,
  initializeGame,
  isLegalMove,
  piecesToFen,
} from "./chess/index";
import { db, schema } from "../db";
import type { Color, GameStatus, PieceType } from "../db/schema";

export * from "./query";

export type BoardResponse = {
  id: number;
  pieces: {
    color: Color;
    piece_type: PieceType;
    square: number;
  }[];
  capturedPieces: {
    white: PieceType[];
    black: PieceType[];
  };
  moves: {
    from: number;
    to: number;
    color: Color;
    pieceType: PieceType;
    captured?: PieceType;
    notation: string;
  }[];
  turn: Color;
  status: GameStatus;
  mode: "vs_player" | "vs_computer";
  timeControl: number;
  whiteTimeRemaining: number;
  blackTimeRemaining: number;
  lastMoveTime: number | null;
  lastMove: {
    from: number;
    to: number;
  } | null;
  serverTime: number;
};

export const getBoard = createServerFn({ method: "POST" })
  .inputValidator((data?: { mode?: "vs_player" | "vs_computer" }) => data)
  .handler(async ({ data }) => {
    try {
      const mode = data?.mode || "vs_player";
      const serverTime = Date.now();
      
      let currentGame = await db.query.games.findFirst({
        where: eq(schema.games.mode, mode),
        orderBy: desc(schema.games.updatedAt),
      });

      if (!currentGame) {
        console.log(`No ${mode} game found, creating new one`);
        // Default creation if accessed directly without reset
        const initialData = initializeGame();

        const [newGame] = await db
          .insert(schema.games)
          .values({
            currentTurn: initialData.turn,
            status: "Ongoing",
            mode: mode,
            timeControl: mode === "vs_computer" ? 0 : 10,
            whiteTimeRemaining: mode === "vs_computer" ? Number.MAX_SAFE_INTEGER : 10 * 60 * 1000,
            blackTimeRemaining: mode === "vs_computer" ? Number.MAX_SAFE_INTEGER : 10 * 60 * 1000,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
          .returning();

        if (newGame) {
           const piecesToInsert = initialData.pieces.map((piece) => ({
            gameId: newGame.id,
            color: piece.color,
            pieceType: piece.pieceType,
            square: piece.square,
            hasMoved: false,
          }));
          await db.insert(schema.pieces).values(piecesToInsert);
          currentGame = newGame;
        }
      }

      if (!currentGame) {
         return { id: 0, pieces: [], turn: "White", status: "Ongoing", moves: [], mode: mode, timeControl: 10, whiteTimeRemaining: 600000, blackTimeRemaining: 600000, lastMoveTime: null, lastMove: null, capturedPieces: { white: [], black: [] } } as BoardResponse;
      }

      const pieces = await db.query.pieces.findMany({
        where: eq(schema.pieces.gameId, currentGame.id),
      });

      // Check for Timeout
      if (currentGame.status === "Ongoing" && currentGame.lastMoveTime && currentGame.timeControl !== 0) {
        const now = Date.now();
        const elapsed = now - currentGame.lastMoveTime;
        const isWhiteTurn = currentGame.currentTurn === "White";
        const timeRemaining = isWhiteTurn 
          ? currentGame.whiteTimeRemaining 
          : currentGame.blackTimeRemaining;

        if (timeRemaining - elapsed <= 0) {
          console.log("Game timed out!");
          await db.update(schema.games)
            .set({ status: "Timeout", updatedAt: now })
            .where(eq(schema.games.id, currentGame.id));
          currentGame.status = "Timeout";
        }
      }

      const moveHistory = await db.query.moves.findMany({
        where: eq(schema.moves.gameId, currentGame.id),
        orderBy: schema.moves.moveNumber,
      });

      const capturedPieces: { white: PieceType[]; black: PieceType[] } = {
        white: [],
        black: [],
      };
      
      const formattedMoves = moveHistory.map(move => {
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
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
          captured: move.capturedPieceType || undefined,
          notation
        };
      });

      const piecesResponse = pieces.map((piece) => ({
        color: piece.color,
        piece_type: piece.pieceType,
        square: piece.square,
      }));

      const lastMove = formattedMoves.length > 0 
        ? { from: formattedMoves[formattedMoves.length - 1].from, to: formattedMoves[formattedMoves.length - 1].to }
        : null;

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
        serverTime,
      } as BoardResponse;
    } catch (error) {
      console.error("Error in getBoard:", error);
      throw error;
    }
  });

export const getMoves = createServerFn({ method: "POST" })
  .inputValidator((data: { square: number; gameId: number }) => data)
  .handler(async ({ data: { square, gameId } }) => {
     console.log(`Getting valid moves for square: ${square} in game ${gameId}`);
    try {
      const currentGame = await db.query.games.findFirst({
        where: eq(schema.games.id, gameId),
      });

      if (!currentGame) {
        console.log("No game found");
        return [];
      }

      const pieces = await db.query.pieces.findMany({
        where: eq(schema.pieces.gameId, currentGame.id),
      });

      const lastMove = await db.query.moves.findFirst({
        where: eq(schema.moves.gameId, currentGame.id),
        orderBy: desc(schema.moves.moveNumber),
      });

      const validMoves = getValidMoves(pieces, square, lastMove);
      return validMoves;
        } catch (error) {
        console.error("Error in getMoves:", error);
        throw error;
      }
    });

export const undoMove = createServerFn({ method: "POST" })
  .inputValidator((data: { gameId: number }) => data)
  .handler(async ({ data: { gameId } }) => {
  console.log(`Undoing last move in game ${gameId}`);
  try {
     const currentGame = await db.query.games.findFirst({
        where: eq(schema.games.id, gameId),
      });

      if (!currentGame) {
        throw new Error("No game found");
      }

      // Get last move
      const lastMove = await db.query.moves.findFirst({
        where: eq(schema.moves.gameId, currentGame.id),
        orderBy: desc(schema.moves.moveNumber),
      });

      if (!lastMove) {
        return { success: false, message: "No moves to undo" };
      }

      // 1. Revert Piece Position
      const movedPiece = await db.query.pieces.findFirst({
        where: and(
          eq(schema.pieces.gameId, currentGame.id),
          eq(schema.pieces.square, lastMove.toSquare)
        )
      });

      if (movedPiece) {
        await db.update(schema.pieces)
          .set({
             square: lastMove.fromSquare,
             pieceType: lastMove.pieceType,
             hasMoved: false 
          })
          .where(eq(schema.pieces.id, movedPiece.id));
      }

      // 2. Restore Captured Piece
      if (lastMove.capturedPieceType) {
        const capturedColor = lastMove.pieceColor === "White" ? "Black" : "White";
        await db.insert(schema.pieces).values({
          gameId: currentGame.id,
          color: capturedColor,
          pieceType: lastMove.capturedPieceType,
          square: lastMove.toSquare,
          hasMoved: true 
        });
      }

      // 3. Un-Castle
      if (lastMove.pieceType === "King" && Math.abs(lastMove.fromSquare - lastMove.toSquare) === 2) {
        const isKingside = getCol(lastMove.toSquare) === 6;
        const rookCol = isKingside ? 7 : 0;
        const rookLandedCol = isKingside ? 5 : 3;
        const row = getRow(lastMove.fromSquare);
        
        const rookLandedSquare = getSquareFromRowCol(row, rookLandedCol);
        const rookOriginalSquare = getSquareFromRowCol(row, rookCol);
        
        await db.update(schema.pieces)
          .set({ square: rookOriginalSquare, hasMoved: false })
          .where(and(
             eq(schema.pieces.gameId, currentGame.id),
             eq(schema.pieces.square, rookLandedSquare),
             eq(schema.pieces.pieceType, "Rook")
          ));
      }

      // 4. Delete Move
      await db.delete(schema.moves).where(eq(schema.moves.id, lastMove.id));

      // 5. Revert Turn
      await db.update(schema.games)
        .set({
           currentTurn: lastMove.pieceColor,
           status: "Ongoing",
           updatedAt: Date.now()
        })
        .where(eq(schema.games.id, currentGame.id));

      return { success: true };

  } catch (e) {
    console.error("Undo failed:", e);
    throw e;
  }
});

export const makeMove = createServerFn({ method: "POST" })
  .inputValidator((args: { from: number; to: number; gameId: number }) => args)
  .handler(async ({ data: { from, to, gameId } }) => {
    try {
      const currentGame = await db.query.games.findFirst({
        where: eq(schema.games.id, gameId),
      });

      if (!currentGame) {
        throw new Error("No game found");
      }
      
      if (currentGame.status !== "Ongoing") {
         throw new Error("Game is not ongoing");
      }

      const pieces = await db.query.pieces.findMany({
        where: eq(schema.pieces.gameId, currentGame.id),
      });

      const lastMove = await db.query.moves.findFirst({
        where: eq(schema.moves.gameId, currentGame.id),
        orderBy: desc(schema.moves.moveNumber),
      });

      if (!isLegalMove(pieces, from, to, currentGame.currentTurn, lastMove)) {
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

       const movingPiece = pieces.find((p) => p.square === from);
      if (!movingPiece) throw new Error("Piece not found");

      // Check for capture
      const capturedPiece = pieces.find((p) => p.square === to);
      let capturedPieceType: PieceType | undefined;

      if (capturedPiece) {
        capturedPieceType = capturedPiece.pieceType;
        await db.delete(schema.pieces).where(and(eq(schema.pieces.gameId, currentGame.id), eq(schema.pieces.square, to)));
      } else if (movingPiece.pieceType === "Pawn" && getCol(from) !== getCol(to)) {
        // En Passant
        const capturedPawnSquare = getSquareFromRowCol(getRow(from), getCol(to));
        const enPassantPiece = pieces.find((p) => p.square === capturedPawnSquare);
         if (enPassantPiece) {
          capturedPieceType = enPassantPiece.pieceType;
          await db.delete(schema.pieces).where(and(eq(schema.pieces.gameId, currentGame.id), eq(schema.pieces.square, capturedPawnSquare)));
        }
      }

      // Castling
      if (movingPiece.pieceType === "King" && Math.abs(getCol(to) - getCol(from)) === 2) {
         const isKingside = getCol(to) === 6;
        const rookFromCol = isKingside ? 7 : 0;
        const rookToCol = isKingside ? 5 : 3;
        const rookFromSquare = getSquareFromRowCol(getRow(from), rookFromCol);
        const rookToSquare = getSquareFromRowCol(getRow(from), rookToCol);

        await db
          .update(schema.pieces)
          .set({
            square: rookToSquare,
            hasMoved: true,
          })
          .where(
            and(
              eq(schema.pieces.gameId, currentGame.id),
              eq(schema.pieces.square, rookFromSquare),
            ),
          );
      }
      
      // Promotion
      let finalPieceType = movingPiece.pieceType;
      if (movingPiece.pieceType === "Pawn") {
        const targetRow = movingPiece.color === "White" ? 0 : 7;
        if (getRow(to) === targetRow) {
          finalPieceType = "Queen";
        }
      }

      await db.update(schema.pieces).set({ square: to, hasMoved: true, pieceType: finalPieceType }).where(and(eq(schema.pieces.gameId, currentGame.id), eq(schema.pieces.square, from)));

      const moveCount = await db.query.moves.findMany({ where: eq(schema.moves.gameId, currentGame.id) });
      await db.insert(schema.moves).values({
        gameId: currentGame.id,
        fromSquare: from,
        toSquare: to,
        pieceType: movingPiece.pieceType,
        pieceColor: movingPiece.color,
        capturedPieceType: capturedPieceType,
        moveNumber: moveCount.length + 1,
        createdAt: now,
      });

      const updatedPieces = await db.query.pieces.findMany({ where: eq(schema.pieces.gameId, currentGame.id) });
      const nextTurn: Color = currentGame.currentTurn === "White" ? "Black" : "White";
      const currentMove = await db.query.moves.findFirst({ where: eq(schema.moves.gameId, currentGame.id), orderBy: desc(schema.moves.moveNumber) });
      const newStatus = getGameStatus(updatedPieces, nextTurn, currentMove);

      await db.update(schema.games).set({
          currentTurn: nextTurn,
          status: newStatus,
          updatedAt: now,
          lastMoveTime: now,
          whiteTimeRemaining: whiteTime,
          blackTimeRemaining: blackTime
        }).where(eq(schema.games.id, currentGame.id));

      if (currentGame.mode === "vs_computer" && nextTurn === "Black" && newStatus === "Ongoing") {
        const fen = piecesToFen(updatedPieces, nextTurn, currentMove || undefined);
        const engineUrl = process.env.CHESS_ENGINE_URL || "http://127.0.0.1:8080";
        fetch(`${engineUrl}/api/engine-move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fen }),
        })
          .then(async (response) => {
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
          })
          .catch((e) => {
            console.error("Failed to get computer move:", e);
          });
      }

      return { success: true, nextTurn, status: newStatus, captured: capturedPieceType !== undefined };

    } catch (e) {
      console.error(e);
      throw e;
    }
  });

async function applyMove(gameId: number, from: number, to: number) {
  const pieces = await db.query.pieces.findMany({
    where: eq(schema.pieces.gameId, gameId),
  });
  
  const movingPiece = pieces.find((p) => p.square === from);
  if (!movingPiece) return;

  const capturedPiece = pieces.find((p) => p.square === to);
  let capturedPieceType: PieceType | undefined;

  if (capturedPiece) {
    capturedPieceType = capturedPiece.pieceType;
    await db.delete(schema.pieces).where(and(eq(schema.pieces.gameId, gameId), eq(schema.pieces.square, to)));
  } else if (movingPiece.pieceType === "Pawn" && getCol(from) !== getCol(to)) {
    const capturedPawnSquare = getSquareFromRowCol(getRow(from), getCol(to));
    const enPassantPiece = pieces.find((p) => p.square === capturedPawnSquare);
    if (enPassantPiece) {
      capturedPieceType = enPassantPiece.pieceType;
      await db.delete(schema.pieces).where(and(eq(schema.pieces.gameId, gameId), eq(schema.pieces.square, capturedPawnSquare)));
    }
  }

  if (movingPiece.pieceType === "King" && Math.abs(getCol(to) - getCol(from)) === 2) {
      const isKingside = getCol(to) === 6;
      const rookFromCol = isKingside ? 7 : 0;
      const rookToCol = isKingside ? 5 : 3;
      const rookFromSquare = getSquareFromRowCol(getRow(from), rookFromCol);
      const rookToSquare = getSquareFromRowCol(getRow(from), rookToCol);

      await db.update(schema.pieces).set({ square: rookToSquare, hasMoved: true })
        .where(and(eq(schema.pieces.gameId, gameId), eq(schema.pieces.square, rookFromSquare)));
  }

  let finalPieceType = movingPiece.pieceType;
  if (movingPiece.pieceType === "Pawn") {
    const targetRow = movingPiece.color === "White" ? 0 : 7;
    if (getRow(to) === targetRow) {
      finalPieceType = "Queen";
    }
  }

  await db.update(schema.pieces).set({ square: to, hasMoved: true, pieceType: finalPieceType })
    .where(and(eq(schema.pieces.gameId, gameId), eq(schema.pieces.square, from)));

  const moveCount = await db.query.moves.findMany({ where: eq(schema.moves.gameId, gameId) });
  await db.insert(schema.moves).values({
    gameId: gameId,
    fromSquare: from,
    toSquare: to,
    pieceType: movingPiece.pieceType,
    pieceColor: movingPiece.color,
    capturedPieceType: capturedPieceType,
    moveNumber: moveCount.length + 1,
    createdAt: Date.now(),
  });

  const updatedPieces = await db.query.pieces.findMany({ where: eq(schema.pieces.gameId, gameId) });
  const nextTurn: Color = movingPiece.color === "White" ? "Black" : "White";
  const lastMove = await db.query.moves.findFirst({ where: eq(schema.moves.gameId, gameId), orderBy: desc(schema.moves.moveNumber) });
  const newStatus = getGameStatus(updatedPieces, nextTurn, lastMove);

  await db.update(schema.games).set({
    currentTurn: nextTurn,
    status: newStatus,
    updatedAt: Date.now(),
    lastMoveTime: Date.now(),
  }).where(eq(schema.games.id, gameId));
}

export const resetGame = createServerFn({ method: "POST" })
  .inputValidator((args: { mode: "vs_player" | "vs_computer"; timeControl: number } | undefined) => args)
  .handler(async ({ data }) => {
    const mode = data?.mode || "vs_player";
    const timeControl = data?.timeControl !== undefined ? data.timeControl : 10;
    
    console.log(`Starting new game: ${mode}, ${timeControl} mins`);

    try {
      const gamesToDelete = await db.query.games.findMany({
        where: eq(schema.games.mode, mode),
      });
      const gameIds = gamesToDelete.map(g => g.id);

      if (gameIds.length > 0) {
        await db.delete(schema.moves).where(inArray(schema.moves.gameId, gameIds));
        await db.delete(schema.pieces).where(inArray(schema.pieces.gameId, gameIds));
        await db.delete(schema.games).where(inArray(schema.games.id, gameIds));
      }
      
      const initialData = initializeGame();

      const [newGame] = await db
        .insert(schema.games)
        .values({
          currentTurn: initialData.turn,
          status: "Ongoing",
          mode: mode,
          timeControl: timeControl,
          whiteTimeRemaining: timeControl === 0 ? Number.MAX_SAFE_INTEGER : timeControl * 60 * 1000,
          blackTimeRemaining: timeControl === 0 ? Number.MAX_SAFE_INTEGER : timeControl * 60 * 1000,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastMoveTime: null
        })
        .returning();
        
      if (newGame) {
         const piecesToInsert = initialData.pieces.map((piece) => ({
          gameId: newGame.id,
          color: piece.color,
          pieceType: piece.pieceType,
          square: piece.square,
          hasMoved: false,
        }));
        await db.insert(schema.pieces).values(piecesToInsert);
      }

      return { success: true };
    } catch (error) {
      console.error("Error in resetGame:", error);
      throw error;
    }
  },
);