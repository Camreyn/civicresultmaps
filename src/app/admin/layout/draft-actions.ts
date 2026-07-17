"use server";

import { revalidatePath } from "next/cache";
import { requireLayoutAdmin } from "@/lib/ui-layout-auth";
import {
  LayoutDraftConflictError,
  archiveLayoutDraft,
  createLayoutDraft,
  createLayoutGroupTemplate,
  deleteLayoutGroupTemplate,
  saveLayoutDraft,
} from "@/lib/ui-layout-v4-repository";
import type {
  WorkspaceLayoutGroupV3,
  WorkspaceLayoutManifestV3,
} from "@/lib/workspace-layout-v3";

export type LayoutDraftActionResult =
  | { draft: SerializedLayoutDraft; kind: "saved"; message: string }
  | { current: SerializedLayoutDraft | null; kind: "conflict"; message: string }
  | { kind: "error"; message: string };

export type SerializedLayoutDraft = {
  archivedAt: string | null;
  baseRevisionId: string | null;
  createdAt: string;
  id: string;
  manifest: WorkspaceLayoutManifestV3;
  name: string;
  updatedAt: string;
  version: number;
};

export async function createLayoutDraftAction(input: {
  baseRevisionId: string | null;
  manifest: WorkspaceLayoutManifestV3;
  name: string;
}): Promise<LayoutDraftActionResult> {
  try {
    const actor = await requireLayoutAdmin();
    const draft = await createLayoutDraft({ ...input, actor });
    revalidatePath("/admin/layout");
    return { draft: serializeDraft(draft), kind: "saved", message: "Named draft created." };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "Unable to create the draft." };
  }
}

export async function saveLayoutDraftAction(input: {
  draftId: string;
  expectedVersion: number;
  manifest: WorkspaceLayoutManifestV3;
  name?: string;
}): Promise<LayoutDraftActionResult> {
  try {
    const actor = await requireLayoutAdmin();
    assertUuid(input.draftId);
    const draft = await saveLayoutDraft({ ...input, actor });
    revalidatePath("/admin/layout");
    return { draft: serializeDraft(draft), kind: "saved", message: "Draft autosaved." };
  } catch (error) {
    if (error instanceof LayoutDraftConflictError) {
      return {
        current: error.current ? serializeDraft(error.current) : null,
        kind: "conflict",
        message: error.message,
      };
    }
    return { kind: "error", message: error instanceof Error ? error.message : "Unable to save the draft." };
  }
}

export async function archiveLayoutDraftAction(draftId: string) {
  const actor = await requireLayoutAdmin();
  assertUuid(draftId);
  await archiveLayoutDraft(draftId, actor);
  revalidatePath("/admin/layout");
}

export async function saveLayoutGroupTemplateAction(input: {
  description: string;
  group: WorkspaceLayoutGroupV3;
  name: string;
}) {
  const actor = await requireLayoutAdmin();
  const template = await createLayoutGroupTemplate({ ...input, actor });
  revalidatePath("/admin/layout");
  return {
    actorEmail: template.actorEmail,
    description: template.description,
    group: template.group,
    id: template.id,
    name: template.name,
    updatedAt: template.updatedAt.toISOString(),
  };
}

export async function deleteLayoutGroupTemplateAction(templateId: string) {
  await requireLayoutAdmin();
  assertUuid(templateId);
  await deleteLayoutGroupTemplate(templateId);
  revalidatePath("/admin/layout");
}

function serializeDraft(draft: {
  archivedAt: Date | null;
  baseRevisionId: string | null;
  createdAt: Date;
  id: string;
  manifest: WorkspaceLayoutManifestV3;
  name: string;
  updatedAt: Date;
  version: number;
}): SerializedLayoutDraft {
  return {
    archivedAt: draft.archivedAt?.toISOString() ?? null,
    baseRevisionId: draft.baseRevisionId,
    createdAt: draft.createdAt.toISOString(),
    id: draft.id,
    manifest: draft.manifest,
    name: draft.name,
    updatedAt: draft.updatedAt.toISOString(),
    version: draft.version,
  };
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("ID is invalid.");
  }
}
