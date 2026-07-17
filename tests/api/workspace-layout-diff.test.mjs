import assert from "node:assert/strict";
import test from "node:test";
import { diffWorkspaceLayoutManifests } from "../../src/lib/workspace-layout-diff.ts";
import { cloneWorkspaceLayoutManifestV3 } from "../../src/lib/workspace-layout-v3.ts";

test("revision diff reports token changes and keyed reorder operations", () => {
  const before = cloneWorkspaceLayoutManifestV3();
  const after = cloneWorkspaceLayoutManifestV3();
  after.settings.accentColor = "#ffcc00";
  after.tabs[0].groups.reverse();
  const diff = diffWorkspaceLayoutManifests(before, after);
  assert.equal(diff.changed >= 1, true);
  assert.equal(diff.entries.some((entry) => entry.path === "settings.accentColor"), true);
});

test("revision diff normalizes v2 and v3 manifests before comparison", async () => {
  const { embeddedWorkspaceLayoutManifestV2 } = await import("../../src/lib/workspace-layout-v2.ts");
  const v3 = cloneWorkspaceLayoutManifestV3();
  const diff = diffWorkspaceLayoutManifests(embeddedWorkspaceLayoutManifestV2, v3);
  assert.equal(diff.entries.length, 0);
});
