CREATE TABLE "public_data_revisions" (
	"scope" text PRIMARY KEY DEFAULT 'public' NOT NULL,
	"revision" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text DEFAULT 'migration' NOT NULL,
	CONSTRAINT "public_data_revisions_scope_check" CHECK ("public_data_revisions"."scope" = 'public'),
	CONSTRAINT "public_data_revisions_revision_check" CHECK ("public_data_revisions"."revision" >= 1)
);
--> statement-breakpoint
INSERT INTO "public_data_revisions" ("scope", "revision", "updated_at", "reason")
VALUES ('public', 1, now(), 'migration')
ON CONFLICT ("scope") DO NOTHING;
