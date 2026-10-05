export type LatencySample = {
	path: "local" | "server";
	totalMs: number;
	engineMs: number;
	renderMs: number;
	serverMs?: number;
};

/** Bounded diagnostic samples, with all end-to-end times on the client clock. */
export class MoveLatency {
	private samples: LatencySample[] = [];
	record(sample: LatencySample) {
		this.samples.push(sample);
		if (this.samples.length > 500) this.samples.shift();
	}
	clear() {
		this.samples = [];
	}
	summary() {
		return (["local", "server"] as const).map((path) => {
			const rows = this.samples.filter((sample) => sample.path === path);
			const percentile = (values: number[], fraction: number) => {
				const sorted = [...values].sort((a, b) => a - b);
				return sorted.length
					? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
					: null;
			};
			return {
				path,
				samples: rows.length,
				p50Ms: percentile(
					rows.map((s) => s.totalMs),
					0.5,
				),
				p95Ms: percentile(
					rows.map((s) => s.totalMs),
					0.95,
				),
				engineP50Ms: percentile(
					rows.map((s) => s.engineMs),
					0.5,
				),
				overheadP50Ms: percentile(
					rows.map((s) => s.totalMs - s.engineMs),
					0.5,
				),
			};
		});
	}
}
export const moveLatency = new MoveLatency();

/** Keeps replies ordered and measures submission through the rendered board. */
export class RemoteMoveTracker {
	private boards = new Map<number, BoardResponse>();
	private pending = new Map<
		number,
		{ started: number; moveCount: number; received?: number; board?: BoardResponse }
	>();
	begin(gameID: number) {
		this.pending.set(gameID, {
			started: performance.now(),
			moveCount: this.boards.get(gameID)?.moveCount ?? 0,
		});
	}
	cancel(gameID: number) {
		this.pending.delete(gameID);
	}
	accept(board: BoardResponse) {
		const previous = this.boards.get(board.id);
		if (
			previous &&
			board.revision !== undefined &&
			previous.revision !== undefined &&
			board.revision < previous.revision
		)
			return previous;
		this.boards.set(board.id, board);
		if (this.boards.size > 128) this.boards.delete(this.boards.keys().next().value as number);
		const pending = this.pending.get(board.id);
		if (
			pending &&
			board.moveCount > pending.moveCount &&
			(board.mode !== "vs_computer" || (board.latency?.searchMs ?? 0) > 0)
		) {
			pending.received ??= performance.now();
			pending.board = board;
		}
		return board;
	}
	markRendered(board: BoardResponse) {
		const pending = this.pending.get(board.id);
		if (
			!pending?.board ||
			pending.received === undefined ||
			pending.board.revision !== board.revision
		)
			return;
		this.pending.delete(board.id);
		const now = performance.now();
		moveLatency.record({
			path: "server",
			totalMs: now - pending.started,
			engineMs: board.latency?.searchMs ?? 0,
			serverMs: board.latency?.serverMs,
			renderMs: now - pending.received,
		});
	}
}

import type { BoardResponse } from "./board";
