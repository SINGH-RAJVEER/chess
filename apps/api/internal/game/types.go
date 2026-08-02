package game

type Color string
type PieceType string
type GameStatus string

const (
	White Color = "White"
	Black Color = "Black"

	Pawn   PieceType = "Pawn"
	Knight PieceType = "Knight"
	Bishop PieceType = "Bishop"
	Rook   PieceType = "Rook"
	Queen  PieceType = "Queen"
	King   PieceType = "King"
)

type Game struct {
	ID, TimeControl, Increment, HalfMoveClock int
	CurrentTurn                               Color
	Status                                    GameStatus
	Mode                                      string
	WhiteTimeRemaining, BlackTimeRemaining    int64
	LastMoveTime                              *int64
	WhitePlayerID, BlackPlayerID              *string
	DrawOfferedBy                             *Color
	CreatedAt, UpdatedAt                      int64
}

type Piece struct {
	ID, GameID, Square int
	Color              Color
	PieceType          PieceType
	HasMoved           bool
}

type MoveRecord struct {
	ID, GameID, FromSquare, ToSquare, MoveNumber int
	PieceType, CapturedPieceType, PromotionPiece PieceType
	PieceColor                                   Color
	CreatedAt                                    int64
}

type BoardPiece struct {
	Color     Color     `json:"color"`
	PieceType PieceType `json:"piece_type"`
	Square    int       `json:"square"`
}

type BoardMove struct {
	From      int       `json:"from"`
	To        int       `json:"to"`
	Color     Color     `json:"color"`
	PieceType PieceType `json:"pieceType"`
	Captured  PieceType `json:"captured,omitempty"`
	Notation  string    `json:"notation"`
	IsCastle  bool      `json:"isCastle"`
	Promotion PieceType `json:"promotion,omitempty"`
}

type BoardResponse struct {
	ID                 int                    `json:"id"`
	Pieces             []BoardPiece           `json:"pieces"`
	CapturedPieces     map[string][]PieceType `json:"capturedPieces"`
	Moves              []BoardMove            `json:"moves"`
	Turn               Color                  `json:"turn"`
	Status             GameStatus             `json:"status"`
	Mode               string                 `json:"mode"`
	TimeControl        int                    `json:"timeControl"`
	Increment          int                    `json:"increment"`
	WhiteTimeRemaining int64                  `json:"whiteTimeRemaining"`
	BlackTimeRemaining int64                  `json:"blackTimeRemaining"`
	LastMoveTime       *int64                 `json:"lastMoveTime"`
	LastMove           *MoveCoordinates       `json:"lastMove"`
	ServerTime         int64                  `json:"serverTime"`
	UserColor          string                 `json:"userColor"`
	IsCheck            bool                   `json:"isCheck"`
	DrawOfferedBy      *Color                 `json:"drawOfferedBy"`
	MoveCount          int                    `json:"moveCount"`
	HalfMoveClock      int                    `json:"halfMoveClock"`
}

type MoveCoordinates struct {
	From int `json:"from"`
	To   int `json:"to"`
}
