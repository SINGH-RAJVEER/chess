import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import lucidePreprocess from "vite-plugin-lucide-preprocess";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:4000";

export default defineConfig({
	plugins: [lucidePreprocess(), tailwindcss(), react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		fs: {
			allow: [searchForWorkspaceRoot(process.cwd())],
		},
		proxy: {
			"/api": {
				target: apiProxyTarget,
				changeOrigin: true,
			},
		},
	},
});
