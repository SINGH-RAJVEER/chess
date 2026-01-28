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
use std::sync::Mutex;

mod bitboard;
mod types;
mod board;

use board::Board;

struct AppState {
    board: Mutex<Board>,
}

#[derive(Serialize)]
struct BoardResponse {
    pieces: Vec<board::PieceInfo>,
    turn: types::Color,
}

#[derive(Deserialize)]
struct MoveRequest {
    from: u8,
    to: u8,
}

#[get("/api/board")]
async fn get_board(data: web::Data<AppState>) -> impl Responder {
    let board = data.board.lock().unwrap();
    let response = BoardResponse {
        pieces: board.to_piece_list(),
        turn: board.turn,
    };
    HttpResponse::Ok().json(response)
}

#[post("/api/move")]
async fn make_move(data: web::Data<AppState>, move_req: web::Json<MoveRequest>) -> impl Responder {
    let mut board = data.board.lock().unwrap();
    
    // TODO: Validate move legality here using bitboard logic
    // For now, we will just blindly move the piece for testing the flow
    
    // simple "move" logic: 
    // 1. check if there is a piece at 'from'
    // 2. move it to 'to'
    // 3. update turn
    
    // Note: detailed move logic (updating specific bitboards) needs to be in board.rs
    // This is a temporary hack to show flow.
    // Real implementation requires identifying the piece type and updating the correct bitboard.
    
    match board.apply_move_unchecked(move_req.from, move_req.to) {
        Ok(_) => HttpResponse::Ok().json("Move accepted"),
        Err(e) => HttpResponse::BadRequest().body(e),
    }
}

async fn greet() -> impl Responder {
    HttpResponse::Ok().body("Chess Backend Running")
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Initializing Chess Board...");
    let board = Board::default();
    let app_state = web::Data::new(AppState {
        board: Mutex::new(board),
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
            .service(make_move)
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
