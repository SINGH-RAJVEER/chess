import { createServerFn } from "@tanstack/solid-start";
import { and, desc, eq, or } from "drizzle-orm";
import { db, schema } from "@chess/db";
import type { Color, PieceType } from "@chess/types";
import type { Game, Move, Piece } from "@chess/db/schema";
import {
  getCol,
  getGameStatus,
  getMoveDetails,
  getRow,
  getSquareFromRowCol,
  initializeGame,
  piecesToFen,
} from "../chess";
import { typeToPieceType } from "./utils";

export const resetGame = createServerFn({ method: "POST" })
  .inputValidator(
    (
      args:
        | { mode: "vs_player" | "vs_computer"; timeControl: number }
        | undefined,
    ) => args,
  )
  .handler(async ({ data }) => {
    const mode = data?.mode || "vs_player";
    const timeControl = data?.timeControl !== undefined ? data.timeControl : 10;

    console.log(`Reset request for: ${mode}`);

    // For vs_player, we don't reset globally anymore. Queue handles new games.
    if (mode === "vs_player") {
      return { success: true };
    }

    // For vs_computer, we can create a new game (legacy support)
    // But ideally we shouldn't delete others' games.
    // Let's just create a new one.

    const initialData = initializeGame();

    const [newGame] = await db
      .insert(schema.games)
      .values({
        currentTurn: initialData.turn,
        status: "Ongoing",
        mode: mode,
        timeControl: timeControl,
        whiteTimeRemaining:
          timeControl === 0 ? Number.MAX_SAFE_INTEGER : timeControl * 60 * 1000,
        blackTimeRemaining:
          timeControl === 0 ? Number.MAX_SAFE_INTEGER : timeControl * 60 * 1000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastMoveTime: null,
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
  });

export const joinQueue = createServerFn({ method: "POST" })
  .inputValidator((data: { playerId: string; timeControl: number }) => data)
  .handler(async ({ data: { playerId, timeControl } }) => {
    console.log(`Player ${playerId} joining queue for ${timeControl} min`);

    // 1. Check if player is already in a game
    const activeGame = await db.query.games.findFirst({
      where: and(
        eq(schema.games.status, "Ongoing"),
        or(
          eq(schema.games.whitePlayerId, playerId),
          eq(schema.games.blackPlayerId, playerId),
        ),
      ),
    });

    if (activeGame) {
      return { status: "matched", gameId: activeGame.id };
    }

    // 2. Check if player is already in queue (update timeControl if so?)
    const existingQueue = await db.query.queue.findFirst({
      where: eq(schema.queue.playerId, playerId),
    });

    if (existingQueue) {
      if (existingQueue.timeControl !== timeControl) {
        await db
          .update(schema.queue)
          .set({ timeControl, joinedAt: Date.now() })
          .where(eq(schema.queue.id, existingQueue.id));
      }
      // Check if matched (could happen if opponent joined meanwhile) - logic below handles matching
    }

    // 3. Look for opponent
    // Transaction ideally, but simple find-delete works for now with SQLite single-writer
    // (unused check removed)

    // Better: If I am in queue, remove me first to avoid self-match?
    // Or just look for someone else.

    // Let's remove self from queue to be clean before matching
    await db.delete(schema.queue).where(eq(schema.queue.playerId, playerId));

    const validOpponent = await db.query.queue.findFirst({
      where: eq(schema.queue.timeControl, timeControl),
      orderBy: schema.queue.joinedAt,
    });

    if (validOpponent) {
      // Match found!
      await db
        .delete(schema.queue)
        .where(eq(schema.queue.id, validOpponent.id));

      const isWhite = Math.random() < 0.5;
      const whiteId = isWhite ? playerId : validOpponent.playerId;
      const blackId = isWhite ? validOpponent.playerId : playerId;

      const initialData = initializeGame();

      const [newGame] = await db
        .insert(schema.games)
        .values({
          currentTurn: initialData.turn,
          status: "Ongoing",
          mode: "vs_player",
          timeControl: timeControl,
          whiteTimeRemaining:
            timeControl === 0
              ? Number.MAX_SAFE_INTEGER
              : timeControl * 60 * 1000,
          blackTimeRemaining:
            timeControl === 0
              ? Number.MAX_SAFE_INTEGER
              : timeControl * 60 * 1000,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastMoveTime: null,
          whitePlayerId: whiteId,
          blackPlayerId: blackId,
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
        return { status: "matched", gameId: newGame.id };
      }
    }

    // No opponent, add to queue
    await db.insert(schema.queue).values({
      playerId,
      timeControl,
      joinedAt: Date.now(),
    });

    return { status: "queued" };
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

      const lastMove = await db.query.moves.findFirst({
        where: eq(schema.moves.gameId, currentGame.id),
        orderBy: desc(schema.moves.moveNumber),
      });

      if (!lastMove) {
        return { success: false, message: "No moves to undo" };
      }

      const movedPiece = await db.query.pieces.findFirst({
        where: and(
          eq(schema.pieces.gameId, currentGame.id),
          eq(schema.pieces.square, lastMove.toSquare),
        ),
      });

      if (movedPiece) {
        await db
          .update(schema.pieces)
          .set({
            square: lastMove.fromSquare,
            pieceType: lastMove.pieceType,
            hasMoved: false,
          })
          .where(eq(schema.pieces.id, movedPiece.id));
      }

      if (lastMove.capturedPieceType) {
        const capturedColor =
          lastMove.pieceColor === "White" ? "Black" : "White";
        await db.insert(schema.pieces).values({
          gameId: currentGame.id,
          color: capturedColor,
          pieceType: lastMove.capturedPieceType,
          square: lastMove.toSquare,
          hasMoved: true,
        });
      }

      if (
        lastMove.pieceType === "King" &&
        Math.abs(lastMove.fromSquare - lastMove.toSquare) === 2
      ) {
        const isKingside = getCol(lastMove.toSquare) === 6;
        const rookCol = isKingside ? 7 : 0;
        const rookLandedCol = isKingside ? 5 : 3;
        const row = getRow(lastMove.fromSquare);

        const rookLandedSquare = getSquareFromRowCol(row, rookLandedCol);
        const rookOriginalSquare = getSquareFromRowCol(row, rookCol);

        await db
          .update(schema.pieces)
          .set({ square: rookOriginalSquare, hasMoved: false })
          .where(
            and(
              eq(schema.pieces.gameId, currentGame.id),
              eq(schema.pieces.square, rookLandedSquare),
              eq(schema.pieces.pieceType, "Rook"),
            ),
          );
      }

      await db.delete(schema.moves).where(eq(schema.moves.id, lastMove.id));

      await db
        .update(schema.games)
        .set({
          currentTurn: lastMove.pieceColor,
          status: "Ongoing",
          updatedAt: Date.now(),
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

      const moveDetails = getMoveDetails(
        pieces,
        from,
        to,
        currentGame.currentTurn,
        lastMove,
      );
      if (!moveDetails) {
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

      let capturedPieceType: PieceType | undefined;

      if (moveDetails.captured) {
        capturedPieceType = typeToPieceType(moveDetails.captured);
        let targetSquare = to;
        if (moveDetails.flags.includes("e")) {
          targetSquare = getSquareFromRowCol(getRow(from), getCol(to));
        }
        await db
          .delete(schema.pieces)
          .where(
            and(
              eq(schema.pieces.gameId, currentGame.id),
              eq(schema.pieces.square, targetSquare),
            ),
          );
      }

      if (moveDetails.flags.includes("k") || moveDetails.flags.includes("q")) {
        const isKingside = moveDetails.flags.includes("k");
        const row = getRow(from);
        const rookFromCol = isKingside ? 7 : 0;
        const rookToCol = isKingside ? 5 : 3;
        const rookFromSquare = getSquareFromRowCol(row, rookFromCol);
        const rookToSquare = getSquareFromRowCol(row, rookToCol);

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

      let finalPieceType: PieceType = movingPiece.pieceType;
      if (moveDetails.promotion) {
        finalPieceType = typeToPieceType(moveDetails.promotion);
      }

      await db
        .update(schema.pieces)
        .set({ square: to, hasMoved: true, pieceType: finalPieceType })
        .where(
          and(
            eq(schema.pieces.gameId, currentGame.id),
            eq(schema.pieces.square, from),
          ),
        );

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
        createdAt: now,
      });

      const updatedPieces = await db.query.pieces.findMany({
        where: eq(schema.pieces.gameId, currentGame.id),
      });
      const nextTurn: Color =
        currentGame.currentTurn === "White" ? "Black" : "White";
      const currentMove = await db.query.moves.findFirst({
        where: eq(schema.moves.gameId, currentGame.id),
        orderBy: desc(schema.moves.moveNumber),
      });
      const newStatus = getGameStatus(updatedPieces, nextTurn, currentMove);

      await db
        .update(schema.games)
        .set({
          currentTurn: nextTurn,
          status: newStatus,
          updatedAt: now,
          lastMoveTime: now,
          whiteTimeRemaining: whiteTime,
          blackTimeRemaining: blackTime,
        })
        .where(eq(schema.games.id, currentGame.id));

      if (
        currentGame.mode === "vs_computer" &&
        nextTurn === "Black" &&
        newStatus === "Ongoing"
      ) {
        const fen = piecesToFen(
          updatedPieces,
          nextTurn,
          currentMove || undefined,
        );
        const engineUrl =
          process.env.CHESS_ENGINE_URL || "http://127.0.0.1:8080";
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
                const fromRank = 8 - parseInt(uciMove[1], 10);
                const toFile = uciMove.charCodeAt(2) - 97;
                const toRank = 8 - parseInt(uciMove[3], 10);

                const fromSquare = getSquareFromRowCol(fromRank, fromFile);
                const toSquare = getSquareFromRowCol(toRank, toFile);

                await applyMove(currentGame.id, fromSquare, toSquare);
              }
            }
          })
          .catch((e: Error) => {
            console.error("Failed to get computer move:", e);
          });
      }

      return {
        success: true,
        nextTurn,
        status: newStatus,
        captured: capturedPieceType !== undefined,
      };
    } catch (e) {
      console.error(e);
      throw e;
    }
  });

