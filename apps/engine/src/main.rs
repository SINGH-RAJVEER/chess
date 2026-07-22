mod neural;

use std::sync::Mutex;

use actix_cors::Cors;
use actix_web::{post, web, App, HttpResponse, HttpServer, Responder};
use serde::{Deserialize, Serialize};

use shakmaty::fen::Fen;
use shakmaty::uci::Uci;
use shakmaty::{CastlingMode, Chess, Color, Move, Position, Role};

#[derive(Deserialize, Serialize)]
struct EngineRequest {
    fen: String,
    #[serde(default)]
    opponent: Opponent,
}

#[derive(Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Opponent {
    #[default]
    Minimax,
    Dqn,
}

#[derive(Serialize, Deserialize)]
struct EngineResponse {
    best_move: Option<String>,
    error: Option<String>,
    engine: String,
    execution_provider: Option<String>,
}

struct EngineState {
    neural: Option<Mutex<neural::NeuralEngine>>,
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
async fn get_engine_move(
    req: web::Json<EngineRequest>,
    state: web::Data<EngineState>,
) -> impl Responder {
    let fen_str = &req.fen;
    let setup: Fen = match fen_str.parse() {
        Ok(f) => f,
        Err(_) => {
            return HttpResponse::BadRequest().json(EngineResponse {
                best_move: None,
                error: Some("Invalid FEN".to_string()),
                engine: "none".to_string(),
                execution_provider: None,
            })
        }
    };

    let position: Chess = match setup.into_position(CastlingMode::Standard) {
        Ok(p) => p,
        Err(_) => {
            return HttpResponse::BadRequest().json(EngineResponse {
                best_move: None,
                error: Some("Invalid Position".to_string()),
                engine: "none".to_string(),
                execution_provider: None,
            })
        }
    };

    let (best_move, engine, execution_provider) = match req.opponent {
        Opponent::Dqn => match &state.neural {
            Some(neural) => {
                let mut neural = match neural.lock() {
                    Ok(neural) => neural,
                    Err(_) => {
                        return HttpResponse::InternalServerError().json(EngineResponse {
                            best_move: None,
                            error: Some("DQN engine lock failed".to_string()),
                            engine: "dqn".to_string(),
                            execution_provider: None,
                        });
                    }
                };
                let provider = neural.provider().to_string();
                match neural.best_move(&position) {
                    Ok(best_move) => (best_move, "dqn", Some(provider)),
                    Err(error) => {
                        eprintln!("[engine] DQN inference failed ({error}); using minimax");
                        (find_best_move(&position, 5), "minimax_fallback", None)
                    }
                }
            }
            None => (find_best_move(&position, 5), "minimax_fallback", None),
        },
        Opponent::Minimax => (find_best_move(&position, 5), "minimax", None),
    };

    match best_move {
        Some(m) => {
            let uci = Uci::from_move(&m, CastlingMode::Standard);
            HttpResponse::Ok().json(EngineResponse {
                best_move: Some(uci.to_string()),
                error: None,
                engine: engine.to_string(),
                execution_provider,
            })
        }
        _none => HttpResponse::Ok().json(EngineResponse {
            best_move: None,
            error: Some("No legal moves".to_string()),
            engine: engine.to_string(),
            execution_provider,
        }),
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let neural = match neural::NeuralEngine::load() {
        Ok(engine) => Some(Mutex::new(engine)),
        Err(error) => {
            eprintln!("[engine] DQN disabled: {error}");
            None
        }
    };
    let state = web::Data::new(EngineState { neural });
    println!("Starting engine server at http://0.0.0.0:8080");

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .app_data(state.clone())
            .wrap(cors)
            .service(get_engine_move)
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}
