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
  turn: Color;
  status: GameStatus;
};

export const getBoard = createServerFn({ method: "POST" }).handler(async () => {
  try {
    let currentGame = await db.query.games.findFirst({
      orderBy: desc(schema.games.updatedAt),
    });

    if (!currentGame) {
      console.log("No game found, creating new one");
      
      const initialData = initializeGame();

      const [newGame] = await db
        .insert(schema.games)
        .values({
          currentTurn: initialData.turn,
          status: "Ongoing",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        .returning();

      if (newGame) {
        console.log(`Created new game with ID ${newGame.id}`);
        // Insert pieces
        const piecesToInsert = initialData.pieces.map((piece) => ({
          gameId: newGame.id,
          color: piece.color,
          pieceType: piece.pieceType,
          square: piece.square,
          hasMoved: false,
        }));

        await db.insert(schema.pieces).values(piecesToInsert);
        console.log(
          `Inserted ${piecesToInsert.length} pieces for game ${newGame.id}`,
        );

        currentGame = newGame;
      }
    }

    if (!currentGame) {
      console.error("Failed to create or retrieve game");
      return { pieces: [], turn: "White", status: "Ongoing" } as BoardResponse;
    }

    // Get current pieces
    const pieces = await db.query.pieces.findMany({
      where: eq(schema.pieces.gameId, currentGame.id),
    });

    // Get captured pieces from move history
    const moveHistory = await db.query.moves.findMany({
      where: eq(schema.moves.gameId, currentGame.id),
    });

    const capturedPieces: { white: PieceType[]; black: PieceType[] } = {
      white: [],
      black: [],
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

    const piecesResponse = pieces.map((piece) => ({
      color: piece.color,
      piece_type: piece.pieceType,
      square: piece.square,
    }));

    console.log(
      `Retrieved game ${currentGame.id} with ${pieces.length} pieces, turn: ${currentGame.currentTurn}`,
    );
    return {
      pieces: piecesResponse,
      capturedPieces,
      turn: currentGame.currentTurn,
      status: currentGame.status,
    } as BoardResponse;
  } catch (error) {
    console.error("Error in getBoard:", error);
    throw error;
  }
});

export const getMoves = createServerFn({ method: "POST" })
  .inputValidator((square: number) => square)
  .handler(async ({ data: square }) => {
    console.log(`Getting valid moves for square: ${square}`);

    try {
      // Get current game
      const currentGame = await db.query.games.findFirst({
        orderBy: desc(schema.games.updatedAt),
      });

      if (!currentGame) {
        console.log("No game found");
        return [];
      }

      // Get all pieces for this game
      const pieces = await db.query.pieces.findMany({
        where: eq(schema.pieces.gameId, currentGame.id),
      });

      // Get last move for en passant
      const lastMove = await db.query.moves.findFirst({
        where: eq(schema.moves.gameId, currentGame.id),
        orderBy: desc(schema.moves.moveNumber),
      });

      const validMoves = getValidMoves(pieces, square, lastMove);
      console.log(
        `Found ${validMoves.length} valid moves for square ${square}`,
      );
      return validMoves;
    } catch (error) {
      console.error("Error in getMoves:", error);
      throw error;
    }
  });

export const makeMove = createServerFn({ method: "POST" })
  .inputValidator((args: { from: number; to: number }) => args)
  .handler(async ({ data: { from, to } }) => {
    console.log(`Making move from ${from} to ${to}`);

    try {
      // Get current game
      const currentGame = await db.query.games.findFirst({
        orderBy: desc(schema.games.updatedAt),
      });

      if (!currentGame) {
        throw new Error("No game found");
      }

      if (currentGame.status !== "Ongoing") {
        throw new Error("Game is not ongoing");
      }

      // Get all pieces for this Game
      const pieces = await db.query.pieces.findMany({
        where: eq(schema.pieces.gameId, currentGame.id),
      });

      // Get last move for en passant validation
      const lastMove = await db.query.moves.findFirst({
        where: eq(schema.moves.gameId, currentGame.id),
        orderBy: desc(schema.moves.moveNumber),
      });

      // Validate move
      if (!isLegalMove(pieces, from, to, currentGame.currentTurn, lastMove)) {
        throw new Error("Invalid move");
      }

      const movingPiece = pieces.find((p) => p.square === from);
      if (!movingPiece || movingPiece.color !== currentGame.currentTurn) {
        throw new Error("No valid piece found at that square");
      }

      // Check for capture (regular)
      const capturedPiece = pieces.find((p) => p.square === to);
      let capturedPieceType: PieceType | undefined;

      if (capturedPiece) {
        capturedPieceType = capturedPiece.pieceType;
        // Remove captured piece
        await db
          .delete(schema.pieces)
          .where(
            and(
              eq(schema.pieces.gameId, currentGame.id),
              eq(schema.pieces.square, to),
            ),
          );
      } else if (
        movingPiece.pieceType === "Pawn" &&
        getCol(from) !== getCol(to)
      ) {
        // En passant capture
        const capturedPawnSquare = getSquareFromRowCol(
          getRow(from),
          getCol(to),
        );
        const enPassantPiece = pieces.find(
          (p) => p.square === capturedPawnSquare,
        );
        if (enPassantPiece) {
          capturedPieceType = enPassantPiece.pieceType;
          await db
            .delete(schema.pieces)
            .where(
              and(
                eq(schema.pieces.gameId, currentGame.id),
                eq(schema.pieces.square, capturedPawnSquare),
              ),
            );
        }
      }

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

      // Update moving piece position
      let finalPieceType = movingPiece.pieceType;
      // Pawn Promotion (default to Queen)
      if (movingPiece.pieceType === "Pawn") {
        const targetRow = movingPiece.color === "White" ? 0 : 7;
        if (getRow(to) === targetRow) {
          finalPieceType = "Queen";
        }
      }

      await db
        .update(schema.pieces)
        .set({
          square: to,
          hasMoved: true,
          pieceType: finalPieceType,
        })
        .where(
          and(
            eq(schema.pieces.gameId, currentGame.id),
            eq(schema.pieces.square, from),
          ),
        );

      // Record move
      const moveCount = await db.query.moves.findMany({
        where: eq(schema.moves.gameId, currentGame.id),
      });

      await db.insert(schema.moves).values({
        gameId: currentGame.id,
        fromSquare: from,
        toSquare: to,
        pieceType: movingPiece.pieceType,
        pieceColor: movingPiece.color,
        capturedPieceType: capturedPieceType,
        moveNumber: moveCount.length + 1,
        createdAt: Date.now(),
      });

      // Get updated pieces to check for game status
      const updatedPieces = await db.query.pieces.findMany({
        where: eq(schema.pieces.gameId, currentGame.id),
      });
      const nextTurn: Color =
        currentGame.currentTurn === "White" ? "Black" : "White";

      // Get last move again (the one we just inserted)
      const currentMove = await db.query.moves.findFirst({
        where: eq(schema.moves.gameId, currentGame.id),
        orderBy: desc(schema.moves.moveNumber),
      });

      const newStatus = getGameStatus(updatedPieces, nextTurn, currentMove);

      // Switch turn and update status
      await db
        .update(schema.games)
        .set({
          currentTurn: nextTurn,
          status: newStatus,
          updatedAt: Date.now(),
        })
        .where(eq(schema.games.id, currentGame.id));

      console.log(
        `Move completed successfully. Next turn: ${nextTurn}, Status: ${newStatus}`,
      );
      return {
        success: true,
        nextTurn,
        status: newStatus,
        captured: capturedPieceType !== undefined,
      };
    } catch (error) {
      console.error("Error in makeMove:", error);
      throw error;
    }
  });

export const resetGame = createServerFn({ method: "POST" }).handler(
  async () => {
    console.log("Resetting game in database");

    try {
      // Delete all moves, then pieces, then games to avoid FK constraint errors
      await db.delete(schema.moves);
      await db.delete(schema.pieces);
      await db.delete(schema.games);

      // Create new game will be handled by getBoard on next request
      console.log("Game reset successfully");
      return { success: true };
    } catch (error) {
      console.error("Error in resetGame:", error);
      throw error;
    }
  },
);
