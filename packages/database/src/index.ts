import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl } from "./config";
import * as schema from "./schema";

const connectionString = getDatabaseUrl();
const client = postgres(connectionString, { prepare: false });
const db = drizzle(client, { schema });

export * from "./config";
export * from "./schema";
export { db, schema };
