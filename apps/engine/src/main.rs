//! Standalone UCI frontend for engine testing tools (fastchess,
//! cutechess, OpenBench) and manual probing.
//!
//! The API no longer spawns an HTTP engine server; computer moves are served
//! in-process through the `cdylib` in `lib.rs`. This binary only speaks UCI
//! on stdin/stdout and is also used by the `just sprt*` recipes.

fn main() -> std::io::Result<()> {
    chess::uci::run()
}
