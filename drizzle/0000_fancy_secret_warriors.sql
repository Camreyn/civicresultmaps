CREATE TYPE "public"."import_status" AS ENUM('staged', 'validated', 'promoted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('loaded', 'candidate', 'needs_data', 'superseded', 'documented_exclusion');--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contest_id" uuid NOT NULL,
	"name" text NOT NULL,
	"party" text NOT NULL,
	"ballot_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capability_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_code" text NOT NULL,
	"election_year" integer NOT NULL,
	"certified_results" boolean DEFAULT false NOT NULL,
	"map" boolean DEFAULT false NOT NULL,
	"review_graphs" boolean DEFAULT false NOT NULL,
	"turnout" boolean DEFAULT false NOT NULL,
	"historical_baseline" boolean DEFAULT false NOT NULL,
	"source_planner" boolean DEFAULT true NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"state_code" text NOT NULL,
	"office" text NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "elections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"office" text NOT NULL,
	"election_date" text NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_code" text NOT NULL,
	"election_year" integer NOT NULL,
	"parser" text NOT NULL,
	"source_document_id" uuid,
	"status" "import_status" DEFAULT 'staged' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jurisdictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_code" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"geometry_key" text
);
--> statement-breakpoint
CREATE TABLE "result_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_run_id" uuid,
	"contest_id" uuid NOT NULL,
	"state_code" text NOT NULL,
	"jurisdiction_code" text NOT NULL,
	"jurisdiction_name" text NOT NULL,
	"level" text NOT NULL,
	"candidate_name" text NOT NULL,
	"party" text NOT NULL,
	"votes" integer NOT NULL,
	"source_document_id" uuid
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"state_code" text NOT NULL,
	"election_year" integer NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"source_url" text NOT NULL,
	"authority" text NOT NULL,
	"local_artifact" text,
	"parser" text,
	"timestamp_basis" text NOT NULL,
	"confidence" text NOT NULL,
	"status" "source_status" DEFAULT 'candidate' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "source_documents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"authority" text NOT NULL,
	"county_label" text DEFAULT 'County' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "states_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "turnout_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_run_id" uuid,
	"state_code" text NOT NULL,
	"election_year" integer NOT NULL,
	"jurisdiction_code" text NOT NULL,
	"jurisdiction_name" text NOT NULL,
	"level" text NOT NULL,
	"ballots_cast" integer NOT NULL,
	"registered_voters" integer,
	"turnout_pct" numeric(8, 4),
	"denominator_note" text NOT NULL,
	"warning_required" boolean DEFAULT false NOT NULL,
	"source_document_id" uuid
);
--> statement-breakpoint
CREATE TABLE "validation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_run_id" uuid,
	"state_code" text NOT NULL,
	"election_year" integer NOT NULL,
	"passed" boolean NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_flags" ADD CONSTRAINT "capability_flags_state_code_states_code_fk" FOREIGN KEY ("state_code") REFERENCES "public"."states"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contests" ADD CONSTRAINT "contests_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contests" ADD CONSTRAINT "contests_state_code_states_code_fk" FOREIGN KEY ("state_code") REFERENCES "public"."states"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_state_code_states_code_fk" FOREIGN KEY ("state_code") REFERENCES "public"."states"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurisdictions" ADD CONSTRAINT "jurisdictions_state_code_states_code_fk" FOREIGN KEY ("state_code") REFERENCES "public"."states"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_rows" ADD CONSTRAINT "result_rows_import_run_id_import_runs_id_fk" FOREIGN KEY ("import_run_id") REFERENCES "public"."import_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_rows" ADD CONSTRAINT "result_rows_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_rows" ADD CONSTRAINT "result_rows_state_code_states_code_fk" FOREIGN KEY ("state_code") REFERENCES "public"."states"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_rows" ADD CONSTRAINT "result_rows_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_state_code_states_code_fk" FOREIGN KEY ("state_code") REFERENCES "public"."states"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnout_rows" ADD CONSTRAINT "turnout_rows_import_run_id_import_runs_id_fk" FOREIGN KEY ("import_run_id") REFERENCES "public"."import_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnout_rows" ADD CONSTRAINT "turnout_rows_state_code_states_code_fk" FOREIGN KEY ("state_code") REFERENCES "public"."states"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnout_rows" ADD CONSTRAINT "turnout_rows_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_import_run_id_import_runs_id_fk" FOREIGN KEY ("import_run_id") REFERENCES "public"."import_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_state_code_states_code_fk" FOREIGN KEY ("state_code") REFERENCES "public"."states"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_contest_name_party_idx" ON "candidates" USING btree ("contest_id","name","party");--> statement-breakpoint
CREATE UNIQUE INDEX "capability_flags_state_year_idx" ON "capability_flags" USING btree ("state_code","election_year");--> statement-breakpoint
CREATE UNIQUE INDEX "contests_election_state_office_idx" ON "contests" USING btree ("election_id","state_code","office");--> statement-breakpoint
CREATE UNIQUE INDEX "elections_year_office_idx" ON "elections" USING btree ("year","office");--> statement-breakpoint
CREATE UNIQUE INDEX "jurisdictions_state_code_level_code_idx" ON "jurisdictions" USING btree ("state_code","level","code");--> statement-breakpoint
CREATE UNIQUE INDEX "result_rows_contest_jurisdiction_candidate_idx" ON "result_rows" USING btree ("contest_id","level","jurisdiction_code","candidate_name","party");--> statement-breakpoint
CREATE UNIQUE INDEX "turnout_rows_state_year_level_jurisdiction_idx" ON "turnout_rows" USING btree ("state_code","election_year","level","jurisdiction_code");