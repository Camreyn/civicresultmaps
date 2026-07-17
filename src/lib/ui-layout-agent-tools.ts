import "server-only";

import { z } from "zod";
import {
  LayoutDraftConflictError,
  createLayoutDraft,
  getLayoutDraft,
  isLayoutDraftDatabaseConfigured,
  listLayoutDrafts,
  saveLayoutDraft,
} from "./ui-layout-v4-repository";
import {
  createLayoutRevision,
  getLayoutRevision,
  isLayoutDatabaseConfigured,
  listLayoutRevisions,
  type LayoutActor,
} from "./ui-layout-repository";
import type { LayoutAgentToolExecution } from "./ui-layout-agent-mcp";
import { diffWorkspaceLayoutManifests } from "./workspace-layout-diff";
import {
  applyWorkspaceLayoutAgentOperations,
  layoutAgentCustomBlockKinds,
  layoutAgentTabIds,
} from "./workspace-layout-agent-operations";
import {
  cloneWorkspaceLayoutManifestV3,
  embeddedWorkspaceLayoutManifestV3,
  toWorkspaceLayoutManifestV3,
  validateWorkspaceLayoutManifestV3,
  type WorkspaceLayoutManifestV3,
} from "./workspace-layout-v3";

const uuidSchema = z.string().uuid();
const draftIdInput = z.object({ draftId: uuidSchema }).strict();
const versionedDraftInput = z.object({
  draftId: uuidSchema,
  expectedVersion: z.number().int().min(1),
}).strict();
const previewInput = versionedDraftInput.extend({ operations: z.unknown() }).strict();
const saveInput = previewInput.extend({ confirmation: z.literal("SAVE_DRAFT") }).strict();
const createDraftInput = z.object({
  confirmation: z.literal("CREATE_DRAFT"),
  name: z.string().trim().min(3).max(80),
  source: z.enum(["latest", "embedded", "draft"]),
  sourceDraftId: uuidSchema.optional(),
}).strict();
const createRevisionInput = versionedDraftInput.extend({
  changeSummary: z.string().trim().min(5).max(500),
  confirmation: z.literal("CREATE_REVISION"),
}).strict();

export async function executeLayoutAgentTool(
  name: string,
  argumentsValue: Record<string, unknown>,
): Promise<LayoutAgentToolExecution> {
  if (name === "layout_status") return layoutStatus(argumentsValue);
  if (!isLayoutDatabaseConfigured() || !isLayoutDraftDatabaseConfigured()) {
    throw new Error("The layout database is not configured for this deployment.");
  }
  if (name === "layout_get_draft") return getDraftTool(argumentsValue);
  if (name === "layout_validate_draft") return validateDraftTool(argumentsValue);
  if (name === "layout_diff_draft") return diffDraftTool(argumentsValue);
  if (name === "layout_create_draft") return createDraftTool(argumentsValue);
  if (name === "layout_preview_changes") return previewChangesTool(argumentsValue);
  if (name === "layout_save_changes") return saveChangesTool(argumentsValue);
  if (name === "layout_create_revision") return createRevisionTool(argumentsValue);
  throw new Error(`Unknown layout tool: ${name}.`);
}

async function layoutStatus(argumentsValue: Record<string, unknown>): Promise<LayoutAgentToolExecution> {
  parse(z.object({}).strict(), argumentsValue);
  const databaseConfigured = isLayoutDatabaseConfigured() && isLayoutDraftDatabaseConfigured();
  const capabilities = {
    creatableCustomBlockKinds: layoutAgentCustomBlockKinds,
    productionPublishing: false,
    tabs: layoutAgentTabIds,
    workflow: ["inspect", "create or choose draft", "preview", "save draft", "human review", "create revision"],
  };
  if (!databaseConfigured) {
    return {
      message: "Layout agent tooling is enabled, but the layout database is not configured for this deployment.",
      structuredContent: {
        capabilities,
        databaseConfigured: false,
        drafts: [],
        latestRevision: null,
        ok: true,
      },
    };
  }
  const [drafts, revisions] = await Promise.all([listLayoutDrafts(30), listLayoutRevisions(1)]);
  const latestRevision = revisions[0] ?? null;
  return {
    message: `Layout control center is ready. Found ${drafts.length} active draft${drafts.length === 1 ? "" : "s"}${latestRevision ? `; latest revision is ${latestRevision.id}` : "; no immutable revision exists yet"}.`,
    structuredContent: {
      capabilities,
      databaseConfigured: true,
      drafts: drafts.map(serializeDraftMetadata),
      latestRevision: latestRevision ? serializeRevisionSummary(latestRevision) : null,
      ok: true,
    },
  };
}

async function getDraftTool(argumentsValue: Record<string, unknown>): Promise<LayoutAgentToolExecution> {
  const input = parse(draftIdInput, argumentsValue);
  const draft = await requireDraft(input.draftId);
  return {
    message: `Loaded draft “${draft.name}” at version ${draft.version}. Use this exact version for preview or save.`,
    structuredContent: {
      draft: serializeDraft(draft),
      ok: true,
      structure: summarizeManifest(draft.manifest),
    },
  };
}

