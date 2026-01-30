import * as schema from "./schema";

let db: any;

if (import.meta.env.SSR) {
  const { join } = await import("path");
  if (typeof Bun !== "undefined") {
    const { Database } = await import("bun:sqlite");
    const { drizzle } = await import("drizzle-orm/bun-sqlite");
    const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");

    const dbPath = "chess.db";
    const sqlite = new Database(dbPath);
    db = drizzle(sqlite, { schema });

    try {
      migrate(db, { migrationsFolder: "drizzle" });
      console.log("Database migrated successfully (Bun)");
    } catch (error) {
      console.error("Database migration failed (Bun):", error);
    }
  } else {
    const Database = (await import("better-sqlite3")).default;
    const { drizzle } = await import("drizzle-orm/better-sqlite3");
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");

    const dbPath =
      process.env.NODE_ENV === "production" ? "/tmp/chess.db" : "chess.db";
    const sqlite = new Database(dbPath);
    db = drizzle(sqlite, { schema });

    try {
      const migrationsFolder =
        process.env.NODE_ENV === "production"
          ? join(process.cwd(), "drizzle")
          : "drizzle";

      migrate(db, { migrationsFolder });
      console.log("Database migrated successfully (Node)");
    } catch (error) {
      console.error("Database migration failed (Node):", error);
    }
  }
} else {
  db = {} as any;
}

export { db, schema };