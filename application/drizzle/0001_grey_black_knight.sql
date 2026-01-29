ALTER TABLE `games` ADD `mode` text DEFAULT 'vs_player' NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `time_control` integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `white_time_remaining` integer DEFAULT 600000 NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `black_time_remaining` integer DEFAULT 600000 NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `last_move_time` integer;