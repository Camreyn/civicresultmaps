import assert from "node:assert/strict";
import test from "node:test";
import {
  cloneWorkspaceLayoutManifestV2,
  createWorkspaceCustomNodeV2,
  embeddedWorkspaceLayoutManifestV2,
  evaluateWorkspaceVisibility,
  isSafeWorkspaceBlobUrl,
  toWorkspaceLayoutManifestV2,
  validateWorkspaceLayoutManifestV2,
  workspaceStarterTemplates,
} from "../../src/lib/workspace-layout-v2.ts";
import { embeddedWorkspaceLayoutManifest } from "../../src/lib/workspace-layout.ts";
import {
  closeWorkspaceLayoutHistoryGroup,
  commitWorkspaceLayoutHistory,
  createWorkspaceLayoutHistory,
  redoWorkspaceLayoutHistory,
  undoWorkspaceLayoutHistory,
} from "../../src/lib/workspace-layout-history.ts";
import {
  createWorkspaceLayoutEnvelope,
  validateWorkspaceLayoutEnvelope,
} from "../../src/lib/workspace-layout-digest.ts";
import {
  reviewViewConfigurationV2,
  workspaceCustomRowsV2,
  workspaceSectionStateV2,
} from "../../src/lib/workspace-layout-v2-runtime.ts";

test("continuous color updates are one undoable history action", () => {
  let history = createWorkspaceLayoutHistory(embeddedWorkspaceLayoutManifestV2);
  history = commitWorkspaceLayoutHistory(history, (manifest) => ({
    ...manifest,
    settings: { ...manifest.settings, accentColor: "#123456" },
  }), "workspace:accent-color");
  history = commitWorkspaceLayoutHistory(history, (manifest) => ({
    ...manifest,
    settings: { ...manifest.settings, accentColor: "#abcdef" },
  }), "workspace:accent-color");

  assert.equal(history.entries.length, 2);
  assert.equal(history.index, 1);
  assert.equal(history.entries[history.index].settings.accentColor, "#abcdef");

  history = closeWorkspaceLayoutHistoryGroup(history);
  history = undoWorkspaceLayoutHistory(history);
  assert.equal(history.index, 0);
  assert.equal(history.entries[history.index].settings.accentColor, undefined);

  history = redoWorkspaceLayoutHistory(history);
  assert.equal(history.index, 1);
  assert.equal(history.entries[history.index].settings.accentColor, "#abcdef");

  history = commitWorkspaceLayoutHistory(history, (manifest) => ({
    ...manifest,
    settings: { ...manifest.settings, accentColor: "#fedcba" },
  }), "workspace:accent-color");
  assert.equal(history.entries.length, 3);
});

test("the embedded v2 manifest and every starter template are structurally valid", () => {
  assert.equal(validateWorkspaceLayoutManifestV2(embeddedWorkspaceLayoutManifestV2).ok, true);
  assert.equal(workspaceStarterTemplates.length, 3);
  for (const template of workspaceStarterTemplates) {
    const validation = validateWorkspaceLayoutManifestV2(template.manifest);
    assert.equal(validation.ok, true, validation.ok ? "" : validation.errors.join("\n"));
  }
});

test("v1 revisions upgrade deterministically without mutating the original", () => {
  const legacy = structuredClone(embeddedWorkspaceLayoutManifest);
  const snapshot = JSON.stringify(legacy);
  const upgraded = toWorkspaceLayoutManifestV2(legacy);
  assert.equal(upgraded.schemaVersion, 2);
  assert.equal(upgraded.registryVersion, 2);
  assert.equal(validateWorkspaceLayoutManifestV2(upgraded).ok, true);
  assert.equal(JSON.stringify(legacy), snapshot);
  assert.equal(upgraded.tabs.find((tab) => tab.id === "review")?.rows[0].columns[0].items[0].component, "review-center");
});

test("required production components cannot be hidden or made conditional", () => {
  const hidden = cloneWorkspaceLayoutManifestV2(embeddedWorkspaceLayoutManifestV2);
  const map = hidden.tabs.find((tab) => tab.id === "map");
  const resultMap = map.rows[0].columns[0].items[0];
  resultMap.visible = false;
  const hiddenValidation = validateWorkspaceLayoutManifestV2(hidden);
  assert.equal(hiddenValidation.ok, false);
  assert.match(hiddenValidation.errors.join(" "), /required|visible/i);

  const conditional = cloneWorkspaceLayoutManifestV2(embeddedWorkspaceLayoutManifestV2);
  conditional.tabs.find((tab) => tab.id === "map").rows[0].columns[0].items[0].visibility = {
    groups: [{ conditions: [{ fact: "state", operator: "equals", value: "WA" }], operator: "all" }],
  };
  const conditionalValidation = validateWorkspaceLayoutManifestV2(conditional);
  assert.equal(conditionalValidation.ok, false);
  assert.match(conditionalValidation.errors.join(" "), /visibility rules|condition/i);
});

