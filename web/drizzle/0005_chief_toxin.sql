CREATE TYPE "public"."email_token_purpose" AS ENUM('password_reset', 'email_verification');--> statement-breakpoint
CREATE TABLE "email_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"purpose" "email_token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX "email_tokens_email_idx" ON "email_tokens" USING btree ("email","purpose");