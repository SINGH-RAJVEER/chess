// Package engine serves computer moves by running UCI engines as child
// processes: the sixtyfour-engine binary built from apps/engine (minimax and
// the custom alpha-beta search) and Stockfish.
//
// Persistent UCI workers are leased exclusively. Workers keep search state
// within one game and reset it when reassigned. Capacity is reserved before
// committing a human move, and failed workers are discarded.
package engine

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/notnil/chess"
)

const (
	opponentMinimax = iota
	opponentCustom
	opponentStockfish
)

// Options selects the computer opponent. Level only applies to Stockfish
// and is clamped by NormalizeLevel.
type Options struct {
	Opponent string
	Level    int
}

var (
	// ErrBusy reports that every search slot is in use.
	ErrBusy = errors.New("engine busy")
	// ErrNoMoves reports a legal position with no legal moves.
	ErrNoMoves = errors.New("no legal moves")
	// ErrInvalidPosition reports a FEN that fails to parse or is illegal.
	ErrInvalidPosition = errors.New("invalid position")
	// ErrEngineUnavailable reports that no sixtyfour-engine binary could be
	// found at ENGINE_PATH, on PATH, or in the local Cargo build output.
	ErrEngineUnavailable = errors.New("SixtyFour engine is not installed on the server")
)

const SearchBudgetMS = 500

func searchConcurrency() int {
	if n := runtime.GOMAXPROCS(0) - 1; n > 0 {
		return min(n, 4)
	}
	return 1
}

// Available reports whether the binary behind opponent can be resolved, so
// callers can reject a move before committing it to a game that would then
// wait on an engine reply that can never arrive.
func Available(opponent string) error {
	selector, err := normalizeOpponent(opponent)
	if err != nil {
		return err
	}
	if selector == opponentStockfish {
		_, err = stockfishPath()
	} else {
		_, err = enginePath()
	}
	return err
}

// BestMove selects a computer move for fen and returns it in UCI notation
// (for example "e7e5" or "e7e8q"), plus optional diagnostic info.
//
// options.Opponent is "minimax", "custom", or "stockfish"; "" defaults to
// minimax and legacy "dqn" values map to custom. Every opponent searches
// for at most 500ms; Stockfish strength comes from options.Level.
func BestMove(fen string, options Options) (string, string, error) {
	lease, err := Acquire(context.Background(), options, 0)
	if err != nil {
		return "", "", err
	}
	defer lease.Release()
	return lease.Search(context.Background(), fen)
}

func validateFEN(fen string) error {
	if strings.TrimSpace(fen) == "" || strings.ContainsAny(fen, "\r\n") {
		return ErrInvalidPosition
	}
	if _, err := chess.FEN(fen); err != nil {
		return ErrInvalidPosition
	}
	return nil
}

func enginePath() (string, error) {
	if name := os.Getenv("ENGINE_PATH"); name != "" {
		path, err := exec.LookPath(name)
		if err != nil {
			return "", ErrEngineUnavailable
		}
		return path, nil
	}
	if path, err := exec.LookPath("sixtyfour-engine"); err == nil {
		return path, nil
	}
	if path := cargoBuildPath(); path != "" {
		return path, nil
	}
	return "", ErrEngineUnavailable
}

// cargoBuildPath locates apps/engine/target/release/sixtyfour-engine relative
// to this source file, so `go run` and `go test` inside the repository work
// after `cargo build --release` without setting ENGINE_PATH. Deployed
// binaries rely on ENGINE_PATH or PATH instead.
func cargoBuildPath() string {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return ""
	}
	path := filepath.Join(filepath.Dir(file), "..", "..", "..", "engine", "target", "release", "sixtyfour-engine")
	if info, err := os.Stat(path); err != nil || info.IsDir() {
		return ""
	}
	return path
}

func normalizeOpponent(opponent string) (int, error) {
	switch opponent {
	case "", "minimax":
		return opponentMinimax, nil
	case "custom", "dqn":
		return opponentCustom, nil
	case "stockfish":
		return opponentStockfish, nil
	default:
		return 0, errors.New("opponent must be minimax, custom, or stockfish")
	}
}
