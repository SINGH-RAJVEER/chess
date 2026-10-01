package game

import (
	"context"
	"testing"
	"time"

	"github.com/rajveer/chess/apps/api/internal/engine"
	"github.com/rajveer/chess/apps/api/internal/testdb"
)

func openService(t *testing.T) (*Service, context.Context) {
	t.Helper()
	return NewService(testdb.Open(t)), context.Background()
}

func resetAndLoad(t *testing.T, service *Service, ctx context.Context, mode string, timeControl int) int {
	t.Helper()
	if err := service.Reset(ctx, mode, timeControl, 0); err != nil {
		t.Fatalf("reset %s: %v", mode, err)
	}
	board, err := service.GetBoard(ctx, mode, nil, "")
	if err != nil {
		t.Fatalf("load %s board: %v", mode, err)
	}
	if board.ID == 0 {
		t.Fatalf("reset %s produced no game", mode)
	}
	return board.ID
}

func TestResetAndGetBoard(t *testing.T) {
	service, ctx := openService(t)
	id := resetAndLoad(t, service, ctx, "vs_player", 10)
	board, err := service.GetBoard(ctx, "vs_player", &id, "")
	if err != nil {
		t.Fatal(err)
	}
	if board.ID != id || len(board.Pieces) != 32 || board.Turn != White || board.Status != "Ongoing" {
		t.Fatalf("unexpected board: id=%d pieces=%d turn=%s status=%s", board.ID, len(board.Pieces), board.Turn, board.Status)
	}
	if board.UserColor != "Spectator" {
		t.Fatalf("anonymous user color = %s", board.UserColor)
	}
}

func TestMakeMoveAppliesE2E4(t *testing.T) {
	service, ctx := openService(t)
	id := resetAndLoad(t, service, ctx, "vs_player", 10)
	result, err := service.MakeMove(ctx, id, 52, 36, "", engine.Options{})
	if err != nil {
		t.Fatal(err)
	}
	if result["success"] != true || result["nextTurn"] != Black {
		t.Fatalf("unexpected move result: %#v", result)
	}
	board, err := service.GetBoard(ctx, "vs_player", &id, "")
	if err != nil {
		t.Fatal(err)
	}
	if board.Turn != Black || len(board.Moves) != 1 || board.Moves[0].Notation != "e4" {
		t.Fatalf("board after e4: turn=%s moves=%+v", board.Turn, board.Moves)
	}
	if board.LastMove == nil || board.LastMove.From != 52 || board.LastMove.To != 36 {
		t.Fatalf("last move = %+v", board.LastMove)
	}
}

func TestMakeMoveRejects(t *testing.T) {
	service, ctx := openService(t)
	id := resetAndLoad(t, service, ctx, "vs_player", 10)
	if _, err := service.MakeMove(ctx, id, 8, 16, "", engine.Options{}); err == nil || err.Error() != "Invalid move" {
		t.Fatalf("moving the other side's pawn: err=%v", err)
	}
	if _, err := service.MakeMove(ctx, id+999999, 52, 36, "", engine.Options{}); err == nil || err.Error() != "No game found" {
		t.Fatalf("unknown game: err=%v", err)
	}
}

func TestValidMovesFromE2(t *testing.T) {
	service, ctx := openService(t)
	id := resetAndLoad(t, service, ctx, "vs_player", 10)
	targets, err := service.ValidMoves(ctx, id, 52)
	if err != nil {
		t.Fatal(err)
	}
	want := map[int]bool{44: true, 36: true}
	if len(targets) != 2 || !want[targets[0]] || !want[targets[1]] {
		t.Fatalf("e2 targets = %v", targets)
	}
	empty, err := service.ValidMoves(ctx, id, 36)
	if err != nil || len(empty) != 0 {
		t.Fatalf("empty square targets = %v, err = %v", empty, err)
	}
}

