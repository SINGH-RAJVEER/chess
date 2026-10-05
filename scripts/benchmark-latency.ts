import { moveLatency, type BoardResponse, type WsServerMessage } from "@sixtyfour/types";

const url = process.env.LATENCY_WS_URL ?? "ws://127.0.0.1:4000/api/ws";
const count = Number(process.env.LATENCY_SAMPLES ?? 10);
const concurrency = Number(process.env.LATENCY_CONCURRENCY ?? 2);
const opponent = process.env.LATENCY_OPPONENT ?? "minimax";
if (!Number.isInteger(count) || count < 1 || !Number.isInteger(concurrency) || concurrency < 1)
	throw new Error("Positive sample and concurrency counts are required");

async function sample() {
	const socket = new WebSocket(url);
	const pending = new Map<
		string,
		{ resolve: (value: WsServerMessage) => void; reject: (error: Error) => void }
	>();
	let sequence = 0;
	let gameID = 0;
	let started = 0;
	let resolveMove: (board: BoardResponse) => void = () => {};
	let rejectMove: (error: Error) => void = () => {};
	const reply = new Promise<BoardResponse>((resolve, reject) => {
		resolveMove = resolve;
		rejectMove = reject;
	});
	const timer = setTimeout(() => {
		rejectMove(new Error("Move timed out"));
		socket.close();
	}, 15000);
	try {
		const open = new Promise<void>((resolve, reject) => {
			socket.onopen = () => resolve();
			socket.onerror = () => reject(new Error("Socket failed"));
		});
		socket.onmessage = (event) => {
			const message = JSON.parse(String(event.data)) as WsServerMessage;
			if (message.id) {
				const request = pending.get(message.id);
				pending.delete(message.id);
				if (message.type === "error") request?.reject(new Error(message.message));
				else request?.resolve(message);
			}
			if (
				message.type === "game.state" &&
				message.board.id === gameID &&
				message.board.moveCount === 2
			)
				resolveMove(message.board);
		};
		const request = (payload: Record<string, unknown>) =>
			new Promise<WsServerMessage>((resolve, reject) => {
				const id = String(++sequence);
				pending.set(id, { resolve, reject });
				socket.send(JSON.stringify({ ...payload, id }));
			});
		await open;
		const created = await request({ type: "game.new", mode: "vs_computer", opponent });
		if (created.type !== "game.state") throw new Error("No game created");
		gameID = created.board.id;
		started = performance.now();
		await request({ type: "game.move", gameId: gameID, from: 52, to: 36, opponent, level: 4 });
		const board = await reply;
		moveLatency.record({
			path: "server",
			totalMs: performance.now() - started,
			engineMs: board.latency?.searchMs ?? 0,
			serverMs: board.latency?.serverMs,
			renderMs: 0,
		});
	} finally {
		clearTimeout(timer);
		socket.close();
	}
}
let next = 0;
await Promise.all(
	Array.from({ length: concurrency }, async () => {
		while (next++ < count) await sample();
	}),
);
console.log(
	JSON.stringify(
		{
			opponent,
			concurrency,
			summary: moveLatency.summary().find((row) => row.path === "server"),
		},
		null,
		2,
	),
);
