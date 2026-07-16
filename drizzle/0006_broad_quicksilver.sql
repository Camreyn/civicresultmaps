CREATE TABLE "ui_layout_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ui_layout_assets_dimensions_check" CHECK ("ui_layout_assets"."width" > 0 and "ui_layout_assets"."height" > 0),
	CONSTRAINT "ui_layout_assets_size_check" CHECK ("ui_layout_assets"."size_bytes" > 0 and "ui_layout_assets"."size_bytes" <= 5242880)
);
--> statement-breakpoint
CREATE TABLE "ui_layout_revision_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ui_layout_template_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ui_layout_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"manifest" jsonb NOT NULL,
	"is_shared" boolean DEFAULT true NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ui_layout_revisions" DROP CONSTRAINT "ui_layout_revisions_schema_version_check";--> statement-breakpoint
ALTER TABLE "ui_layout_revisions" DROP CONSTRAINT "ui_layout_revisions_registry_version_check";--> statement-breakpoint
ALTER TABLE "ui_layout_revision_assets" ADD CONSTRAINT "ui_layout_revision_assets_revision_id_ui_layout_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."ui_layout_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_layout_revision_assets" ADD CONSTRAINT "ui_layout_revision_assets_asset_id_ui_layout_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."ui_layout_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_layout_template_assets" ADD CONSTRAINT "ui_layout_template_assets_template_id_ui_layout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."ui_layout_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_layout_template_assets" ADD CONSTRAINT "ui_layout_template_assets_asset_id_ui_layout_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."ui_layout_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ui_layout_assets_created_at_idx" ON "ui_layout_assets" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ui_layout_assets_pathname_idx" ON "ui_layout_assets" USING btree ("pathname");--> statement-breakpoint
CREATE UNIQUE INDEX "ui_layout_assets_url_idx" ON "ui_layout_assets" USING btree ("url");--> statement-breakpoint
CREATE UNIQUE INDEX "ui_layout_revision_assets_unique_idx" ON "ui_layout_revision_assets" USING btree ("revision_id","asset_id");--> statement-breakpoint
CREATE INDEX "ui_layout_revision_assets_revision_idx" ON "ui_layout_revision_assets" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ui_layout_template_assets_unique_idx" ON "ui_layout_template_assets" USING btree ("template_id","asset_id");--> statement-breakpoint
CREATE INDEX "ui_layout_template_assets_template_idx" ON "ui_layout_template_assets" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "ui_layout_templates_created_at_idx" ON "ui_layout_templates" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ui_layout_templates_name_idx" ON "ui_layout_templates" USING btree ("name");--> statement-breakpoint
ALTER TABLE "ui_layout_revisions" ADD CONSTRAINT "ui_layout_revisions_schema_version_check" CHECK ("ui_layout_revisions"."schema_version" in (1, 2));--> statement-breakpoint
ALTER TABLE "ui_layout_revisions" ADD CONSTRAINT "ui_layout_revisions_registry_version_check" CHECK ("ui_layout_revisions"."registry_version" in (1, 2));