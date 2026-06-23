ALTER TABLE "games" ADD COLUMN "increment" integer NOT NULL DEFAULT 0;
ALTER TABLE "games" ADD COLUMN "draw_offered_by" text;
ALTER TABLE "games" ADD COLUMN "half_move_clock" integer NOT NULL DEFAULT 0;
ALTER TABLE "queue" ADD COLUMN "increment" integer NOT NULL DEFAULT 0;
ALTER TABLE "moves" ADD COLUMN "promotion_piece" text;
