import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export type Color = "White" | "Black";
export type PieceType = "Pawn" | "Knight" | "Bishop" | "Rook" | "Queen" | "King";
export type GameStatus = "Ongoing" | "Checkmate" | "Stalemate";

export const games = sqliteTable("games", {
  id: integer("id").primaryKey(),
  currentTurn: text("current_turn").notNull().$type<Color>(),
  status: text("status").notNull().$type<GameStatus>(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const pieces = sqliteTable("pieces", {
  id: integer("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => games.id),
  color: text("color").notNull().$type<Color>(),
  pieceType: text("piece_type").notNull().$type<PieceType>(),
  square: integer("square").notNull(),
  hasMoved: integer("has_moved", { mode: "boolean" }).default(false).notNull(),
});

export const moves = sqliteTable("moves", {
  id: integer("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => games.id),
  fromSquare: integer("from_square").notNull(),
  toSquare: integer("to_square").notNull(),
  pieceType: text("piece_type").notNull().$type<PieceType>(),
  pieceColor: text("piece_color").notNull().$type<Color>(),
  capturedPieceType: text("captured_piece_type").$type<PieceType>(),
  moveNumber: integer("move_number").notNull(),
  createdAt: integer("created_at").notNull(),
});

export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type Piece = typeof pieces.$inferSelect;
export type NewPiece = typeof pieces.$inferInsert;
export type Move = typeof moves.$inferSelect;
export type NewMove = typeof moves.$inferInsert;