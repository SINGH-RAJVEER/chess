import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/chess";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageDir, "../..");
const workspaceEnvPath = resolve(workspaceRoot, ".env");

config({ path: workspaceEnvPath });

export function getDatabaseUrl() {
	return process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
}

export const databasePaths = {
	packageDir,
	workspaceRoot,
	workspaceEnvPath,
	schema: resolve(packageDir, "src/schema.ts"),
	migrations: resolve(packageDir, "drizzle"),
};
