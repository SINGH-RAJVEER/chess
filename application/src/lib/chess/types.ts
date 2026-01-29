import type { Color, Piece } from "../../db/schema";

export type ChessBoard = {
  pieces: Piece[];
  turn: Color;
  status: "Ongoing" | "Checkmate" | "Stalemate";
};
