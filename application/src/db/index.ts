import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const database = new Database("chess.db");
const db = drizzle(database, { schema });

export { db, schema };