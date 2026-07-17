import assert from "node:assert/strict";
import test from "node:test";
import {
  WorkspaceLayoutAgentOperationError,
  applyWorkspaceLayoutAgentOperations,
} from "../../src/lib/workspace-layout-agent-operations.ts";
import {
  cloneWorkspaceLayoutManifestV3,
  embeddedWorkspaceLayoutManifestV3,
  flattenWorkspaceNodesV3,
  validateWorkspaceLayoutManifestV3,
} from "../../src/lib/workspace-layout-v3.ts";

test("layout agent can add and edit deterministic custom content in one validated batch", () => {
  const result = applyWorkspaceLayoutAgentOperations(embeddedWorkspaceLayoutManifestV3, [
    {
      body: "A concise explanation of this map.",
      component: "rich-text",
      name: "Reader orientation",
      operationId: "add-orientation",
      tabId: "map",
      title: "How to read this map",
      type: "add_group",
    },
    {
      nodeId: "custom-rich-text-agent-add-orientation",
      operationId: "refine-orientation",
      patch: {
        presentation: { emphasis: "prominent" },
        richText: "Use the source and coverage panels to interpret the map.",
        title: "Reading the results map",
      },
      type: "update_block",
    },
  ]);

  const group = result.manifest.tabs.find((tab) => tab.id === "map")?.groups
    .find((candidate) => candidate.id === "group-agent-add-orientation");
  const node = group?.rows[0]?.columns[0]?.items[0];
  assert.equal(group?.name, "Reader orientation");
  assert.equal(node?.id, "custom-rich-text-agent-add-orientation");
  assert.equal(node?.kind, "custom");
  assert.equal(node?.title, "Reading the results map");
  assert.equal(node?.presentation?.emphasis, "prominent");
  assert.equal(result.operations[0].createdIds.includes("group-agent-add-orientation"), true);
  assert.equal(validateWorkspaceLayoutManifestV3(result.manifest).ok, true);
});


test("layout agent balances new custom columns and rejects unsafe production spans", () => {
  const result = applyWorkspaceLayoutAgentOperations(embeddedWorkspaceLayoutManifestV3, [
    {
      component: "heading",
      name: "Two-column orientation",
      operationId: "two-column-group",
      tabId: "map",
      type: "add_group",
    },
    {
      component: "callout",
      operationId: "second-column",
      rowId: "row-agent-two-column-group",
      type: "add_column",
    },
  ]);
  const row = result.manifest.tabs.find((tab) => tab.id === "map").groups
    .find((group) => group.id === "group-agent-two-column-group").rows[0];
  assert.deepEqual(row.columns.map((column) => column.span.desktop), [6, 6]);

  const resultsMap = flattenWorkspaceNodesV3(embeddedWorkspaceLayoutManifestV3.tabs.find((tab) => tab.id === "map"))
    .find((node) => node.kind === "production" && node.component === "results-map");
  const resultsColumn = embeddedWorkspaceLayoutManifestV3.tabs.find((tab) => tab.id === "map").groups
    .flatMap((group) => group.rows).flatMap((candidate) => candidate.columns)
    .find((column) => column.items.some((node) => node.id === resultsMap.id));
  assert.throws(
    () => applyWorkspaceLayoutAgentOperations(embeddedWorkspaceLayoutManifestV3, [{
      columnId: resultsColumn.id,
      operationId: "shrink-results-map",
      patch: { desktopSpan: 3 },
      type: "update_column",
    }]),
    /not supported by every production component/i,
  );
});

test("layout agent can create a fully configured video block", () => {
  const result = applyWorkspaceLayoutAgentOperations(embeddedWorkspaceLayoutManifestV3, [{
    component: "video",
    name: "Video context",
    operationId: "video-context",
    tabId: "map",
    type: "add_group",
    video: { id: "abcde12345", provider: "youtube", title: "How to use the map" },
  }]);
  const node = result.manifest.tabs.find((tab) => tab.id === "map").groups
    .find((group) => group.id === "group-agent-video-context").rows[0].columns[0].items[0];
  assert.equal(node.component, "video");
  assert.equal(node.video.id, "abcde12345");
});

