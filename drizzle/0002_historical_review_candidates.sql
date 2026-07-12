ALTER TABLE "analysis_indicators" ADD COLUMN IF NOT EXISTS "jurisdiction_tag" text;--> statement-breakpoint
ALTER TABLE "equipment_rows" ADD COLUMN IF NOT EXISTS "jurisdiction_tag" text;--> statement-breakpoint
ALTER TABLE "historical_result_rows" ADD COLUMN IF NOT EXISTS "jurisdiction_tag" text;--> statement-breakpoint
ALTER TABLE "result_rows" ADD COLUMN IF NOT EXISTS "jurisdiction_tag" text;--> statement-breakpoint
ALTER TABLE "review_rows" ADD COLUMN IF NOT EXISTS "jurisdiction_tag" text;--> statement-breakpoint
ALTER TABLE "review_rows" ADD COLUMN IF NOT EXISTS "dem_candidate" text;--> statement-breakpoint
ALTER TABLE "review_rows" ADD COLUMN IF NOT EXISTS "rep_candidate" text;--> statement-breakpoint
ALTER TABLE "review_rows" ADD COLUMN IF NOT EXISTS "dem_votes" integer;--> statement-breakpoint
ALTER TABLE "review_rows" ADD COLUMN IF NOT EXISTS "rep_votes" integer;--> statement-breakpoint
ALTER TABLE "review_rows" ADD COLUMN IF NOT EXISTS "dem_share" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "review_rows" ADD COLUMN IF NOT EXISTS "rep_share" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "turnout_rows" ADD COLUMN IF NOT EXISTS "jurisdiction_tag" text;