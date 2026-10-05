package game

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	libchess "github.com/notnil/chess"
	"time"
)

// ArchivedGame is an unrated local game, independent of live server games.
type ArchivedGame struct {
	Version  int      `json:"version"`
	ID       int64    `json:"id"`
	Revision int64    `json:"revision"`
	Moves    []string `json:"moves"`
	Resigned bool     `json:"resigned"`
	Opponent string   `json:"opponent"`
	Level    int      `json:"level"`
}

func ValidateArchive(state ArchivedGame) error {
	if state.Version != 1 || state.ID <= 0 || state.ID > 9007199254740991 || state.Revision < 0 || state.Revision > 9007199254740991 || len(state.Moves) > 2048 || state.Level < 1 || state.Level > 8 {
		return errors.New("invalid computer game archive")
	}
	if state.Opponent != "minimax" && state.Opponent != "custom" && state.Opponent != "stockfish" {
		return errors.New("invalid opponent")
	}
	position := libchess.NewGame()
	for _, move := range state.Moves {
		if len(move) > 16 || position.Outcome() != libchess.NoOutcome {
			return errors.New("invalid move history")
		}
		if err := position.MoveStr(move); err != nil {
			return errors.New("invalid move history")
		}
	}
	return nil
}

func (service *Service) Archive(ctx context.Context, userID string, state ArchivedGame) error {
	if err := ValidateArchive(state); err != nil {
		return err
	}
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	_, err = service.db.Exec(ctx, `INSERT INTO computer_game_archives(user_id,client_id,revision,state,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,client_id) DO UPDATE SET revision=EXCLUDED.revision,state=EXCLUDED.state,updated_at=EXCLUDED.updated_at WHERE computer_game_archives.revision < EXCLUDED.revision`, userID, state.ID, state.Revision, data, time.Now().UnixMilli())
	return err
}

func (service *Service) LatestArchive(ctx context.Context, userID string) (json.RawMessage, error) {
	var data json.RawMessage
	err := service.db.QueryRow(ctx, `SELECT state FROM computer_game_archives WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 1`, userID).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return data, err
}
