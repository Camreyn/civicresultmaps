import assert from "node:assert/strict";
import test from "node:test";
import {
  cloneWorkspaceLayoutManifest,
  embeddedWorkspaceLayoutManifest,
  resolveVisibleWorkspaceTab,
  validateWorkspaceLayoutManifest,
  workspaceLayoutRegistry,
  workspaceSectionState,
} from "../../src/lib/workspace-layout.ts";

test("embedded workspace layout exactly matches the code-owned registry", () => {
  const result = validateWorkspaceLayoutManifest(embeddedWorkspaceLayoutManifest);
  assert.equal(result.ok, true);
  assert.deepEqual(
    embeddedWorkspaceLayoutManifest.tabs.map((tab) => tab.id),
    workspaceLayoutRegistry.map((tab) => tab.id),
  );
  assert.equal(embeddedWorkspaceLayoutManifest.tabs.every((tab) => tab.visible), true);
});

test("layout manifests may reorder registered tabs and sections", () => {
  const manifest = cloneWorkspaceLayoutManifest();
  manifest.tabs.reverse();
  const review = manifest.tabs.find((tab) => tab.id === "review");
  assert.ok(review);
  review.sections.reverse();

  const result = validateWorkspaceLayoutManifest(manifest);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.tabs[0].id, "contact");
  assert.deepEqual(workspaceSectionState(manifest, "review", "methodology"), {
    order: 0,
    visible: true,
  });
});

test("required trust surfaces cannot be hidden", () => {
  const hiddenMap = cloneWorkspaceLayoutManifest();
  hiddenMap.tabs.find((tab) => tab.id === "map").visible = false;
  const mapResult = validateWorkspaceLayoutManifest(hiddenMap);
  assert.equal(mapResult.ok, false);
  assert.match(mapResult.errors.join(" "), /Required tab Map cannot be hidden/);

  const hiddenProvenance = cloneWorkspaceLayoutManifest();
  hiddenProvenance.tabs
    .find((tab) => tab.id === "data")
    .sections.find((section) => section.id === "source-provenance").visible = false;
  const provenanceResult = validateWorkspaceLayoutManifest(hiddenProvenance);
  assert.equal(provenanceResult.ok, false);
  assert.match(provenanceResult.errors.join(" "), /Required section Source Provenance cannot be hidden/);
});

test("visible tabs retain at least one visible section", () => {
  const manifest = cloneWorkspaceLayoutManifest();
  const history = manifest.tabs.find((tab) => tab.id === "history");
  assert.ok(history);
  history.sections.forEach((section) => { section.visible = false; });

  const result = validateWorkspaceLayoutManifest(manifest);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /Visible tab history must contain at least one visible section/);

  history.visible = false;
  assert.equal(validateWorkspaceLayoutManifest(manifest).ok, true);
});

test("unknown, duplicate, and missing registry entries are rejected", () => {
  const manifest = cloneWorkspaceLayoutManifest();
  manifest.tabs[0].id = "unknown";
  manifest.tabs.push(structuredClone(manifest.tabs[1]));

  const result = validateWorkspaceLayoutManifest(manifest);
  assert.equal(result.ok, false);
  const errors = result.errors.join(" ");
  assert.match(errors, /Unknown tab id: unknown/);
  assert.match(errors, /appears more than once/);
  assert.match(errors, /Tab map is missing/);
});

test("hidden and unknown requested tabs fall back to Map", () => {
  const manifest = cloneWorkspaceLayoutManifest();
  manifest.tabs.find((tab) => tab.id === "history").visible = false;

  assert.equal(resolveVisibleWorkspaceTab(manifest, "review"), "review");
  assert.equal(resolveVisibleWorkspaceTab(manifest, "history"), "map");
  assert.equal(resolveVisibleWorkspaceTab(manifest, "not-a-tab"), "map");
  assert.equal(resolveVisibleWorkspaceTab(manifest), "map");
});
