CREATE TABLE "connection_workspaces" (
  "id" text PRIMARY KEY, "version" integer NOT NULL, "document" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "connection_workspace_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "version" integer NOT NULL,
  "document" jsonb NOT NULL, "digest" text NOT NULL, "actor_id" text NOT NULL,
  "actor_email" text NOT NULL, "note" text NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "connection_workspace_revisions_version_unique" UNIQUE ("version")
);
--> statement-breakpoint
CREATE TABLE "connection_releases" (
  "id" text PRIMARY KEY, "document" jsonb NOT NULL, "digest" text NOT NULL,
  "workspace_version" integer NOT NULL, "actor_id" text NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "connection_publication" (
  "id" text PRIMARY KEY, "release_id" text CONSTRAINT "connection_publication_release_id_connection_releases_id_fk" REFERENCES "connection_releases"("id")
);
--> statement-breakpoint
ALTER TABLE "result_rows" ADD COLUMN "source_locator" jsonb;
