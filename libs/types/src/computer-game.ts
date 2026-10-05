import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import type { BoardResponse } from "./board";
import {
	type ComputerOpponent,
	type PieceType,
	type PromotionPiece,
	parseComputerOpponent,
	parseStockfishLevel,
	type StockfishLevel,
} from "./chess";
import { moveLatency } from "./latency";
import type { WsClientMessage, WsServerMessage } from "./ws";

export const SEARCH_BUDGET_MS = 500;

export type EngineRequest = {
	fen: string;
	opponent: ComputerOpponent;
	level: StockfishLevel;
	revision: number;
};
export type EngineReply = { move: string; elapsedMs: number };
export interface LocalEngine {
	prepare(opponent: ComputerOpponent): Promise<void>;
	search(request: EngineRequest, signal: AbortSignal): Promise<EngineReply>;
	reset(): void;
	dispose(): void;
}
export interface GameStorage {
	read(): Promise<string | null>;
	write(value: string): Promise<void>;
}
export type ComputerMoveTiming = {
	revision: number;
	engineMs: number;
	replyMs: number;
	submittedAt: number;
};
type ClientRequest<T extends WsClientMessage = WsClientMessage> = T extends unknown
	? Omit<T, "id"> & { id?: string }
	: never;
const PIECES: Record<PieceSymbol, PieceType> = {
	p: "Pawn",
	n: "Knight",
	b: "Bishop",
	r: "Rook",
	q: "Queen",
	k: "King",
};
const PROMOTIONS: Record<PromotionPiece, string> = {
	Queen: "q",
	Rook: "r",
	Bishop: "b",
	Knight: "n",
};
const squareName = (index: number): Square => {
	if (!Number.isInteger(index) || index < 0 || index > 63) throw new Error("Invalid square");
	return `${"abcdefgh"[index % 8]}${8 - Math.floor(index / 8)}` as Square;
};
const squareIndex = (name: string) => (8 - Number(name[1])) * 8 + "abcdefgh".indexOf(name[0]);

function restoreState(value: string) {
	const saved = JSON.parse(value);
	if (
		saved.version !== 1 ||
		!Number.isSafeInteger(saved.id) ||
		saved.id <= 0 ||
		!Number.isSafeInteger(saved.revision) ||
		saved.revision < 0 ||
		!Array.isArray(saved.moves) ||
		saved.moves.length > 2048
	)
		throw new Error("Invalid saved computer game");
	const chess = new Chess();
	const moves: Move[] = [];
	for (const move of saved.moves) {
		if (typeof move !== "string" || chess.isGameOver())
			throw new Error("Invalid saved move history");
		moves.push(chess.move(move));
	}
	return { saved, chess, moves };
}

/** Owns local rules, persistence, cancellation, and engine orchestration. */
export class ComputerGame {
	private chess = new Chess();
	private history: Move[] = [];
	private id = Date.now();
	private revision = 0;
	private resigned = false;
	private opponent: ComputerOpponent = "minimax";
	private level: StockfishLevel = 4;
	private abort: AbortController | null = null;
	private listeners = new Set<(message: WsServerMessage) => void>();
	private statuses = new Set<(status: "open" | "idle") => void>();
	private status: "open" | "idle" = "idle";
	private initialization: Promise<void> | null = null;
	private writes: Promise<void> = Promise.resolve();
	private connected = 0;
	private paintedRevision = -1;
	private currentBoard: BoardResponse | null = null;
	lastLatency: ComputerMoveTiming | null = null;

	constructor(
		private engine: LocalEngine,
		private storage: GameStorage,
		private onError: (error: Error) => void = () => {},
	) {}

