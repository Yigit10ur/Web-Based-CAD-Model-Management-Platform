ALTER TYPE "public"."conversion_status" ADD VALUE 'awaiting_translation' BEFORE 'queued';--> statement-breakpoint
ALTER TYPE "public"."conversion_status" ADD VALUE 'translating' BEFORE 'queued';--> statement-breakpoint
ALTER TABLE "model_versions" ADD COLUMN "translated_key" text;