func TestQueueMatchmaking(t *testing.T) {
	service, ctx := openService(t)
	first, err := service.JoinQueue(ctx, "queue-alice", 10, 0)
	if err != nil || first["status"] != "queued" {
		t.Fatalf("alice join = %#v, err = %v", first, err)
	}
	second, err := service.JoinQueue(ctx, "queue-bob", 10, 0)
	if err != nil || second["status"] != "matched" {
		t.Fatalf("bob join = %#v, err = %v", second, err)
	}
	matchedID, ok := second["gameId"].(int)
	if !ok || matchedID == 0 {
		t.Fatalf("matched game has no id: %#v", second)
	}
	status, err := service.QueueStatus(ctx, "queue-alice")
	if err != nil || status["status"] != "matched" || status["gameId"] != matchedID {
		t.Fatalf("alice status = %#v, err = %v", status, err)
	}
	idle, err := service.QueueStatus(ctx, "queue-stranger")
	if err != nil || idle["status"] != "idle" {
		t.Fatalf("stranger status = %#v, err = %v", idle, err)
	}
	board, err := service.GetBoard(ctx, "vs_player", &matchedID, "queue-alice")
	if err != nil {
		t.Fatal(err)
	}
	if board.UserColor != "White" && board.UserColor != "Black" {
		t.Fatalf("alice color = %s", board.UserColor)
	}
}

func TestUndoRestoresPosition(t *testing.T) {
	service, ctx := openService(t)
	id := resetAndLoad(t, service, ctx, "vs_player", 10)
	if _, err := service.MakeMove(ctx, id, 52, 36, "", engine.Options{}); err != nil {
		t.Fatal(err)
	}
	undone, err := service.Undo(ctx, id)
	if err != nil || undone["success"] != true {
		t.Fatalf("undo = %#v, err = %v", undone, err)
	}
	board, err := service.GetBoard(ctx, "vs_player", &id, "")
	if err != nil {
		t.Fatal(err)
	}
	if board.Turn != White || len(board.Moves) != 0 {
		t.Fatalf("after undo: turn=%s moves=%d", board.Turn, len(board.Moves))
	}
	empty, err := service.Undo(ctx, id)
	if err != nil || empty["success"] != false {
		t.Fatalf("second undo = %#v, err = %v", empty, err)
	}
}

func TestResignEndsGame(t *testing.T) {
	service, ctx := openService(t)
	id := resetAndLoad(t, service, ctx, "vs_player", 10)
	result, err := service.Resign(ctx, id, White)
	if err != nil {
		t.Fatal(err)
	}
	if result["status"] != "Resignation" || result["winner"] != Black {
		t.Fatalf("resign result = %#v", result)
	}
	if _, err := service.Resign(ctx, id, Black); err == nil {
		t.Fatal("second resign should fail on a finished game")
	}
	if _, err := service.MakeMove(ctx, id, 52, 36, "", engine.Options{}); err == nil {
		t.Fatal("move on a finished game should fail")
	}
}

func TestDrawOfferAndResponse(t *testing.T) {
	service, ctx := openService(t)
	id := resetAndLoad(t, service, ctx, "vs_player", 10)
	offered, err := service.OfferDraw(ctx, id, White)
	if err != nil || offered["drawOfferedBy"] != White {
		t.Fatalf("offer = %#v, err = %v", offered, err)
	}
	declined, err := service.RespondDraw(ctx, id, false)
	if err != nil || declined["status"] != GameStatus("Ongoing") {
		t.Fatalf("decline = %#v, err = %v", declined, err)
	}
	if _, err := service.OfferDraw(ctx, id, Black); err != nil {
		t.Fatal(err)
	}
	accepted, err := service.RespondDraw(ctx, id, true)
	if err != nil || accepted["status"] != GameStatus("Draw") {
		t.Fatalf("accept = %#v, err = %v", accepted, err)
	}
}

func TestComputerGameGetsEngineReply(t *testing.T) {
	service, ctx := openService(t)
	id := resetAndLoad(t, service, ctx, "vs_computer", 0)
	if _, err := service.MakeMove(ctx, id, 52, 36, "", engine.Options{Opponent: "minimax"}); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(20 * time.Second)
	for {
		board, err := service.GetBoard(ctx, "vs_computer", &id, "")
		if err != nil {
			t.Fatal(err)
		}
		if len(board.Moves) == 2 && board.Turn == White {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("engine did not reply: moves=%+v turn=%s", board.Moves, board.Turn)
		}
		time.Sleep(200 * time.Millisecond)
	}
}
