import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import solidPlugin from "vite-plugin-solid";
import { nitro } from "nitro/vite";

import lucidePreprocess from "vite-plugin-lucide-preprocess";

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
});
