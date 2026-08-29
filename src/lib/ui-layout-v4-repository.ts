import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "../db";
import {
  uiLayoutDraftAssets,
  uiLayoutDrafts,
  uiLayoutGroupTemplateAssets,
  uiLayoutGroupTemplates,
} from "../db/ui-layout-v4-schema";
import {
  cloneWorkspaceLayoutGroupV3,
  cloneWorkspaceLayoutManifestV3,
  embeddedWorkspaceLayoutManifestV3,
  flattenWorkspaceNodesV3,
  isWorkspaceGroupCustomOnlyV3,
  toWorkspaceLayoutManifestV3,
  validateWorkspaceLayoutManifestV3,
  type WorkspaceLayoutGroupV3,
  type WorkspaceLayoutManifestV3,
} from "./workspace-layout-v3";
import type { LayoutActor } from "./ui-layout-repository";

const MAX_DRAFT_BYTES = 1_500_000;

export class LayoutDraftConflictError extends Error {
  current: typeof uiLayoutDrafts.$inferSelect | null;

  constructor(current: typeof uiLayoutDrafts.$inferSelect | null) {
    super("This draft was changed in another session. Review the server copy before overwriting it.");
    this.name = "LayoutDraftConflictError";
    this.current = current;
  }
}

export function isLayoutDraftDatabaseConfigured() {
  return hasDatabase();
}

