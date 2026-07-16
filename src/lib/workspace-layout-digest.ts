import { createHash } from "node:crypto";
import type { WorkspaceLayoutEnvelopeV1, WorkspaceLayoutManifestV1 } from "./workspace-layout.ts";
import {
  WORKSPACE_LAYOUT_REGISTRY_VERSION,
  WORKSPACE_LAYOUT_SCHEMA_VERSION,
  validateWorkspaceLayoutManifest,
} from "./workspace-layout.ts";
import {
  WORKSPACE_LAYOUT_REGISTRY_VERSION_V2,
  WORKSPACE_LAYOUT_SCHEMA_VERSION_V2,
  validateWorkspaceLayoutManifestV2,
  type WorkspaceLayoutEnvelope,
  type WorkspaceLayoutEnvelopeV2,
  type WorkspaceLayoutManifest,
  type WorkspaceLayoutManifestV2,
} from "./workspace-layout-v2.ts";

export function workspaceLayoutDigest(manifest: WorkspaceLayoutManifest) {
  return createHash("sha256").update(stableJsonStringify(manifest)).digest("hex");
}

export function createWorkspaceLayoutEnvelope(input: {
  manifest: WorkspaceLayoutManifestV2;
  publishedAt?: string;
  revisionId: string;
}): WorkspaceLayoutEnvelopeV2;
export function createWorkspaceLayoutEnvelope(input: {
  manifest: WorkspaceLayoutManifestV1;
  publishedAt?: string;
  revisionId: string;
}): WorkspaceLayoutEnvelopeV1;
export function createWorkspaceLayoutEnvelope(input: {
  manifest: WorkspaceLayoutManifest;
  publishedAt?: string;
  revisionId: string;
}): WorkspaceLayoutEnvelope;
export function createWorkspaceLayoutEnvelope(input: {
  manifest: WorkspaceLayoutManifest;
  publishedAt?: string;
  revisionId: string;
}): WorkspaceLayoutEnvelope {
  return {
    schemaVersion: input.manifest.schemaVersion,
    registryVersion: input.manifest.registryVersion,
    revisionId: input.revisionId,
    manifestDigest: workspaceLayoutDigest(input.manifest),
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    manifest: input.manifest,
  } as WorkspaceLayoutEnvelope;
}

export type WorkspaceLayoutEnvelopeValidationResult =
  | { ok: true; value: WorkspaceLayoutEnvelope }
  | { ok: false; errors: string[] };

export function validateWorkspaceLayoutEnvelope(value: unknown): WorkspaceLayoutEnvelopeValidationResult {
  if (!isRecord(value)) {
    return { ok: false, errors: ["Layout envelope must be an object."] };
  }

  const errors: string[] = [];
  const versionPair = layoutVersionPair(value.manifest);
  if (!versionPair) {
    errors.push(`Envelope manifest schemaVersion must be ${WORKSPACE_LAYOUT_SCHEMA_VERSION} or ${WORKSPACE_LAYOUT_SCHEMA_VERSION_V2}.`);
  } else {
    if (value.schemaVersion !== versionPair.schemaVersion) {
      errors.push(`Envelope schemaVersion must match manifest schemaVersion ${versionPair.schemaVersion}.`);
    }
    if (value.registryVersion !== versionPair.registryVersion) {
      errors.push(`Envelope registryVersion must match manifest registryVersion ${versionPair.registryVersion}.`);
    }
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

  const manifestResult = validateWorkspaceLayoutManifestAny(value.manifest);
  if (!manifestResult.ok) {
    errors.push(...manifestResult.errors);
  } else if (value.manifestDigest !== workspaceLayoutDigest(manifestResult.value)) {
    errors.push("Envelope manifestDigest does not match the manifest.");
  }

  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: value as WorkspaceLayoutEnvelope };
}

export type WorkspaceLayoutManifestValidationResult =
  | { ok: true; value: WorkspaceLayoutManifest }
  | { ok: false; errors: string[] };

export function validateWorkspaceLayoutManifestAny(value: unknown): WorkspaceLayoutManifestValidationResult {
  if (isRecord(value) && value.schemaVersion === WORKSPACE_LAYOUT_SCHEMA_VERSION_V2) {
    return validateWorkspaceLayoutManifestV2(value);
  }
  return validateWorkspaceLayoutManifest(value);
}

export function stableJsonStringify(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function layoutVersionPair(value: unknown) {
  if (!isRecord(value)) return null;
  if (value.schemaVersion === WORKSPACE_LAYOUT_SCHEMA_VERSION_V2 && value.registryVersion === WORKSPACE_LAYOUT_REGISTRY_VERSION_V2) {
    return { registryVersion: WORKSPACE_LAYOUT_REGISTRY_VERSION_V2, schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION_V2 };
  }
  if (value.schemaVersion === WORKSPACE_LAYOUT_SCHEMA_VERSION && value.registryVersion === WORKSPACE_LAYOUT_REGISTRY_VERSION) {
    return { registryVersion: WORKSPACE_LAYOUT_REGISTRY_VERSION, schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION };
  }
  return null;
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
