CREATE TABLE "account" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"account_id" varchar(256) NOT NULL,
	"provider_id" varchar(256) NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"expires_at" timestamp,
	"password" text
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;