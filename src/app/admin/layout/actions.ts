"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLayoutAdmin } from "@/lib/ui-layout-auth";
import {
  createLayoutPublication,
  createLayoutRevision,
  getLayoutRevision,
  LayoutRevisionConflictError,
  updateLayoutPublication,
  type LayoutPublicationEnvironment,
} from "@/lib/ui-layout-repository";
import { validateWorkspaceLayoutManifest } from "@/lib/workspace-layout";
import {
  isWorkspaceLayoutPublicationAction,
  isWorkspaceLayoutPublicationEnvironment,
  workspaceLayoutPublicationChannel,
} from "@/lib/workspace-layout-publisher-policy";
import {
  WORKSPACE_LAYOUT_DRAFT_COOKIE,
  WORKSPACE_LAYOUT_DRAFT_MAX_AGE,
} from "@/lib/workspace-layout-runtime";

export type LayoutActionState = {
  kind: "idle" | "success" | "error" | "conflict";
  message: string;
  revisionId?: string;
};

export const initialLayoutActionState: LayoutActionState = { kind: "idle", message: "" };

export async function saveLayoutRevisionAction(
  _previous: LayoutActionState,
  formData: FormData,
): Promise<LayoutActionState> {
  try {
    const actor = await requireLayoutAdmin();
    const rawManifest = String(formData.get("manifest") ?? "");
    const manifest = JSON.parse(rawManifest) as unknown;
    const validation = validateWorkspaceLayoutManifest(manifest);
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
    const requestKeyBase = String(formData.get("requestKey") ?? "").trim() || randomUUID();
    const requestKey = `${requestKeyBase}:${revisionId}:${environment}:${action}`;
    const publication = await createLayoutPublication({
      action,
      actor,
      channel: workspaceLayoutPublicationChannel(action),
      environment,
      idempotencyKey: requestKey,
      revisionId,
    });
    if (!publication) throw new Error("The publication request could not be reloaded.");

    const dispatch = await dispatchPublisher(publication.id, environment);
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

async function dispatchPublisher(publicationId: string, environment: LayoutPublicationEnvironment) {
  if (process.env.UI_LAYOUT_PUBLISH_WORKFLOW_ENABLED !== "true") {
    return {
      kind: "queued" as const,
      message: "Publication recorded and safely queued. Dispatch remains disabled until the workflow is active on main.",
    };
  }
  const token = process.env.UI_LAYOUT_GITHUB_TOKEN;
  const repository = process.env.UI_LAYOUT_GITHUB_REPOSITORY ?? process.env.GITHUB_REPOSITORY;
  if (!token || !repository) {
    return {
      kind: "queued" as const,
      message: "Publication recorded, but GitHub workflow dispatch is not configured yet.",
    };
  }
  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/ui-layout-publish.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: process.env.UI_LAYOUT_PUBLISH_REF ?? "main",
        inputs: { publication_id: publicationId, environment },
      }),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`GitHub workflow dispatch failed (${response.status}): ${detail}`);
  }
  return { kind: "dispatched" as const, message: "Publication recorded and dispatched to the protected workflow." };
}
