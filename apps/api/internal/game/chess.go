package game

import (
	"fmt"
	"strconv"
	"strings"

	libchess "github.com/notnil/chess"
)

func row(square int) int { return square / 8 }
func col(square int) int { return square % 8 }
func square(row, col int) int {
	if row < 0 || row > 7 || col < 0 || col > 7 {
		return -1
	}
	return row*8 + col
}
func algebraic(index int) string {
	return fmt.Sprintf("%c%d", 'a'+col(index), 8-row(index))
}
func indexFromAlgebraic(value string) int {
	if len(value) != 2 {
		return -1
	}
	rank, err := strconv.Atoi(value[1:])
	if err != nil {
		return -1
	}
	return square(8-rank, int(value[0]-'a'))
}

func initialPieces() []Piece {
	game := libchess.NewGame()
	pieces := make([]Piece, 0, 32)
	for sq, piece := range game.Position().Board().SquareMap() {
		pieces = append(pieces, Piece{
			Color: colorFromChess(piece.Color()), PieceType: pieceTypeFromChess(piece.Type()),
			Square: indexFromAlgebraic(sq.String()), HasMoved: false,
		})
	}
	return pieces
}

func positionFor(pieces []Piece, turn Color, lastMove *MoveRecord, halfMove int) (*libchess.Game, error) {
	fen := piecesToFEN(pieces, turn, lastMove, halfMove)
	option, err := libchess.FEN(fen)
	if err != nil {
		return nil, err
	}
	return libchess.NewGame(option), nil
}

func piecesToFEN(pieces []Piece, turn Color, lastMove *MoveRecord, halfMove int) string {
	bySquare := make(map[int]Piece, len(pieces))
	for _, piece := range pieces {
		bySquare[piece.Square] = piece
	}
	var builder strings.Builder
	for r := 0; r < 8; r++ {
		empty := 0
		for c := 0; c < 8; c++ {
			piece, ok := bySquare[square(r, c)]
			if !ok {
				empty++
				continue
			}
			if empty > 0 {
				builder.WriteString(strconv.Itoa(empty))
				empty = 0
			}
			symbol := map[PieceType]byte{Pawn: 'p', Knight: 'n', Bishop: 'b', Rook: 'r', Queen: 'q', King: 'k'}[piece.PieceType]
			if piece.Color == White {
				symbol -= 'a' - 'A'
			}
			builder.WriteByte(symbol)
		}
		if empty > 0 {
			builder.WriteString(strconv.Itoa(empty))
		}
		if r < 7 {
			builder.WriteByte('/')
		}
	}
	active := "w"
	if turn == Black {
		active = "b"
	}
	castling := ""
	for _, candidate := range []struct {
		kingSquare, rookSquare int
		right                  string
		color                  Color
	}{{60, 63, "K", White}, {60, 56, "Q", White}, {4, 7, "k", Black}, {4, 0, "q", Black}} {
		king, kingOK := bySquare[candidate.kingSquare]
		rook, rookOK := bySquare[candidate.rookSquare]
		if kingOK && rookOK && king.Color == candidate.color && king.PieceType == King && !king.HasMoved &&
			rook.Color == candidate.color && rook.PieceType == Rook && !rook.HasMoved {
			castling += candidate.right
		}
	}
	if castling == "" {
		castling = "-"
	}
	enPassant := "-"
	if lastMove != nil && lastMove.PieceType == Pawn && abs(row(lastMove.FromSquare)-row(lastMove.ToSquare)) == 2 {
		enPassant = algebraic(square((row(lastMove.FromSquare)+row(lastMove.ToSquare))/2, col(lastMove.FromSquare)))
	}
	return fmt.Sprintf("%s %s %s %s %d 1", builder.String(), active, castling, enPassant, halfMove)
}

