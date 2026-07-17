import assert from "node:assert/strict";
import test from "node:test";
import {
  cloneWorkspaceLayoutManifestV3,
  defaultWorkspaceLayoutSettingsV3,
  embeddedWorkspaceLayoutManifestV3,
  isWorkspaceGroupCustomOnlyV3,
  toWorkspaceLayoutManifestV3,
  validateWorkspaceLayoutManifestV3,
  workspaceLayoutManifestV3ToV2,
  workspaceStarterGroupTemplatesV3,
} from "../../src/lib/workspace-layout-v3.ts";
import { embeddedWorkspaceLayoutManifestV2 } from "../../src/lib/workspace-layout-v2.ts";
import {
  createWorkspaceLayoutEnvelope,
  validateWorkspaceLayoutEnvelope,
} from "../../src/lib/workspace-layout-digest.ts";
import { workspaceRuntimeGroupsV3 } from "../../src/lib/workspace-layout-v3-runtime.ts";

test("schema v3 defaults match the public workspace palette", () => {
  assert.deepEqual({
    accent: defaultWorkspaceLayoutSettingsV3.accentColor,
    background: defaultWorkspaceLayoutSettingsV3.backgroundColor,
    foreground: defaultWorkspaceLayoutSettingsV3.textColor,
    muted: defaultWorkspaceLayoutSettingsV3.mutedTextColor,
    surface: defaultWorkspaceLayoutSettingsV3.surfaceColor,
  }, {
    accent: "#35c7a3",
    background: "#101112",
    foreground: "#f4f1ea",
    muted: "#a9aaa4",
    surface: "#171918",
  });
  const validation = validateWorkspaceLayoutManifestV3(embeddedWorkspaceLayoutManifestV3);
  assert.equal(validation.ok, true, validation.ok ? "" : validation.errors.join("\n"));
  assert.equal(validation.contrast.every((result) => result.ok), true);
});

test("v2 upgrades are deterministic and retain compatibility structure", () => {
  const first = toWorkspaceLayoutManifestV3(embeddedWorkspaceLayoutManifestV2);
  const second = toWorkspaceLayoutManifestV3(embeddedWorkspaceLayoutManifestV2);
  assert.deepEqual(first, second);
  assert.equal(first.tabs.every((tab) => tab.groups.length === 1), true);
  assert.equal(JSON.stringify(workspaceLayoutManifestV3ToV2(first).tabs), JSON.stringify(embeddedWorkspaceLayoutManifestV2.tabs));
});

test("weak design-token contrast and unknown fields fail closed", () => {
  const weak = cloneWorkspaceLayoutManifestV3();
  weak.settings.textColor = weak.settings.backgroundColor;
  const contrast = validateWorkspaceLayoutManifestV3(weak);
  assert.equal(contrast.ok, false);
  assert.match(contrast.errors.join(" "), /contrast/i);

  const unknown = cloneWorkspaceLayoutManifestV3();
  unknown.tabs[0].groups[0].unsafeHtml = "<script>";
  const shape = validateWorkspaceLayoutManifestV3(unknown);
  assert.equal(shape.ok, false);
  assert.match(shape.errors.join(" "), /unsupported fields/i);
});

test("starter groups remain custom-only and public runtime projection keeps headings", () => {
  assert.equal(workspaceStarterGroupTemplatesV3.every((template) => isWorkspaceGroupCustomOnlyV3(template.group)), true);
  const manifest = cloneWorkspaceLayoutManifestV3();
  const group = structuredClone(workspaceStarterGroupTemplatesV3[0].group);
  group.heading = "How to read this view";
  manifest.tabs.find((tab) => tab.id === "map").groups.push(group);
  const runtime = workspaceRuntimeGroupsV3(manifest, "map", { state: "WA", year: 2024 });
  assert.equal(runtime.some((item) => item.heading === "How to read this view"), true);
});

test("schema v3 envelopes retain version metadata and detect tampering", () => {
  const envelope = createWorkspaceLayoutEnvelope({
    manifest: embeddedWorkspaceLayoutManifestV3,
    publishedAt: "2026-07-16T00:00:00.000Z",
    revisionId: "v3-test",
  });
  assert.equal(envelope.schemaVersion, 3);
  assert.equal(validateWorkspaceLayoutEnvelope(envelope).ok, true);
  const tampered = structuredClone(envelope);
  tampered.manifest.settings.accentColor = "#ffffff";
  assert.equal(validateWorkspaceLayoutEnvelope(tampered).ok, false);
});
