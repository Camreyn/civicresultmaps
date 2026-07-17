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
import type { WorkspaceLayoutManifestAny } from "../lib/workspace-layout-v3";
import { uiLayoutRevisions } from "./schema";

export const uiLayoutAssets = pgTable(
  "ui_layout_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    url: text("url").notNull(),
    pathname: text("pathname").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    alt: text("alt").notNull().default(""),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    createdAtIndex: index("ui_layout_assets_created_at_idx").on(table.createdAt),
    dimensionsCheck: check("ui_layout_assets_dimensions_check", sql`${table.width} > 0 and ${table.height} > 0`),
    pathnameUnique: uniqueIndex("ui_layout_assets_pathname_idx").on(table.pathname),
    sizeCheck: check("ui_layout_assets_size_check", sql`${table.sizeBytes} > 0 and ${table.sizeBytes} <= 5242880`),
    urlUnique: uniqueIndex("ui_layout_assets_url_idx").on(table.url),
  }),
);

export const uiLayoutTemplates = pgTable(
  "ui_layout_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    manifest: jsonb("manifest").$type<WorkspaceLayoutManifestAny>().notNull(),
    isShared: boolean("is_shared").notNull().default(true),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdAtIndex: index("ui_layout_templates_created_at_idx").on(table.createdAt),
    nameIndex: index("ui_layout_templates_name_idx").on(table.name),
  }),
);

export const uiLayoutRevisionAssets = pgTable(
  "ui_layout_revision_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revisionId: uuid("revision_id").notNull().references(() => uiLayoutRevisions.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => uiLayoutAssets.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    revisionAssetUnique: uniqueIndex("ui_layout_revision_assets_unique_idx").on(table.revisionId, table.assetId),
    revisionIndex: index("ui_layout_revision_assets_revision_idx").on(table.revisionId),
  }),
);

export const uiLayoutTemplateAssets = pgTable(
  "ui_layout_template_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").notNull().references(() => uiLayoutTemplates.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => uiLayoutAssets.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    templateAssetUnique: uniqueIndex("ui_layout_template_assets_unique_idx").on(table.templateId, table.assetId),
    templateIndex: index("ui_layout_template_assets_template_idx").on(table.templateId),
  }),
);
