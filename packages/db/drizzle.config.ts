import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { databasePaths, getDatabaseUrl } from "./src/config";

config({ path: databasePaths.workspaceEnvPath });

export default defineConfig({
	schema: databasePaths.schema,
	out: databasePaths.migrations,
	dialect: "postgresql",
	dbCredentials: {
		url: getDatabaseUrl(),
	},
});
