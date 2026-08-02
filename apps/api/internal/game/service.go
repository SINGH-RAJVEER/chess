package game

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand/v2"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	libchess "github.com/notnil/chess"
)

type Service struct {
	db         *pgxpool.Pool
	engineURL  string
	httpClient *http.Client
}

func NewService(db *pgxpool.Pool, engineURL string) *Service {
	return &Service{db: db, engineURL: strings.TrimRight(engineURL, "/"), httpClient: &http.Client{Timeout: 30 * time.Second}}
}

func (service *Service) createGame(ctx context.Context, mode string, timeControl, increment int, whiteID, blackID *string) (*Game, error) {
	tx, err := service.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	startingTime := int64(timeControl * 60 * 1000)
	if timeControl == 0 {
		startingTime = 9007199254740991
	}
	now := time.Now().UnixMilli()
	game, err := scanGame(tx.QueryRow(ctx, `INSERT INTO games(current_turn,status,mode,time_control,increment,white_time_remaining,black_time_remaining,last_move_time,white_player_id,black_player_id,draw_offered_by,half_move_clock,created_at,updated_at)
        VALUES('White','Ongoing',$1,$2,$3,$4,$4,NULL,$5,$6,NULL,0,$7,$7) RETURNING `+gameColumns,
		mode, timeControl, increment, startingTime, whiteID, blackID, now))
	if err != nil {
		return nil, err
	}
	batch := &pgx.Batch{}
	for _, piece := range initialPieces() {
		batch.Queue(`INSERT INTO pieces(game_id,color,piece_type,square,has_moved) VALUES($1,$2,$3,$4,false)`, game.ID, piece.Color, piece.PieceType, piece.Square)
	}
	results := tx.SendBatch(ctx, batch)
	if err := results.Close(); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return game, nil
}

func (service *Service) GetBoard(ctx context.Context, mode string, gameID *int, playerID string) (BoardResponse, error) {
	if mode == "" {
		mode = "vs_player"
	}
	var game *Game
	var err error
	if gameID != nil && *gameID != 0 {
		game, err = scanGame(service.db.QueryRow(ctx, `SELECT `+gameColumns+` FROM games WHERE id=$1`, *gameID))
	} else if playerID != "" && mode == "vs_player" {
		game, err = scanGame(service.db.QueryRow(ctx, `SELECT `+gameColumns+` FROM games WHERE status IN ('Ongoing','Checkmate','Stalemate','Timeout','Resignation','Draw','InsufficientMaterial','ThreefoldRepetition','FiftyMoveRule') AND (white_player_id=$1 OR black_player_id=$1) ORDER BY updated_at DESC LIMIT 1`, playerID))
	} else if mode == "vs_player" {
		game, err = scanGame(service.db.QueryRow(ctx, `SELECT `+gameColumns+` FROM games WHERE mode='vs_player' AND white_player_id IS NULL AND black_player_id IS NULL ORDER BY updated_at DESC LIMIT 1`))
		if err == nil && game == nil {
			game, err = service.createGame(ctx, mode, 10, 0, nil, nil)
		}
	} else {
		game, err = scanGame(service.db.QueryRow(ctx, `SELECT `+gameColumns+` FROM games WHERE mode='vs_computer' ORDER BY updated_at DESC LIMIT 1`))
		if err == nil && game == nil {
			game, err = service.createGame(ctx, mode, 0, 0, nil, nil)
		}
	}
	if err != nil {
		return BoardResponse{}, err
	}
	now := time.Now().UnixMilli()
	if game == nil {
		return emptyBoard(mode, now), nil
	}
	pieces, err := loadPieces(ctx, service.db, game.ID)
	if err != nil {
		return BoardResponse{}, err
	}
	if game.Status == "Ongoing" && game.LastMoveTime != nil && game.TimeControl != 0 {
		remaining := game.WhiteTimeRemaining
		if game.CurrentTurn == Black {
			remaining = game.BlackTimeRemaining
		}
		if remaining-(now-*game.LastMoveTime) <= 0 {
			if _, err := service.db.Exec(ctx, `UPDATE games SET status='Timeout',updated_at=$1 WHERE id=$2 AND status='Ongoing'`, now, game.ID); err != nil {
				return BoardResponse{}, err
			}
			game.Status = "Timeout"
		}
	}
	moves, err := loadMoves(ctx, service.db, game.ID)
	if err != nil {
		return BoardResponse{}, err
	}
	response := formatBoard(*game, pieces, moves, playerID, now)
	if game.Status == "Ongoing" {
		var last *MoveRecord
		if len(moves) > 0 {
			last = &moves[len(moves)-1]
		}
		_, chessErr := positionFor(pieces, game.CurrentTurn, last, game.HalfMoveClock)
		if chessErr == nil {
			response.IsCheck = isInCheck(pieces, game.CurrentTurn)
		}
	}
	return response, nil
}

