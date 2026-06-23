import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite";
import lucidePreprocess from "vite-plugin-lucide-preprocess";

const workspaceRoot = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, workspaceRoot, "");
	const apiProxyTarget =
		env.VITE_API_PROXY_TARGET || process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:4000";

	return {
		envDir: workspaceRoot,
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
	};
});
