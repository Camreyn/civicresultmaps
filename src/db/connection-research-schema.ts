import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ResearchDocument, PublicResearchDocument } from "../lib/connection-research";

export const connectionWorkspaces = pgTable("connection_workspaces", {
  id: text("id").primaryKey(), version: integer("version").notNull(), document: jsonb("document").$type<ResearchDocument>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const connectionWorkspaceRevisions = pgTable("connection_workspace_revisions", {
  id: uuid("id").primaryKey().defaultRandom(), version: integer("version").notNull().unique(),
  document: jsonb("document").$type<ResearchDocument>().notNull(), digest: text("digest").notNull(),
  actorId: text("actor_id").notNull(), actorEmail: text("actor_email").notNull(), note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const connectionReleases = pgTable("connection_releases", {
  id: text("id").primaryKey(), document: jsonb("document").$type<PublicResearchDocument>().notNull(), digest: text("digest").notNull(),
  workspaceVersion: integer("workspace_version").notNull(), actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const connectionPublication = pgTable("connection_publication", {
  id: text("id").primaryKey(), releaseId: text("release_id").references(() => connectionReleases.id),
});
