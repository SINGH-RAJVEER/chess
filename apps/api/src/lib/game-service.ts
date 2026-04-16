import { db, type Game, schema } from "@chess/db";
import type {
	BoardResponse,
	Color,
	DrawOfferResponse,
	DrawRespondResponse,
	GetBoardParams,
	GetMovesParams,
	JoinQueueRequest,
	MakeMoveRequest,
	MakeMoveResponse,
	PieceType,
	QueueStatusResponse,
	ResetGameRequest,
	ResetGameResponse,
	ResignRequest,
	ResignResponse,
	UndoMoveRequest,
	UndoMoveResponse,
} from "@chess/types";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
	getCol,
	getGameStatus,
	getMoveDetails,
	getRow,
	getSquareFromRowCol,
	getValidMoves,
	initializeGame,
	isInCheck,
	piecesToFen,
} from "./chess";
import { typeToPieceType } from "./utils";

async function createGame({
	mode,
	timeControl,
	increment = 0,
	whitePlayerId = null,
	blackPlayerId = null,
}: {
	mode: "vs_player" | "vs_computer";
	timeControl: number;
	increment?: number;
	whitePlayerId?: string | null;
	blackPlayerId?: string | null;
}) {
	const initialData = initializeGame();
	const startingTime = timeControl === 0 ? Number.MAX_SAFE_INTEGER : timeControl * 60 * 1000;

	const [newGame] = await db
		.insert(schema.games)
		.values({
			currentTurn: initialData.turn,
			status: "Ongoing",
			mode,
			timeControl,
			increment,
			whiteTimeRemaining: startingTime,
			blackTimeRemaining: startingTime,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			lastMoveTime: null,
			whitePlayerId,
			blackPlayerId,
			drawOfferedBy: null,
			halfMoveClock: 0,
		})
		.returning();

	if (newGame) {
		await db.insert(schema.pieces).values(
			initialData.pieces.map((piece) => ({
				gameId: newGame.id,
				color: piece.color,
				pieceType: piece.pieceType,
				square: piece.square,
				hasMoved: false,
			})),
		);
	}

	return newGame;
}

export async function getQueueStatus({
	playerId,
}: {
	playerId: string;
}): Promise<QueueStatusResponse> {
	const queueEntry = await db.query.queue.findFirst({
		where: eq(schema.queue.playerId, playerId),
	});

	if (queueEntry) {
		return { status: "queued", timeControl: queueEntry.timeControl };
	}

	const activeGame = await db.query.games.findFirst({
		where: and(
			eq(schema.games.status, "Ongoing"),
			or(eq(schema.games.whitePlayerId, playerId), eq(schema.games.blackPlayerId, playerId)),
		),
		orderBy: desc(schema.games.updatedAt),
	});

	if (activeGame) {
		return { status: "matched", gameId: activeGame.id };
	}

	return { status: "idle" };
}

