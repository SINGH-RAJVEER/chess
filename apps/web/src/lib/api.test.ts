import { afterEach, describe, expect, test } from "bun:test";
import { getBoard, getMoves, makeMove } from "./api";

type CapturedCall = { url: string; init?: RequestInit };

let calls: CapturedCall[] = [];
let nextResponse: { status: number; body: unknown } = { status: 200, body: {} };

function respond(status: number, body: unknown) {
	nextResponse = { status, body };
}

function installFetch(
	impl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
) {
	globalThis.fetch = impl as unknown as typeof fetch;
}

function installCapturingFetch() {
	installFetch(async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: url.toString(), init });
		return new Response(JSON.stringify(nextResponse.body), { status: nextResponse.status });
	});
}

installCapturingFetch();

afterEach(() => {
	calls = [];
	respond(200, {});
	installCapturingFetch();
});

describe("request building", () => {
	test("getBoard encodes mode, game, and player", async () => {
		respond(200, { id: 1 });
		await getBoard({ mode: "vs_computer", gameId: 7, playerId: "p1" });
		expect(calls).toHaveLength(1);
		const url = new URL(calls[0].url, "http://localhost");
		expect(url.pathname).toBe("/api/board");
		expect(url.searchParams.get("mode")).toBe("vs_computer");
		expect(url.searchParams.get("gameId")).toBe("7");
		expect(url.searchParams.get("playerId")).toBe("p1");
	});

	test("getBoard omits absent params", async () => {
		respond(200, { id: 0 });
		await getBoard({});
		expect(new URL(calls[0].url, "http://localhost").search).toBe("");
	});

	test("getMoves encodes square and game", async () => {
		respond(200, [36, 44]);
		const moves = await getMoves({ square: 52, gameId: 3 });
		expect(moves).toEqual([36, 44]);
		expect(calls[0].url).toContain("/api/moves?square=52&gameId=3");
	});

	test("makeMove posts JSON with the opponent", async () => {
		respond(200, { success: true });
		await makeMove({ from: 52, to: 36, gameId: 3, opponent: "custom" });
		expect(calls[0].init?.method).toBe("POST");
		expect(calls[0].init?.headers).toMatchObject({ "Content-Type": "application/json" });
		expect(JSON.parse(calls[0].init?.body as string)).toEqual({
			from: 52,
			to: 36,
			gameId: 3,
			opponent: "custom",
		});
	});
});

describe("error handling", () => {
	test("server errors surface the response message", async () => {
		respond(400, { error: "Invalid move" });
		await expect(makeMove({ from: 52, to: 52, gameId: 3 })).rejects.toThrow("Invalid move");
	});

	test("empty error bodies fall back to the status text", async () => {
		installFetch(async () => new Response("boom", { status: 500 }));
		await expect(getBoard({})).rejects.toThrow();
	});
});
