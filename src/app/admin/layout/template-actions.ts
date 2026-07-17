"use server";

import { revalidatePath } from "next/cache";
import type { LayoutActionState } from "./layout-action-state";
import { requireLayoutAdmin } from "@/lib/ui-layout-auth";
import {
  createLayoutTemplate,
  deleteLayoutTemplate,
} from "@/lib/ui-layout-v3-repository";
import { validateWorkspaceLayoutManifestAny } from "@/lib/workspace-layout-digest";
import { toWorkspaceLayoutManifestV3 } from "@/lib/workspace-layout-v3";

export async function saveLayoutTemplateAction(
  _previous: LayoutActionState,
  formData: FormData,
): Promise<LayoutActionState> {
  try {
    const actor = await requireLayoutAdmin();
    const manifest = JSON.parse(String(formData.get("manifest") ?? "")) as unknown;
    const validation = validateWorkspaceLayoutManifestAny(manifest);
    if (!validation.ok) return { kind: "error", message: validation.errors.join(" ") };
    const template = await createLayoutTemplate({
      actor,
      description: String(formData.get("description") ?? ""),
      manifest: toWorkspaceLayoutManifestV3(validation.value),
      name: String(formData.get("name") ?? ""),
    });
    revalidatePath("/admin/layout");
    return { kind: "success", message: `Saved shared template “${template.name}”.` };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "Unable to save the template." };
  }
}

export async function deleteLayoutTemplateAction(formData: FormData) {
  await requireLayoutAdmin();
  const templateId = String(formData.get("templateId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(templateId)) throw new Error("Template ID is invalid.");
  await deleteLayoutTemplate(templateId);
  revalidatePath("/admin/layout");
}
