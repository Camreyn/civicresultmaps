import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  WorkspaceLayoutGroupV3,
  WorkspaceLayoutManifestV3,
} from "../lib/workspace-layout-v3";
import { uiLayoutRevisions } from "./schema";
import { uiLayoutAssets } from "./ui-layout-v3-schema";

export const uiLayoutDrafts = pgTable(
  "ui_layout_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    manifest: jsonb("manifest").$type<WorkspaceLayoutManifestV3>().notNull(),
    baseRevisionId: uuid("base_revision_id").references(() => uiLayoutRevisions.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    actorUpdatedIndex: index("ui_layout_drafts_actor_updated_idx").on(table.actorId, table.updatedAt),
    nameIndex: index("ui_layout_drafts_name_idx").on(table.name),
    updatedAtIndex: index("ui_layout_drafts_updated_at_idx").on(table.updatedAt),
    versionCheck: check("ui_layout_drafts_version_check", sql`${table.version} > 0`),
  }),
);

export const uiLayoutGroupTemplates = pgTable(
  "ui_layout_group_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    group: jsonb("group").$type<WorkspaceLayoutGroupV3>().notNull(),
    isShared: boolean("is_shared").notNull().default(true),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdAtIndex: index("ui_layout_group_templates_created_at_idx").on(table.createdAt),
    nameIndex: index("ui_layout_group_templates_name_idx").on(table.name),
  }),
);

export const uiLayoutDraftAssets = pgTable(
  "ui_layout_draft_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id").notNull().references(() => uiLayoutDrafts.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => uiLayoutAssets.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    draftAssetUnique: uniqueIndex("ui_layout_draft_assets_unique_idx").on(table.draftId, table.assetId),
    draftIndex: index("ui_layout_draft_assets_draft_idx").on(table.draftId),
  }),
);

export const uiLayoutGroupTemplateAssets = pgTable(
  "ui_layout_group_template_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").notNull().references(() => uiLayoutGroupTemplates.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => uiLayoutAssets.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    templateAssetUnique: uniqueIndex("ui_layout_group_template_assets_unique_idx").on(table.templateId, table.assetId),
    templateIndex: index("ui_layout_group_template_assets_template_idx").on(table.templateId),
  }),
);
