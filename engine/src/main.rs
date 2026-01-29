use actix_cors::Cors;
use actix_web::{post, web, App, HttpResponse, HttpServer, Responder};
use serde::{Deserialize, Serialize};
use shakmaty::{CastlingMode, Chess, Position};
use shakmaty::fen::Fen;
use shakmaty::uci::Uci;

#[derive(Deserialize, Serialize)]
struct EngineRequest {
    fen: String,
}

#[derive(Serialize, Deserialize)]
struct EngineResponse {
    best_move: Option<String>,
    error: Option<String>,
}

#[post("/api/engine-move")]
async fn get_engine_move(req: web::Json<EngineRequest>) -> impl Responder {
    let fen_str = &req.fen;
    let setup: Fen = match fen_str.parse() {
        Ok(f) => f,
        Err(_) => return HttpResponse::BadRequest().json(EngineResponse {
            best_move: None,
            error: Some("Invalid FEN".to_string()),
        }),
    };

    let position: Chess = match setup.into_position(CastlingMode::Standard) {
        Ok(p) => p,
        Err(_) => return HttpResponse::BadRequest().json(EngineResponse {
            best_move: None,
            error: Some("Invalid Position".to_string()),
        }),
    };

    let legal_moves = position.legal_moves();
    
    if legal_moves.is_empty() {
         return HttpResponse::Ok().json(EngineResponse {
            best_move: None,
            error: Some("No legal moves".to_string()),
        });
    }

    // Placeholder: Pick the first move
    // In a real engine, we'd do alpha-beta search here
    let best_move = &legal_moves[0];
    
    let uci = Uci::from_move(best_move, CastlingMode::Standard);
    
    HttpResponse::Ok().json(EngineResponse {
        best_move: Some(uci.to_string()),
        error: None,
    })
}

async fn greet() -> impl Responder {
    HttpResponse::Ok().body("Chess Engine Running")
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test, App};

    #[actix_web::test]
    async fn test_get_engine_move() {
        let app = test::init_service(App::new().service(get_engine_move)).await;
        
        let req = test::TestRequest::post()
            .uri("/api/engine-move")
            .set_json(EngineRequest {
                fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string(),
            })
            .to_request();
            
        let resp: EngineResponse = test::call_and_read_body_json(&app, req).await;
        
        assert!(resp.best_move.is_some());
        assert!(resp.error.is_none());
        
        // Check that the move is non-empty
        let m = resp.best_move.unwrap();
        assert!(!m.is_empty());
        println!("Best move: {}", m);
    }
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