func emptyBoard(mode string, now int64) BoardResponse {
	response := BoardResponse{ID: 0, Pieces: []BoardPiece{}, CapturedPieces: map[string][]PieceType{"white": {}, "black": {}}, Moves: []BoardMove{}, Turn: White, Status: "Ongoing", Mode: mode, TimeControl: 10, WhiteTimeRemaining: 600000, BlackTimeRemaining: 600000, ServerTime: now, UserColor: "Spectator"}
	for _, piece := range initialPieces() {
		response.Pieces = append(response.Pieces, BoardPiece{piece.Color, piece.PieceType, piece.Square})
	}
	return response
}

func formatBoard(game Game, pieces []Piece, moves []MoveRecord, playerID string, now int64) BoardResponse {
	response := BoardResponse{ID: game.ID, Pieces: []BoardPiece{}, CapturedPieces: map[string][]PieceType{"white": {}, "black": {}}, Moves: []BoardMove{}, Turn: game.CurrentTurn, Status: game.Status, Mode: game.Mode, TimeControl: game.TimeControl, Increment: game.Increment, WhiteTimeRemaining: game.WhiteTimeRemaining, BlackTimeRemaining: game.BlackTimeRemaining, LastMoveTime: game.LastMoveTime, ServerTime: now, UserColor: "Spectator", DrawOfferedBy: game.DrawOfferedBy, MoveCount: len(moves), HalfMoveClock: game.HalfMoveClock}
	if game.WhitePlayerID != nil && *game.WhitePlayerID == playerID {
		response.UserColor = "White"
	}
	if game.BlackPlayerID != nil && *game.BlackPlayerID == playerID {
		response.UserColor = "Black"
	}
	for _, piece := range pieces {
		response.Pieces = append(response.Pieces, BoardPiece{piece.Color, piece.PieceType, piece.Square})
	}
	files := "abcdefgh"
	for _, move := range moves {
		castle := move.PieceType == King && abs(col(move.FromSquare)-col(move.ToSquare)) == 2
		notation := ""
		if castle {
			if col(move.ToSquare) == 6 {
				notation = "O-O"
			} else {
				notation = "O-O-O"
			}
		} else {
			if move.PieceType != Pawn {
				if move.PieceType == Knight {
					notation = "N"
				} else {
					notation = string(move.PieceType[0])
				}
			}
			if move.CapturedPieceType != "" {
				if move.PieceType == Pawn {
					notation += string(files[col(move.FromSquare)])
				}
				notation += "x"
			}
			notation += fmt.Sprintf("%c%d", files[col(move.ToSquare)], 8-row(move.ToSquare))
			if move.PromotionPiece != "" {
				letter := string(move.PromotionPiece[0])
				if move.PromotionPiece == Knight {
					letter = "N"
				}
				notation += "=" + letter
			}
		}
		response.Moves = append(response.Moves, BoardMove{move.FromSquare, move.ToSquare, move.PieceColor, move.PieceType, move.CapturedPieceType, notation, castle, move.PromotionPiece})
		if move.CapturedPieceType != "" {
			key := "white"
			if move.PieceColor == White {
				key = "black"
			}
			response.CapturedPieces[key] = append(response.CapturedPieces[key], move.CapturedPieceType)
		}
	}
	if len(moves) > 0 {
		last := moves[len(moves)-1]
		response.LastMove = &MoveCoordinates{last.FromSquare, last.ToSquare}
	}
	return response
}

