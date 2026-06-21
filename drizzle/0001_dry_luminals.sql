CREATE TABLE "equipment_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_run_id" uuid,
	"state_code" text NOT NULL,
	"election_year" integer NOT NULL,
	"jurisdiction_code" text NOT NULL,
	"jurisdiction_name" text NOT NULL,
	"level" text DEFAULT 'county' NOT NULL,
	"vendor" text DEFAULT '' NOT NULL,
	"system_name" text DEFAULT '' NOT NULL,
	"equipment_type" text DEFAULT '' NOT NULL,
	"usage" text DEFAULT 'context' NOT NULL,
	"paper_record" text DEFAULT 'not_recorded' NOT NULL,
	"standard_system" text DEFAULT '' NOT NULL,
	"accessible_system" text DEFAULT '' NOT NULL,
	"absentee_system" text DEFAULT '' NOT NULL,
	"poll_book_system" text DEFAULT '' NOT NULL,
	"tabulation" text DEFAULT '' NOT NULL,
	"registered_voters" integer,
	"precincts" integer,
	"polling_places" integer,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_document_id" uuid
);
--> statement-breakpoint
ALTER TABLE "equipment_rows" ADD CONSTRAINT "equipment_rows_import_run_id_import_runs_id_fk" FOREIGN KEY ("import_run_id") REFERENCES "public"."import_runs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "equipment_rows" ADD CONSTRAINT "equipment_rows_state_code_states_code_fk" FOREIGN KEY ("state_code") REFERENCES "public"."states"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "equipment_rows" ADD CONSTRAINT "equipment_rows_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_rows_state_year_jurisdiction_usage_idx" ON "equipment_rows" USING btree ("state_code","election_year","level","jurisdiction_code","usage");
