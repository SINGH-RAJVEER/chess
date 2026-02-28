import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import lucidePreprocess from "vite-plugin-lucide-preprocess";
import solidPlugin from "vite-plugin-solid";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [
		lucidePreprocess(),
		nitro(),
		tailwindcss(),
		tanstackStart(),
		solidPlugin({ ssr: true }),
		viteTsConfigPaths({
			projects: ["./tsconfig.json"],
		}),
	],
	resolve: {
		dedupe: ["solid-js", "solid-js/web"],
	},
	ssr: {
		external: ["postgres"],
	},
	build: {
		rollupOptions: {
			external: ["postgres"],
		},
	},
});
