import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/chess";

const client = postgres(connectionString, { prepare: false });
const db = drizzle(client, { schema });

export { db, schema };
export * from "./schema";
