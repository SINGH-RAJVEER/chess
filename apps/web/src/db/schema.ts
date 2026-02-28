import {
	bigint,
	boolean,
	integer,
	pgTable,
	serial,
	text,
} from "drizzle-orm/pg-core";

export type Color = "White" | "Black";
export type PieceType =
	| "Pawn"
	| "Knight"
	| "Bishop"
	| "Rook"
	| "Queen"
	| "King";
export type GameStatus = "Ongoing" | "Checkmate" | "Stalemate" | "Timeout";

export const games = pgTable("games", {
	id: serial("id").primaryKey(),
	currentTurn: text("current_turn").notNull().$type<Color>(),
	status: text("status").notNull().$type<GameStatus>(),
	mode: text("mode")
		.notNull()
		.default("vs_player")
		.$type<"vs_player" | "vs_computer">(),
	timeControl: integer("time_control").notNull().default(10), // in minutes
	whiteTimeRemaining: integer("white_time_remaining").notNull().default(600000), // ms (10 mins)
	blackTimeRemaining: integer("black_time_remaining").notNull().default(600000), // ms
	lastMoveTime: bigint("last_move_time", { mode: "number" }), // timestamp
	whitePlayerId: text("white_player_id"),
	blackPlayerId: text("black_player_id"),
	createdAt: bigint("created_at", { mode: "number" }).notNull(),
	updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const queue = pgTable("queue", {
	id: serial("id").primaryKey(),
	playerId: text("player_id").notNull(),
	timeControl: integer("time_control").notNull(),
	joinedAt: bigint("joined_at", { mode: "number" }).notNull(),
});

export const pieces = pgTable("pieces", {
	id: serial("id").primaryKey(),
	gameId: integer("game_id")
		.notNull()
		.references(() => games.id),
	color: text("color").notNull().$type<Color>(),
	pieceType: text("piece_type").notNull().$type<PieceType>(),
	square: integer("square").notNull(),
	hasMoved: boolean("has_moved").default(false).notNull(),
});

export const moves = pgTable("moves", {
	id: serial("id").primaryKey(),
	gameId: integer("game_id")
		.notNull()
		.references(() => games.id),
	fromSquare: integer("from_square").notNull(),
	toSquare: integer("to_square").notNull(),
	pieceType: text("piece_type").notNull().$type<PieceType>(),
	pieceColor: text("piece_color").notNull().$type<Color>(),
	capturedPieceType: text("captured_piece_type").$type<PieceType>(),
	moveNumber: integer("move_number").notNull(),
	createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type Piece = typeof pieces.$inferSelect;
export type NewPiece = typeof pieces.$inferInsert;
export type Move = typeof moves.$inferSelect;
export type NewMove = typeof moves.$inferInsert;
