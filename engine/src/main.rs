use actix_cors::Cors;
use actix_web::{
    post, 
    web, 
    App, 
    HttpResponse, 
    HttpServer, 
    Responder
};

mod bitboard;
mod types;
mod board;

use board::Board;
use types::Move;

// Placeholder function for engine calculation
fn calculate_best_move(board: &Board) -> Option<Move> {
    // For now, just return the first legal move available
    let moves = board.get_legal_moves();
    moves.into_iter().next()
}

#[post("/api/engine-move")]
async fn get_engine_move(board: web::Json<Board>) -> impl Responder {
    let best_move = calculate_best_move(&board);
    HttpResponse::Ok().json(best_move)
}

async fn greet() -> impl Responder {
    HttpResponse::Ok().body("Chess Engine Running")
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Starting engine server at http://127.0.0.1:8080");

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .route("/", web::get().to(greet))
            .service(get_engine_move)
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
