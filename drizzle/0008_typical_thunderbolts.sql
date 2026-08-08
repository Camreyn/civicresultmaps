CREATE TABLE "geography_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"geometry_version_id" uuid NOT NULL,
	"source_feature_id" text NOT NULL,
	"parent_geoid" text,
	"name" text DEFAULT '' NOT NULL,
	"geometry_key" text,
	"is_geographic" boolean DEFAULT true NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geography_features_id_version_unique" UNIQUE("id","geometry_version_id"),
	CONSTRAINT "geography_features_source_feature_id_check" CHECK (length(trim("geography_features"."source_feature_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "geography_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_code" text NOT NULL,
	"election_id" uuid NOT NULL,
	"geography_type" text NOT NULL,
	"boundary_vintage" text NOT NULL,
	"vintage_status" text DEFAULT 'unknown' NOT NULL,
	"valid_from" text,
	"valid_to" text,
	"source_document_id" uuid,
	"source_layer" text,
	"source_crs" text,
	"served_crs" text DEFAULT 'EPSG:4326' NOT NULL,
	"derivation_method" text NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"caveat" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geography_versions_vintage_status_check" CHECK ("geography_versions"."vintage_status" in ('election_date_confirmed', 'current_only', 'unknown')),
	CONSTRAINT "geography_versions_derivation_method_check" CHECK ("geography_versions"."derivation_method" in ('official_export', 'official_service', 'digitized_map', 'official_crosswalk')),
	CONSTRAINT "geography_versions_status_check" CHECK ("geography_versions"."status" in ('candidate', 'blocked', 'reviewed', 'published', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "reporting_unit_geometry_crosswalks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporting_unit_id" uuid NOT NULL,
	"geometry_version_id" uuid NOT NULL,
	"geography_feature_id" uuid,
	"relationship_type" text NOT NULL,
	"match_method" text NOT NULL,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"confidence" text NOT NULL,
	"source_document_id" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"note" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reporting_unit_geometry_crosswalks_unique" UNIQUE NULLS NOT DISTINCT("reporting_unit_id","geometry_version_id","geography_feature_id","relationship_type"),
	CONSTRAINT "reporting_unit_geometry_crosswalks_relationship_type_check" CHECK ("reporting_unit_geometry_crosswalks"."relationship_type" in ('one_to_one', 'one_to_many', 'many_to_one', 'unmatched', 'non_geographic', 'source_alias')),
	CONSTRAINT "reporting_unit_geometry_crosswalks_match_method_check" CHECK ("reporting_unit_geometry_crosswalks"."match_method" in ('exact_official_id', 'official_crosswalk', 'reviewed_name', 'spatial_review', 'digitized')),
	CONSTRAINT "reporting_unit_geometry_crosswalks_review_status_check" CHECK ("reporting_unit_geometry_crosswalks"."review_status" in ('pending', 'reviewed', 'rejected')),
	CONSTRAINT "reporting_unit_geometry_crosswalks_confidence_check" CHECK ("reporting_unit_geometry_crosswalks"."confidence" in ('high', 'medium', 'low')),
	CONSTRAINT "reporting_unit_geometry_crosswalks_feature_relationship_check" CHECK ((
        ("reporting_unit_geometry_crosswalks"."relationship_type" in ('unmatched', 'non_geographic', 'source_alias') and "reporting_unit_geometry_crosswalks"."geography_feature_id" is null)
        or
        ("reporting_unit_geometry_crosswalks"."relationship_type" in ('one_to_one', 'one_to_many', 'many_to_one') and "reporting_unit_geometry_crosswalks"."geography_feature_id" is not null)
      ))
);
--> statement-breakpoint
CREATE TABLE "reporting_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_code" text NOT NULL,
	"election_id" uuid NOT NULL,
	"reporting_grain" text NOT NULL,
	"parent_geoid" text,
	"source_unit_id" text NOT NULL,
	"source_display_name" text NOT NULL,
	"is_geographic" boolean NOT NULL,
	"source_document_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reporting_units_state_election_grain_parent_source_unique" UNIQUE NULLS NOT DISTINCT("state_code","election_id","reporting_grain","parent_geoid","source_unit_id"),
	CONSTRAINT "reporting_units_source_unit_id_check" CHECK (length(trim("reporting_units"."source_unit_id")) > 0)
);
--> statement-breakpoint
ALTER TABLE "result_rows" ADD COLUMN "reporting_unit_id" uuid;--> statement-breakpoint
ALTER TABLE "review_rows" ADD COLUMN "reporting_unit_id" uuid;--> statement-breakpoint
ALTER TABLE "turnout_rows" ADD COLUMN "reporting_unit_id" uuid;--> statement-breakpoint
ALTER TABLE "geography_features" ADD CONSTRAINT "geography_features_geometry_version_id_geography_versions_id_fk" FOREIGN KEY ("geometry_version_id") REFERENCES "public"."geography_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geography_versions" ADD CONSTRAINT "geography_versions_state_code_states_code_fk" FOREIGN KEY ("state_code") REFERENCES "public"."states"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geography_versions" ADD CONSTRAINT "geography_versions_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geography_versions" ADD CONSTRAINT "geography_versions_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_unit_geometry_crosswalks" ADD CONSTRAINT "reporting_unit_geometry_crosswalks_reporting_unit_id_reporting_units_id_fk" FOREIGN KEY ("reporting_unit_id") REFERENCES "public"."reporting_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_unit_geometry_crosswalks" ADD CONSTRAINT "reporting_unit_geometry_crosswalks_geometry_version_id_geography_versions_id_fk" FOREIGN KEY ("geometry_version_id") REFERENCES "public"."geography_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_unit_geometry_crosswalks" ADD CONSTRAINT "reporting_unit_geometry_crosswalks_feature_version_geography_features_fk" FOREIGN KEY ("geography_feature_id","geometry_version_id") REFERENCES "public"."geography_features"("id","geometry_version_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_unit_geometry_crosswalks" ADD CONSTRAINT "reporting_unit_geometry_crosswalks_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_units" ADD CONSTRAINT "reporting_units_state_code_states_code_fk" FOREIGN KEY ("state_code") REFERENCES "public"."states"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_units" ADD CONSTRAINT "reporting_units_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_units" ADD CONSTRAINT "reporting_units_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "geography_features_version_source_feature_idx" ON "geography_features" USING btree ("geometry_version_id","source_feature_id");--> statement-breakpoint
CREATE INDEX "geography_features_version_parent_idx" ON "geography_features" USING btree ("geometry_version_id","parent_geoid");--> statement-breakpoint
CREATE UNIQUE INDEX "geography_versions_state_election_type_vintage_idx" ON "geography_versions" USING btree ("state_code","election_id","geography_type","boundary_vintage");--> statement-breakpoint
CREATE INDEX "geography_versions_election_id_idx" ON "geography_versions" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "geography_versions_status_idx" ON "geography_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reporting_unit_geometry_crosswalks_version_status_idx" ON "reporting_unit_geometry_crosswalks" USING btree ("geometry_version_id","review_status");--> statement-breakpoint
CREATE INDEX "reporting_unit_geometry_crosswalks_reporting_unit_idx" ON "reporting_unit_geometry_crosswalks" USING btree ("reporting_unit_id");--> statement-breakpoint
CREATE INDEX "reporting_units_election_id_idx" ON "reporting_units" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "reporting_units_state_parent_idx" ON "reporting_units" USING btree ("state_code","parent_geoid");--> statement-breakpoint
ALTER TABLE "result_rows" ADD CONSTRAINT "result_rows_reporting_unit_id_reporting_units_id_fk" FOREIGN KEY ("reporting_unit_id") REFERENCES "public"."reporting_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rows" ADD CONSTRAINT "review_rows_reporting_unit_id_reporting_units_id_fk" FOREIGN KEY ("reporting_unit_id") REFERENCES "public"."reporting_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnout_rows" ADD CONSTRAINT "turnout_rows_reporting_unit_id_reporting_units_id_fk" FOREIGN KEY ("reporting_unit_id") REFERENCES "public"."reporting_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "result_rows_reporting_unit_id_idx" ON "result_rows" USING btree ("reporting_unit_id");--> statement-breakpoint
CREATE INDEX "review_rows_reporting_unit_id_idx" ON "review_rows" USING btree ("reporting_unit_id");--> statement-breakpoint
CREATE INDEX "turnout_rows_reporting_unit_id_idx" ON "turnout_rows" USING btree ("reporting_unit_id");