import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, hasDatabase } from "../db";
import {
  uiLayoutAssets,
  uiLayoutRevisionAssets,
  uiLayoutTemplateAssets,
  uiLayoutTemplates,
} from "../db/ui-layout-v3-schema";
import {
  flattenWorkspaceNodes,
  isSafeWorkspaceBlobUrl,
  isWorkspaceCustomNodeV2,
  validateWorkspaceLayoutManifestV2,
  type WorkspaceLayoutManifestV2,
} from "./workspace-layout-v2";
import type { LayoutActor } from "./ui-layout-repository";

export type LayoutAssetInput = {
  id: string;
  alt: string;
  contentType: "image/avif" | "image/jpeg" | "image/png" | "image/webp";
  height: number;
  pathname: string;
  sizeBytes: number;
  url: string;
  width: number;
};

export async function listLayoutAssets(limit = 80) {
  if (!hasDatabase()) return [];
  return getDb()
    .select()
    .from(uiLayoutAssets)
    .where(isNull(uiLayoutAssets.deletedAt))
    .orderBy(desc(uiLayoutAssets.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function createLayoutAsset(input: LayoutAssetInput & { actor: LayoutActor }) {
  validateAssetInput(input);
  const [existing] = await getDb()
    .select()
    .from(uiLayoutAssets)
    .where(eq(uiLayoutAssets.pathname, input.pathname))
    .limit(1);
  if (existing) return existing;
  const [asset] = await getDb().insert(uiLayoutAssets).values({
    id: input.id,
    actorEmail: input.actor.email,
    actorId: input.actor.id,
    alt: input.alt.trim().slice(0, 300),
    contentType: input.contentType,
    height: input.height,
    pathname: input.pathname,
    sizeBytes: input.sizeBytes,
    url: input.url,
    width: input.width,
  }).returning();
  return asset;
}

export async function archiveLayoutAsset(assetId: string, actor: LayoutActor) {
  const [usage] = await getDb()
    .select({ id: uiLayoutRevisionAssets.id })
    .from(uiLayoutRevisionAssets)
    .where(eq(uiLayoutRevisionAssets.assetId, assetId))
    .limit(1);
  if (usage) throw new Error("This image is referenced by a saved layout revision and cannot be deleted.");
  const [templateUsage] = await getDb()
    .select({ id: uiLayoutTemplateAssets.id })
    .from(uiLayoutTemplateAssets)
    .where(eq(uiLayoutTemplateAssets.assetId, assetId))
    .limit(1);
  if (templateUsage) throw new Error("This image is referenced by a shared layout template and cannot be deleted.");

  const [asset] = await getDb()
    .update(uiLayoutAssets)
    .set({ deletedAt: new Date(), actorEmail: actor.email, actorId: actor.id })
    .where(and(eq(uiLayoutAssets.id, assetId), isNull(uiLayoutAssets.deletedAt)))
    .returning();
  return asset ?? null;
}

export async function listLayoutTemplates(limit = 40) {
  if (!hasDatabase()) return [];
  return getDb()
    .select()
    .from(uiLayoutTemplates)
    .orderBy(desc(uiLayoutTemplates.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function createLayoutTemplate(input: {
  actor: LayoutActor;
  description: string;
  manifest: WorkspaceLayoutManifestV2;
  name: string;
}) {
  const validation = validateWorkspaceLayoutManifestV2(input.manifest);
  if (!validation.ok) throw new Error(validation.errors.join(" "));
  const name = input.name.trim();
  if (name.length < 3 || name.length > 80) throw new Error("Template name must be between 3 and 80 characters.");
  const id = randomUUID();
  const db = getDb();
  const assetIds = collectLayoutAssetIds(validation.value);
  await db.batch([
    db.insert(uiLayoutTemplates).values({
      id,
      actorEmail: input.actor.email,
      actorId: input.actor.id,
      description: input.description.trim().slice(0, 240),
      manifest: validation.value,
      name,
    }),
    ...assetIds.map((assetId) => db.insert(uiLayoutTemplateAssets).values({
      assetId,
      id: randomUUID(),
      templateId: id,
    })),
  ]);
  const [template] = await db.select().from(uiLayoutTemplates).where(eq(uiLayoutTemplates.id, id)).limit(1);
  if (!template) throw new Error("The template was created but could not be reloaded.");
  return template;
}

export async function deleteLayoutTemplate(templateId: string) {
  const [template] = await getDb()
    .delete(uiLayoutTemplates)
    .where(eq(uiLayoutTemplates.id, templateId))
    .returning();
  return template ?? null;
}

export async function syncLayoutRevisionAssets(revisionId: string, manifest: WorkspaceLayoutManifestV2) {
  const assetIds = collectLayoutAssetIds(manifest);
  if (!assetIds.length) return;
  await getDb().insert(uiLayoutRevisionAssets).values(assetIds.map((assetId) => ({
    assetId,
    id: randomUUID(),
    revisionId,
  }))).onConflictDoNothing();
}

export function collectLayoutAssetIds(manifest: WorkspaceLayoutManifestV2) {
  return [...new Set(manifest.tabs.flatMap((tab) => flattenWorkspaceNodes(tab)
    .filter(isWorkspaceCustomNodeV2)
    .flatMap((node) => node.asset?.assetId ? [node.asset.assetId] : [])))];
}

function validateAssetInput(input: LayoutAssetInput) {
  if (!isSafeWorkspaceBlobUrl(input.url)) throw new Error("Image URL must be a Vercel Blob URL.");
  if (!input.pathname.startsWith("layout-media/")) throw new Error("Image path is outside the layout-media namespace.");
  if (!["image/avif", "image/jpeg", "image/png", "image/webp"].includes(input.contentType)) {
    throw new Error("Only PNG, JPEG, WebP, and AVIF images are allowed.");
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > 5 * 1024 * 1024) {
    throw new Error("Images must be 5 MB or smaller.");
  }
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1) {
    throw new Error("Image dimensions are required.");
  }
}
