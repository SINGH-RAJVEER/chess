import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dbPath = process.env.NODE_ENV === "production" ? "/tmp/chess.db" : "chess.db";
const database = new Database(dbPath);
const db = drizzle(database, { schema });

export { db, schema };