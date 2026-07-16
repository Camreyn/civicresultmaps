import assert from "node:assert/strict";
import test from "node:test";
import {
  cloneWorkspaceLayoutManifest,
  createWorkspaceCustomBlock,
  embeddedWorkspaceLayoutManifest,
  inspectWorkspaceLayoutManifest,
  resolveVisibleWorkspaceTab,
  validateWorkspaceLayoutManifest,
  workspaceCustomBlocks,
  workspaceLayoutSettings,
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
    presentation: undefined,
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
test("legacy schema-v1 manifests remain valid without optional builder settings", () => {
  const manifest = cloneWorkspaceLayoutManifest();
  delete manifest.settings;
  manifest.tabs.forEach((tab) => {
    delete tab.settings;
    tab.sections.forEach((section) => { delete section.presentation; });
  });

  assert.equal(validateWorkspaceLayoutManifest(manifest).ok, true);
  assert.deepEqual(workspaceLayoutSettings(manifest), {
    contentWidth: "wide",
    defaultTab: "map",
    notesDefault: "collapsed",
    tabStyle: "bar",
    theme: "civic",
  });
});

test("approved custom blocks and responsive presentation settings validate", () => {
  const manifest = cloneWorkspaceLayoutManifest();
  manifest.settings = {
    contentWidth: "full",
    defaultTab: "history",
    notesDefault: "expanded",
    tabStyle: "pills",
    theme: "warm",
  };
  const history = manifest.tabs.find((tab) => tab.id === "history");
  assert.ok(history);
  history.settings = { density: "spacious", notesPosition: "below" };
  history.sections[0].presentation = {
    density: "compact",
    emphasis: "prominent",
    surface: "accent",
  };
  const narrative = createWorkspaceCustomBlock("narrative", 7);
  narrative.presentation.span = { desktop: 6, mobile: 12, tablet: 6 };
  history.sections.push(narrative);

  const result = validateWorkspaceLayoutManifest(manifest);
  assert.equal(result.ok, true);
  assert.equal(workspaceCustomBlocks(manifest, "history")[0].id, "custom-narrative-7");
  assert.equal(workspaceSectionState(manifest, "history", "historical-summary").presentation.surface, "accent");
  assert.equal(resolveVisibleWorkspaceTab(manifest), "history");
});

test("custom blocks are supplemental, bounded, and restricted to safe links", () => {
  const unsafeLink = cloneWorkspaceLayoutManifest();
  const history = unsafeLink.tabs.find((tab) => tab.id === "history");
  assert.ok(history);
  const linkList = createWorkspaceCustomBlock("link-list", 8);
  linkList.items[0].href = "//example.invalid/escape";
  history.sections.push(linkList);
  const unsafeResult = validateWorkspaceLayoutManifest(unsafeLink);
  assert.equal(unsafeResult.ok, false);
  assert.match(unsafeResult.errors.join(" "), /must use \/, https:\/\//);

  const interleaved = cloneWorkspaceLayoutManifest();
  interleaved.tabs
    .find((tab) => tab.id === "history")
    .sections.unshift(createWorkspaceCustomBlock("callout", 9));
  const orderResult = validateWorkspaceLayoutManifest(interleaved);
  assert.equal(orderResult.ok, false);
  assert.match(orderResult.errors.join(" "), /must appear before custom blocks/);

  const invalidSpan = cloneWorkspaceLayoutManifest();
  invalidSpan.tabs.find((tab) => tab.id === "history").sections[0].presentation = {
    span: { desktop: 5 },
  };
  const spanResult = validateWorkspaceLayoutManifest(invalidSpan);
  assert.equal(spanResult.ok, false);
  assert.match(spanResult.errors.join(" "), /desktop span must be 4, 6, 8, or 12/);
});

test("visible tabs retain a visible production section and defaults stay visible", () => {
  const manifest = cloneWorkspaceLayoutManifest();
  const history = manifest.tabs.find((tab) => tab.id === "history");
  assert.ok(history);
  history.sections.forEach((section) => { section.visible = false; });
  history.sections.push(createWorkspaceCustomBlock("narrative", 10));
  manifest.settings.defaultTab = "history";

  const result = validateWorkspaceLayoutManifest(manifest);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /must retain at least one visible production section/);

  history.visible = false;
  const hiddenDefaultResult = validateWorkspaceLayoutManifest(manifest);
  assert.equal(hiddenDefaultResult.ok, false);
  assert.match(hiddenDefaultResult.errors.join(" "), /defaultTab must reference a visible tab/);
});

test("pre-publish inspection identifies editorial review and protected surfaces", () => {
  const manifest = cloneWorkspaceLayoutManifest();
  manifest.tabs
    .find((tab) => tab.id === "history")
    .sections.push(createWorkspaceCustomBlock("callout", 11));

  const issues = inspectWorkspaceLayoutManifest(manifest);
  assert.equal(issues.some((issue) => issue.id.startsWith("editorial-history-") && issue.severity === "warning"), true);
  assert.equal(issues.some((issue) => issue.id === "required-surfaces" && issue.severity === "info"), true);
});
