//! `sixtyfour-engine`: the UCI frontend served to the Go API, engine testing
//! tools (fastchess, cutechess, OpenBench), and manual probing.
//!
//! The API spawns this binary once per computer move and talks to it over
//! stdin/stdout. The `just sprt*` recipes use the lighter `uci` shim in
//! `src/bin/uci.rs` instead.

fn main() -> std::io::Result<()> {
	sixtyfour::uci::run()
}