export async function getBoard({
	mode,
	gameId,
	playerId,
}: GetBoardParams = {}): Promise<BoardResponse> {
	try {
		const resolvedMode = mode || "vs_player";
		const serverTime = Date.now();

		let currentGame: Game | undefined;

		if (gameId) {
			currentGame = await db.query.games.findFirst({
				where: eq(schema.games.id, gameId),
			});
		} else if (playerId && resolvedMode === "vs_player") {
			currentGame = await db.query.games.findFirst({
				where: and(
					or(
						eq(schema.games.status, "Ongoing"),
						eq(schema.games.status, "Checkmate"),
						eq(schema.games.status, "Stalemate"),
						eq(schema.games.status, "Timeout"),
						eq(schema.games.status, "Resignation"),
						eq(schema.games.status, "Draw"),
						eq(schema.games.status, "InsufficientMaterial"),
						eq(schema.games.status, "ThreefoldRepetition"),
						eq(schema.games.status, "FiftyMoveRule"),
					),
					or(eq(schema.games.whitePlayerId, playerId), eq(schema.games.blackPlayerId, playerId)),
				),
				orderBy: desc(schema.games.updatedAt),
			});
		} else if (resolvedMode === "vs_player") {
			currentGame = await db.query.games.findFirst({
				where: and(
					eq(schema.games.mode, "vs_player"),
					isNull(schema.games.whitePlayerId),
					isNull(schema.games.blackPlayerId),
				),
				orderBy: desc(schema.games.updatedAt),
			});

			if (!currentGame) {
				currentGame = await createGame({
					mode: "vs_player",
					timeControl: 10,
				});
			}
		} else if (resolvedMode === "vs_computer") {
			currentGame = await db.query.games.findFirst({
				where: eq(schema.games.mode, "vs_computer"),
				orderBy: desc(schema.games.updatedAt),
			});

			if (!currentGame) {
				currentGame = await createGame({
					mode: "vs_computer",
					timeControl: 0,
				});
			}
		}

		if (!currentGame) {
			const initialData = initializeGame();

			return {
				id: 0,
				pieces: initialData.pieces.map((piece) => ({
					color: piece.color,
					piece_type: piece.pieceType,
					square: piece.square,
				})),
				turn: "White",
				status: "Ongoing",
				moves: [],
				mode: resolvedMode,
				timeControl: 10,
				increment: 0,
				whiteTimeRemaining: 600000,
				blackTimeRemaining: 600000,
				lastMoveTime: null,
				lastMove: null,
				capturedPieces: { white: [], black: [] },
				serverTime,
				isCheck: false,
				drawOfferedBy: null,
				moveCount: 0,
				halfMoveClock: 0,
			};
		}

		const pieces = await db.query.pieces.findMany({
			where: eq(schema.pieces.gameId, currentGame.id),
		});

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
			const toFile = files[getCol(move.toSquare)];
			const toRank = 8 - getRow(move.toSquare);

			const isCastle =
				move.pieceType === "King" &&
				Math.abs(getCol(move.fromSquare) - getCol(move.toSquare)) === 2;
			const isKingside = isCastle && getCol(move.toSquare) === 6;

			let notation = "";
			if (isCastle) {
				notation = isKingside ? "O-O" : "O-O-O";
			} else {
				if (move.pieceType !== "Pawn") {
					notation += move.pieceType === "Knight" ? "N" : move.pieceType[0];
				}
				if (move.capturedPieceType) {
					if (move.pieceType === "Pawn") {
						notation += fromFile;
					}
					notation += "x";
				}
				notation += `${toFile}${toRank}`;
				if (move.promotionPiece) {
					notation += `=${move.promotionPiece === "Knight" ? "N" : move.promotionPiece[0]}`;
				}
			}

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
				isCastle,
				promotion: move.promotionPiece || undefined,
			};
		});

		const lastMove =
			formattedMoves.length > 0
				? {
						from: formattedMoves[formattedMoves.length - 1].from,
						to: formattedMoves[formattedMoves.length - 1].to,
					}
				: null;

		let userColor: BoardResponse["userColor"] = "Spectator";
		if (playerId) {
			if (currentGame.whitePlayerId === playerId) userColor = "White";
			else if (currentGame.blackPlayerId === playerId) userColor = "Black";
		}

		const lastDbMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : undefined;
		const checkStatus =
			currentGame.status === "Ongoing"
				? isInCheck(pieces, currentGame.currentTurn, lastDbMove)
				: false;

		return {
			id: currentGame.id,
			pieces: pieces.map((piece) => ({
				color: piece.color,
				piece_type: piece.pieceType,
				square: piece.square,
			})),
			capturedPieces,
			moves: formattedMoves,
			turn: currentGame.currentTurn,
			status: currentGame.status,
			mode: currentGame.mode,
			timeControl: currentGame.timeControl,
			increment: currentGame.increment ?? 0,
			whiteTimeRemaining: currentGame.whiteTimeRemaining,
			blackTimeRemaining: currentGame.blackTimeRemaining,
			lastMoveTime: currentGame.lastMoveTime,
			lastMove,
			serverTime,
			userColor,
			isCheck: checkStatus,
			drawOfferedBy: currentGame.drawOfferedBy ?? null,
			moveCount: moveHistory.length,
			halfMoveClock: currentGame.halfMoveClock ?? 0,
		};
	} catch (error) {
		console.error("Error in getBoard:", error);
		throw error;
	}
}

