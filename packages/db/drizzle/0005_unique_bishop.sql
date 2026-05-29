ALTER TABLE "games" ALTER COLUMN "white_time_remaining" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "white_time_remaining" SET DEFAULT 600000;--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "black_time_remaining" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "black_time_remaining" SET DEFAULT 600000;