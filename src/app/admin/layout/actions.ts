"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLayoutAdmin } from "@/lib/ui-layout-auth";
import type { LayoutActionState } from "./layout-action-state";
import {
  createLayoutPublication,
  createLayoutRevision,
  getLayoutRevision,
  LayoutRevisionConflictError,
  updateLayoutPublication,
} from "@/lib/ui-layout-repository";
import { validateWorkspaceLayoutManifestAny } from "@/lib/workspace-layout-digest";
import { dispatchLayoutPublisher } from "@/lib/workspace-layout-publication-dispatch";
import { cancelScheduledLayoutPublication } from "@/lib/ui-layout-scheduler";
import {
  isWorkspaceLayoutPublicationAction,
  isWorkspaceLayoutPublicationEnvironment,
  workspaceLayoutPublicationChannel,
} from "@/lib/workspace-layout-publisher-policy";
import {
  WORKSPACE_LAYOUT_DRAFT_COOKIE,
  WORKSPACE_LAYOUT_DRAFT_MAX_AGE,
} from "@/lib/workspace-layout-runtime";

export async function saveLayoutRevisionAction(
  _previous: LayoutActionState,
  formData: FormData,
): Promise<LayoutActionState> {
  try {
    const actor = await requireLayoutAdmin();
    const rawManifest = String(formData.get("manifest") ?? "");
    const manifest = JSON.parse(rawManifest) as unknown;
    const validation = validateWorkspaceLayoutManifestAny(manifest);
    if (!validation.ok) return { kind: "error", message: validation.errors.join(" ") };
    const parentValue = String(formData.get("parentRevisionId") ?? "").trim();
    const revision = await createLayoutRevision({
      actor,
      changeSummary: String(formData.get("changeSummary") ?? ""),
      manifest: validation.value,
      parentRevisionId: parentValue || null,
    });
    if (!revision) throw new Error("The revision was created but could not be reloaded.");
    revalidatePath("/admin/layout");
    return { kind: "success", message: "Immutable layout revision saved.", revisionId: revision.id };
  } catch (error) {
    if (error instanceof LayoutRevisionConflictError) {
      return { kind: "conflict", message: error.message };
    }
    return { kind: "error", message: error instanceof Error ? error.message : "Unable to save the layout revision." };
  }
}

export async function startLayoutDraftPreviewAction(formData: FormData) {
  await requireLayoutAdmin();
  const revisionId = String(formData.get("revisionId") ?? "");
  if (!(await getLayoutRevision(revisionId))) throw new Error("Layout revision not found.");
  (await cookies()).set(WORKSPACE_LAYOUT_DRAFT_COOKIE, revisionId, {
    httpOnly: true,
    maxAge: WORKSPACE_LAYOUT_DRAFT_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/?state=WA&tab=map");
}

export async function stopLayoutDraftPreviewAction() {
  await requireLayoutAdmin();
  (await cookies()).delete(WORKSPACE_LAYOUT_DRAFT_COOKIE);
  redirect("/admin/layout");
}

export async function requestLayoutPublicationAction(
  _previous: LayoutActionState,
  formData: FormData,
): Promise<LayoutActionState> {
  try {
    const actor = await requireLayoutAdmin();
    const revisionId = String(formData.get("revisionId") ?? "");
    const environment = String(formData.get("environment") ?? "");
    const action = String(formData.get("publicationAction") ?? "");
    if (!isWorkspaceLayoutPublicationEnvironment(environment)) {
      return { kind: "error", message: "Choose preview or production." };
    }
    if (!isWorkspaceLayoutPublicationAction(action)) {
      return { kind: "error", message: "Choose a supported publication action." };
    }
    if (environment === "production" && formData.get("confirmProduction") !== "yes") {
      return { kind: "error", message: "Confirm the production publication before continuing." };
    }
    const scheduledValue = String(formData.get("scheduledFor") ?? "").trim();
    let scheduledFor: Date | null = null;
    if (scheduledValue) {
      const parsed = new Date(scheduledValue);
      if (Number.isNaN(parsed.getTime())) return { kind: "error", message: "Choose a valid schedule time." };
      scheduledFor = parsed;
    }
    const requestKeyBase = String(formData.get("requestKey") ?? "").trim() || randomUUID();
    const requestKey = `${requestKeyBase}:${revisionId}:${environment}:${action}:${scheduledFor?.toISOString() ?? "now"}`;
    const publication = await createLayoutPublication({
      action,
      actor,
      channel: workspaceLayoutPublicationChannel(action),
      environment,
      idempotencyKey: requestKey,
      revisionId,
      scheduledFor,
    });
    if (!publication) throw new Error("The publication request could not be reloaded.");

    if (publication.status === "scheduled") {
      revalidatePath("/admin/layout");
      return {
        kind: "success",
        message: "Publication scheduled successfully. The activity list shows the time in your local time zone.",
        revisionId,
      };
    }
    const dispatch = await dispatchLayoutPublisher(publication.id, environment);
    if (dispatch.kind === "dispatched") {
      await updateLayoutPublication({ publicationId: publication.id, status: "dispatched", actor });
    }
    revalidatePath("/admin/layout");
    return {
      kind: "success",
      message: dispatch.message,
      revisionId,
    };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "Unable to request publication." };
  }
}

export async function cancelLayoutPublicationAction(formData: FormData) {
  const actor = await requireLayoutAdmin();
  const publicationId = String(formData.get("publicationId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(publicationId)) throw new Error("Publication ID is invalid.");
  const cancelled = await cancelScheduledLayoutPublication(publicationId, actor);
  if (!cancelled) throw new Error("Only pending scheduled publications can be cancelled.");
  revalidatePath("/admin/layout");
}
