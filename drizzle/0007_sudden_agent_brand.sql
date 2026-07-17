ALTER TYPE "public"."ui_layout_publication_status" ADD VALUE 'scheduled' BEFORE 'dispatched';--> statement-breakpoint
ALTER TYPE "public"."ui_layout_publication_status" ADD VALUE 'retrying' BEFORE 'published';--> statement-breakpoint
ALTER TYPE "public"."ui_layout_publication_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "ui_layout_draft_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ui_layout_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"base_revision_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "ui_layout_drafts_version_check" CHECK ("ui_layout_drafts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "ui_layout_group_template_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ui_layout_group_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"group" jsonb NOT NULL,
	"is_shared" boolean DEFAULT true NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ui_layout_revisions" DROP CONSTRAINT "ui_layout_revisions_schema_version_check";--> statement-breakpoint
ALTER TABLE "ui_layout_publications" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ui_layout_publications" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ui_layout_publications" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ui_layout_publications" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "ui_layout_publications" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ui_layout_publications" ADD COLUMN "claim_token" text;--> statement-breakpoint
ALTER TABLE "ui_layout_publications" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ui_layout_publications" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ui_layout_publications" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "ui_layout_draft_assets" ADD CONSTRAINT "ui_layout_draft_assets_draft_id_ui_layout_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."ui_layout_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_layout_draft_assets" ADD CONSTRAINT "ui_layout_draft_assets_asset_id_ui_layout_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."ui_layout_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_layout_drafts" ADD CONSTRAINT "ui_layout_drafts_base_revision_id_ui_layout_revisions_id_fk" FOREIGN KEY ("base_revision_id") REFERENCES "public"."ui_layout_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_layout_group_template_assets" ADD CONSTRAINT "ui_layout_group_template_assets_template_id_ui_layout_group_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."ui_layout_group_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_layout_group_template_assets" ADD CONSTRAINT "ui_layout_group_template_assets_asset_id_ui_layout_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."ui_layout_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ui_layout_draft_assets_unique_idx" ON "ui_layout_draft_assets" USING btree ("draft_id","asset_id");--> statement-breakpoint
CREATE INDEX "ui_layout_draft_assets_draft_idx" ON "ui_layout_draft_assets" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "ui_layout_drafts_actor_updated_idx" ON "ui_layout_drafts" USING btree ("actor_id","updated_at");--> statement-breakpoint
CREATE INDEX "ui_layout_drafts_name_idx" ON "ui_layout_drafts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ui_layout_drafts_updated_at_idx" ON "ui_layout_drafts" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ui_layout_group_template_assets_unique_idx" ON "ui_layout_group_template_assets" USING btree ("template_id","asset_id");--> statement-breakpoint
CREATE INDEX "ui_layout_group_template_assets_template_idx" ON "ui_layout_group_template_assets" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "ui_layout_group_templates_created_at_idx" ON "ui_layout_group_templates" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ui_layout_group_templates_name_idx" ON "ui_layout_group_templates" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ui_layout_publications_schedule_idx" ON "ui_layout_publications" USING btree ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "ui_layout_publications" ADD CONSTRAINT "ui_layout_publications_attempts_check" CHECK ("ui_layout_publications"."attempt_count" >= 0);--> statement-breakpoint
ALTER TABLE "ui_layout_publications" ADD CONSTRAINT "ui_layout_publications_max_attempts_check" CHECK ("ui_layout_publications"."max_attempts" between 1 and 10);--> statement-breakpoint
ALTER TABLE "ui_layout_revisions" ADD CONSTRAINT "ui_layout_revisions_schema_version_check" CHECK ("ui_layout_revisions"."schema_version" in (1, 2, 3));