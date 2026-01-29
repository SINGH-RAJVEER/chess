use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::env;

pub async fn init_pool() -> Result<SqlitePool, sqlx::Error> {
    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:chess.db".to_string());
    
    // Create the database file if it doesn't exist
    if !std::path::Path::new("chess.db").exists() && database_url == "sqlite:chess.db" {
        std::fs::File::create("chess.db").expect("Failed to create database file");
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    // Initialize schema
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS game_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            board_json TEXT NOT NULL
        )",
    )
    .execute(&pool)
    .await?;

    Ok(pool)
}
