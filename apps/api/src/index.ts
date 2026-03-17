import type {
	GameMode,
	GetBoardParams,
	JoinQueueRequest,
	MakeMoveRequest,
	ResetGameRequest,
	UndoMoveRequest,
} from "@chess/types";
import { config } from "dotenv";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
	getBoard,
	getMoves,
	getQueueStatus,
	joinQueue,
	makeMove,
	resetGame,
	undoMove,
} from "./lib/game-service";
import authRouter from "./routes/auth";

config();

const app = new Hono();

app.use("/api/*", cors());

app.onError((error, context) => {
	console.error(error);
	return context.json({ error: error.message || "Internal Server Error" }, 500);
});

const api = app.basePath("/api");

api.get("/health", (context) => context.json({ ok: true as const }));

api.route("/auth", authRouter);

api.get("/board", async (context) => {
	const gameId = context.req.query("gameId");
	const params: GetBoardParams = {
		mode: context.req.query("mode") as GameMode | undefined,
		gameId: gameId ? Number(gameId) : undefined,
		playerId: context.req.query("playerId"),
	};

	return context.json(await getBoard(params));
});

api.get("/moves", async (context) => {
	const square = Number(context.req.query("square"));
	const gameId = Number(context.req.query("gameId"));

	if (Number.isNaN(square) || Number.isNaN(gameId)) {
		return context.json({ error: "square and gameId are required" }, 400);
	}

	return context.json(await getMoves({ square, gameId }));
});

api.get("/queue-status", async (context) => {
	const playerId = context.req.query("playerId");
	if (!playerId) {
		return context.json({ error: "playerId is required" }, 400);
	}

	return context.json(await getQueueStatus({ playerId }));
});

api.post("/reset", async (context) => {
	const body = (await context.req.json()) as Partial<ResetGameRequest>;
	return context.json(
		await resetGame({
			mode: body.mode || "vs_player",
			timeControl: body.timeControl ?? 10,
		}),
	);
});

api.post("/join-queue", async (context) => {
	const body = (await context.req.json()) as Partial<JoinQueueRequest>;
	if (!body.playerId || body.timeControl === undefined) {
		return context.json({ error: "playerId and timeControl are required" }, 400);
	}

	return context.json(
		await joinQueue({
			playerId: body.playerId,
			timeControl: body.timeControl,
		}),
	);
});

api.post("/move", async (context) => {
	const body = (await context.req.json()) as Partial<MakeMoveRequest>;
	if (body.from === undefined || body.to === undefined || body.gameId === undefined) {
		return context.json({ error: "from, to, and gameId are required" }, 400);
	}

	return context.json(
		await makeMove({
			from: body.from,
			to: body.to,
			gameId: body.gameId,
		}),
	);
});

api.post("/undo", async (context) => {
	const body = (await context.req.json()) as Partial<UndoMoveRequest>;
	if (body.gameId === undefined) {
		return context.json({ error: "gameId is required" }, 400);
	}

	return context.json(await undoMove({ gameId: body.gameId }));
});

export default {
	port: Number(Bun.env.PORT || 4000),
	fetch: app.fetch,
};