func (service *Service) ValidMoves(ctx context.Context, gameID, from int) ([]int, error) {
	game, err := scanGame(service.db.QueryRow(ctx, `SELECT `+gameColumns+` FROM games WHERE id=$1`, gameID))
	if err != nil || game == nil {
		return []int{}, err
	}
	pieces, err := loadPieces(ctx, service.db, gameID)
	if err != nil {
		return nil, err
	}
	moves, err := loadMoves(ctx, service.db, gameID)
	if err != nil {
		return nil, err
	}
	pieceColor := Color("")
	for _, piece := range pieces {
		if piece.Square == from {
			pieceColor = piece.Color
		}
	}
	if pieceColor == "" {
		return []int{}, nil
	}
	var last *MoveRecord
	if len(moves) > 0 {
		last = &moves[len(moves)-1]
	}
	gamePosition, err := positionFor(pieces, pieceColor, last, game.HalfMoveClock)
	if err != nil {
		return []int{}, nil
	}
	result := []int{}
	seen := map[int]bool{}
	for _, move := range gamePosition.ValidMoves() {
		if indexFromAlgebraic(move.S1().String()) == from {
			target := indexFromAlgebraic(move.S2().String())
			if !seen[target] {
				result = append(result, target)
				seen[target] = true
			}
		}
	}
	return result, nil
}

func (service *Service) MakeMove(ctx context.Context, gameID, from, to int, promotion PieceType, opponent string) (map[string]any, error) {
	return service.makeMove(ctx, gameID, from, to, promotion, opponent, false)
}

