export type Color = "White" | "Black";

export type PieceType =
  | "Pawn"
  | "Knight"
  | "Bishop"
  | "Rook"
  | "Queen"
  | "King";

export type GameStatus = "Ongoing" | "Checkmate" | "Stalemate" | "Timeout";

export type GameMode = "vs_player" | "vs_computer";

export type QueueStatus = "idle" | "queued" | "matched";

export type UserColor = Color | "Spectator";
