use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use ort::ep::ExecutionProviderDispatch;
use ort::session::Session;
use ort::value::Tensor;
use shakmaty::{Chess, Color, EnPassantMode, Move, Outcome, Position, Role, Square};

const INPUT_PLANES: usize = 14;
const POLICY_SIZE: usize = 4672;
const C_PUCT: f32 = 1.5;

pub struct NeuralEngine {
    session: Session,
    provider: &'static str,
    simulations: u32,
    move_time: Duration,
}

impl NeuralEngine {
    pub fn load() -> Result<Self, String> {
        let model_path = std::env::var_os("CHESS_MODEL_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dqn/model.onnx"));
        if !model_path.is_file() {
            return Err(format!("model not found at {}", model_path.display()));
        }

        let (session, provider) = match build_session(
            &model_path,
            Some(ort::ep::CUDA::default().build().error_on_failure()),
        ) {
            Ok(session) => (session, "CUDA"),
            Err(cuda_error) => {
                eprintln!("[engine] CUDA unavailable ({cuda_error}); using ONNX CPU inference");
                let session = build_session(&model_path, None)
                    .map_err(|error| format!("could not load ONNX model: {error}"))?;
                (session, "CPU")
            }
        };

        let simulations = read_env("DQN_SIMULATIONS", 20000_u32);
        let move_time = Duration::from_millis(read_env("DQN_MOVE_TIME_MS", 500000_u64));
        eprintln!(
            "[engine] DQN model loaded from {} with {provider} provider",
            model_path.display()
        );

        Ok(Self {
            session,
            provider,
            simulations,
            move_time,
        })
    }

    pub fn provider(&self) -> &'static str {
        self.provider
    }

    pub fn best_move(&mut self, position: &Chess) -> Result<Option<Move>, String> {
        neural_best_move(
            position,
            &mut self.session,
            self.simulations,
            self.move_time,
        )
    }
}

fn build_session(
    model_path: &PathBuf,
    provider: Option<ExecutionProviderDispatch>,
) -> ort::Result<Session> {
    let mut builder = Session::builder()?;
    if let Some(provider) = provider {
        builder = builder.with_execution_providers([provider])?;
    }
    builder.commit_from_file(model_path)
}