func (service *Service) makeMove(ctx context.Context, gameID, from, to int, promotion PieceType, opponent string, engine bool) (map[string]any, error) {
	tx, err := service.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	game, err := scanGame(tx.QueryRow(ctx, `SELECT `+gameColumns+` FROM games WHERE id=$1 FOR UPDATE`, gameID))
	if err != nil {
		return nil, err
	}
	if game == nil {
		return nil, errors.New("No game found")
	}
	if game.Status != "Ongoing" {
		return nil, errors.New("Game is not ongoing")
	}
	pieces, err := loadPieces(ctx, tx, gameID)
	if err != nil {
		return nil, err
	}
	moves, err := loadMoves(ctx, tx, gameID)
	if err != nil {
		return nil, err
	}
	var last *MoveRecord
	if len(moves) > 0 {
		last = &moves[len(moves)-1]
	}
	chessGame, err := positionFor(pieces, game.CurrentTurn, last, game.HalfMoveClock)
	if err != nil {
		return nil, errors.New("Invalid move")
	}
	legal := findLegalMove(chessGame, from, to, promotion)
	if legal == nil {
		return nil, errors.New("Invalid move")
	}
	var moving Piece
	found := false
	for _, piece := range pieces {
		if piece.Square == from {
			moving = piece
			found = true
			break
		}
	}
	if !found {
		return nil, errors.New("Piece not found")
	}
	captured := PieceType("")
	captureSquare := to
	if legal.HasTag(libchess.EnPassant) {
		captureSquare = square(row(from), col(to))
	}
	for _, piece := range pieces {
		if piece.Square == captureSquare && piece.Color != moving.Color {
			captured = piece.PieceType
		}
	}
	if captured != "" {
		if _, err := tx.Exec(ctx, `DELETE FROM pieces WHERE game_id=$1 AND square=$2`, gameID, captureSquare); err != nil {
			return nil, err
		}
	}
	isCastle := legal.HasTag(libchess.KingSideCastle) || legal.HasTag(libchess.QueenSideCastle)
	if isCastle {
		rookFrom, rookTo := square(row(from), 0), square(row(from), 3)
		if legal.HasTag(libchess.KingSideCastle) {
			rookFrom, rookTo = square(row(from), 7), square(row(from), 5)
		}
		if _, err := tx.Exec(ctx, `UPDATE pieces SET square=$1,has_moved=true WHERE game_id=$2 AND square=$3`, rookTo, gameID, rookFrom); err != nil {
			return nil, err
		}
	}
	finalType := moving.PieceType
	promoted := PieceType("")
	if legal.Promo() != libchess.NoPieceType {
		finalType = pieceTypeFromChess(legal.Promo())
		promoted = finalType
	}
	if _, err := tx.Exec(ctx, `UPDATE pieces SET square=$1,has_moved=true,piece_type=$2 WHERE id=$3`, to, finalType, moving.ID); err != nil {
		return nil, err
	}
	now := time.Now().UnixMilli()
	if _, err := tx.Exec(ctx, `INSERT INTO moves(game_id,from_square,to_square,piece_type,piece_color,captured_piece_type,promotion_piece,move_number,created_at) VALUES($1,$2,$3,$4,$5,NULLIF($6,''),NULLIF($7,''),$8,$9)`, gameID, from, to, moving.PieceType, moving.Color, captured, promoted, len(moves)+1, now); err != nil {
		return nil, err
	}
	whiteTime, blackTime := game.WhiteTimeRemaining, game.BlackTimeRemaining
	if game.LastMoveTime != nil && game.TimeControl != 0 {
		elapsed := now - *game.LastMoveTime
		if game.CurrentTurn == White {
			whiteTime = max64(0, whiteTime-elapsed) + int64(game.Increment*1000)
		} else {
			blackTime = max64(0, blackTime-elapsed) + int64(game.Increment*1000)
		}
	}
	next := White
	if game.CurrentTurn == White {
		next = Black
	}
	updatedPieces, err := loadPieces(ctx, tx, gameID)
	if err != nil {
		return nil, err
	}
	currentRecord := MoveRecord{FromSquare: from, ToSquare: to, PieceType: moving.PieceType, PieceColor: moving.Color}
	nextGame, err := positionFor(updatedPieces, next, &currentRecord, game.HalfMoveClock)
	if err != nil {
		return nil, err
	}
	status := gameStatus(nextGame)
	halfMove := game.HalfMoveClock + 1
	if moving.PieceType == Pawn || captured != "" {
		halfMove = 0
	}
	if halfMove >= 100 && status == "Ongoing" {
		status = "FiftyMoveRule"
	}
	currentRecord.PromotionPiece = promoted
	if status == "Ongoing" && hasThreefoldRepetition(append(moves, currentRecord)) {
		status = "ThreefoldRepetition"
	}
	check := status == "Ongoing" && isInCheck(updatedPieces, next)
	if _, err := tx.Exec(ctx, `UPDATE games SET current_turn=$1,status=$2,updated_at=$3,last_move_time=$3,white_time_remaining=$4,black_time_remaining=$5,draw_offered_by=NULL,half_move_clock=$6 WHERE id=$7`, next, status, now, whiteTime, blackTime, halfMove, gameID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	result := map[string]any{"success": true, "nextTurn": next, "status": status, "captured": captured != "", "isCheck": check, "isCheckmate": status == "Checkmate", "isCastle": isCastle}
	if promoted != "" {
		result["promotion"] = promoted
	}
	if !engine && game.Mode == "vs_computer" && next == Black && status == "Ongoing" {
		go service.requestEngineMove(gameID, piecesToFEN(updatedPieces, next, &currentRecord, halfMove), opponent)
	}
	return result, nil
}

func (service *Service) requestEngineMove(gameID int, fen, opponent string) {
	if opponent == "" {
		opponent = "minimax"
	}
	body, _ := json.Marshal(map[string]string{"fen": fen, "opponent": opponent})
	response, err := service.httpClient.Post(service.engineURL+"/api/engine-move", "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("engine request for game %d failed: %v", gameID, err)
		return
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		log.Printf("engine request for game %d returned %s", gameID, response.Status)
		return
	}
	var result struct {
		BestMove string `json:"best_move"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		log.Printf("engine response for game %d was invalid: %v", gameID, err)
		return
	}
	if len(result.BestMove) < 4 {
		log.Printf("engine returned no move for game %d", gameID)
		return
	}
	promotion := PieceType("")
	if len(result.BestMove) == 5 {
		promotion = map[byte]PieceType{'q': Queen, 'r': Rook, 'b': Bishop, 'n': Knight}[result.BestMove[4]]
	}
	if _, err := service.makeMove(context.Background(), gameID, indexFromAlgebraic(result.BestMove[:2]), indexFromAlgebraic(result.BestMove[2:4]), promotion, opponent, true); err != nil {
		log.Printf("engine move for game %d could not be applied: %v", gameID, err)
	}
}

func (service *Service) Reset(ctx context.Context, mode string, timeControl, increment int) error {
	_, err := service.createGame(ctx, mode, timeControl, increment, nil, nil)
	return err
}

func (service *Service) QueueStatus(ctx context.Context, playerID string) (map[string]any, error) {
	var timeControl int
	err := service.db.QueryRow(ctx, `SELECT time_control FROM queue WHERE player_id=$1 LIMIT 1`, playerID).Scan(&timeControl)
	if err == nil {
		return map[string]any{"status": "queued", "timeControl": timeControl}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	var gameID int
	err = service.db.QueryRow(ctx, `SELECT id FROM games WHERE status='Ongoing' AND (white_player_id=$1 OR black_player_id=$1) ORDER BY updated_at DESC LIMIT 1`, playerID).Scan(&gameID)
	if err == nil {
		return map[string]any{"status": "matched", "gameId": gameID}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	return map[string]any{"status": "idle"}, nil
}

func (service *Service) JoinQueue(ctx context.Context, playerID string, timeControl, increment int) (map[string]any, error) {
	tx, err := service.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `LOCK TABLE queue IN SHARE ROW EXCLUSIVE MODE`); err != nil {
		return nil, err
	}
	var activeID int
	err = tx.QueryRow(ctx, `SELECT id FROM games WHERE status='Ongoing' AND (white_player_id=$1 OR black_player_id=$1) LIMIT 1`, playerID).Scan(&activeID)
	if err == nil {
		return map[string]any{"status": "matched", "gameId": activeID}, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM queue WHERE player_id=$1`, playerID); err != nil {
		return nil, err
	}
	var queueID int
	var opponent string
	err = tx.QueryRow(ctx, `SELECT id,player_id FROM queue WHERE time_control=$1 AND increment=$2 ORDER BY joined_at LIMIT 1 FOR UPDATE`, timeControl, increment).Scan(&queueID, &opponent)
	if errors.Is(err, pgx.ErrNoRows) {
		_, err = tx.Exec(ctx, `INSERT INTO queue(player_id,time_control,increment,joined_at) VALUES($1,$2,$3,$4)`, playerID, timeControl, increment, time.Now().UnixMilli())
		if err != nil {
			return nil, err
		}
		return map[string]any{"status": "queued"}, tx.Commit(ctx)
	}
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM queue WHERE id=$1`, queueID); err != nil {
		return nil, err
	}
	white, black := playerID, opponent
	if rand.IntN(2) == 0 {
		white, black = opponent, playerID
	}
	startingTime := int64(timeControl * 60000)
	if timeControl == 0 {
		startingTime = 9007199254740991
	}
	now := time.Now().UnixMilli()
	var gameID int
	err = tx.QueryRow(ctx, `INSERT INTO games(current_turn,status,mode,time_control,increment,white_time_remaining,black_time_remaining,white_player_id,black_player_id,half_move_clock,created_at,updated_at) VALUES('White','Ongoing','vs_player',$1,$2,$3,$3,$4,$5,0,$6,$6) RETURNING id`, timeControl, increment, startingTime, white, black, now).Scan(&gameID)
	if err != nil {
		return nil, err
	}
	batch := &pgx.Batch{}
	for _, piece := range initialPieces() {
		batch.Queue(`INSERT INTO pieces(game_id,color,piece_type,square,has_moved) VALUES($1,$2,$3,$4,false)`, gameID, piece.Color, piece.PieceType, piece.Square)
	}
	results := tx.SendBatch(ctx, batch)
	if err := results.Close(); err != nil {
		return nil, err
	}
	return map[string]any{"status": "matched", "gameId": gameID}, tx.Commit(ctx)
}

func (service *Service) Undo(ctx context.Context, gameID int) (map[string]any, error) {
	tx, err := service.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	game, err := scanGame(tx.QueryRow(ctx, `SELECT `+gameColumns+` FROM games WHERE id=$1 FOR UPDATE`, gameID))
	if err != nil {
		return nil, err
	}
	if game == nil {
		return nil, errors.New("No game found")
	}
	moves, err := loadMoves(ctx, tx, gameID)
	if err != nil {
		return nil, err
	}
	if len(moves) == 0 {
		return map[string]any{"success": false, "message": "No moves to undo"}, tx.Commit(ctx)
	}
	last := moves[len(moves)-1]
	if _, err := tx.Exec(ctx, `UPDATE pieces SET square=$1,piece_type=$2,has_moved=false WHERE game_id=$3 AND square=$4`, last.FromSquare, last.PieceType, gameID, last.ToSquare); err != nil {
		return nil, err
	}
	if last.CapturedPieceType != "" {
		capturedColor := White
		if last.PieceColor == White {
			capturedColor = Black
		}
		if _, err := tx.Exec(ctx, `INSERT INTO pieces(game_id,color,piece_type,square,has_moved) VALUES($1,$2,$3,$4,true)`, gameID, capturedColor, last.CapturedPieceType, last.ToSquare); err != nil {
			return nil, err
		}
	}
	if last.PieceType == King && abs(last.FromSquare-last.ToSquare) == 2 {
		rookCol, landed := 0, 3
		if col(last.ToSquare) == 6 {
			rookCol, landed = 7, 5
		}
		_, err = tx.Exec(ctx, `UPDATE pieces SET square=$1,has_moved=false WHERE game_id=$2 AND square=$3 AND piece_type='Rook'`, square(row(last.FromSquare), rookCol), gameID, square(row(last.FromSquare), landed))
		if err != nil {
			return nil, err
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM moves WHERE id=$1`, last.ID); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `UPDATE games SET current_turn=$1,status='Ongoing',updated_at=$2,draw_offered_by=NULL WHERE id=$3`, last.PieceColor, time.Now().UnixMilli(), gameID); err != nil {
		return nil, err
	}
	return map[string]any{"success": true}, tx.Commit(ctx)
}