	getStatus() {
		return this.status;
	}
	onStatus(listener: (status: "open" | "idle") => void) {
		this.statuses.add(listener);
		listener(this.status);
		return () => {
			this.statuses.delete(listener);
		};
	}
	subscribe(listener: (message: WsServerMessage) => void) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	connect() {
		this.connected++;
		void this.initialize()
			.then(() => {
				if (!this.connected) return;
				this.status = "open";
				for (const listener of this.statuses) listener("open");
				void this.engine.prepare(this.opponent).catch((error) => this.report(error));
				if (this.chess.turn() === "b") this.think();
			})
			.catch((error) => this.report(error));
	}
	disconnect() {
		this.connected = Math.max(0, this.connected - 1);
		if (this.connected) return;
		this.cancel();
		this.engine.dispose();
		this.status = "idle";
		for (const listener of this.statuses) listener("idle");
	}
	private initialize() {
		if (this.initialization) return this.initialization;
		this.initialization = this.storage
			.read()
			.then((value) => {
				if (!value) return;
				this.restore(value);
			})
			.catch((error) => this.report(error));
		return this.initialization;
	}
	private restore(value: string) {
		const { saved, chess, moves } = restoreState(value);
		this.chess = chess;
		this.history = moves;
		this.id = saved.id;
		this.revision = saved.revision;
		this.resigned = saved.resigned === true;
		this.opponent = parseComputerOpponent(saved.opponent);
		this.level = parseStockfishLevel(saved.level);
		this.currentBoard = null;
	}
	async restoreArchive(value: string, expected: { id: number; revision?: number }) {
		await this.initialize();
		if (
			this.id !== expected.id ||
			this.revision !== expected.revision ||
			this.history.length ||
			this.resigned
		)
			return false;
		this.cancel();
		this.engine.reset();
		this.restore(value);
		this.emit();
		this.think();
		return true;
	}
	private report(error: unknown) {
		this.onError(error instanceof Error ? error : new Error(String(error)));
	}
	async configure(opponent: ComputerOpponent, level: StockfishLevel) {
		await this.initialize();
		if (opponent !== this.opponent || level !== this.level) {
			this.cancel();
			this.opponent = opponent;
			this.level = level;
			this.revision++;
			this.emit();
		}
		await this.engine.prepare(opponent);
		this.think();
	}
	private cancel() {
		this.abort?.abort();
		this.abort = null;
	}
	private save() {
		const value = JSON.stringify({
			version: 1,
			id: this.id,
			revision: this.revision,
			moves: this.history.map((move) => move.san),
			resigned: this.resigned,
			opponent: this.opponent,
			level: this.level,
		});
		this.writes = this.writes
			.then(() => this.storage.write(value))
			.catch((error) => this.report(error));
	}
	private emit() {
		const board = this.board();
		this.save();
		for (const listener of this.listeners) listener({ type: "game.state", board });
		return board;
	}
	board(): BoardResponse {
		if (this.currentBoard?.revision === this.revision && this.currentBoard.id === this.id)
			return this.currentBoard;
		const moves = this.history;
		const available = this.chess.moves({ verbose: true });
		const isCheck = this.chess.isCheck();
		const legalMoves: Record<number, number[]> = {};
		for (const move of available) {
			legalMoves[squareIndex(move.from)] ??= [];
			const targets = legalMoves[squareIndex(move.from)];
			if (!targets.includes(squareIndex(move.to))) targets.push(squareIndex(move.to));
		}
		const capturedPieces: BoardResponse["capturedPieces"] = { white: [], black: [] };
		for (const move of moves)
			if (move.captured)
				capturedPieces[move.color === "w" ? "black" : "white"].push(PIECES[move.captured]);
		const last = moves.at(-1);
		const turn = this.chess.turn() === "w" ? "White" : "Black";
		const status = this.resigned
			? "Resignation"
			: available.length === 0 && isCheck
				? "Checkmate"
				: available.length === 0
					? "Stalemate"
					: this.chess.isInsufficientMaterial()
						? "InsufficientMaterial"
						: this.chess.isThreefoldRepetition()
							? "ThreefoldRepetition"
							: this.chess.isDrawByFiftyMoves()
								? "FiftyMoveRule"
								: "Ongoing";
		this.currentBoard = {
			id: this.id,
			revision: this.revision,
			legalMoves: status === "Ongoing" ? legalMoves : {},
			turn,
			status,
			mode: "vs_computer",
			pieces: this.chess
				.board()
				.flat()
				.filter((piece) => piece !== null)
				.map((piece) => ({
					square: squareIndex(piece.square),
					color: piece.color === "w" ? "White" : "Black",
					piece_type: PIECES[piece.type],
				})),
			moves: moves.map((move) => ({
				from: squareIndex(move.from),
				to: squareIndex(move.to),
				color: move.color === "w" ? "White" : "Black",
				pieceType: PIECES[move.piece],
				captured: move.captured ? PIECES[move.captured] : undefined,
				promotion: move.promotion ? PIECES[move.promotion] : undefined,
				notation: move.san,
				isCastle: move.isKingsideCastle() || move.isQueensideCastle(),
			})),
			capturedPieces,
			timeControl: 0,
			increment: 0,
			whiteTimeRemaining: 0,
			blackTimeRemaining: 0,
			lastMoveTime: null,
			lastMove: last ? { from: squareIndex(last.from), to: squareIndex(last.to) } : null,
			serverTime: Date.now(),
			userColor: "White",
			isCheck,
			drawOfferedBy: null,
			moveCount: moves.length,
			halfMoveClock: Number(this.chess.fen().split(" ")[4]),
		};
		return this.currentBoard;
	}
	markRendered(revision: number) {
		const sample = this.lastLatency;
		if (!sample || sample.revision !== revision || this.paintedRevision === revision) return;
		this.paintedRevision = revision;
		const totalMs = performance.now() - sample.submittedAt;
		moveLatency.record({
			path: "local",
			totalMs,
			engineMs: sample.engineMs,
			renderMs: totalMs - sample.replyMs,
		});
	}
	private think(startedAt = performance.now()) {
		if (
			this.abort ||
			this.chess.turn() !== "b" ||
			this.board().status !== "Ongoing" ||
			!this.connected
		)
			return;
		const abort = new AbortController();
		this.abort = abort;
		const revision = this.revision;
		const submittedAt = startedAt;
		void this.engine
			.search(
				{ fen: this.chess.fen(), opponent: this.opponent, level: this.level, revision },
				abort.signal,
			)
			.then((reply) => {
				if (abort.signal.aborted || revision !== this.revision) return;
				if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(reply.move))
					throw new Error("Engine returned an invalid move");
				this.history.push(
					this.chess.move({
						from: reply.move.slice(0, 2),
						to: reply.move.slice(2, 4),
						promotion: reply.move[4],
					}),
				);
				this.revision++;
				this.lastLatency = {
					revision: this.revision,
					engineMs: reply.elapsedMs,
					replyMs: performance.now() - submittedAt,
					submittedAt,
				};
				this.emit();
			})
			.catch((error) => {
				if (!abort.signal.aborted) this.report(error);
			})
			.finally(() => {
				if (this.abort === abort) this.abort = null;
			});
	}
	async request(message: ClientRequest): Promise<WsServerMessage> {
		const submittedAt = performance.now();
		await this.initialize();
		// The public socket shape is a union, use its correlated request type.
		const msg = message as WsClientMessage;
		switch (msg.type) {
			case "game.new":
				this.cancel();
				this.engine.reset();
				this.chess.reset();
				this.history = [];
				this.resigned = false;
				this.id = Math.max(Date.now(), this.id + 1);
				this.revision++;
				this.opponent = parseComputerOpponent(msg.opponent ?? this.opponent);
				void this.engine.prepare(this.opponent).catch((error) => this.report(error));
				break;
			case "game.move": {
				if (
					msg.gameId !== this.id ||
					this.chess.turn() !== "w" ||
					this.board().status !== "Ongoing"
				)
					throw new Error("Wait for the engine");
				const revision = this.revision;
				this.opponent = parseComputerOpponent(msg.opponent ?? this.opponent);
				this.level = parseStockfishLevel(msg.level ?? this.level);
				await this.engine.prepare(this.opponent);
				// Preparation may overlap a reset, takeback, or another submission.
				if (
					msg.gameId !== this.id ||
					revision !== this.revision ||
					this.chess.turn() !== "w" ||
					this.board().status !== "Ongoing"
				)
					throw new Error("Position changed");
				this.history.push(
					this.chess.move({
						from: squareName(msg.from),
						to: squareName(msg.to),
						promotion: PROMOTIONS[msg.promotion ?? "Queen"],
					}),
				);
				this.revision++;
				this.emit();
				this.think(submittedAt);
				return { type: "game.state", board: this.board() };
			}
			case "game.undo.request":
				this.cancel();
				this.engine.reset();
				this.chess.undo();
				this.history.pop();
				this.resigned = false;
				this.revision++;
				break;
			case "game.resign":
				this.cancel();
				this.resigned = true;
				this.revision++;
				break;
			case "moves.get":
				return {
					type: "moves.result",
					gameId: this.id,
					square: msg.square,
					targets: this.board().legalMoves?.[msg.square] ?? [],
				};
			case "board.get":
			case "game.join":
				this.think();
				return { type: "game.state", board: this.board() };
			case "game.leave":
				this.cancel();
				return { type: "game.state", board: this.board() };
			default:
				throw new Error("Unsupported computer game operation");
		}
		return { type: "game.state", board: this.emit() };
	}
}
