import { chmod, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const generated = join(root, "apps/engine/wasm");
const publicDir = join(root, "apps/web/public/engines");
const mobileDir = join(root, "apps/mobile/src/generated");
const env = { ...process.env };
const hash = new Bun.CryptoHasher("sha256");
for (const pattern of [
	"apps/engine/src/**/*.rs",
	"apps/engine/Cargo.*",
	"libs/types/src/**/*.ts",
	"scripts/build-local-engines.ts",
	"bun.lock",
]) {
	for (const file of Array.from(new Bun.Glob(pattern).scanSync({ cwd: root })).sort()) {
		hash.update(file);
		hash.update(await Bun.file(join(root, file)).arrayBuffer());
	}
}
const fingerprint = hash.digest("hex");
const stamp = Bun.file(join(publicDir, ".build-hash"));
const required = [
	join(publicDir, "classical-worker.js"),
	join(publicDir, "stockfish-18-lite-single.js"),
	join(publicDir, "stockfish-18-lite-single.wasm"),
	join(mobileDir, "local-engine-page.ts"),
];
if (
	!process.argv.includes("--force") &&
	(await stamp.exists()) &&
	(await stamp.text()) === fingerprint &&
	(await Promise.all(required.map((file) => Bun.file(file).exists()))).every(Boolean)
)
	process.exit(0);
async function run(args: string[], cwd = root, extraEnv = env) {
	const process = Bun.spawn(args, { cwd, env: extraEnv, stdout: "inherit", stderr: "inherit" });
	if (await process.exited) throw new Error(`Failed: ${args.join(" ")}`);
}
async function output(args: string[]) {
	const process = Bun.spawn(args, { stdout: "pipe", stderr: "inherit" });
	const value = (await new Response(process.stdout).text()).trim();
	if (await process.exited) throw new Error(`Failed: ${args.join(" ")}`);
	return value;
}
await Promise.all([
	mkdir(generated, { recursive: true }),
	mkdir(publicDir, { recursive: true }),
	mkdir(mobileDir, { recursive: true }),
]);
if (!process.argv.includes("--assets-only")) {
	const rustup = Bun.which("rustup");
	if (!rustup) throw new Error("Install rustup, then run this command inside devenv shell");
	const toolchain = process.env.WASM_TOOLCHAIN ?? "stable";
	const probe = Bun.spawn([rustup, "which", "--toolchain", toolchain, "rustc"], {
		stdout: "ignore",
		stderr: "ignore",
	});
	if (await probe.exited)
		await run([rustup, "toolchain", "install", toolchain, "--profile", "minimal"]);
	const targets = await output([
		rustup,
		"target",
		"list",
		"--installed",
		"--toolchain",
		toolchain,
	]);
	if (!targets.includes("wasm32-unknown-unknown"))
		await run([rustup, "target", "add", "--toolchain", toolchain, "wasm32-unknown-unknown"]);
	const rustc = await output([rustup, "which", "--toolchain", toolchain, "rustc"]);
	const cargo = await output([rustup, "which", "--toolchain", toolchain, "cargo"]);
	const linker = join(root, "scripts/wasm-linker.sh");
	await chmod(linker, 0o755);
	await run(
		[cargo, "build", "--locked", "--release", "--target", "wasm32-unknown-unknown", "--lib"],
		join(root, "apps/engine"),
		{
			...env,
			RUSTC: rustc,
			...(process.platform === "linux"
				? { CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER: linker }
				: {}),
		},
	);
}
const version = (await Bun.file(join(root, "apps/engine/Cargo.lock")).text()).match(
	/name = "wasm-bindgen"\nversion = "([^"]+)"/,
)?.[1];
if (!version) throw new Error("wasm-bindgen is missing from Cargo.lock");
const bindgen =
	process.env.WASM_BINDGEN ??
	Bun.which("wasm-bindgen") ??
	join(root, ".devenv/wasm-tools/bin/wasm-bindgen");
if (!(await Bun.file(bindgen).exists())) {
	await run([
		"cargo",
		"install",
		"wasm-bindgen-cli",
		"--locked",
		"--version",
		version,
		"--root",
		join(root, ".devenv/wasm-tools"),
	]);
}
if (!(await output([bindgen, "--version"])).endsWith(version))
	throw new Error(`wasm-bindgen ${version} is required`);
