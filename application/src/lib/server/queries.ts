import { createServerFn } from "@tanstack/solid-start";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../../db";
import {
  getCol,
  getRow,
  getValidMoves,
  initializeGame,
} from "../chess";
import type { BoardResponse } from "./types";
import type { PieceType } from "../../db/schema";

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
           const piecesToInsert = initialData.pieces.map((piece: any) => ({
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
      
      const formattedMoves = moveHistory.map((move: any) => {
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
