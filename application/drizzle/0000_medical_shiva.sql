CREATE TABLE `games` (
	`id` integer PRIMARY KEY NOT NULL,
	`current_turn` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `moves` (
	`id` integer PRIMARY KEY NOT NULL,
	`game_id` integer NOT NULL,
	`from_square` integer NOT NULL,
	`to_square` integer NOT NULL,
	`piece_type` text NOT NULL,
	`piece_color` text NOT NULL,
	`captured_piece_type` text,
	`move_number` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pieces` (
	`id` integer PRIMARY KEY NOT NULL,
	`game_id` integer NOT NULL,
	`color` text NOT NULL,
	`piece_type` text NOT NULL,
	`square` integer NOT NULL,
	`has_moved` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
