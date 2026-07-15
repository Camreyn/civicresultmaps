import "server-only";

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "../db";
import {
  uiLayoutAuditEvents,
  uiLayoutPublications,
  uiLayoutRevisions,
} from "../db/schema";
import { workspaceLayoutDigest } from "./workspace-layout-digest";
import {
  WORKSPACE_LAYOUT_REGISTRY_VERSION,
  WORKSPACE_LAYOUT_SCHEMA_VERSION,
  validateWorkspaceLayoutManifest,
  type WorkspaceLayoutManifestV1,
} from "./workspace-layout";

export type LayoutActor = {
  id: string;
  email: string;
};

export type LayoutPublicationEnvironment = "preview" | "production";
export type LayoutPublicationChannel = "candidate" | "stable";
export type LayoutPublicationAction = "stage" | "promote" | "rollback";
export type LayoutPublicationStatus = "requested" | "dispatched" | "publishing" | "published" | "failed";

export class LayoutRevisionConflictError extends Error {
  constructor(message = "The layout changed after this editor session started. Reload and reapply your changes.") {
    super(message);
    this.name = "LayoutRevisionConflictError";
  }
}

export function isLayoutDatabaseConfigured() {
  return hasDatabase();
}

export async function listLayoutRevisions(limit = 30) {
  if (!hasDatabase()) return [];
  return getDb()
    .select()
    .from(uiLayoutRevisions)
    .orderBy(desc(uiLayoutRevisions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getLayoutRevision(revisionId: string) {
  if (!hasDatabase()) return null;
  const [revision] = await getDb()
    .select()
    .from(uiLayoutRevisions)
    .where(eq(uiLayoutRevisions.id, revisionId))
    .limit(1);
  return revision ?? null;
}

export async function createLayoutRevision(input: {
  actor: LayoutActor;
  changeSummary: string;
  manifest: WorkspaceLayoutManifestV1;
  parentRevisionId: string | null;
}) {
  const validation = validateWorkspaceLayoutManifest(input.manifest);
  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }
  const changeSummary = input.changeSummary.trim();
  if (changeSummary.length < 5 || changeSummary.length > 500) {
    throw new Error("Change summary must be between 5 and 500 characters.");
  }

  const db = getDb();
  const [latest] = await db
    .select({ id: uiLayoutRevisions.id })
    .from(uiLayoutRevisions)
    .orderBy(desc(uiLayoutRevisions.createdAt))
    .limit(1);
  const latestId = latest?.id ?? null;
  if (latestId !== input.parentRevisionId) {
    throw new LayoutRevisionConflictError();
  }

  const id = randomUUID();
  const auditId = randomUUID();
  const manifestDigest = workspaceLayoutDigest(validation.value);
  try {
    await db.batch([
      db.insert(uiLayoutRevisions).values({
        id,
        schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
        registryVersion: WORKSPACE_LAYOUT_REGISTRY_VERSION,
        manifest: validation.value,
        manifestDigest,
        parentRevisionId: input.parentRevisionId,
        changeSummary,
        actorId: input.actor.id,
        actorEmail: input.actor.email,
      }),
      db.insert(uiLayoutAuditEvents).values({
        id: auditId,
        action: "revision.created",
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        revisionId: id,
        metadata: { changeSummary, manifestDigest, parentRevisionId: input.parentRevisionId },
      }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new LayoutRevisionConflictError();
    }
    throw error;
  }

  return getLayoutRevision(id);
}

export async function listLayoutPublications(limit = 40) {
  if (!hasDatabase()) return [];
  return getDb()
    .select()
    .from(uiLayoutPublications)
    .orderBy(desc(uiLayoutPublications.requestedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getLayoutPublication(publicationId: string) {
  if (!hasDatabase()) return null;
  const [publication] = await getDb()
    .select()
    .from(uiLayoutPublications)
    .where(eq(uiLayoutPublications.id, publicationId))
    .limit(1);
  return publication ?? null;
}

export async function getLayoutPublicationWithRevision(publicationId: string) {
  const publication = await getLayoutPublication(publicationId);
  if (!publication) return null;
  const revision = await getLayoutRevision(publication.revisionId);
  return revision ? { publication, revision } : null;
}

export async function createLayoutPublication(input: {
  action: LayoutPublicationAction;
  actor: LayoutActor;
  channel: LayoutPublicationChannel;
  environment: LayoutPublicationEnvironment;
  idempotencyKey: string;
  revisionId: string;
}) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(uiLayoutPublications)
    .where(eq(uiLayoutPublications.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (existing) return existing;
  if (!(await getLayoutRevision(input.revisionId))) {
    throw new Error("The selected layout revision does not exist.");
  }

  const id = randomUUID();
  try {
    await db.batch([
      db.insert(uiLayoutPublications).values({
        id,
        revisionId: input.revisionId,
        environment: input.environment,
        channel: input.channel,
        action: input.action,
        idempotencyKey: input.idempotencyKey,
        actorId: input.actor.id,
        actorEmail: input.actor.email,
      }),
      db.insert(uiLayoutAuditEvents).values({
        id: randomUUID(),
        action: "publication.requested",
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        revisionId: input.revisionId,
        publicationId: id,
        metadata: {
          action: input.action,
          channel: input.channel,
          environment: input.environment,
          idempotencyKey: input.idempotencyKey,
        },
      }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const [winner] = await db
        .select()
        .from(uiLayoutPublications)
        .where(eq(uiLayoutPublications.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (winner) return winner;
    }
    throw error;
  }

  return getLayoutPublication(id);
}

export async function updateLayoutPublication(input: {
  actor?: LayoutActor;
  edgeDigest?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  publicationId: string;
  status: LayoutPublicationStatus;
  workflowRunId?: string | null;
}) {
  const db = getDb();
  const publication = await getLayoutPublication(input.publicationId);
  if (!publication) throw new Error("Layout publication not found.");
  const actor = input.actor ?? { id: "ui-layout-publisher", email: "workflow@civicresultmaps.org" };
  const now = new Date();
  const timestamps = input.status === "dispatched"
    ? { dispatchedAt: now }
    : input.status === "publishing"
      ? { startedAt: now }
      : input.status === "published" || input.status === "failed"
        ? { completedAt: now }
        : {};

  await db.batch([
    db.update(uiLayoutPublications)
      .set({
        status: input.status,
        edgeDigest: input.edgeDigest,
        failureCode: input.failureCode,
        failureMessage: input.failureMessage,
        workflowRunId: input.workflowRunId,
        ...timestamps,
      })
      .where(eq(uiLayoutPublications.id, input.publicationId)),
    db.insert(uiLayoutAuditEvents).values({
      id: randomUUID(),
      action: `publication.${input.status}`,
      actorId: actor.id,
      actorEmail: actor.email,
      revisionId: publication.revisionId,
      publicationId: publication.id,
      metadata: {
        edgeDigest: input.edgeDigest ?? null,
        failureCode: input.failureCode ?? null,
        workflowRunId: input.workflowRunId ?? null,
      },
    }),
  ]);

  return getLayoutPublication(input.publicationId);
}

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return code === "23505" || /unique|duplicate/i.test(message);
}
