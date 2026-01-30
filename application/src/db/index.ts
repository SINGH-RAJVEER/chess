import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const dbPath = process.env.NODE_ENV === "production" ? "/tmp/chess.db" : "chess.db";
const database = new Database(dbPath, { create: true });
const db = drizzle(database, { schema });

export { db, schema };