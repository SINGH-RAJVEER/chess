package game

import (
	"strings"
	"testing"

	libchess "github.com/notnil/chess"
)

func TestBoardNumberingAndInitialPosition(t *testing.T) {
	if algebraic(0) != "a8" || algebraic(63) != "h1" || indexFromAlgebraic("e2") != 52 {
		t.Fatalf("unexpected board numbering: 0=%s 63=%s e2=%d", algebraic(0), algebraic(63), indexFromAlgebraic("e2"))
	}
	pieces := initialPieces()
	if len(pieces) != 32 {
		t.Fatalf("got %d initial pieces", len(pieces))
	}
	game, err := positionFor(pieces, White, nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	move := findLegalMove(game, 52, 36, "")
	if move == nil || move.S1().String() != "e2" || move.S2().String() != "e4" {
		t.Fatalf("e2-e4 was not legal: %#v", move)
	}
}

func TestCastlingRightsFollowHasMoved(t *testing.T) {
	pieces := initialPieces()
	fen := piecesToFEN(pieces, White, nil, 0)
	if fen != "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" {
		t.Fatalf("unexpected FEN: %s", fen)
	}
	for index := range pieces {
		if pieces[index].PieceType == King && pieces[index].Color == White {
			pieces[index].HasMoved = true
		}
	}
	if got := piecesToFEN(pieces, White, nil, 0); strings.Contains(strings.Fields(got)[2], "K") || strings.Contains(strings.Fields(got)[2], "Q") {
		t.Fatalf("white castling rights remained: %s", got)
	}
}

func TestStatusAndPromotion(t *testing.T) {
	option, err := libchess.FEN("7k/5Q2/7K/8/8/8/8/8 b - - 0 1")
	if err != nil {
		t.Fatal(err)
	}
	if status := gameStatus(libchess.NewGame(option)); status != "Stalemate" {
		t.Fatalf("status = %s", status)
	}
	option, err = libchess.FEN("7k/P7/7K/8/8/8/8/8 w - - 0 1")
	if err != nil {
		t.Fatal(err)
	}
	game := libchess.NewGame(option)
	move := findLegalMove(game, indexFromAlgebraic("a7"), indexFromAlgebraic("a8"), Knight)
	if move == nil || move.Promo() != libchess.Knight {
		t.Fatalf("knight promotion = %#v", move)
	}
}

func TestCheckDetection(t *testing.T) {
	pieces := []Piece{
		{Color: White, PieceType: King, Square: indexFromAlgebraic("e1")},
		{Color: Black, PieceType: King, Square: indexFromAlgebraic("a8")},
		{Color: Black, PieceType: Rook, Square: indexFromAlgebraic("e8")},
	}
	if !isInCheck(pieces, White) {
		t.Fatal("rook check was not detected")
	}
	pieces = append(pieces, Piece{Color: White, PieceType: Pawn, Square: indexFromAlgebraic("e2")})
	if isInCheck(pieces, White) {
		t.Fatal("blocked rook was reported as check")
	}
}

func TestThreefoldRepetition(t *testing.T) {
	uciMoves := [][2]string{{"g1", "f3"}, {"g8", "f6"}, {"f3", "g1"}, {"f6", "g8"}, {"g1", "f3"}, {"g8", "f6"}, {"f3", "g1"}, {"f6", "g8"}}
	moves := make([]MoveRecord, 0, len(uciMoves))
	for _, move := range uciMoves {
		moves = append(moves, MoveRecord{FromSquare: indexFromAlgebraic(move[0]), ToSquare: indexFromAlgebraic(move[1])})
	}
	if !hasThreefoldRepetition(moves) {
		t.Fatal("threefold repetition was not detected")
	}
}