test("visibility groups evaluate allowlisted public data facts", () => {
  const visibility = {
    groups: [
      {
        conditions: [
          { fact: "state", operator: "in", value: ["WA", "OR"] },
          { fact: "data", key: "turnout", operator: "available" },
        ],
        operator: "all",
      },
    ],
    operator: "all",
  };
  assert.equal(evaluateWorkspaceVisibility(visibility, {
    data: { turnout: true },
    state: "WA",
    year: 2024,
  }), true);
  assert.equal(evaluateWorkspaceVisibility(visibility, {
    data: { turnout: false },
    state: "WA",
    year: 2024,
  }), false);
  const manifest = cloneWorkspaceLayoutManifestV2(embeddedWorkspaceLayoutManifestV2);
  const coverage = manifest.tabs.find((tab) => tab.id === "map").rows[0].columns[1].items
    .find((node) => node.component === "coverage-context");
  coverage.visibility = visibility;
  assert.equal(workspaceSectionStateV2(manifest, "map", "coverage-context", {
    data: { turnout: false },
    state: "WA",
    year: 2024,
  }).visible, false);
  assert.equal(workspaceSectionStateV2(manifest, "map", "coverage-context", {
    data: { turnout: true },
    state: "WA",
    year: 2024,
  }).visible, true);
});

test("visibility rules reject unknown public-data keys", () => {
  const manifest = cloneWorkspaceLayoutManifestV2(embeddedWorkspaceLayoutManifestV2);
  const custom = createWorkspaceCustomNodeV2("callout");
  custom.visibility = {
    groups: [{ conditions: [{ fact: "data", key: "private-record", operator: "available" }], operator: "all" }],
  };
  manifest.tabs.find((tab) => tab.id === "map").rows[0].columns[1].items.push(custom);
  const validation = validateWorkspaceLayoutManifestV2(manifest);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join(" "), /unsupported data visibility key/i);
});

test("managed image URLs are restricted to the layout-media Blob namespace", () => {
  assert.equal(isSafeWorkspaceBlobUrl("https://example.public.blob.vercel-storage.com/layout-media/map.webp"), true);
  assert.equal(isSafeWorkspaceBlobUrl("https://example.public.blob.vercel-storage.com/other/map.webp"), false);
  assert.equal(isSafeWorkspaceBlobUrl("https://example.com/layout-media/map.webp"), false);
});

test("custom runtime rows preserve column placement and conditional visibility", () => {
  const manifest = cloneWorkspaceLayoutManifestV2(embeddedWorkspaceLayoutManifestV2);
  const mapRow = manifest.tabs.find((tab) => tab.id === "map").rows[0];
  const custom = createWorkspaceCustomNodeV2("callout");
  custom.visibility = {
    groups: [{ conditions: [{ fact: "data", key: "historical", operator: "available" }], operator: "all" }],
  };
  mapRow.columns[1].items.push(custom);

  assert.equal(workspaceCustomRowsV2(manifest, "map", {
    data: { historical: false },
    state: "WA",
    year: 2024,
  }).length, 0);

  const rows = workspaceCustomRowsV2(manifest, "map", {
    data: { historical: true },
    state: "WA",
    year: 2024,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].columns.length, mapRow.columns.length);
  assert.equal(rows[0].columns[0].items.length, 0);
  assert.equal(rows[0].columns[1].items[0].id, custom.id);
});

test("v2 envelopes retain version metadata and detect tampering", () => {
  const envelope = createWorkspaceLayoutEnvelope({
    manifest: embeddedWorkspaceLayoutManifestV2,
    publishedAt: "2026-07-16T00:00:00.000Z",
    revisionId: "v2-test",
  });
  assert.equal(envelope.schemaVersion, 2);
  assert.equal(validateWorkspaceLayoutEnvelope(envelope).ok, true);
  const tampered = structuredClone(envelope);
  tampered.manifest.settings.theme = "warm";
  assert.equal(validateWorkspaceLayoutEnvelope(tampered).ok, false);
});

test("review configuration validates known ordered views and honors the configured default", () => {
  const manifest = cloneWorkspaceLayoutManifestV2(embeddedWorkspaceLayoutManifestV2);
  const reviewNode = manifest.tabs.find((tab) => tab.id === "review").rows
    .flatMap((row) => row.columns).flatMap((column) => column.items)
    .find((node) => node.kind === "production" && node.component === "review-center");
  reviewNode.config = {
    ...reviewNode.config,
    defaultView: "indicators",
    viewOrder: ["overview", "evidence-tools", "indicators", "screening", "methodology"],
    visibleViews: ["overview", "indicators", "methodology"],
  };
  assert.equal(validateWorkspaceLayoutManifestV2(manifest).ok, true);
  assert.deepEqual(reviewViewConfigurationV2(manifest), {
    defaultView: "indicators",
    navigationStyle: "tabs",
    viewOrder: ["overview", "indicators", "methodology"],
  });
});

test("review configuration rejects unknown, duplicate, empty, and hidden defaults", () => {
  const invalidConfigs = [
    { viewOrder: ["overview", "evidence-tools", "indicators", "screening", "unknown"] },
    { viewOrder: ["overview", "evidence-tools", "indicators", "screening", "screening"] },
    { visibleViews: [] },
    { defaultView: "screening", visibleViews: ["overview", "indicators"] },
  ];
  for (const config of invalidConfigs) {
    const manifest = cloneWorkspaceLayoutManifestV2(embeddedWorkspaceLayoutManifestV2);
    const reviewNode = manifest.tabs.find((tab) => tab.id === "review").rows
      .flatMap((row) => row.columns).flatMap((column) => column.items)
      .find((node) => node.kind === "production" && node.component === "review-center");
    reviewNode.config = { ...reviewNode.config, ...config };
    const validation = validateWorkspaceLayoutManifestV2(manifest);
    assert.equal(validation.ok, false);
    assert.match(validation.errors.join(" "), /review/i);
  }
});
