import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const database = new Database("chess.db");
const db = drizzle(database, { schema });

export { db, schema };