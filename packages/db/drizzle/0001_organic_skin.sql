CREATE TABLE "password" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"password_hash" varchar(256) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" varchar(256) NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" varchar(256),
	"user_agent" varchar(256),
	"user_id" varchar(256) NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"email" varchar(256) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"password" varchar(1024),
	"image" varchar(256),
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"identifier" varchar(256) NOT NULL,
	"value" varchar(256) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "white_player_id" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "black_player_id" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "queue" ALTER COLUMN "player_id" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "password" ADD CONSTRAINT "password_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;