func findLegalMove(game *libchess.Game, from, to int, promotion PieceType) *libchess.Move {
	for _, move := range game.ValidMoves() {
		if indexFromAlgebraic(move.S1().String()) != from || indexFromAlgebraic(move.S2().String()) != to {
			continue
		}
		wanted := chessPieceType(promotion)
		if move.Promo() == libchess.NoPieceType && promotion == "" || move.Promo() == wanted || promotion == "" && move.Promo() == libchess.Queen {
			return move
		}
	}
	return nil
}

func gameStatus(game *libchess.Game) GameStatus {
	switch game.Position().Status() {
	case libchess.Checkmate:
		return "Checkmate"
	case libchess.Stalemate:
		return "Stalemate"
	case libchess.InsufficientMaterial:
		return "InsufficientMaterial"
	default:
		return "Ongoing"
	}
}

func hasThreefoldRepetition(moves []MoveRecord) bool {
	game := libchess.NewGame(libchess.UseNotation(libchess.UCINotation{}))
	for _, move := range moves {
		value := algebraic(move.FromSquare) + algebraic(move.ToSquare)
		if move.PromotionPiece != "" {
			value += map[PieceType]string{Queen: "q", Rook: "r", Bishop: "b", Knight: "n"}[move.PromotionPiece]
		}
		if err := game.MoveStr(value); err != nil {
			return false
		}
	}
	for _, method := range game.EligibleDraws() {
		if method == libchess.ThreefoldRepetition {
			return true
		}
	}
	return false
}

func isInCheck(pieces []Piece, color Color) bool {
	occupied := make(map[int]Piece, len(pieces))
	kingSquare := -1
	for _, piece := range pieces {
		occupied[piece.Square] = piece
		if piece.Color == color && piece.PieceType == King {
			kingSquare = piece.Square
		}
	}
	if kingSquare < 0 {
		return false
	}
	for _, piece := range pieces {
		if piece.Color == color {
			continue
		}
		dr, dc := row(kingSquare)-row(piece.Square), col(kingSquare)-col(piece.Square)
		switch piece.PieceType {
		case Pawn:
			direction := 1
			if piece.Color == White {
				direction = -1
			}
			if dr == direction && abs(dc) == 1 {
				return true
			}
		case Knight:
			if abs(dr)*abs(dc) == 2 {
				return true
			}
		case King:
			if abs(dr) <= 1 && abs(dc) <= 1 {
				return true
			}
		case Bishop:
			if abs(dr) == abs(dc) && pathClear(occupied, piece.Square, kingSquare) {
				return true
			}
		case Rook:
			if (dr == 0 || dc == 0) && pathClear(occupied, piece.Square, kingSquare) {
				return true
			}
		case Queen:
			if (dr == 0 || dc == 0 || abs(dr) == abs(dc)) && pathClear(occupied, piece.Square, kingSquare) {
				return true
			}
		}
	}
	return false
}

func pathClear(occupied map[int]Piece, from, to int) bool {
	dr, dc := sign(row(to)-row(from)), sign(col(to)-col(from))
	for r, c := row(from)+dr, col(from)+dc; r != row(to) || c != col(to); r, c = r+dr, c+dc {
		if _, exists := occupied[square(r, c)]; exists {
			return false
		}
	}
	return true
}

func sign(value int) int {
	if value < 0 {
		return -1
	}
	if value > 0 {
		return 1
	}
	return 0
}

func colorFromChess(color libchess.Color) Color {
	if color == libchess.White {
		return White
	}
	return Black
}
func pieceTypeFromChess(piece libchess.PieceType) PieceType {
	return map[libchess.PieceType]PieceType{libchess.Pawn: Pawn, libchess.Knight: Knight, libchess.Bishop: Bishop, libchess.Rook: Rook, libchess.Queen: Queen, libchess.King: King}[piece]
}
func chessPieceType(piece PieceType) libchess.PieceType {
	return map[PieceType]libchess.PieceType{Pawn: libchess.Pawn, Knight: libchess.Knight, Bishop: libchess.Bishop, Rook: libchess.Rook, Queen: libchess.Queen, King: libchess.King}[piece]
}
func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