await run([
	bindgen,
	"--target",
	"web",
	"--out-dir",
	generated,
	join(root, "apps/engine/target/wasm32-unknown-unknown/release/sixtyfour.wasm"),
]);
const wasm = Buffer.from(
	await Bun.file(join(generated, "sixtyfour_bg.wasm")).arrayBuffer(),
).toString("base64");
const entry = join(generated, "worker.ts");
await Bun.write(
	entry,
	`import { initSync, LocalEngine } from "./sixtyfour.js";
initSync({ module: Uint8Array.from(atob(${JSON.stringify(wasm)}), c => c.charCodeAt(0)) });
const engine = new LocalEngine();
self.onmessage = event => {
	try {
		if (event.data.type === "reset") { engine.reset(); return; }
		const start = performance.now();
		const move = engine.best_move(event.data.fen, event.data.opponent);
		self.postMessage({ type: "result", move, elapsedMs: performance.now() - start });
	} catch (error) { self.postMessage({ type: "error", error: String(error) }); }
};
self.postMessage({ type: "ready" });`,
);
const result = await Bun.build({ entrypoints: [entry], target: "browser", minify: true });
if (!result.success) throw new AggregateError(result.logs, "Worker build failed");
const classical = await result.outputs[0].text();
await Bun.write(join(publicDir, "classical-worker.js"), classical);
const stockfishDir = join(root, "node_modules/stockfish/bin");
const stockfish = await Bun.file(join(stockfishDir, "stockfish-18-lite-single.js")).text();
const stockfishWasm = Buffer.from(
	await Bun.file(join(stockfishDir, "stockfish-18-lite-single.wasm")).arrayBuffer(),
);
await Bun.write(join(publicDir, "stockfish-18-lite-single.js"), stockfish);
await Bun.write(join(publicDir, "stockfish-18-lite-single.wasm"), stockfishWasm);
await Bun.write(
	join(publicDir, "COPYING.txt"),
	Bun.file(join(root, "node_modules/stockfish/Copying.txt")),
);
await Bun.write(
	join(publicDir, "README.txt"),
	"Stockfish.js 18.0.8, GPLv3. Source: https://github.com/nmrugg/stockfish.js/tree/v18.0.8\nStockfish source: https://github.com/official-stockfish/Stockfish\nBuild scripts and bundled engine source are in this project's repository.\n",
);
const mobileEntry = join(generated, "mobile-page.ts");
await Bun.write(
	mobileEntry,
	`import { WorkerEngine } from "../../../libs/types/src/worker-engine";
const classical = ${JSON.stringify(classical)};
const stockfish = ${JSON.stringify(stockfish)};
const bytes = ${JSON.stringify(stockfishWasm.toString("base64"))};
const engine = new WorkerEngine(isStockfish => {
	const source = URL.createObjectURL(new Blob([isStockfish ? stockfish : classical], { type: "application/javascript" }));
	const wasm = isStockfish ? URL.createObjectURL(new Blob([Uint8Array.from(atob(bytes), c => c.charCodeAt(0))], { type: "application/wasm" })) : null;
	const worker = new Worker(source + (wasm ? "#" + encodeURIComponent(wasm) : ""));
	const terminate = worker.terminate.bind(worker);
	worker.terminate = () => { terminate(); URL.revokeObjectURL(source); if (wasm) URL.revokeObjectURL(wasm); };
	return worker;
});
window.sixtyfourEngineRequest = async msg => {
	try {
		if (msg.type === "prepare") await engine.prepare(msg.opponent);
		if (msg.type === "reset") engine.reset();
		if (msg.type === "cancel") engine.dispose();
		const reply = msg.type === "search" ? await engine.search(msg.request, new AbortController().signal) : null;
		window.ReactNativeWebView.postMessage(JSON.stringify({ id: msg.id, reply }));
	} catch (error) { window.ReactNativeWebView.postMessage(JSON.stringify({ id: msg.id, error: String(error) })); }
};
window.ReactNativeWebView.postMessage(JSON.stringify({ type: "ready" }));`,
);
const mobile = await Bun.build({ entrypoints: [mobileEntry], target: "browser", minify: true });
if (!mobile.success) throw new AggregateError(mobile.logs, "Mobile engine build failed");
const html = `<!doctype html><meta charset="utf-8"><script>${(await mobile.outputs[0].text()).replace(/<\/script/gi, "<\\/script")}</script>`;
await Bun.write(
	join(mobileDir, "local-engine-page.ts"),
	`// Generated by scripts/build-local-engines.ts.\nexport const LOCAL_ENGINE_HTML = ${JSON.stringify(html)};\n`,
);
console.log("Built offline browser and mobile engines with a 500ms search budget.");
await Bun.write(stamp, fingerprint);
