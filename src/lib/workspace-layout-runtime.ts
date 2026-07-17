import "server-only";

import { createClient } from "@vercel/edge-config";
import { cookies } from "next/headers";
import { evaluate } from "flags/next";
import { workspaceLayoutCandidate, workspaceLayoutRuntimeV3 } from "@/flags";
import { readLayoutAdmin } from "./ui-layout-auth";
import { getLayoutRevision } from "./ui-layout-repository";
import { createWorkspaceLayoutEnvelope } from "./workspace-layout-digest";
import { resolveWorkspaceLayoutCandidates } from "./workspace-layout-resolution";

export const WORKSPACE_LAYOUT_STABLE_KEY = "workspaceLayoutStable";
export const WORKSPACE_LAYOUT_CANDIDATE_KEY = "workspaceLayoutCandidate";
export const WORKSPACE_LAYOUT_DRAFT_COOKIE = "crm_layout_draft";
export const WORKSPACE_LAYOUT_DRAFT_MAX_AGE = 60 * 60 * 8;

let edgeConfigClient: ReturnType<typeof createClient> | null = null;

function getEdgeConfigClient() {
  const connection = process.env.EDGE_CONFIG;
  if (!connection) return null;
  edgeConfigClient ??= createClient(connection);
  return edgeConfigClient;
}

async function readDraftEnvelope() {
  const revisionId = (await cookies()).get(WORKSPACE_LAYOUT_DRAFT_COOKIE)?.value;
  if (!revisionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(revisionId)) {
    return undefined;
  }
  const admin = await readLayoutAdmin();
  if (admin.status !== "ready") return undefined;
  const revision = await getLayoutRevision(revisionId);
  if (!revision) return undefined;
  return createWorkspaceLayoutEnvelope({
    manifest: revision.manifest,
    publishedAt: revision.createdAt.toISOString(),
    revisionId: revision.id,
  });
}

async function readEdgeLayouts() {
  const client = getEdgeConfigClient();
  if (!client) return { candidate: undefined, stable: undefined };
  try {
    const values = await client.getAll([WORKSPACE_LAYOUT_CANDIDATE_KEY, WORKSPACE_LAYOUT_STABLE_KEY]);
    return {
      candidate: values[WORKSPACE_LAYOUT_CANDIDATE_KEY],
      stable: values[WORKSPACE_LAYOUT_STABLE_KEY],
    };
  } catch (error) {
    console.error(JSON.stringify({
      event: "workspace_layout_edge_read_failed",
      message: error instanceof Error ? error.message : "Unknown Edge Config read error",
    }));
    return { candidate: undefined, stable: undefined };
  }
}

export async function resolveWorkspaceLayout() {
  const [draft, edgeLayouts] = await Promise.all([readDraftEnvelope(), readEdgeLayouts()]);
  let candidateEnabled = false;
  let runtimeV3Enabled = process.env.NODE_ENV === "development" && !process.env.VERCEL;
  try {
    const evaluated = await evaluate({
      candidate: workspaceLayoutCandidate,
      runtimeV3: workspaceLayoutRuntimeV3,
    });
    candidateEnabled = edgeLayouts.candidate !== undefined && evaluated.candidate;
    runtimeV3Enabled = evaluated.runtimeV3;
  } catch (error) {
    console.error(JSON.stringify({
      event: "workspace_layout_flag_failed",
      message: error instanceof Error ? error.message : "Unknown flag evaluation error",
    }));
  }

  const resolution = resolveWorkspaceLayoutCandidates({
    draft,
    candidate: edgeLayouts.candidate,
    candidateEnabled,
    stable: edgeLayouts.stable,
  });
  console.info(JSON.stringify({
    event: "workspace_layout_resolved",
    source: resolution.source,
    revisionId: resolution.envelope.revisionId,
    fallbacks: resolution.fallbacks,
    runtime: runtimeV3Enabled ? "v3" : "compatibility",
  }));
  return { ...resolution, runtimeV3Enabled };
}
