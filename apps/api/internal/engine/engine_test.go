package engine

import (
	"errors"
	"strings"
	"testing"
)

const startFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

func TestBestMoveMinimax(t *testing.T) {
	uci, _, err := BestMove(startFEN, Options{Opponent: "minimax"})
	if err != nil {
		t.Fatal(err)
	}
	if len(uci) < 4 {
		t.Fatalf("expected UCI move, got %q", uci)
	}
}

func TestBestMoveCustom(t *testing.T) {
	t.Setenv("ENGINE_CUSTOM_MOVETIME_MS", "50")
	t.Setenv("ENGINE_CUSTOM_MAX_DEPTH", "4")
	uci, info, err := BestMove(startFEN, Options{Opponent: "custom"})
	if err != nil {
		t.Fatal(err)
	}
	if len(uci) < 4 {
		t.Fatalf("expected UCI move, got %q", uci)
	}
	if !strings.Contains(info, "custom") {
		t.Fatalf("expected custom info, got %q", info)
	}
}

func TestLegacyDQNMapsToCustom(t *testing.T) {
	t.Setenv("ENGINE_CUSTOM_MOVETIME_MS", "50")
	t.Setenv("ENGINE_CUSTOM_MAX_DEPTH", "4")
	uci, _, err := BestMove(startFEN, Options{Opponent: "dqn"})
	if err != nil {
		t.Fatal(err)
	}
	if len(uci) < 4 {
		t.Fatalf("expected UCI move, got %q", uci)
	}
}

func TestBestMoveInvalidPosition(t *testing.T) {
	if _, _, err := BestMove("not a fen", Options{Opponent: "minimax"}); !errors.Is(err, ErrInvalidPosition) {
		t.Fatalf("expected ErrInvalidPosition, got %v", err)
	}
	if _, _, err := BestMove("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", Options{Opponent: "minimax"}); !errors.Is(err, ErrNoMoves) {
		t.Fatalf("expected ErrNoMoves, got %v", err)
	}
}

func TestBestMoveUnknownOpponent(t *testing.T) {
	if _, _, err := BestMove(startFEN, Options{Opponent: "unknown"}); err == nil {
		t.Fatal("expected opponent validation error")
	}
}

func requireStockfish(t *testing.T) {
	t.Helper()
	if !StockfishAvailable() {
		t.Skip("stockfish binary not installed")
	}
}

func TestBestMoveStockfishLevels(t *testing.T) {
	requireStockfish(t)
	for _, level := range []int{MinLevel, MaxLevel} {
		uci, info, err := BestMove(startFEN, Options{Opponent: "stockfish", Level: level})
		if err != nil {
			t.Fatalf("level %d: %v", level, err)
		}
		if len(uci) < 4 {
			t.Fatalf("level %d: expected UCI move, got %q", level, uci)
		}
		if !strings.Contains(info, "stockfish") {
			t.Fatalf("level %d: expected stockfish info, got %q", level, info)
		}
	}
}

func TestBestMoveStockfishPositionErrors(t *testing.T) {
	requireStockfish(t)
	if _, _, err := BestMove("not a fen", Options{Opponent: "stockfish"}); !errors.Is(err, ErrInvalidPosition) {
		t.Fatalf("expected ErrInvalidPosition, got %v", err)
	}
	if _, _, err := BestMove("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", Options{Opponent: "stockfish"}); !errors.Is(err, ErrNoMoves) {
		t.Fatalf("expected ErrNoMoves, got %v", err)
	}
}

func TestStockfishMissingBinary(t *testing.T) {
	t.Setenv("STOCKFISH_PATH", "/nonexistent/stockfish")
	if StockfishAvailable() {
		t.Fatal("expected stockfish to be unavailable")
	}
	if _, _, err := BestMove(startFEN, Options{Opponent: "stockfish"}); !errors.Is(err, ErrStockfishUnavailable) {
		t.Fatalf("expected ErrStockfishUnavailable, got %v", err)
	}
}

func TestNormalizeLevel(t *testing.T) {
	cases := map[int]int{-3: DefaultLevel, 0: DefaultLevel, 1: 1, 5: 5, 8: 8, 20: MaxLevel}
	for input, want := range cases {
		if got := NormalizeLevel(input); got != want {
			t.Fatalf("NormalizeLevel(%d) = %d, want %d", input, got, want)
		}
	}
}