export async function getMoves({ square, gameId }: GetMovesParams): Promise<number[]> {
	try {
		const currentGame = await db.query.games.findFirst({
			where: eq(schema.games.id, gameId),
		});

		if (!currentGame) {
			return [];
		}

		const pieces = await db.query.pieces.findMany({
			where: eq(schema.pieces.gameId, currentGame.id),
		});

		const lastMove = await db.query.moves.findFirst({
			where: eq(schema.moves.gameId, currentGame.id),
			orderBy: desc(schema.moves.moveNumber),
		});

		return getValidMoves(pieces, square, lastMove);
	} catch (error) {
		console.error("Error in getMoves:", error);
		throw error;
	}
}

export async function resetGame({
	mode,
	timeControl,
	increment,
}: ResetGameRequest): Promise<ResetGameResponse> {
	const resolvedMode = mode || "vs_player";
	const resolvedTimeControl = timeControl ?? 10;
	const resolvedIncrement = increment ?? 0;

	if (resolvedMode === "vs_player") {
		await createGame({
			mode: "vs_player",
			timeControl: resolvedTimeControl,
			increment: resolvedIncrement,
		});
		return { success: true };
	}

	await createGame({
		mode: resolvedMode,
		timeControl: resolvedTimeControl,
		increment: resolvedIncrement,
	});

	return { success: true };
}

export async function joinQueue({
	playerId,
	timeControl,
	increment = 0,
}: JoinQueueRequest): Promise<QueueStatusResponse> {
	const activeGame = await db.query.games.findFirst({
		where: and(
			eq(schema.games.status, "Ongoing"),
			or(eq(schema.games.whitePlayerId, playerId), eq(schema.games.blackPlayerId, playerId)),
		),
	});

	if (activeGame) {
		return { status: "matched", gameId: activeGame.id };
	}

	const existingQueue = await db.query.queue.findFirst({
		where: eq(schema.queue.playerId, playerId),
	});

	if (existingQueue && existingQueue.timeControl !== timeControl) {
		await db
			.update(schema.queue)
			.set({ timeControl, increment, joinedAt: Date.now() })
			.where(eq(schema.queue.id, existingQueue.id));
	}

	await db.delete(schema.queue).where(eq(schema.queue.playerId, playerId));

	const validOpponent = await db.query.queue.findFirst({
		where: and(eq(schema.queue.timeControl, timeControl), eq(schema.queue.increment, increment)),
		orderBy: schema.queue.joinedAt,
	});

	if (validOpponent) {
		await db.delete(schema.queue).where(eq(schema.queue.id, validOpponent.id));

		const isWhite = Math.random() < 0.5;
		const whiteId = isWhite ? playerId : validOpponent.playerId;
		const blackId = isWhite ? validOpponent.playerId : playerId;
		const newGame = await createGame({
			mode: "vs_player",
			timeControl,
			increment,
			whitePlayerId: whiteId,
			blackPlayerId: blackId,
		});

		if (newGame) {
			return { status: "matched", gameId: newGame.id };
		}
	}

	await db.insert(schema.queue).values({
		playerId,
		timeControl,
		increment,
		joinedAt: Date.now(),
	});

	return { status: "queued" };
}

