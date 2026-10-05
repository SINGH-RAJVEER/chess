package engine

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestPersistentWorkerBudgetAndCancellation(t *testing.T) {
	lease, err := Acquire(context.Background(), Options{Opponent: "minimax"}, 123)
	if err != nil { t.Fatal(err) }
	pid := lease.worker.cmd.Process.Pid
	start := time.Now()
	move, info, err := lease.Search(context.Background(), startFEN)
	lease.Release()
	if err != nil || len(move)<4 || !strings.Contains(info, "depth") { t.Fatalf("move=%q info=%q err=%v", move, info, err) }
	if time.Since(start)>800*time.Millisecond { t.Fatalf("search overran 500ms budget: %s", time.Since(start)) }
	lease, err = Acquire(context.Background(), Options{Opponent: "minimax"}, 123)
	if err != nil { t.Fatal(err) }
	defer lease.Release()
	if lease.worker.cmd.Process.Pid != pid { t.Fatal("worker was not reused") }
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, _, err := lease.Search(ctx, startFEN); !errors.Is(err, context.DeadlineExceeded) { t.Fatalf("expected deadline, got %v", err) }
}

func TestCapacityReservation(t *testing.T) {
	var leases []*Lease
	defer func() { for _, lease := range leases { lease.Release() } }()
	for i:=0; i<searchConcurrency(); i++ {
		lease, err := Acquire(context.Background(), Options{Opponent:"minimax"}, i+1000)
		if err != nil { t.Fatal(err) }
		leases = append(leases, lease)
	}
	if _, err := Acquire(context.Background(), Options{Opponent:"minimax"}, 9999); !errors.Is(err, ErrBusy) { t.Fatalf("expected busy, got %v", err) }
}

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
	// A line break would append a command to the engine's UCI script.
	if _, _, err := BestMove(startFEN+"\ngo infinite", Options{Opponent: "minimax"}); !errors.Is(err, ErrInvalidPosition) {
		t.Fatalf("expected ErrInvalidPosition for injected command, got %v", err)
	}
	// Parses in Go but is illegal for the engine: the side not to move is
	// in check. The engine must refuse rather than search a stale position.
	if _, _, err := BestMove("7k/8/8/8/8/8/8/K6Q w - - 0 1", Options{Opponent: "custom"}); !errors.Is(err, ErrInvalidPosition) {
		t.Fatalf("expected ErrInvalidPosition from the engine, got %v", err)
	}
}

func TestEngineMissingBinary(t *testing.T) {
	t.Setenv("ENGINE_PATH", "/nonexistent/sixtyfour-engine")
	if err := Available("minimax"); !errors.Is(err, ErrEngineUnavailable) {
		t.Fatalf("expected ErrEngineUnavailable, got %v", err)
	}
	if _, _, err := BestMove(startFEN, Options{Opponent: "custom"}); !errors.Is(err, ErrEngineUnavailable) {
		t.Fatalf("expected ErrEngineUnavailable, got %v", err)
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
