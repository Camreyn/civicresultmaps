import { createHash } from "node:crypto";
import type { WorkspaceLayoutEnvelopeV1, WorkspaceLayoutManifestV1 } from "./workspace-layout.ts";
import {
  WORKSPACE_LAYOUT_REGISTRY_VERSION,
  WORKSPACE_LAYOUT_SCHEMA_VERSION,
  validateWorkspaceLayoutManifest,
} from "./workspace-layout.ts";

export function workspaceLayoutDigest(manifest: WorkspaceLayoutManifestV1) {
  return createHash("sha256").update(stableJsonStringify(manifest)).digest("hex");
}

export function createWorkspaceLayoutEnvelope(input: {
  manifest: WorkspaceLayoutManifestV1;
  publishedAt?: string;
  revisionId: string;
}): WorkspaceLayoutEnvelopeV1 {
  return {
    schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
    registryVersion: WORKSPACE_LAYOUT_REGISTRY_VERSION,
    revisionId: input.revisionId,
    manifestDigest: workspaceLayoutDigest(input.manifest),
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    manifest: input.manifest,
  };
}

export type WorkspaceLayoutEnvelopeValidationResult =
  | { ok: true; value: WorkspaceLayoutEnvelopeV1 }
  | { ok: false; errors: string[] };

export function validateWorkspaceLayoutEnvelope(value: unknown): WorkspaceLayoutEnvelopeValidationResult {
  if (!isRecord(value)) {
    return { ok: false, errors: ["Layout envelope must be an object."] };
  }

  const errors: string[] = [];
  if (value.schemaVersion !== WORKSPACE_LAYOUT_SCHEMA_VERSION) {
    errors.push(`Envelope schemaVersion must be ${WORKSPACE_LAYOUT_SCHEMA_VERSION}.`);
  }
  if (value.registryVersion !== WORKSPACE_LAYOUT_REGISTRY_VERSION) {
    errors.push(`Envelope registryVersion must be ${WORKSPACE_LAYOUT_REGISTRY_VERSION}.`);
  }
  if (typeof value.revisionId !== "string" || !value.revisionId.trim()) {
    errors.push("Envelope revisionId is required.");
  }
  if (typeof value.publishedAt !== "string" || Number.isNaN(Date.parse(value.publishedAt))) {
    errors.push("Envelope publishedAt must be an ISO date string.");
  }
  if (typeof value.manifestDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.manifestDigest)) {
    errors.push("Envelope manifestDigest must be a SHA-256 hex digest.");
  }

  const manifestResult = validateWorkspaceLayoutManifest(value.manifest);
  if (!manifestResult.ok) {
    errors.push(...manifestResult.errors);
  } else if (value.manifestDigest !== workspaceLayoutDigest(manifestResult.value)) {
    errors.push("Envelope manifestDigest does not match the manifest.");
  }

  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: value as WorkspaceLayoutEnvelopeV1 };
}

export function stableJsonStringify(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