export async function listLayoutDrafts(limit = 40) {
  if (!hasDatabase()) return [];
  const drafts = await getDb()
    .select()
    .from(uiLayoutDrafts)
    .where(isNull(uiLayoutDrafts.archivedAt))
    .orderBy(desc(uiLayoutDrafts.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return drafts.map(normalizeStoredDraft);
}

export async function getLayoutDraft(draftId: string) {
  if (!hasDatabase()) return null;
  const [draft] = await getDb()
    .select()
    .from(uiLayoutDrafts)
    .where(eq(uiLayoutDrafts.id, draftId))
    .limit(1);
  return draft ? normalizeStoredDraft(draft) : null;
}

export async function createLayoutDraft(input: {
  actor: LayoutActor;
  baseRevisionId: string | null;
  manifest: WorkspaceLayoutManifestV3;
  name: string;
}) {
  const manifest = validateDraftPayload(input.manifest);
  const name = normalizeDraftName(input.name);
  const id = randomUUID();
  const [draft] = await getDb().insert(uiLayoutDrafts).values({
    actorEmail: input.actor.email,
    actorId: input.actor.id,
    baseRevisionId: input.baseRevisionId,
    id,
    manifest,
    name,
  }).returning();
  if (!draft) throw new Error("The draft was created but could not be reloaded.");
  await syncDraftAssets(draft.id, manifest);
  return draft;
}

export async function saveLayoutDraft(input: {
  actor: LayoutActor;
  draftId: string;
  expectedVersion: number;
  manifest: WorkspaceLayoutManifestV3;
  name?: string;
}) {
  const manifest = validateDraftPayload(input.manifest);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new Error("Draft version is invalid.");
  }
  const values = {
    actorEmail: input.actor.email,
    actorId: input.actor.id,
    manifest,
    name: input.name === undefined ? undefined : normalizeDraftName(input.name),
    updatedAt: new Date(),
    version: sql`${uiLayoutDrafts.version} + 1`,
  };
  const [updated] = await getDb()
    .update(uiLayoutDrafts)
    .set(values)
    .where(and(
      eq(uiLayoutDrafts.id, input.draftId),
      eq(uiLayoutDrafts.version, input.expectedVersion),
      isNull(uiLayoutDrafts.archivedAt),
    ))
    .returning();
  if (!updated) throw new LayoutDraftConflictError(await getLayoutDraft(input.draftId));
  await syncDraftAssets(updated.id, manifest);
  return updated;
}

export async function archiveLayoutDraft(draftId: string, actor: LayoutActor) {
  const [draft] = await getDb()
    .update(uiLayoutDrafts)
    .set({
      actorEmail: actor.email,
      actorId: actor.id,
      archivedAt: new Date(),
      updatedAt: new Date(),
      version: sql`${uiLayoutDrafts.version} + 1`,
    })
    .where(and(eq(uiLayoutDrafts.id, draftId), isNull(uiLayoutDrafts.archivedAt)))
    .returning();
  return draft ?? null;
}

export async function listLayoutGroupTemplates(limit = 40) {
  if (!hasDatabase()) return [];
  return getDb()
    .select()
    .from(uiLayoutGroupTemplates)
    .orderBy(desc(uiLayoutGroupTemplates.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function createLayoutGroupTemplate(input: {
  actor: LayoutActor;
  description: string;
  group: WorkspaceLayoutGroupV3;
  name: string;
}) {
  const group = validateGroupTemplate(input.group);
  const name = normalizeTemplateName(input.name);
  const id = randomUUID();
  const assetIds = collectGroupAssetIds(group);
  await getDb().batch([
    getDb().insert(uiLayoutGroupTemplates).values({
      actorEmail: input.actor.email,
      actorId: input.actor.id,
      description: input.description.trim().slice(0, 240),
      group,
      id,
      name,
    }),
    ...assetIds.map((assetId) => getDb().insert(uiLayoutGroupTemplateAssets).values({
      assetId,
      id: randomUUID(),
      templateId: id,
    })),
  ]);
  const [template] = await getDb().select().from(uiLayoutGroupTemplates)
    .where(eq(uiLayoutGroupTemplates.id, id)).limit(1);
  if (!template) throw new Error("The group template was created but could not be reloaded.");
  return template;
}

export async function deleteLayoutGroupTemplate(templateId: string) {
  const [template] = await getDb().delete(uiLayoutGroupTemplates)
    .where(eq(uiLayoutGroupTemplates.id, templateId)).returning();
  return template ?? null;
}

export function collectGroupAssetIds(group: WorkspaceLayoutGroupV3) {
  return [...new Set(group.rows.flatMap((row) => row.columns).flatMap((column) => column.items)
    .flatMap((node) => node.kind === "custom" && node.asset?.assetId ? [node.asset.assetId] : []))];
}

async function syncDraftAssets(draftId: string, manifest: WorkspaceLayoutManifestV3) {
  const assetIds = [...new Set(manifest.tabs.flatMap(flattenWorkspaceNodesV3)
    .flatMap((node) => node.kind === "custom" && node.asset?.assetId ? [node.asset.assetId] : []))];
  const db = getDb();
  await db.delete(uiLayoutDraftAssets).where(eq(uiLayoutDraftAssets.draftId, draftId));
  if (!assetIds.length) return;
  await db.insert(uiLayoutDraftAssets).values(assetIds.map((assetId) => ({
    assetId,
    draftId,
    id: randomUUID(),
  }))).onConflictDoNothing();
}

function validateDraftPayload(manifest: WorkspaceLayoutManifestV3) {
  const normalized = toWorkspaceLayoutManifestV3(manifest);
  const serialized = JSON.stringify(normalized);
  if (new TextEncoder().encode(serialized).byteLength > MAX_DRAFT_BYTES) {
    throw new Error("Draft manifest is too large.");
  }
  const validation = validateWorkspaceLayoutManifestV3(normalized);
  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }
  return validation.value;
}

function normalizeStoredDraft(draft: typeof uiLayoutDrafts.$inferSelect) {
  return {
    ...draft,
    manifest: toWorkspaceLayoutManifestV3(draft.manifest),
  };
}

function validateGroupTemplate(group: WorkspaceLayoutGroupV3) {
  if (!group || !Array.isArray(group.rows) || !group.rows.length) throw new Error("Group templates require at least one row.");
  const serialized = JSON.stringify(group);
  if (new TextEncoder().encode(serialized).byteLength > 500_000) throw new Error("Group template is too large.");

  const candidate = cloneWorkspaceLayoutManifestV3(embeddedWorkspaceLayoutManifestV3);
  const target = candidate.tabs.reduce((smallest, tab) =>
    tab.groups.length < smallest.groups.length ? tab : smallest,
  );
  target.groups.push(structuredClone(group));
  const validation = validateWorkspaceLayoutManifestV3(candidate);
  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }
  const validatedTab = validation.value.tabs.find((tab) => tab.id === target.id);
  const validatedGroup = validatedTab?.groups.at(-1);
  if (!validatedGroup) throw new Error("Group template could not be validated.");
  if (!isWorkspaceGroupCustomOnlyV3(validatedGroup)) {
    throw new Error("Only custom-only groups can be saved as templates.");
  }
  return cloneWorkspaceLayoutGroupV3(validatedGroup);
}

function normalizeDraftName(value: string) {
  const name = value.trim();
  if (name.length < 3 || name.length > 80) throw new Error("Draft name must be between 3 and 80 characters.");
  return name;
}

function normalizeTemplateName(value: string) {
  const name = value.trim();
  if (name.length < 3 || name.length > 80) throw new Error("Template name must be between 3 and 80 characters.");
  return name;
}