async function validateDraftTool(argumentsValue: Record<string, unknown>): Promise<LayoutAgentToolExecution> {
  const input = parse(draftIdInput, argumentsValue);
  const draft = await requireDraft(input.draftId);
  const validation = validateWorkspaceLayoutManifestV3(draft.manifest);
  return {
    message: validation.ok
      ? `Draft “${draft.name}” version ${draft.version} passes all layout and contrast checks.`
      : `Draft “${draft.name}” failed validation: ${validation.errors.join(" ")}`,
    structuredContent: {
      contrast: validation.contrast,
      draftId: draft.id,
      errors: validation.ok ? [] : validation.errors,
      ok: validation.ok,
      version: draft.version,
    },
  };
}

async function diffDraftTool(argumentsValue: Record<string, unknown>): Promise<LayoutAgentToolExecution> {
  const input = parse(draftIdInput, argumentsValue);
  const draft = await requireDraft(input.draftId);
  const baseline = await resolveDraftBaseline(draft.baseRevisionId);
  const diff = diffWorkspaceLayoutManifests(baseline.manifest, draft.manifest);
  return {
    message: `Draft “${draft.name}” differs from ${baseline.label} by ${diff.added} added, ${diff.changed} changed, and ${diff.removed} removed entries.`,
    structuredContent: {
      baseline: baseline.summary,
      diff,
      draftId: draft.id,
      ok: true,
      version: draft.version,
    },
  };
}

async function createDraftTool(argumentsValue: Record<string, unknown>): Promise<LayoutAgentToolExecution> {
  const input = parse(createDraftInput, argumentsValue);
  let baseRevisionId: string | null = null;
  let manifest = cloneWorkspaceLayoutManifestV3(embeddedWorkspaceLayoutManifestV3);
  if (input.source === "latest") {
    const latest = (await listLayoutRevisions(1))[0] ?? null;
    if (latest) {
      baseRevisionId = latest.id;
      manifest = toWorkspaceLayoutManifestV3(latest.manifest);
    }
  } else if (input.source === "draft") {
    if (!input.sourceDraftId) throw new Error("sourceDraftId is required when source is draft.");
    const source = await requireDraft(input.sourceDraftId);
    baseRevisionId = source.baseRevisionId;
    manifest = cloneWorkspaceLayoutManifestV3(source.manifest);
  }
  const draft = await createLayoutDraft({
    actor: layoutAgentActor(),
    baseRevisionId,
    manifest,
    name: input.name,
  });
  return {
    message: `Created draft “${draft.name}” at version ${draft.version}. Nothing was published.`,
    structuredContent: { draft: serializeDraft(draft), ok: true },
  };
}

async function previewChangesTool(argumentsValue: Record<string, unknown>): Promise<LayoutAgentToolExecution> {
  const input = parse(previewInput, argumentsValue);
  const draft = await requireCurrentDraft(input.draftId, input.expectedVersion);
  const applied = applyWorkspaceLayoutAgentOperations(draft.manifest, input.operations);
  const diff = diffWorkspaceLayoutManifests(draft.manifest, applied.manifest);
  const validation = validateWorkspaceLayoutManifestV3(applied.manifest);
  if (!validation.ok) throw new Error(validation.errors.join(" "));
  return {
    message: `Previewed ${applied.operations.length} operation${applied.operations.length === 1 ? "" : "s"} against draft “${draft.name}” version ${draft.version}. No changes were saved.`,
    structuredContent: {
      diff,
      draftId: draft.id,
      nextStructure: summarizeManifest(applied.manifest),
      ok: true,
      operations: applied.operations,
      saved: false,
      validation: { contrast: validation.contrast, errors: [] },
      version: draft.version,
    },
  };
}

async function saveChangesTool(argumentsValue: Record<string, unknown>): Promise<LayoutAgentToolExecution> {
  const input = parse(saveInput, argumentsValue);
  const draft = await requireCurrentDraft(input.draftId, input.expectedVersion);
  const applied = applyWorkspaceLayoutAgentOperations(draft.manifest, input.operations);
  const diff = diffWorkspaceLayoutManifests(draft.manifest, applied.manifest);
  try {
    const saved = await saveLayoutDraft({
      actor: layoutAgentActor(),
      draftId: draft.id,
      expectedVersion: draft.version,
      manifest: applied.manifest,
    });
    return {
      message: `Saved ${applied.operations.length} operation${applied.operations.length === 1 ? "" : "s"} to draft “${saved.name}”. Its new version is ${saved.version}; nothing was published.`,
      structuredContent: {
        diff,
        draft: serializeDraftMetadata(saved),
        ok: true,
        operations: applied.operations,
        published: false,
      },
    };
  } catch (error) {
    if (error instanceof LayoutDraftConflictError) {
      const currentVersion = error.current?.version;
      throw new Error(currentVersion
        ? `Draft version conflict. The current version is ${currentVersion}; reload it before retrying.`
        : "Draft version conflict. Reload the draft before retrying.");
    }
    throw error;
  }
}

