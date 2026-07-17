import "server-only";

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "../db";
import {
  uiLayoutAuditEvents,
  uiLayoutPublications,
  uiLayoutRevisions,
} from "../db/schema";
import { uiLayoutRevisionAssets } from "../db/ui-layout-v3-schema";
import { validateWorkspaceLayoutManifestAny, workspaceLayoutDigest } from "./workspace-layout-digest";
import type { WorkspaceLayoutManifestAny } from "./workspace-layout-v3";
import { collectLayoutAssetIds } from "./ui-layout-v3-repository";

export type LayoutActor = {
  id: string;
  email: string;
};

export type LayoutPublicationEnvironment = "preview" | "production";
export type LayoutPublicationChannel = "candidate" | "stable";
export type LayoutPublicationAction = "stage" | "promote" | "rollback";
export type LayoutPublicationStatus = "requested" | "scheduled" | "dispatched" | "publishing" | "retrying" | "published" | "failed" | "cancelled";

export class LayoutRevisionConflictError extends Error {
  constructor(message = "The layout changed after this editor session started. Reload and reapply your changes.") {
    super(message);
    this.name = "LayoutRevisionConflictError";
  }
}

type LayoutPublicationRow = typeof uiLayoutPublications.$inferSelect;
type LegacyLayoutPublicationRow = Omit<
  LayoutPublicationRow,
  | "attemptCount"
  | "cancellationReason"
  | "cancelledAt"
  | "claimedAt"
  | "claimToken"
  | "lastAttemptAt"
  | "maxAttempts"
  | "nextAttemptAt"
  | "scheduledFor"
>;

const legacyLayoutPublicationColumns = {
  action: uiLayoutPublications.action,
  actorEmail: uiLayoutPublications.actorEmail,
  actorId: uiLayoutPublications.actorId,
  channel: uiLayoutPublications.channel,
  completedAt: uiLayoutPublications.completedAt,
  dispatchedAt: uiLayoutPublications.dispatchedAt,
  edgeDigest: uiLayoutPublications.edgeDigest,
  environment: uiLayoutPublications.environment,
  failureCode: uiLayoutPublications.failureCode,
  failureMessage: uiLayoutPublications.failureMessage,
  id: uiLayoutPublications.id,
  idempotencyKey: uiLayoutPublications.idempotencyKey,
  requestedAt: uiLayoutPublications.requestedAt,
  revisionId: uiLayoutPublications.revisionId,
  startedAt: uiLayoutPublications.startedAt,
  status: uiLayoutPublications.status,
  workflowRunId: uiLayoutPublications.workflowRunId,
};

function withSchedulingDefaults(publication: LegacyLayoutPublicationRow): LayoutPublicationRow {
  return {
    ...publication,
    attemptCount: 0,
    cancellationReason: null,
    cancelledAt: null,
    claimedAt: null,
    claimToken: null,
    lastAttemptAt: null,
    maxAttempts: 3,
    nextAttemptAt: null,
    scheduledFor: null,
  };
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
  manifest: WorkspaceLayoutManifestAny;
  parentRevisionId: string | null;
}) {
  const validation = validateWorkspaceLayoutManifestAny(input.manifest);
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
  const assetIds = validation.value.schemaVersion === 1
    ? []
    : collectLayoutAssetIds(validation.value);
  try {
    await db.batch([
      db.insert(uiLayoutRevisions).values({
        id,
        schemaVersion: validation.value.schemaVersion,
        registryVersion: validation.value.registryVersion,
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
      ...assetIds.map((assetId) => db.insert(uiLayoutRevisionAssets).values({
        assetId,
        id: randomUUID(),
        revisionId: id,
      })),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new LayoutRevisionConflictError();
    }
    throw error;
  }

  return getLayoutRevision(id);
}

export async function listLayoutPublications(limit = 40, includeScheduling = false): Promise<LayoutPublicationRow[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  if (includeScheduling) {
    return db
      .select()
      .from(uiLayoutPublications)
      .orderBy(desc(uiLayoutPublications.requestedAt))
      .limit(boundedLimit);
  }
  const publications = await db
    .select(legacyLayoutPublicationColumns)
    .from(uiLayoutPublications)
    .orderBy(desc(uiLayoutPublications.requestedAt))
    .limit(boundedLimit);
  return publications.map(withSchedulingDefaults);
}

export async function getLayoutPublication(
  publicationId: string,
  includeScheduling = false,
): Promise<LayoutPublicationRow | null> {
  if (!hasDatabase()) return null;
  const db = getDb();
  if (includeScheduling) {
    const [publication] = await db
      .select()
      .from(uiLayoutPublications)
      .where(eq(uiLayoutPublications.id, publicationId))
      .limit(1);
    return publication ?? null;
  }
  const [publication] = await db
    .select(legacyLayoutPublicationColumns)
    .from(uiLayoutPublications)
    .where(eq(uiLayoutPublications.id, publicationId))
    .limit(1);
  return publication ? withSchedulingDefaults(publication) : null;
}

async function getLayoutPublicationByIdempotencyKey(
  idempotencyKey: string,
  includeScheduling: boolean,
): Promise<LayoutPublicationRow | null> {
  const db = getDb();
  if (includeScheduling) {
    const [publication] = await db
      .select()
      .from(uiLayoutPublications)
      .where(eq(uiLayoutPublications.idempotencyKey, idempotencyKey))
      .limit(1);
    return publication ?? null;
  }
  const [publication] = await db
    .select(legacyLayoutPublicationColumns)
    .from(uiLayoutPublications)
    .where(eq(uiLayoutPublications.idempotencyKey, idempotencyKey))
    .limit(1);
  return publication ? withSchedulingDefaults(publication) : null;
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
  scheduledFor?: Date | null;
}) {
  const db = getDb();
  const scheduledFor = input.scheduledFor ?? null;
  if (scheduledFor && (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now())) {
    throw new Error("Scheduled publication time must be in the future.");
  }
  const existing = await getLayoutPublicationByIdempotencyKey(input.idempotencyKey, Boolean(scheduledFor));
  if (existing) return existing;
  if (!(await getLayoutRevision(input.revisionId))) {
    throw new Error("The selected layout revision does not exist.");
  }
  const initialStatus: LayoutPublicationStatus = scheduledFor ? "scheduled" : "requested";

  const id = randomUUID();
  const publicationValues: typeof uiLayoutPublications.$inferInsert = {
    action: input.action,
    actorEmail: input.actor.email,
    actorId: input.actor.id,
    channel: input.channel,
    environment: input.environment,
    id,
    idempotencyKey: input.idempotencyKey,
    revisionId: input.revisionId,
    status: initialStatus,
    ...(scheduledFor ? { nextAttemptAt: scheduledFor, scheduledFor } : {}),
  };
  try {
    await db.batch([
      db.insert(uiLayoutPublications).values(publicationValues),
      db.insert(uiLayoutAuditEvents).values({
        id: randomUUID(),
        action: scheduledFor ? "publication.scheduled" : "publication.requested",
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        revisionId: input.revisionId,
        publicationId: id,
        metadata: {
          action: input.action,
          channel: input.channel,
          environment: input.environment,
          idempotencyKey: input.idempotencyKey,
          scheduledFor: scheduledFor?.toISOString() ?? null,
          status: initialStatus,
        },
      }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await getLayoutPublicationByIdempotencyKey(input.idempotencyKey, Boolean(scheduledFor));
      if (winner) return winner;
    }
    throw error;
  }

  return getLayoutPublication(id, Boolean(scheduledFor));
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
