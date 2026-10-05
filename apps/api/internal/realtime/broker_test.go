package realtime

import (
	"os"
	"testing"
	"time"

	"github.com/rajveer/sixtyfour/apps/api/internal/game"
)

func TestRedisRelaysCommittedSnapshotAndCloses(t *testing.T) {
	url := os.Getenv("TEST_REDIS_URL")
	if url == "" {
		t.Skip("TEST_REDIS_URL is required")
	}
	first, err := NewRedisBroker(url)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := NewRedisBroker(url)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	received := make(chan Change, 1)
	second.Subscribe(func(change Change) { received <- change })
	first.Publish(Change{GameID: 123, Snapshot: &game.Snapshot{Board: game.BoardResponse{ID: 123, Revision: 7, LegalMoves: map[int][]int{52: {36}}}}})
	select {
	case change := <-received:
		if change.Snapshot == nil || change.Snapshot.Board.Revision != 7 || len(change.Snapshot.Board.LegalMoves[52]) != 1 {
			t.Fatalf("snapshot lost: %+v", change)
		}
	case <-time.After(time.Second):
		t.Fatal("snapshot was not relayed")
	}
}