export async function undoMove({ gameId }: UndoMoveRequest): Promise<UndoMoveResponse> {
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
			const capturedColor = lastMove.pieceColor === "White" ? "Black" : "White";
			await db.insert(schema.pieces).values({
				gameId: currentGame.id,
				color: capturedColor,
				pieceType: lastMove.capturedPieceType,
				square: lastMove.toSquare,
				hasMoved: true,
			});
		}

		if (lastMove.pieceType === "King" && Math.abs(lastMove.fromSquare - lastMove.toSquare) === 2) {
			const isKingside = getCol(lastMove.toSquare) === 6;
			const rookCol = isKingside ? 7 : 0;
			const rookLandedCol = isKingside ? 5 : 3;
			const row = getRow(lastMove.fromSquare);

			await db
				.update(schema.pieces)
				.set({
					square: getSquareFromRowCol(row, rookCol),
					hasMoved: false,
				})
				.where(
					and(
						eq(schema.pieces.gameId, currentGame.id),
						eq(schema.pieces.square, getSquareFromRowCol(row, rookLandedCol)),
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
				drawOfferedBy: null,
			})
			.where(eq(schema.games.id, currentGame.id));

		return { success: true };
	} catch (error) {
		console.error("Undo failed:", error);
		throw error;
	}
}

export async function resign({ gameId, color }: ResignRequest): Promise<ResignResponse> {
	const currentGame = await db.query.games.findFirst({
		where: eq(schema.games.id, gameId),
	});

	if (!currentGame) {
		throw new Error("No game found");
	}

	if (currentGame.status !== "Ongoing") {
		throw new Error("Game is not ongoing");
	}

	const winner: Color = color === "White" ? "Black" : "White";

	await db
		.update(schema.games)
		.set({
			status: "Resignation",
			updatedAt: Date.now(),
		})
		.where(eq(schema.games.id, gameId));

	return { success: true, status: "Resignation", winner };
}

export async function offerDraw({
	gameId,
	color,
}: {
	gameId: number;
	color: Color;
}): Promise<DrawOfferResponse> {
	const currentGame = await db.query.games.findFirst({
		where: eq(schema.games.id, gameId),
	});

	if (!currentGame) {
		throw new Error("No game found");
	}

	if (currentGame.status !== "Ongoing") {
		throw new Error("Game is not ongoing");
	}

	await db
		.update(schema.games)
		.set({ drawOfferedBy: color, updatedAt: Date.now() })
		.where(eq(schema.games.id, gameId));

	return { success: true, drawOfferedBy: color };
}

export async function respondToDraw({
	gameId,
	accept,
}: {
	gameId: number;
	accept: boolean;
}): Promise<DrawRespondResponse> {
	const currentGame = await db.query.games.findFirst({
		where: eq(schema.games.id, gameId),
	});

	if (!currentGame) {
		throw new Error("No game found");
	}

	if (currentGame.status !== "Ongoing") {
		throw new Error("Game is not ongoing");
	}

	if (accept) {
		await db
			.update(schema.games)
			.set({ status: "Draw", drawOfferedBy: null, updatedAt: Date.now() })
			.where(eq(schema.games.id, gameId));
		return { success: true, status: "Draw" };
	}

	await db
		.update(schema.games)
		.set({ drawOfferedBy: null, updatedAt: Date.now() })
		.where(eq(schema.games.id, gameId));
	return { success: true, status: "Ongoing" };
}

