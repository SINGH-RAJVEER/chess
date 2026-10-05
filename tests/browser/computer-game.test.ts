import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { chromium, type Browser, type Page, type BrowserContext } from "playwright";

let browser: Browser;
let page: Page;
let context: BrowserContext;
let server: ReturnType<typeof Bun.spawn> | null = null;
const origin = "http://127.0.0.1:3107";

beforeAll(async () => {
	if (
		!(await fetch(origin)
			.then(() => true)
			.catch(() => false))
	) {
		server = Bun.spawn(["bun", "run", "dev", "--host", "127.0.0.1", "--port", "3107"], {
			cwd: "apps/web",
			stdout: "ignore",
			stderr: "ignore",
		});
		for (let i = 0; i < 100; i++) {
			if (
				await fetch(origin)
					.then(() => true)
					.catch(() => false)
			)
				break;
			await Bun.sleep(100);
		}
	}
	browser = await chromium.launch({
		executablePath:
			process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? Bun.which("chromium") ?? undefined,
		headless: true,
		args: ["--no-sandbox"],
	});
});
afterAll(async () => {
	await browser?.close();
	server?.kill();
});
beforeEach(async () => {
	context = await browser.newContext();
	page = await context.newPage();
	await page.route("**/api/**", (route) => route.abort());
	await page.addInitScript(() => {
		localStorage.setItem(
			"sixtyfour_settings",
			JSON.stringify({ confirmMoves: false, soundEnabled: false }),
		);
	});
});
afterEach(async () => {
	await context?.close();
});
async function countMoves(count: number) {
	await page.waitForFunction(
		(count) =>
			JSON.parse(localStorage.getItem("sixtyfour_local_computer_game") ?? "{}").moves
				?.length === count,
		count,
	);
}

for (const opponent of ["Default", "Stockfish"]) {
	test(`${opponent} plays and resumes with the API unavailable`, async () => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(`${origin}/computer`);
		expect(await page.title()).toBe("SixtyFour");
		await page.getByRole("heading", { name: "SixtyFour", exact: true }).waitFor();
		expect(
			await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute("href"),
		).toBe("/favicon.svg");
		await page.getByRole("button", { name: opponent, exact: true }).click();
		await page.locator('[data-square="52"]').click();
		await page.locator('[data-square="36"]').click();
		await countMoves(2);
		await page.waitForFunction(() => window.sixtyfourLatency?.summary()[0].samples === 1);
		console.log(opponent, await page.evaluate(() => window.sixtyfourLatency?.summary()[0]));
		const saved = await page.evaluate(() =>
			localStorage.getItem("sixtyfour_local_computer_game"),
		);
		await page.reload();
		await page.locator('[data-square="36"] img').waitFor({ state: "visible" });
		expect(
			await page.evaluate(() => localStorage.getItem("sixtyfour_local_computer_game")),
		).toBe(saved);
		expect(errors).toEqual([]);
	}, 30000);
}

test("reset cancels an active search", async () => {
	await page.goto(`${origin}/computer`);
	await page.locator('[data-square="52"]').click();
	await page.locator('[data-square="36"]').click();
	await countMoves(1);
	await page
		.getByRole("button", { name: /restart|new game/i })
		.first()
		.click();
	await countMoves(0);
	await Bun.sleep(650);
	expect(
		await page.evaluate(
			() =>
				JSON.parse(localStorage.getItem("sixtyfour_local_computer_game") ?? "{}").moves
					?.length,
		),
	).toBe(0);
}, 30000);

test("mobile's bundled engine page runs without external assets", async () => {
	const { LOCAL_ENGINE_HTML } = await import("../../apps/mobile/src/generated/local-engine-page");
	await page.addInitScript(() => {
		const messages: unknown[] = [];
		Object.assign(window, {
			engineMessages: messages,
			ReactNativeWebView: {
				postMessage: (message: string) => messages.push(JSON.parse(message)),
			},
		});
	});
	await page.goto(`${origin}/computer`);
	await page.setContent(LOCAL_ENGINE_HTML);
	const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
	for (const opponent of ["minimax", "stockfish"]) {
		await page.evaluate(
			({ opponent, fen }) => {
				const host = window as unknown as {
					sixtyfourEngineRequest: (msg: unknown) => void;
				};
				host.sixtyfourEngineRequest({
					type: "search",
					id: opponent,
					request: { fen, opponent, level: 4, revision: 1 },
				});
			},
			{ opponent, fen },
		);
		await page.waitForFunction(
			(opponent) =>
				(window as unknown as { engineMessages: { id: string }[] }).engineMessages.some(
					(m) => m.id === opponent,
				),
			opponent,
		);
		const result = await page.evaluate(
			(opponent) =>
				(
					window as unknown as {
						engineMessages: { id: string; reply?: { move: string }; error?: string }[];
					}
				).engineMessages.find((m) => m.id === opponent),
			opponent,
		);
		expect(result?.error).toBeUndefined();
		expect(result?.reply?.move).toMatch(/^[a-h][1-8][a-h][1-8]/);
	}
}, 30000);
