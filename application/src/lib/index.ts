export {
  getBoard,
  getMoves,
  makeMove,
  undoMove,
  resetGame,
  type BoardResponse,
} from "./game-api";

export type Color = "White" | "Black";
export type PieceType = "Pawn" | "Knight" | "Bishop" | "Rook" | "Queen" | "King";
export type GameStatus = "Ongoing" | "Checkmate" | "Stalemate";
