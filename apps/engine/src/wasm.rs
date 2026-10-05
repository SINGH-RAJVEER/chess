use std::sync::atomic::AtomicBool;
use shakmaty::{fen::Fen, uci::UciMove, CastlingMode};
use wasm_bindgen::prelude::*;
use web_time::Duration;
use crate::{minimax, search::Searcher};

#[wasm_bindgen]
pub struct LocalEngine {
	searcher: Searcher,
}

#[wasm_bindgen]
impl LocalEngine {
	#[wasm_bindgen(constructor)]
	pub fn new() -> Self {
		Self { searcher: Searcher::with_hash_mb(16) }
	}
	pub fn reset(&mut self) { self.searcher.clear(); }
	pub fn best_move(&mut self, fen: &str, opponent: &str) -> Result<String, JsValue> {
		let pos = fen.parse::<Fen>().map_err(|e| JsValue::from_str(&e.to_string()))?
			.into_position(CastlingMode::Standard).map_err(|e| JsValue::from_str(&e.to_string()))?;
		let budget = Duration::from_millis(500);
		let result = if opponent == "minimax" {
			minimax::search(&pos, budget, 64, &AtomicBool::new(false), None, |_| {})
		} else {
			self.searcher.search(&pos, budget, 64)
		};
		Ok(result.best_move.map(|m| UciMove::from_standard(m).to_string()).unwrap_or_else(|| "0000".into()))
	}
}
