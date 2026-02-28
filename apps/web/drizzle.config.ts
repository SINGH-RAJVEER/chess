import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env" });

export default defineConfig({
  schema: "../packages/db/src/schema.ts",
  out: "../packages/db/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/chess",
  },
});