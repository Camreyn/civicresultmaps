import {
  createWorkspaceLayoutEnvelope,
  validateWorkspaceLayoutEnvelope,
} from "./workspace-layout-digest.ts";
import { embeddedWorkspaceLayoutManifest } from "./workspace-layout.ts";
import type { WorkspaceLayoutEnvelope } from "./workspace-layout-v2.ts";

export type WorkspaceLayoutSource = "draft" | "candidate" | "stable" | "embedded";

export type WorkspaceLayoutResolution = {
  envelope: WorkspaceLayoutEnvelope;
  fallbacks: string[];
  source: WorkspaceLayoutSource;
};

const embeddedEnvelope = createWorkspaceLayoutEnvelope({
  manifest: embeddedWorkspaceLayoutManifest,
  publishedAt: "2026-07-15T00:00:00.000Z",
  revisionId: "embedded-v1",
});

export function resolveWorkspaceLayoutCandidates(input: {
  candidate?: unknown;
  candidateEnabled: boolean;
  draft?: unknown;
  stable?: unknown;
}): WorkspaceLayoutResolution {
  const fallbacks: string[] = [];

  if (input.draft !== undefined) {
    const draft = validateWorkspaceLayoutEnvelope(input.draft);
    if (draft.ok) return { envelope: draft.value, fallbacks, source: "draft" };
    fallbacks.push(`draft_invalid:${draft.errors.join("|")}`);
  }

  if (input.candidateEnabled) {
    const candidate = validateWorkspaceLayoutEnvelope(input.candidate);
    if (candidate.ok) return { envelope: candidate.value, fallbacks, source: "candidate" };
    fallbacks.push(`candidate_invalid:${candidate.errors.join("|")}`);
  }

  if (input.stable !== undefined) {
    const stable = validateWorkspaceLayoutEnvelope(input.stable);
    if (stable.ok) return { envelope: stable.value, fallbacks, source: "stable" };
    fallbacks.push(`stable_invalid:${stable.errors.join("|")}`);
  } else {
    fallbacks.push("stable_unavailable");
  }

  return { envelope: embeddedEnvelope, fallbacks, source: "embedded" };
}

export function getEmbeddedWorkspaceLayoutEnvelope() {
  return embeddedEnvelope;
}
