use actix_cors::Cors;
use actix_web::{
	get, 
	post, 
	web, 
	App, 
	HttpResponse, 
	HttpServer, 
	Responder
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

mod bitboard;
mod types;
mod board;
mod db;

use board::Board;

struct AppState {
    db_pool: SqlitePool,
}

#[derive(Serialize)]
struct BoardResponse {
    pieces: Vec<board::PieceInfo>,
    turn: types::Color,
    status: types::GameStatus,
}

#[derive(Deserialize)]
struct MoveRequest {
    from: u8,
    to: u8,
}

#[derive(Deserialize)]
struct LegalMovesRequest {
    square: u8,
}

// Helper to load board from DB (or default if not found)
async fn load_board(pool: &SqlitePool) -> Board {
    // We assume game ID 1 for this single-session app
    let row: Option<(String,)> = sqlx::query_as("SELECT board_json FROM game_state WHERE id = 1")
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    if let Some((json,)) = row {
        serde_json::from_str(&json).unwrap_or_else(|_| Board::default())
    } else {
        let board = Board::default();
        save_board(pool, &board).await;
        board
    }
}

// Helper to save board to DB
async fn save_board(pool: &SqlitePool, board: &Board) {
    let json = serde_json::to_string(board).unwrap();
    sqlx::query("INSERT OR REPLACE INTO game_state (id, board_json) VALUES (1, ?)")
        .bind(json)
        .execute(pool)
        .await
        .expect("Failed to save board");
}

#[get("/api/board")]
async fn get_board(data: web::Data<AppState>) -> impl Responder {
    let board = load_board(&data.db_pool).await;
    let response = BoardResponse {
        pieces: board.to_piece_list(),
        turn: board.turn,
        status: board.get_status(),
    };
    HttpResponse::Ok().json(response)
}

#[get("/api/moves")]
async fn get_legal_moves(data: web::Data<AppState>, query: web::Query<LegalMovesRequest>) -> impl Responder {
    let board = load_board(&data.db_pool).await;
    let moves = board.get_moves_for_square(query.square);
    HttpResponse::Ok().json(moves)
}

#[post("/api/move")]
async fn make_move(data: web::Data<AppState>, move_req: web::Json<MoveRequest>) -> impl Responder {
    let mut board = load_board(&data.db_pool).await;
    
    let mv = types::Move {
        from: move_req.from,
        to: move_req.to,
        promotion: None, 
    };
    
    println!("Attempting move: {} -> {}", mv.from, mv.to);
    
    match board.apply_move(mv) {
        Ok(_) => {
            save_board(&data.db_pool, &board).await;
            println!("Move Success");
            HttpResponse::Ok().json("Move accepted")
        },
        Err(e) => {
            println!("Move Failed: {}", e);
            HttpResponse::BadRequest().body(e)
        },
    }
}

#[post("/api/reset")]
async fn reset_game(data: web::Data<AppState>) -> impl Responder {
    println!("Resetting game...");
    let board = Board::default();
    save_board(&data.db_pool, &board).await;
    println!("Game reset successful");
    HttpResponse::Ok().json("Game reset")
}

async fn greet() -> impl Responder {
    HttpResponse::Ok().body("Chess Backend Running")
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Initializing Database...");
    let pool = db::init_pool().await.expect("Failed to initialize database");
    
    let app_state = web::Data::new(AppState {
        db_pool: pool,
    });
    
    println!("Starting server at http://127.0.0.1:8080");

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .app_data(app_state.clone())
            .wrap(cors)
            .route("/", web::get().to(greet))
            .service(get_board)
            .service(get_legal_moves)
            .service(make_move)
            .service(reset_game)
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}