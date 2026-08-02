package game

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

const gameColumns = `id,current_turn,status,mode,time_control,increment,white_time_remaining,black_time_remaining,last_move_time,white_player_id,black_player_id,draw_offered_by,half_move_clock,created_at,updated_at`

func scanGame(row pgx.Row) (*Game, error) {
	game := new(Game)
	err := row.Scan(&game.ID, &game.CurrentTurn, &game.Status, &game.Mode, &game.TimeControl, &game.Increment,
		&game.WhiteTimeRemaining, &game.BlackTimeRemaining, &game.LastMoveTime, &game.WhitePlayerID,
		&game.BlackPlayerID, &game.DrawOfferedBy, &game.HalfMoveClock, &game.CreatedAt, &game.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return game, err
}

func loadPieces(ctx context.Context, query interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, gameID int) ([]Piece, error) {
	rows, err := query.Query(ctx, `SELECT id,game_id,color,piece_type,square,has_moved FROM pieces WHERE game_id=$1`, gameID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	pieces := []Piece{}
	for rows.Next() {
		var piece Piece
		if err := rows.Scan(&piece.ID, &piece.GameID, &piece.Color, &piece.PieceType, &piece.Square, &piece.HasMoved); err != nil {
			return nil, err
		}
		pieces = append(pieces, piece)
	}
	return pieces, rows.Err()
}

func loadMoves(ctx context.Context, query interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, gameID int) ([]MoveRecord, error) {
	rows, err := query.Query(ctx, `SELECT id,game_id,from_square,to_square,piece_type,piece_color,COALESCE(captured_piece_type,''),COALESCE(promotion_piece,''),move_number,created_at FROM moves WHERE game_id=$1 ORDER BY move_number`, gameID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	moves := []MoveRecord{}
	for rows.Next() {
		var move MoveRecord
		if err := rows.Scan(&move.ID, &move.GameID, &move.FromSquare, &move.ToSquare, &move.PieceType, &move.PieceColor,
			&move.CapturedPieceType, &move.PromotionPiece, &move.MoveNumber, &move.CreatedAt); err != nil {
			return nil, err
		}
		moves = append(moves, move)
	}
	return moves, rows.Err()
}