func (service *Service) Resign(ctx context.Context, gameID int, color Color) (map[string]any, error) {
	game, err := scanGame(service.db.QueryRow(ctx, `SELECT `+gameColumns+` FROM games WHERE id=$1`, gameID))
	if err != nil {
		return nil, err
	}
	if game == nil {
		return nil, errors.New("No game found")
	}
	if game.Status != "Ongoing" {
		return nil, errors.New("Game is not ongoing")
	}
	winner := White
	if color == White {
		winner = Black
	}
	_, err = service.db.Exec(ctx, `UPDATE games SET status='Resignation',updated_at=$1 WHERE id=$2`, time.Now().UnixMilli(), gameID)
	return map[string]any{"success": true, "status": "Resignation", "winner": winner}, err
}
func (service *Service) OfferDraw(ctx context.Context, gameID int, color Color) (map[string]any, error) {
	return service.setDraw(ctx, gameID, &color, "Ongoing", map[string]any{"success": true, "drawOfferedBy": color})
}
func (service *Service) RespondDraw(ctx context.Context, gameID int, accept bool) (map[string]any, error) {
	status := GameStatus("Ongoing")
	if accept {
		status = "Draw"
	}
	return service.setDraw(ctx, gameID, nil, status, map[string]any{"success": true, "status": status})
}
func (service *Service) setDraw(ctx context.Context, gameID int, offer *Color, status GameStatus, result map[string]any) (map[string]any, error) {
	game, err := scanGame(service.db.QueryRow(ctx, `SELECT `+gameColumns+` FROM games WHERE id=$1`, gameID))
	if err != nil {
		return nil, err
	}
	if game == nil {
		return nil, errors.New("No game found")
	}
	if game.Status != "Ongoing" {
		return nil, errors.New("Game is not ongoing")
	}
	_, err = service.db.Exec(ctx, `UPDATE games SET status=$1,draw_offered_by=$2,updated_at=$3 WHERE id=$4`, status, offer, time.Now().UnixMilli(), gameID)
	return result, err
}
func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
