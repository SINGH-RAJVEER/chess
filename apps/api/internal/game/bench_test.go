package game

import (
	"testing"

	"github.com/rajveer/sixtyfour/apps/api/internal/engine"
)

func BenchmarkPiecesToFEN(b *testing.B) {
	pieces := initialPieces()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = piecesToFEN(pieces, White, nil, 0)
	}
}

func BenchmarkPositionForAndLegalMove(b *testing.B) {
	pieces := initialPieces()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		game, err := positionFor(pieces, White, nil, 0)
		if err != nil {
			b.Fatal(err)
		}
		if move := findLegalMove(game, 52, 36, ""); move == nil {
			b.Fatal("e2-e4 not legal")
		}
	}
}

func BenchmarkFormatBoard(b *testing.B) {
	pieces := initialPieces()
	game := Game{ID: 1, CurrentTurn: White, Status: "Ongoing", Mode: "vs_player", TimeControl: 10}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = formatBoard(game, pieces, nil, "", 0)
	}
}

func BenchmarkHasThreefoldRepetition(b *testing.B) {
	moves := []MoveRecord{
		{FromSquare: 62, ToSquare: 45}, {FromSquare: 6, ToSquare: 21},
		{FromSquare: 45, ToSquare: 62}, {FromSquare: 21, ToSquare: 6},
		{FromSquare: 62, ToSquare: 45}, {FromSquare: 6, ToSquare: 21},
		{FromSquare: 45, ToSquare: 62}, {FromSquare: 21, ToSquare: 6},
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if !hasThreefoldRepetition(moves) {
			b.Fatal("expected repetition")
		}
	}
}

func BenchmarkEngineMinimax(b *testing.B) {
	const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, _, err := engine.BestMove(fen, engine.Options{Opponent: "minimax"}); err != nil {
			b.Fatal(err)
		}
	}
}