test("layout agent rejects content fields that do not belong to a custom block type", () => {
  const added = applyWorkspaceLayoutAgentOperations(embeddedWorkspaceLayoutManifestV3, [{
    component: "callout",
    name: "Typed content",
    operationId: "typed-content",
    tabId: "map",
    type: "add_group",
  }]);

  assert.throws(
    () => applyWorkspaceLayoutAgentOperations(added.manifest, [{
      nodeId: "custom-callout-agent-typed-content",
      operationId: "wrong-content-field",
      patch: { richText: "This field belongs to rich-text blocks." },
      type: "update_block",
    }]),
    /richText is only valid for rich-text blocks/i,
  );

  assert.throws(
    () => applyWorkspaceLayoutAgentOperations(embeddedWorkspaceLayoutManifestV3, [{
      component: "callout",
      items: [{ label: "Ignored item" }],
      name: "Invalid item content",
      operationId: "wrong-create-field",
      tabId: "map",
      type: "add_group",
    }]),
    /Items are only valid for metric, link, button, and accordion blocks/i,
  );
});

test("layout agent deletion removes a content block when its container remains valid", () => {
  const base = cloneWorkspaceLayoutManifestV3();
  const mapTab = base.tabs.find((tab) => tab.id === "map");
  assert.ok(mapTab);
  const destination = mapTab.groups[0].rows[0].columns[0];
  const added = applyWorkspaceLayoutAgentOperations(base, [{
    body: "Temporary orientation",
    columnId: destination.id,
    component: "callout",
    operationId: "temporary-callout",
    type: "add_block",
  }]);
  assert.equal(destination.items.length + 1, added.manifest.tabs.find((tab) => tab.id === "map").groups[0].rows[0].columns[0].items.length);

  const removed = applyWorkspaceLayoutAgentOperations(added.manifest, [{
    nodeId: "custom-callout-agent-temporary-callout",
    operationId: "remove-temporary-callout",
    type: "delete_block",
  }]);
  assert.equal(
    flattenWorkspaceNodesV3(removed.manifest.tabs.find((tab) => tab.id === "map"))
      .some((node) => node.id === "custom-callout-agent-temporary-callout"),
    false,
  );
});

test("layout agent deletion prunes empty custom containers like the visual editor", () => {
  const added = applyWorkspaceLayoutAgentOperations(embeddedWorkspaceLayoutManifestV3, [{
    component: "callout",
    name: "Temporary group",
    operationId: "single-block-group",
    tabId: "map",
    type: "add_group",
  }]);
  const removed = applyWorkspaceLayoutAgentOperations(added.manifest, [{
    nodeId: "custom-callout-agent-single-block-group",
    operationId: "delete-single-block",
    type: "delete_block",
  }]);
  const mapTab = removed.manifest.tabs.find((tab) => tab.id === "map");
  assert.equal(mapTab.groups.some((group) => group.id === "group-agent-single-block-group"), false);
});

test("layout agent protects required production components and contrast rules", () => {
  const mapTab = embeddedWorkspaceLayoutManifestV3.tabs.find((tab) => tab.id === "map");
  const required = flattenWorkspaceNodesV3(mapTab).find((node) => node.kind === "production" && node.component === "results-map");
  assert.ok(required);
  assert.throws(
    () => applyWorkspaceLayoutAgentOperations(embeddedWorkspaceLayoutManifestV3, [{
      nodeId: required.id,
      operationId: "hide-results-map",
      patch: { visible: false },
      type: "update_block",
    }]),
    /Required production components cannot be hidden/i,
  );
  assert.throws(
    () => applyWorkspaceLayoutAgentOperations(embeddedWorkspaceLayoutManifestV3, [{
      operationId: "break-accent-contrast",
      patch: { accentColor: "#101112" },
      type: "update_workspace",
    }]),
    /contrast must be at least/i,
  );
  const locked = cloneWorkspaceLayoutManifestV3();
  const lockedGroup = locked.tabs.find((tab) => tab.id === "map").groups[0];
  const lockedRowId = lockedGroup.rows[0].id;
  lockedGroup.locked = true;
  assert.throws(
    () => applyWorkspaceLayoutAgentOperations(locked, [{
      operationId: "bypass-parent-lock",
      patch: { gap: "large", locked: false },
      rowId: lockedRowId,
      type: "update_row",
    }]),
    /group is locked/i,
  );
});

test("layout agent operation failures identify their batch position", () => {
  assert.throws(
    () => applyWorkspaceLayoutAgentOperations(embeddedWorkspaceLayoutManifestV3, [{
      groupId: "group-that-does-not-exist",
      operationId: "missing-group",
      type: "delete_group",
    }]),
    (error) => {
      assert.equal(error instanceof WorkspaceLayoutAgentOperationError, true);
      assert.equal(error.operationId, "missing-group");
      assert.equal(error.operationIndex, 0);
      assert.match(error.message, /was not found/i);
      return true;
    },
  );
});
