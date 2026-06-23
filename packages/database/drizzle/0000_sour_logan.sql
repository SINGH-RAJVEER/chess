CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"current_turn" text NOT NULL,
	"status" text NOT NULL,
	"mode" text DEFAULT 'vs_player' NOT NULL,
	"time_control" integer DEFAULT 10 NOT NULL,
	"white_time_remaining" integer DEFAULT 600000 NOT NULL,
	"black_time_remaining" integer DEFAULT 600000 NOT NULL,
	"last_move_time" bigint,
	"white_player_id" text,
	"black_player_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moves" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"from_square" integer NOT NULL,
	"to_square" integer NOT NULL,
	"piece_type" text NOT NULL,
	"piece_color" text NOT NULL,
	"captured_piece_type" text,
	"move_number" integer NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pieces" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"color" text NOT NULL,
	"piece_type" text NOT NULL,
	"square" integer NOT NULL,
	"has_moved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"time_control" integer NOT NULL,
	"joined_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moves" ADD CONSTRAINT "moves_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;
