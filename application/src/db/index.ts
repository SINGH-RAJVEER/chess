import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { join } from "path";

const dbPath = process.env.NODE_ENV === "production" ? "/tmp/chess.db" : "chess.db";
const database = new Database(dbPath);
const db = drizzle(database, { schema });

// Automatically migrate the database on startup
try {
  const migrationsFolder = process.env.NODE_ENV === "production" 
    ? join(process.cwd(), "drizzle") // In Vercel, this might need adjustment depending on where assets are placed
    : "drizzle";
    
  migrate(db, { migrationsFolder });
  console.log("Database migrated successfully");
} catch (error) {
  console.error("Database migration failed:", error);
}

export { db, schema };