export async function makeMove({
	from,
	to,
	gameId,
	promotion,
}: MakeMoveRequest): Promise<MakeMoveResponse> {
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
		promotion,
	);
	if (!moveDetails) {
		throw new Error("Invalid move");
	}

	const now = Date.now();
	let whiteTime = currentGame.whiteTimeRemaining;
	let blackTime = currentGame.blackTimeRemaining;
	const incrementMs = (currentGame.increment ?? 0) * 1000;

	if (currentGame.lastMoveTime && currentGame.timeControl !== 0) {
		const elapsed = now - currentGame.lastMoveTime;
		if (currentGame.currentTurn === "White") {
			whiteTime = Math.max(0, whiteTime - elapsed) + incrementMs;
		} else {
			blackTime = Math.max(0, blackTime - elapsed) + incrementMs;
		}
	}

	const movingPiece = pieces.find((piece) => piece.square === from);
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
			.where(and(eq(schema.pieces.gameId, currentGame.id), eq(schema.pieces.square, targetSquare)));
	}

	const isCastle = moveDetails.flags.includes("k") || moveDetails.flags.includes("q");
	if (isCastle) {
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
				and(eq(schema.pieces.gameId, currentGame.id), eq(schema.pieces.square, rookFromSquare)),
			);
	}

	let finalPieceType: PieceType = movingPiece.pieceType;
	let promotionPiece: PieceType | undefined;
	if (moveDetails.promotion) {
		finalPieceType = typeToPieceType(moveDetails.promotion);
		promotionPiece = finalPieceType;
	}

	await db
		.update(schema.pieces)
		.set({ square: to, hasMoved: true, pieceType: finalPieceType })
		.where(and(eq(schema.pieces.gameId, currentGame.id), eq(schema.pieces.square, from)));

	const moveCount = await db.query.moves.findMany({
		where: eq(schema.moves.gameId, currentGame.id),
	});

	await db.insert(schema.moves).values({
		gameId: currentGame.id,
		fromSquare: from,
		toSquare: to,
		pieceType: movingPiece.pieceType,
		pieceColor: movingPiece.color,
		capturedPieceType,
		promotionPiece,
		moveNumber: moveCount.length + 1,
		createdAt: now,
	});

	const updatedPieces = await db.query.pieces.findMany({
		where: eq(schema.pieces.gameId, currentGame.id),
	});

	const nextTurn: Color = currentGame.currentTurn === "White" ? "Black" : "White";
	const currentMoveRecord = await db.query.moves.findFirst({
		where: eq(schema.moves.gameId, currentGame.id),
		orderBy: desc(schema.moves.moveNumber),
	});
	const newStatus = getGameStatus(updatedPieces, nextTurn, currentMoveRecord);
	const checkAfterMove =
		newStatus === "Ongoing" ? isInCheck(updatedPieces, nextTurn, currentMoveRecord) : false;
	const isCheckmate = newStatus === "Checkmate";

	// Update half-move clock (reset on pawn move or capture)
	const halfMoveClock =
		movingPiece.pieceType === "Pawn" || capturedPieceType
			? 0
			: (currentGame.halfMoveClock ?? 0) + 1;

	// Check 50-move rule
	const finalStatus = halfMoveClock >= 100 && newStatus === "Ongoing" ? "FiftyMoveRule" : newStatus;

	await db
		.update(schema.games)
		.set({
			currentTurn: nextTurn,
			status: finalStatus,
			updatedAt: now,
			lastMoveTime: now,
			whiteTimeRemaining: whiteTime,
			blackTimeRemaining: blackTime,
			drawOfferedBy: null,
			halfMoveClock,
		})
		.where(eq(schema.games.id, currentGame.id));

	if (currentGame.mode === "vs_computer" && nextTurn === "Black" && finalStatus === "Ongoing") {
		const fen = piecesToFen(updatedPieces, nextTurn, currentMoveRecord || undefined);
		const engineUrl = process.env.CHESS_ENGINE_URL || "http://127.0.0.1:8080";

		fetch(`${engineUrl}/api/engine-move`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ fen }),
		})
			.then(async (response) => {
				if (!response.ok) return;
				const data = (await response.json()) as { best_move?: string };
				if (!data.best_move) return;

				const fromFile = data.best_move.charCodeAt(0) - 97;
				const fromRank = 8 - parseInt(data.best_move[1], 10);
				const toFile = data.best_move.charCodeAt(2) - 97;
				const toRank = 8 - parseInt(data.best_move[3], 10);

				// Handle engine promotion
				let enginePromotion: PieceType | undefined;
				if (data.best_move.length === 5) {
					const promoChar = data.best_move[4];
					const promoMap: Record<string, PieceType> = {
						q: "Queen",
						r: "Rook",
						b: "Bishop",
						n: "Knight",
					};
					enginePromotion = promoMap[promoChar];
				}

				await applyMove(
					currentGame.id,
					getSquareFromRowCol(fromRank, fromFile),
					getSquareFromRowCol(toRank, toFile),
					enginePromotion,
				);
			})
			.catch((error: Error) => {
				console.error("Failed to get computer move:", error);
			});
	}

	return {
		success: true,
		nextTurn,
		status: finalStatus,
		captured: capturedPieceType !== undefined,
		isCheck: checkAfterMove,
		isCheckmate,
		isCastle,
		promotion: promotionPiece,
	};
}

