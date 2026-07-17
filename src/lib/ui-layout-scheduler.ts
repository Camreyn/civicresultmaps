import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "../db";
import { uiLayoutAuditEvents, uiLayoutPublications } from "../db/schema";
import { dispatchLayoutPublisher } from "./workspace-layout-publication-dispatch";
import {
  WORKSPACE_LAYOUT_STALE_CLAIM_MINUTES,
  workspaceLayoutRetryDelayMinutes,
  workspaceLayoutScheduleIsExhausted,
} from "./workspace-layout-scheduler-policy";
import type { LayoutActor } from "./ui-layout-repository";

const schedulerActor: LayoutActor = {
  email: "scheduler@civicresultmaps.org",
  id: "ui-layout-scheduler",
};

export type LayoutScheduleRunResult = {
  claimed: number;
  dispatched: number;
  failed: number;
  retried: number;
};

export async function processScheduledLayoutPublications(
  now = new Date(),
  limit = 10,
): Promise<LayoutScheduleRunResult> {
  if (!hasDatabase()) throw new Error("Layout database is not configured.");
  const claimed = await claimDueLayoutPublications(now, limit);
  const result: LayoutScheduleRunResult = { claimed: claimed.length, dispatched: 0, failed: 0, retried: 0 };
  for (const publication of claimed) {
    try {
      const dispatch = await dispatchLayoutPublisher(publication.id, publication.environment);
      if (dispatch.kind !== "dispatched") throw new Error(dispatch.message);
      await markScheduleDispatched(publication.id, publication.claimToken!, now);
      result.dispatched += 1;
    } catch (error) {
      const final = workspaceLayoutScheduleIsExhausted(publication.attemptCount, publication.maxAttempts);
      await markScheduleFailure(
        publication.id,
        publication.claimToken!,
        error instanceof Error ? error.message : "Unknown scheduled dispatch error",
        now,
        final,
      );
      if (final) result.failed += 1;
      else result.retried += 1;
    }
  }
  return result;
}

export async function claimDueLayoutPublications(now = new Date(), limit = 10) {
  const db = getDb();
  const staleClaim = new Date(now.getTime() - WORKSPACE_LAYOUT_STALE_CLAIM_MINUTES * 60_000);
  const candidates = await db
    .select()
    .from(uiLayoutPublications)
    .where(and(
      inArray(uiLayoutPublications.status, ["scheduled", "retrying"]),
      lte(uiLayoutPublications.nextAttemptAt, now),
      or(isNull(uiLayoutPublications.claimedAt), lte(uiLayoutPublications.claimedAt, staleClaim)),
    ))
    .orderBy(asc(uiLayoutPublications.nextAttemptAt))
    .limit(Math.min(Math.max(limit, 1), 25));

  const claimed: Array<typeof uiLayoutPublications.$inferSelect> = [];
  for (const candidate of candidates) {
    const claimToken = randomUUID();
    const [winner] = await db
      .update(uiLayoutPublications)
      .set({
        attemptCount: sql`${uiLayoutPublications.attemptCount} + 1`,
        claimedAt: now,
        claimToken,
        lastAttemptAt: now,
      })
      .where(and(
        eq(uiLayoutPublications.id, candidate.id),
        inArray(uiLayoutPublications.status, ["scheduled", "retrying"]),
        lte(uiLayoutPublications.nextAttemptAt, now),
        or(isNull(uiLayoutPublications.claimedAt), lte(uiLayoutPublications.claimedAt, staleClaim)),
      ))
      .returning();
    if (winner) claimed.push(winner);
  }
  return claimed;
}

export async function cancelScheduledLayoutPublication(
  publicationId: string,
  actor: LayoutActor,
  reason = "Cancelled by an administrator.",
) {
  const now = new Date();
  const [cancelled] = await getDb()
    .update(uiLayoutPublications)
    .set({
      cancelledAt: now,
      cancellationReason: reason.trim().slice(0, 500),
      claimToken: null,
      claimedAt: null,
      completedAt: now,
      status: "cancelled",
    })
    .where(and(
      eq(uiLayoutPublications.id, publicationId),
      inArray(uiLayoutPublications.status, ["scheduled", "retrying"]),
      isNull(uiLayoutPublications.claimedAt),
    ))
    .returning();
  if (!cancelled) return null;
  await insertScheduleAudit(cancelled, "publication.cancelled", actor, {
    reason: cancelled.cancellationReason,
  });
  return cancelled;
}

async function markScheduleDispatched(publicationId: string, claimToken: string, now: Date) {
  const [publication] = await getDb()
    .update(uiLayoutPublications)
    .set({
      claimToken: null,
      claimedAt: null,
      dispatchedAt: now,
      failureCode: null,
      failureMessage: null,
      nextAttemptAt: null,
      status: "dispatched",
    })
    .where(and(eq(uiLayoutPublications.id, publicationId), eq(uiLayoutPublications.claimToken, claimToken)))
    .returning();
  if (!publication) throw new Error("Scheduled publication claim was lost before dispatch completion.");
  await insertScheduleAudit(publication, "publication.dispatched", schedulerActor, {
    attemptCount: publication.attemptCount,
    scheduledFor: publication.scheduledFor?.toISOString() ?? null,
  });
}

async function markScheduleFailure(
  publicationId: string,
  claimToken: string,
  message: string,
  now: Date,
  final: boolean,
) {
  const [current] = await getDb().select().from(uiLayoutPublications)
    .where(and(eq(uiLayoutPublications.id, publicationId), eq(uiLayoutPublications.claimToken, claimToken))).limit(1);
  if (!current) return;
  const nextAttemptAt = final ? null : new Date(now.getTime() + workspaceLayoutRetryDelayMinutes(current.attemptCount) * 60_000);
  const [publication] = await getDb()
    .update(uiLayoutPublications)
    .set({
      claimToken: null,
      claimedAt: null,
      completedAt: final ? now : null,
      failureCode: final ? "scheduler_exhausted" : "scheduler_retry",
      failureMessage: message.slice(0, 2000),
      nextAttemptAt,
      status: final ? "failed" : "retrying",
    })
    .where(and(eq(uiLayoutPublications.id, publicationId), eq(uiLayoutPublications.claimToken, claimToken)))
    .returning();
  if (!publication) return;
  await insertScheduleAudit(publication, final ? "publication.failed" : "publication.retrying", schedulerActor, {
    attemptCount: publication.attemptCount,
    failureMessage: publication.failureMessage,
    nextAttemptAt: publication.nextAttemptAt?.toISOString() ?? null,
  });
}

async function insertScheduleAudit(
  publication: typeof uiLayoutPublications.$inferSelect,
  action: string,
  actor: LayoutActor,
  metadata: Record<string, unknown>,
) {
  await getDb().insert(uiLayoutAuditEvents).values({
    action,
    actorEmail: actor.email,
    actorId: actor.id,
    id: randomUUID(),
    metadata,
    publicationId: publication.id,
    revisionId: publication.revisionId,
  });
}
