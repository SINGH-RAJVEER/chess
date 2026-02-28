import { createServerFn } from "@tanstack/solid-start";
import { and, desc, eq, or } from "drizzle-orm";
import { db, schema } from "@chess/db";
import type { PieceType } from "@chess/types";
import type { Game } from "@chess/db/schema";
import { getCol, getRow, getValidMoves, initializeGame } from "../chess";
import type { BoardResponse } from "./types";

export const getQueueStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { playerId: string }) => data)
  .handler(async ({ data: { playerId } }) => {
    // Check if in queue
    const queueEntry = await db.query.queue.findFirst({
      where: eq(schema.queue.playerId, playerId),
    });

    if (queueEntry) {
      return { status: "queued", timeControl: queueEntry.timeControl };
    }

    // Check if in active game (matched)
    const activeGame = await db.query.games.findFirst({
      where: and(
        eq(schema.games.status, "Ongoing"),
        or(
          eq(schema.games.whitePlayerId, playerId),
          eq(schema.games.blackPlayerId, playerId),
        ),
      ),
      orderBy: desc(schema.games.updatedAt),
    });

    if (activeGame) {
      return { status: "matched", gameId: activeGame.id };
    }

    return { status: "idle" };
  });

export const getBoard = createServerFn({ method: "POST" })
  .inputValidator(
    (data?: {
      mode?: "vs_player" | "vs_computer";
      gameId?: number;
      playerId?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    try {
      const mode = data?.mode || "vs_player";
      const gameId = data?.gameId;
      const playerId = data?.playerId;
      const serverTime = Date.now();

      let currentGame: Game | undefined;

      if (gameId) {
        currentGame = await db.query.games.findFirst({
          where: eq(schema.games.id, gameId),
        });
      } else if (playerId && mode === "vs_player") {
        currentGame = await db.query.games.findFirst({
          where: and(
            or(
              eq(schema.games.status, "Ongoing"),
              eq(schema.games.status, "Checkmate"), // Show finished games too
              eq(schema.games.status, "Stalemate"),
              eq(schema.games.status, "Timeout"),
            ),
            or(
              eq(schema.games.whitePlayerId, playerId),
              eq(schema.games.blackPlayerId, playerId),
            ),
          ),
          orderBy: desc(schema.games.updatedAt),
        });
      } else if (mode === "vs_computer") {
        // Legacy/Fallback for computer: Find ANY vs_computer game or create one
        // Ideally should be per-player too if playerId is present
        currentGame = await db.query.games.findFirst({
          where: eq(schema.games.mode, "vs_computer"),
          orderBy: desc(schema.games.updatedAt),
        });

        if (!currentGame) {
          const initialData = initializeGame();
          const [newGame] = await db
            .insert(schema.games)
            .values({
              currentTurn: initialData.turn,
              status: "Ongoing",
              mode: "vs_computer",
              timeControl: 0,
              whiteTimeRemaining: Number.MAX_SAFE_INTEGER,
              blackTimeRemaining: Number.MAX_SAFE_INTEGER,
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
      }

      if (!currentGame) {
        const initialData = initializeGame();
        const piecesResponse = initialData.pieces.map((piece) => ({
          color: piece.color,
          piece_type: piece.pieceType,
          square: piece.square,
        }));

        return {
          id: 0,
          pieces: piecesResponse,
          turn: "White",
          status: "Ongoing",
          moves: [],
          mode: mode,
          timeControl: 10,
          whiteTimeRemaining: 600000,
          blackTimeRemaining: 600000,
          lastMoveTime: null,
          lastMove: null,
          capturedPieces: { white: [], black: [] },
          serverTime: Date.now(),
        } as BoardResponse;
      }

      const pieces = await db.query.pieces.findMany({
        where: eq(schema.pieces.gameId, currentGame.id),
      });

      // Check for Timeout
      if (
        currentGame.status === "Ongoing" &&
        currentGame.lastMoveTime &&
        currentGame.timeControl !== 0
      ) {
        const now = Date.now();
        const elapsed = now - currentGame.lastMoveTime;
        const isWhiteTurn = currentGame.currentTurn === "White";
        const timeRemaining = isWhiteTurn
          ? currentGame.whiteTimeRemaining
          : currentGame.blackTimeRemaining;

        if (timeRemaining - elapsed <= 0) {
          console.log("Game timed out!");
          await db
            .update(schema.games)
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
          captured: move.capturedPieceType || undefined,
          notation,
        };
      });

      const piecesResponse = pieces.map((piece) => ({
        color: piece.color,
        piece_type: piece.pieceType,
        square: piece.square,
      }));

      const lastMove =
        formattedMoves.length > 0
          ? {
              from: formattedMoves[formattedMoves.length - 1].from,
              to: formattedMoves[formattedMoves.length - 1].to,
            }
          : null;

      let userColor = "Spectator";
      if (playerId) {
        if (currentGame.whitePlayerId === playerId) userColor = "White";
        else if (currentGame.blackPlayerId === playerId) userColor = "Black";
      }

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
        userColor,
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