export async function applyMove(gameId: number, from: number, to: number, promotion?: PieceType) {
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

	const promotionPiece = promotion as import("@chess/types").PromotionPiece | undefined;
	const moveDetails = getMoveDetails(
		pieces,
		from,
		to,
		currentGame.currentTurn,
		lastMove,
		promotionPiece,
	);
	if (!moveDetails) return;

	const movingPiece = pieces.find((piece) => piece.square === from);
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
			.where(and(eq(schema.pieces.gameId, gameId), eq(schema.pieces.square, targetSquare)));
	}

	if (moveDetails.flags.includes("k") || moveDetails.flags.includes("q")) {
		const isKingside = moveDetails.flags.includes("k");
		const row = getRow(from);
		const rookFromCol = isKingside ? 7 : 0;
		const rookToCol = isKingside ? 5 : 3;

		await db
			.update(schema.pieces)
			.set({
				square: getSquareFromRowCol(row, rookToCol),
				hasMoved: true,
			})
			.where(
				and(
					eq(schema.pieces.gameId, gameId),
					eq(schema.pieces.square, getSquareFromRowCol(row, rookFromCol)),
				),
			);
	}

	let finalPieceType: PieceType = movingPiece.pieceType;
	let finalPromotionPiece: PieceType | undefined;
	if (moveDetails.promotion) {
		finalPieceType = typeToPieceType(moveDetails.promotion);
		finalPromotionPiece = finalPieceType;
	}

	await db
		.update(schema.pieces)
		.set({ square: to, hasMoved: true, pieceType: finalPieceType })
		.where(and(eq(schema.pieces.gameId, gameId), eq(schema.pieces.square, from)));

	const moveCount = await db.query.moves.findMany({
		where: eq(schema.moves.gameId, gameId),
	});
	const now = Date.now();
	await db.insert(schema.moves).values({
		gameId,
		fromSquare: from,
		toSquare: to,
		pieceType: movingPiece.pieceType,
		pieceColor: movingPiece.color,
		capturedPieceType,
		promotionPiece: finalPromotionPiece,
		moveNumber: moveCount.length + 1,
		createdAt: now,
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

	const halfMoveClock =
		movingPiece.pieceType === "Pawn" || capturedPieceType
			? 0
			: (currentGame.halfMoveClock ?? 0) + 1;

	const finalStatus = halfMoveClock >= 100 && newStatus === "Ongoing" ? "FiftyMoveRule" : newStatus;

	// Apply increment for computer
	let whiteTime = currentGame.whiteTimeRemaining;
	let blackTime = currentGame.blackTimeRemaining;
	const incrementMs = (currentGame.increment ?? 0) * 1000;
	if (currentGame.lastMoveTime && currentGame.timeControl !== 0) {
		const elapsed = now - currentGame.lastMoveTime;
		if (movingPiece.color === "White") {
			whiteTime = Math.max(0, whiteTime - elapsed) + incrementMs;
		} else {
			blackTime = Math.max(0, blackTime - elapsed) + incrementMs;
		}
	}

	await db
		.update(schema.games)
		.set({
			currentTurn: nextTurn,
			status: finalStatus,
			updatedAt: now,
			lastMoveTime: now,
			whiteTimeRemaining: whiteTime,
			blackTimeRemaining: blackTime,
			halfMoveClock,
		})
		.where(eq(schema.games.id, gameId));
}
