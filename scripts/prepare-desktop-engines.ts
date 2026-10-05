import { chmod, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const dest = join(root, "apps/desktop/engines");
const extension = process.platform === "win32" ? ".exe" : "";
const build = Bun.spawn(["cargo", "build", "--locked", "--release", "--bin", "sixtyfour-engine"], {
	cwd: join(root, "apps/engine"),
	stdout: "inherit",
	stderr: "inherit",
});
if (await build.exited) throw new Error("Native engine build failed");
const stockfish = process.env.STOCKFISH_PATH ?? Bun.which("stockfish");
if (!stockfish) throw new Error("Stockfish is required to package desktop computer games");
await mkdir(dest, { recursive: true });
await Bun.write(
	join(dest, `sixtyfour-engine${extension}`),
	Bun.file(join(root, `apps/engine/target/release/sixtyfour-engine${extension}`)),
);
await Bun.write(join(dest, `stockfish${extension}`), Bun.file(stockfish));
await chmod(join(dest, `sixtyfour-engine${extension}`), 0o755);
await chmod(join(dest, `stockfish${extension}`), 0o755);
await Bun.write(
	join(dest, "COPYING.txt"),
	Bun.file(join(root, "node_modules/stockfish/Copying.txt")),
);
console.log("Prepared native desktop engines for this platform.");
