use actix_cors::Cors;
use actix_web::{post, web, App, HttpResponse, HttpServer, Responder};
use serde::{Deserialize, Serialize};
use shakmaty::{CastlingMode, Chess, Position, Move, Role, Color};
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

fn evaluate(pos: &Chess) -> i32 {
    let mut score = 0;
    let board = pos.board();

    for (_square, piece) in board.clone() {
        let piece_val = match piece.role {
            Role::Pawn => 100,
            Role::Knight => 320,
            Role::Bishop => 330,
            Role::Rook => 500,
            Role::Queen => 900,
            Role::King => 20000,
        };

        if piece.color == Color::White {
            score += piece_val;
        } else {
            score -= piece_val;
        }
    }
    score
}

fn minimax(pos: &Chess, depth: i32, mut alpha: i32, mut beta: i32, maximizing: bool) -> i32 {
    if depth == 0 || pos.is_game_over() {
        return evaluate(pos);
    }

    let legals = pos.legal_moves();

    if maximizing {
        let mut max_eval = i32::MIN;
        for m in legals {
            let mut new_pos = pos.clone();
            new_pos.play_unchecked(&m);
            let eval = minimax(&new_pos, depth - 1, alpha, beta, false);
            max_eval = max_eval.max(eval);
            alpha = alpha.max(eval);
            if beta <= alpha {
                break;
            }
        }
        max_eval
    } else {
        let mut min_eval = i32::MAX;
        for m in legals {
            let mut new_pos = pos.clone();
            new_pos.play_unchecked(&m);
            let eval = minimax(&new_pos, depth - 1, alpha, beta, true);
            min_eval = min_eval.min(eval);
            beta = beta.min(eval);
            if beta <= alpha {
                break;
            }
        }
        min_eval
    }
}

fn find_best_move(pos: &Chess, depth: i32) -> Option<Move> {
    let legals = pos.legal_moves();
    if legals.is_empty() {
        return None;
    }

    let mut best_move = None;
    let maximizing = pos.turn() == Color::White;

    if maximizing {
        let mut max_eval = i32::MIN;
        for m in legals {
            let mut new_pos = pos.clone();
            new_pos.play_unchecked(&m);
            let eval = minimax(&new_pos, depth - 1, i32::MIN, i32::MAX, false);
            if eval > max_eval {
                max_eval = eval;
                best_move = Some(m);
            }
        }
    } else {
        let mut min_eval = i32::MAX;
        for m in legals {
            let mut new_pos = pos.clone();
            new_pos.play_unchecked(&m);
            let eval = minimax(&new_pos, depth - 1, i32::MIN, i32::MAX, true);
            if eval < min_eval {
                min_eval = eval;
                best_move = Some(m);
            }
        }
    }

    best_move
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

    let best_move = find_best_move(&position, 5);

    match best_move {
        Some(m) => {
            let uci = Uci::from_move(&m, CastlingMode::Standard);
            HttpResponse::Ok().json(EngineResponse {
                best_move: Some(uci.to_string()),
                error: None,
            })
        }
        _none => HttpResponse::Ok().json(EngineResponse {
            best_move: None,
            error: Some("No legal moves".to_string()),
        }),
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
            .service(get_engine_move)
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
