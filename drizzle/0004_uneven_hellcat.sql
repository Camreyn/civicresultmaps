CREATE TYPE "public"."ui_layout_channel" AS ENUM('candidate', 'stable');--> statement-breakpoint
CREATE TYPE "public"."ui_layout_environment" AS ENUM('preview', 'production');--> statement-breakpoint
CREATE TYPE "public"."ui_layout_publication_action" AS ENUM('stage', 'promote', 'rollback');--> statement-breakpoint
CREATE TYPE "public"."ui_layout_publication_status" AS ENUM('requested', 'dispatched', 'publishing', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "ui_layout_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"revision_id" uuid,
	"publication_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ui_layout_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"environment" "ui_layout_environment" NOT NULL,
	"channel" "ui_layout_channel" NOT NULL,
	"action" "ui_layout_publication_action" NOT NULL,
	"status" "ui_layout_publication_status" DEFAULT 'requested' NOT NULL,
	"idempotency_key" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"workflow_run_id" text,
	"edge_digest" text,
	"failure_code" text,
	"failure_message" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ui_layout_publications_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "ui_layout_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_version" integer NOT NULL,
	"registry_version" integer NOT NULL,
	"manifest" jsonb NOT NULL,
	"manifest_digest" text NOT NULL,
	"parent_revision_id" uuid,
	"change_summary" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ui_layout_revisions_schema_version_check" CHECK ("ui_layout_revisions"."schema_version" = 1),
	CONSTRAINT "ui_layout_revisions_registry_version_check" CHECK ("ui_layout_revisions"."registry_version" = 1)
);
--> statement-breakpoint
ALTER TABLE "ui_layout_audit_events" ADD CONSTRAINT "ui_layout_audit_events_revision_id_ui_layout_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."ui_layout_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_layout_audit_events" ADD CONSTRAINT "ui_layout_audit_events_publication_id_ui_layout_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."ui_layout_publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_layout_publications" ADD CONSTRAINT "ui_layout_publications_revision_id_ui_layout_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."ui_layout_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_layout_revisions" ADD CONSTRAINT "ui_layout_revisions_parent_revision_id_ui_layout_revisions_id_fk" FOREIGN KEY ("parent_revision_id") REFERENCES "public"."ui_layout_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ui_layout_audit_events_created_at_idx" ON "ui_layout_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ui_layout_publications_requested_at_idx" ON "ui_layout_publications" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "ui_layout_publications_revision_id_idx" ON "ui_layout_publications" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "ui_layout_revisions_created_at_idx" ON "ui_layout_revisions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ui_layout_revisions_manifest_digest_idx" ON "ui_layout_revisions" USING btree ("manifest_digest");