export type Color = "White" | "Black";
export type PieceType =
  | "Pawn"
  | "Knight"
  | "Bishop"
  | "Rook"
  | "Queen"
  | "King";
export type GameStatus = "Ongoing" | "Checkmate" | "Stalemate";

export interface PieceInfo {
  color: Color;
  piece_type: PieceType;
  square: number;
}

export interface BoardResponse {
  pieces: PieceInfo[];
  turn: Color;
  status: GameStatus;
}