fn read_env<T>(name: &str, default: T) -> T
where
    T: std::str::FromStr,
{
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

struct Node {
    position: Chess,
    chess_move: Option<Move>,
    parent: Option<usize>,
    children: Vec<usize>,
    visits: u32,
    value_sum: f32,
    prior: f32,
    expanded: bool,
}

impl Node {
    fn new(position: Chess, chess_move: Option<Move>, parent: Option<usize>, prior: f32) -> Self {
        Self {
            position,
            chess_move,
            parent,
            children: Vec::new(),
            visits: 0,
            value_sum: 0.0,
            prior,
            expanded: false,
        }
    }

    fn value(&self) -> f32 {
        if self.visits == 0 {
            0.0
        } else {
            self.value_sum / self.visits as f32
        }
    }
}

fn neural_best_move(
    position: &Chess,
    session: &mut Session,
    max_simulations: u32,
    move_time: Duration,
) -> Result<Option<Move>, String> {
    if position.is_game_over() {
        return Ok(None);
    }

    let deadline = Instant::now() + move_time;
    let mut arena = vec![Node::new(position.clone(), None, None, 1.0)];
    let root_value = expand(&mut arena, 0, session)?;
    backpropagate(&mut arena, 0, root_value);

    let mut simulations = 0;
    while simulations < max_simulations && Instant::now() < deadline {
        let leaf = select(&arena);
        let value = if arena[leaf].position.is_game_over() {
            terminal_value(&arena[leaf].position)
        } else {
            expand(&mut arena, leaf, session)?
        };
        backpropagate(&mut arena, leaf, value);
        simulations += 1;
    }

    eprintln!("[engine] DQN search completed {simulations} simulations");
    Ok(arena[0]
        .children
        .iter()
        .max_by_key(|&&child| arena[child].visits)
        .and_then(|&child| arena[child].chess_move.clone()))
}

fn select(arena: &[Node]) -> usize {
    let mut index = 0;
    loop {
        let node = &arena[index];
        if !node.expanded || node.children.is_empty() || node.position.is_game_over() {
            return index;
        }

        let parent_visits = node.visits.max(1) as f32;
        index = *node
            .children
            .iter()
            .max_by(|&&left, &&right| {
                let score = |child: &Node| {
                    -child.value()
                        + C_PUCT * child.prior * parent_visits.sqrt() / (1.0 + child.visits as f32)
                };
                score(&arena[left])
                    .partial_cmp(&score(&arena[right]))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .expect("expanded nodes have children");
    }
}

fn expand(arena: &mut Vec<Node>, index: usize, session: &mut Session) -> Result<f32, String> {
    let (policy, value) = evaluate(session, &arena[index].position)?;
    let legal_moves: Vec<Move> = arena[index].position.legal_moves().into_iter().collect();
    let parent_position = arena[index].position.clone();
    arena[index].expanded = true;

    for chess_move in legal_moves {
        let Some(policy_index) = move_to_policy_index(&chess_move) else {
            continue;
        };
        let mut child_position = parent_position.clone();
        child_position.play_unchecked(&chess_move);
        let child_index = arena.len();
        arena[index].children.push(child_index);
        arena.push(Node::new(
            child_position,
            Some(chess_move),
            Some(index),
            *policy.get(&policy_index).unwrap_or(&0.0),
        ));
    }

    Ok(value)
}

fn backpropagate(arena: &mut [Node], mut index: usize, mut value: f32) {
    loop {
        arena[index].visits += 1;
        arena[index].value_sum += value;
        value = -value;
        match arena[index].parent {
            Some(parent) => index = parent,
            None => break,
        }
    }
}

fn terminal_value(position: &Chess) -> f32 {
    match position.outcome() {
        Some(Outcome::Decisive { winner }) if winner == position.turn() => 1.0,
        Some(Outcome::Decisive { .. }) => -1.0,
        _ => 0.0,
    }
}

fn evaluate(session: &mut Session, position: &Chess) -> Result<(HashMap<usize, f32>, f32), String> {
    let input =
        Tensor::<f32>::from_array(([1_usize, INPUT_PLANES, 8, 8], board_to_tensor(position)))
            .map_err(|error| error.to_string())?;
    let outputs = session
        .run(ort::inputs!["board" => input])
        .map_err(|error| error.to_string())?;
    let (_, logits) = outputs["policy"]
        .try_extract_tensor::<f32>()
        .map_err(|error| error.to_string())?;
    let (_, values) = outputs["value"]
        .try_extract_tensor::<f32>()
        .map_err(|error| error.to_string())?;

    if logits.len() != POLICY_SIZE || values.is_empty() {
        return Err("DQN model returned invalid output shapes".to_string());
    }

    let legal_indices: Vec<(usize, f32)> = position
        .legal_moves()
        .into_iter()
        .filter_map(|chess_move| {
            move_to_policy_index(&chess_move).map(|index| (index, logits[index]))
        })
        .collect();
    if legal_indices.is_empty() {
        return Ok((HashMap::new(), values[0]));
    }

    let max_logit = legal_indices
        .iter()
        .map(|(_, logit)| *logit)
        .fold(f32::NEG_INFINITY, f32::max);
    let denominator: f32 = legal_indices
        .iter()
        .map(|(_, logit)| (*logit - max_logit).exp())
        .sum();
    let policy = legal_indices
        .into_iter()
        .map(|(index, logit)| (index, (logit - max_logit).exp() / denominator))
        .collect();

    Ok((policy, values[0]))
}

fn board_to_tensor(position: &Chess) -> Vec<f32> {
    let mut planes = vec![0.0; INPUT_PLANES * 8 * 8];
    for (square, piece) in position.board().clone() {
        let color_offset = if piece.color == Color::White { 0 } else { 6 };
        let role_offset = match piece.role {
            Role::Pawn => 0,
            Role::Knight => 1,
            Role::Bishop => 2,
            Role::Rook => 3,
            Role::Queen => 4,
            Role::King => 5,
        };
        planes[(color_offset + role_offset) * 64 + usize::from(square)] = 1.0;
    }

    if position.turn() == Color::White {
        planes[12 * 64..13 * 64].fill(1.0);
    }
    if let Some(square) = position.ep_square(EnPassantMode::Legal) {
        planes[13 * 64 + usize::from(square)] = 1.0;
    }
    planes
}

fn move_to_policy_index(chess_move: &Move) -> Option<usize> {
    let from = chess_move.from()?;
    let to = castle_destination(chess_move).unwrap_or_else(|| chess_move.to());
    let from_rank = i32::from(from.rank());
    let from_file = i32::from(from.file());
    let rank_delta = i32::from(to.rank()) - from_rank;
    let file_delta = i32::from(to.file()) - from_file;

    if let Some(promotion) = chess_move.promotion().filter(|role| *role != Role::Queen) {
        let promotion_index = match promotion {
            Role::Knight => 0,
            Role::Bishop => 1,
            Role::Rook => 2,
            _ => return None,
        };
        let plane = 64 + promotion_index * 3 + (file_delta + 1) as usize;
        return Some(plane * 64 + usize::from(from));
    }

    const KNIGHT_OFFSETS: [(i32, i32); 8] = [
        (2, 1),
        (1, 2),
        (-1, 2),
        (-2, 1),
        (-2, -1),
        (-1, -2),
        (1, -2),
        (2, -1),
    ];
    if let Some(offset) = KNIGHT_OFFSETS
        .iter()
        .position(|candidate| *candidate == (rank_delta, file_delta))
    {
        return Some((56 + offset) * 64 + usize::from(from));
    }

    const DIRECTIONS: [(i32, i32); 8] = [
        (1, 0),
        (1, 1),
        (0, 1),
        (-1, 1),
        (-1, 0),
        (-1, -1),
        (0, -1),
        (1, -1),
    ];
    for (direction_index, (rank_direction, file_direction)) in DIRECTIONS.iter().enumerate() {
        for distance in 1..=7 {
            if rank_delta == rank_direction * distance && file_delta == file_direction * distance {
                let plane = direction_index * 7 + (distance - 1) as usize;
                return Some(plane * 64 + usize::from(from));
            }
        }
    }
    None
}

fn castle_destination(chess_move: &Move) -> Option<Square> {
    let Move::Castle { king, rook } = chess_move else {
        return None;
    };
    let destination_file = if king < rook { 6 } else { 2 };
    Some(Square::new(u32::from(king.rank()) * 8 + destination_file))
}

#[cfg(test)]
mod tests {
    use super::*;
    use shakmaty::{fen::Fen, uci::Uci, CastlingMode};

    #[test]
    fn initial_board_encoding_matches_training_layout() {
        let position = Chess::default();
        let tensor = board_to_tensor(&position);

        assert_eq!(tensor.len(), INPUT_PLANES * 64);
        assert_eq!(tensor[usize::from(Square::A2)], 1.0);
        assert_eq!(tensor[6 * 64 + usize::from(Square::A7)], 1.0);
        assert!(tensor[12 * 64..13 * 64].iter().all(|value| *value == 1.0));
    }

    #[test]
    fn move_encoding_matches_training_layout() {
        let position = Chess::default();
        let chess_move = Uci::from_ascii(b"g1f3")
            .unwrap()
            .to_move(&position)
            .unwrap();

        assert_eq!(move_to_policy_index(&chess_move), Some(63 * 64 + 6));
    }

    #[test]
    fn castling_uses_the_king_destination() {
        let fen: Fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1".parse().unwrap();
        let position: Chess = fen.into_position(CastlingMode::Standard).unwrap();
        let chess_move = Uci::from_ascii(b"e1g1")
            .unwrap()
            .to_move(&position)
            .unwrap();

        assert_eq!(move_to_policy_index(&chess_move), Some(15 * 64 + 4));
    }
}
