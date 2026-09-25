package engine

import (
	"errors"
	"strings"
	"testing"
)

const startFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

func TestBestMoveMinimax(t *testing.T) {
	uci, _, err := BestMove(startFEN, "minimax")
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
	uci, info, err := BestMove(startFEN, "custom")
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
	uci, _, err := BestMove(startFEN, "dqn")
	if err != nil {
		t.Fatal(err)
	}
	if len(uci) < 4 {
		t.Fatalf("expected UCI move, got %q", uci)
	}
}

func TestBestMoveInvalidPosition(t *testing.T) {
	if _, _, err := BestMove("not a fen", "minimax"); !errors.Is(err, ErrInvalidPosition) {
		t.Fatalf("expected ErrInvalidPosition, got %v", err)
	}
	if _, _, err := BestMove("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", "minimax"); !errors.Is(err, ErrNoMoves) {
		t.Fatalf("expected ErrNoMoves, got %v", err)
	}
}

func TestBestMoveUnknownOpponent(t *testing.T) {
	if _, _, err := BestMove(startFEN, "unknown"); err == nil {
		t.Fatal("expected opponent validation error")
	}
}
