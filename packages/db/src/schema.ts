import type { Color, GameStatus, PieceType } from "@chess/types";
import {
	bigint,
	boolean,
	integer,
	pgTable,
	serial,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("user", {
	id: varchar("id", { length: 256 }).primaryKey(),
	name: varchar("name", { length: 256 }).notNull(),
	email: varchar("email", { length: 256 }).notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	password: varchar("password", { length: 1024 }),
	image: varchar("image", { length: 256 }),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
});

export const sessions = pgTable("session", {
	id: varchar("id", { length: 256 }).primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: varchar("token", { length: 256 }).notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: varchar("ip_address", { length: 256 }),
	userAgent: varchar("user_agent", { length: 256 }),
	userId: varchar("user_id", { length: 256 })
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("account", {
	id: varchar("id", { length: 256 }).primaryKey(),
	accountId: varchar("account_id", { length: 256 }).notNull(),
	providerId: varchar("provider_id", { length: 256 }).notNull(),
	userId: varchar("user_id", { length: 256 })
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	expiresAt: timestamp("expires_at"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
});

export const verifications = pgTable("verification", {
	id: varchar("id", { length: 256 }).primaryKey(),
	identifier: varchar("identifier", { length: 256 }).notNull(),
	value: varchar("value", { length: 256 }).notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at"),
	updatedAt: timestamp("updated_at"),
});

export const passwords = pgTable("password", {
	id: serial("id").primaryKey(),
	userId: varchar("user_id", { length: 256 })
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	passwordHash: varchar("password_hash", { length: 256 }).notNull(),
});

export const games = pgTable("games", {
	id: serial("id").primaryKey(),
	currentTurn: text("current_turn").notNull().$type<Color>(),
	status: text("status").notNull().$type<GameStatus>(),
	mode: text("mode").notNull().default("vs_player").$type<"vs_player" | "vs_computer">(),
	timeControl: integer("time_control").notNull().default(10),
	whiteTimeRemaining: integer("white_time_remaining").notNull().default(600000),
	blackTimeRemaining: integer("black_time_remaining").notNull().default(600000),
	lastMoveTime: bigint("last_move_time", { mode: "number" }),
	whitePlayerId: varchar("white_player_id", { length: 256 }),
	blackPlayerId: varchar("black_player_id", { length: 256 }),
	createdAt: bigint("created_at", { mode: "number" }).notNull(),
	updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const queue = pgTable("queue", {
	id: serial("id").primaryKey(),
	playerId: varchar("player_id", { length: 256 }).notNull(),
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
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Password = typeof passwords.$inferSelect;