export async function applyMove(gameId: number, from: number, to: number) {
  const currentGame = await db.query.games.findFirst({
    where: eq(schema.games.id, gameId),
  });
  if (!currentGame) return;

  const pieces = await db.query.pieces.findMany({
    where: eq(schema.pieces.gameId, gameId),
  });

  const lastMove = await db.query.moves.findFirst({
    where: eq(schema.moves.gameId, gameId),
    orderBy: desc(schema.moves.moveNumber),
  });

  const moveDetails = getMoveDetails(
    pieces,
    from,
    to,
    currentGame.currentTurn,
    lastMove,
  );
  if (!moveDetails) return;

  const movingPiece = pieces.find((p) => p.square === from);
  if (!movingPiece) return;

  let capturedPieceType: PieceType | undefined;

  if (moveDetails.captured) {
    capturedPieceType = typeToPieceType(moveDetails.captured);
    let targetSquare = to;
    if (moveDetails.flags.includes("e")) {
      targetSquare = getSquareFromRowCol(getRow(from), getCol(to));
    }
    await db
      .delete(schema.pieces)
      .where(
        and(
          eq(schema.pieces.gameId, gameId),
          eq(schema.pieces.square, targetSquare),
        ),
      );
  }

  if (moveDetails.flags.includes("k") || moveDetails.flags.includes("q")) {
    const isKingside = moveDetails.flags.includes("k");
    const row = getRow(from);
    const rookFromCol = isKingside ? 7 : 0;
    const rookToCol = isKingside ? 5 : 3;
    const rookFromSquare = getSquareFromRowCol(row, rookFromCol);
    const rookToSquare = getSquareFromRowCol(row, rookToCol);

    await db
      .update(schema.pieces)
      .set({ square: rookToSquare, hasMoved: true })
      .where(
        and(
          eq(schema.pieces.gameId, gameId),
          eq(schema.pieces.square, rookFromSquare),
        ),
      );
  }

  let finalPieceType: PieceType = movingPiece.pieceType;
  if (moveDetails.promotion) {
    finalPieceType = typeToPieceType(moveDetails.promotion);
  }

  await db
    .update(schema.pieces)
    .set({ square: to, hasMoved: true, pieceType: finalPieceType })
    .where(
      and(eq(schema.pieces.gameId, gameId), eq(schema.pieces.square, from)),
    );

  const moveCount = await db.query.moves.findMany({
    where: eq(schema.moves.gameId, gameId),
  });
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

  const updatedPieces = await db.query.pieces.findMany({
    where: eq(schema.pieces.gameId, gameId),
  });
  const nextTurn: Color = movingPiece.color === "White" ? "Black" : "White";
  const finalMove = await db.query.moves.findFirst({
    where: eq(schema.moves.gameId, gameId),
    orderBy: desc(schema.moves.moveNumber),
  });
  const newStatus = getGameStatus(updatedPieces, nextTurn, finalMove);

  await db
    .update(schema.games)
    .set({
      currentTurn: nextTurn,
      status: newStatus,
      updatedAt: Date.now(),
      lastMoveTime: Date.now(),
    })
    .where(eq(schema.games.id, gameId));
}