async function createRevisionTool(argumentsValue: Record<string, unknown>): Promise<LayoutAgentToolExecution> {
  const input = parse(createRevisionInput, argumentsValue);
  const draft = await requireCurrentDraft(input.draftId, input.expectedVersion);
  const latest = (await listLayoutRevisions(1))[0] ?? null;
  const latestId = latest?.id ?? null;
  if (draft.baseRevisionId !== latestId) {
    throw new Error("This draft is not based on the latest immutable revision. Review and rebase it in the control center before creating a revision.");
  }
  const validation = validateWorkspaceLayoutManifestV3(draft.manifest);
  if (!validation.ok) throw new Error(validation.errors.join(" "));
  const revision = await createLayoutRevision({
    actor: layoutAgentActor(),
    changeSummary: input.changeSummary,
    manifest: validation.value,
    parentRevisionId: latestId,
  });
  if (!revision) throw new Error("The revision was created but could not be reloaded.");
  return {
    message: `Created immutable revision ${revision.id} from draft “${draft.name}”. It has not been staged or published.`,
    structuredContent: {
      draftId: draft.id,
      ok: true,
      published: false,
      revision: serializeRevisionSummary(revision),
    },
  };
}

async function requireDraft(draftId: string) {
  const draft = await getLayoutDraft(draftId);
  if (!draft || draft.archivedAt) throw new Error("The requested active layout draft was not found.");
  return draft;
}

async function requireCurrentDraft(draftId: string, expectedVersion: number) {
  const draft = await requireDraft(draftId);
  if (draft.version !== expectedVersion) {
    throw new Error(`Draft version conflict. Expected ${expectedVersion}, but the current version is ${draft.version}. Reload before retrying.`);
  }
  return draft;
}

async function resolveDraftBaseline(baseRevisionId: string | null) {
  if (baseRevisionId) {
    const revision = await getLayoutRevision(baseRevisionId);
    if (revision) return {
      label: `base revision ${revision.id}`,
      manifest: revision.manifest,
      summary: serializeRevisionSummary(revision),
    };
  }
  const latest = (await listLayoutRevisions(1))[0] ?? null;
  if (latest) return {
    label: `latest revision ${latest.id}`,
    manifest: latest.manifest,
    summary: serializeRevisionSummary(latest),
  };
  return {
    label: "the embedded safe default",
    manifest: embeddedWorkspaceLayoutManifestV3,
    summary: { id: null, source: "embedded" },
  };
}

function layoutAgentActor(): LayoutActor {
  return {
    email: process.env.UI_LAYOUT_AGENT_ACTOR_EMAIL?.trim() || "layout-agent@civicresultmaps.org",
    id: process.env.UI_LAYOUT_AGENT_ACTOR_ID?.trim() || "codex-layout-agent",
  };
}

function serializeDraft(draft: Awaited<ReturnType<typeof requireDraft>>) {
  return {
    ...serializeDraftMetadata(draft),
    manifest: draft.manifest,
  };
}

function serializeDraftMetadata(draft: {
  archivedAt: Date | null;
  baseRevisionId: string | null;
  createdAt: Date;
  id: string;
  name: string;
  updatedAt: Date;
  version: number;
}) {
  return {
    archivedAt: draft.archivedAt?.toISOString() ?? null,
    baseRevisionId: draft.baseRevisionId,
    createdAt: draft.createdAt.toISOString(),
    id: draft.id,
    name: draft.name,
    updatedAt: draft.updatedAt.toISOString(),
    version: draft.version,
  };
}

function serializeRevisionSummary(revision: {
  changeSummary: string;
  createdAt: Date;
  id: string;
  manifestDigest: string;
  parentRevisionId: string | null;
  registryVersion: number;
  schemaVersion: number;
}) {
  return {
    changeSummary: revision.changeSummary,
    createdAt: revision.createdAt.toISOString(),
    id: revision.id,
    manifestDigest: revision.manifestDigest,
    parentRevisionId: revision.parentRevisionId,
    registryVersion: revision.registryVersion,
    schemaVersion: revision.schemaVersion,
  };
}

export function summarizeManifest(manifest: WorkspaceLayoutManifestV3) {
  return {
    settings: manifest.settings,
    tabs: manifest.tabs.map((tab) => ({
      groups: tab.groups.map((group) => ({
        description: group.description,
        heading: group.heading,
        id: group.id,
        locked: group.locked ?? false,
        name: group.name,
        rows: group.rows.map((row) => ({
          align: row.align,
          columns: row.columns.map((column) => ({
            id: column.id,
            locked: column.locked ?? false,
            nodes: column.items.map((node) => ({
              component: node.component,
              id: node.id,
              kind: node.kind,
              locked: node.locked ?? false,
              title: node.kind === "custom" ? node.title : undefined,
              visible: node.visible,
            })),
            span: column.span,
          })),
          gap: row.gap,
          id: row.id,
          locked: row.locked ?? false,
        })),
      })),
      id: tab.id,
      settings: tab.settings,
      visible: tab.visible,
    })),
  };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new Error(parsed.error.issues.map((issue) => {
    const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  }).join(" "));
}
