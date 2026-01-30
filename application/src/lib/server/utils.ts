import type { PieceType } from "../../db/schema";

export function typeToPieceType(type: string): PieceType {
  switch (type.toLowerCase()) {
    case "p": return "Pawn";
    case "n": return "Knight";
    case "b": return "Bishop";
    case "r": return "Rook";
    case "q": return "Queen";
    case "k": return "King";
    default: return "Pawn";
  }
}
