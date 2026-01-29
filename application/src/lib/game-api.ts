import { createServerFn } from "@tanstack/solid-start";
import { and, desc, eq } from "drizzle-orm";
import {
  getCol,
  getGameStatus,
  getRow,
  getSquareFromRowCol,
  getValidMoves,
  initializeGame,
  isLegalMove,
} from "./chess/index";
import { db, schema } from "../db";
import type { Color, GameStatus, PieceType } from "../db/schema";

export type BoardResponse = {
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
};

export const getBoard = createServerFn({ method: "POST" }).handler(async () => {
  try {
    let currentGame = await db.query.games.findFirst({
      orderBy: desc(schema.games.updatedAt),
    });

    if (!currentGame) {
      console.log("No game found, creating new one");
      // Default creation if accessed directly without reset
      const initialData = initializeGame();

      const [newGame] = await db
        .insert(schema.games)
        .values({
          currentTurn: initialData.turn,
          status: "Ongoing",
          mode: "vs_player",
          timeControl: 10,
          whiteTimeRemaining: 10 * 60 * 1000,
          blackTimeRemaining: 10 * 60 * 1000,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        .returning();

      if (newGame) {
        // ... insert pieces (same as before)
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
       return { pieces: [], turn: "White", status: "Ongoing", moves: [], mode: "vs_player", timeControl: 10, whiteTimeRemaining: 600000, blackTimeRemaining: 600000, lastMoveTime: null, capturedPieces: { white: [], black: [] } } as BoardResponse;
    }

    // Get pieces and moves (same as before)
    const pieces = await db.query.pieces.findMany({
      where: eq(schema.pieces.gameId, currentGame.id),
    });

    const moveHistory = await db.query.moves.findMany({
      where: eq(schema.moves.gameId, currentGame.id),
      orderBy: schema.moves.moveNumber,
    });

    const capturedPieces: { white: PieceType[]; black: PieceType[] } = {
      white: [],
      black: [],
    };
    
    const formattedMoves = moveHistory.map(move => {
      // ... (notation logic same as before)
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

    return {
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
    } as BoardResponse;
  } catch (error) {
    console.error("Error in getBoard:", error);
    throw error;
  }
});

// ... getMoves ...
export const getMoves = createServerFn({ method: "POST" })
  .inputValidator((square: number) => square)
  .handler(async ({ data: square }) => {
     // ... (Keep existing implementation)
     console.log(`Getting valid moves for square: ${square}`);
    try {
      const currentGame = await db.query.games.findFirst({
        orderBy: desc(schema.games.updatedAt),
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
    
    
    export const undoMove = createServerFn({ method: "POST" }).handler(async () => {
      console.log("Undoing last move");
      try {
         const currentGame = await db.query.games.findFirst({
            orderBy: desc(schema.games.updatedAt),
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
    
    
    export const makeMove = createServerFn({ method: "POST" })  .inputValidator((args: { from: number; to: number }) => args)
  .handler(async ({ data: { from, to } }) => {
    // ... (Keep existing validation logic)
    try {
      const currentGame = await db.query.games.findFirst({
        orderBy: desc(schema.games.updatedAt),
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
      
      // ... Capture/EnPassant/Castling Logic ...
      // To save space, I will copy the logic but insert the Time Update here
      
      // TIME UPDATE LOGIC
      const now = Date.now();
      let whiteTime = currentGame.whiteTimeRemaining;
      let blackTime = currentGame.blackTimeRemaining;
      
      // If this is NOT the very first move of the game (or handling for first move)
      // We assume if lastMoveTime is set, we deduct.
      if (currentGame.lastMoveTime && currentGame.timeControl !== 0) {
          const elapsed = now - currentGame.lastMoveTime;
          if (currentGame.currentTurn === "White") {
              whiteTime = Math.max(0, whiteTime - elapsed);
          } else {
              blackTime = Math.max(0, blackTime - elapsed);
          }
      }

      // ... Proceed with Piece Updates ...
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

      // Record Move
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

      // Status Update
      const updatedPieces = await db.query.pieces.findMany({ where: eq(schema.pieces.gameId, currentGame.id) });
      const nextTurn: Color = currentGame.currentTurn === "White" ? "Black" : "White";
      const currentMove = await db.query.moves.findFirst({ where: eq(schema.moves.gameId, currentGame.id), orderBy: desc(schema.moves.moveNumber) });
      const newStatus = getGameStatus(updatedPieces, nextTurn, currentMove);

      // Update Game
      await db.update(schema.games).set({
          currentTurn: nextTurn,
          status: newStatus,
          updatedAt: now,
          lastMoveTime: now, // Set the timestamp for the next turn's calculation
          whiteTimeRemaining: whiteTime,
          blackTimeRemaining: blackTime
        }).where(eq(schema.games.id, currentGame.id));

      return { success: true, nextTurn, status: newStatus, captured: capturedPieceType !== undefined };

    } catch (e) {
      console.error(e);
      throw e;
    }
  });

export const resetGame = createServerFn({ method: "POST" })
  .inputValidator((args: { mode: "vs_player" | "vs_computer"; timeControl: number } | undefined) => args)
  .handler(async ({ data }) => {
    const mode = data?.mode || "vs_player";
    const timeControl = data?.timeControl !== undefined ? data.timeControl : 10;
    
    console.log(`Starting new game: ${mode}, ${timeControl} mins`);

    try {
      await db.delete(schema.moves);
      await db.delete(schema.pieces);
      await db.delete(schema.games);
      
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
          lastMoveTime: null // Reset timer
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
