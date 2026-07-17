import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKSPACE_LAYOUT_HISTORY_LIMIT,
  createWorkspaceLayoutEditorState,
  duplicateWorkspaceNodeV3,
  moveWorkspaceColumnV3,
  moveWorkspaceGroupV3,
  moveWorkspaceRowV3,
  moveWorkspaceNodeV3,
  setWorkspaceNodeLockV3,
  workspaceLayoutEditorReducer,
} from "../../src/lib/workspace-layout-editor-reducer.ts";
import {
  cloneWorkspaceLayoutManifestV3,
  embeddedWorkspaceLayoutManifestV3,
} from "../../src/lib/workspace-layout-v3.ts";
import { createWorkspaceCustomNodeV2 } from "../../src/lib/workspace-layout-v2.ts";

function commit(state, updater, groupKey) {
  return workspaceLayoutEditorReducer(state, { groupKey, type: "commit", updater });
}

test("one change produces exactly one undo and redo step", () => {
  let state = createWorkspaceLayoutEditorState(embeddedWorkspaceLayoutManifestV3);
  state = commit(state, (manifest) => ({ ...manifest, settings: { ...manifest.settings, accentColor: "#123456" } }));
  assert.equal(state.past.length, 1);
  state = workspaceLayoutEditorReducer(state, { type: "undo" });
  assert.equal(state.present.settings.accentColor, "#35c7a3");
  assert.equal(state.past.length, 0);
  const unchanged = workspaceLayoutEditorReducer(state, { type: "undo" });
  assert.deepEqual(unchanged.present, state.present);
  state = workspaceLayoutEditorReducer(state, { type: "redo" });
  assert.equal(state.present.settings.accentColor, "#123456");
});

test("continuous color input is grouped into one history entry", () => {
  let state = createWorkspaceLayoutEditorState(embeddedWorkspaceLayoutManifestV3);
  for (const color of ["#123456", "#234567", "#345678"]) {
    state = commit(state, (manifest) => ({ ...manifest, settings: { ...manifest.settings, accentColor: color } }), "workspace:accentColor");
  }
  assert.equal(state.past.length, 1);
  assert.equal(state.present.settings.accentColor, "#345678");
  state = workspaceLayoutEditorReducer(state, { type: "close-group" });
  state = workspaceLayoutEditorReducer(state, { type: "undo" });
  assert.equal(state.present.settings.accentColor, "#35c7a3");
});

test("history is capped and rebase does not invent undo entries", () => {
  let state = createWorkspaceLayoutEditorState(embeddedWorkspaceLayoutManifestV3);
  for (let index = 0; index < WORKSPACE_LAYOUT_HISTORY_LIMIT + 25; index += 1) {
    state = commit(state, (manifest) => ({ ...manifest, settings: { ...manifest.settings, notesDefault: manifest.settings.notesDefault === "collapsed" ? "expanded" : "collapsed" } }));
  }
  assert.equal(state.past.length, WORKSPACE_LAYOUT_HISTORY_LIMIT);
  const count = state.past.length;
  state = workspaceLayoutEditorReducer(state, { type: "rebase" });
  assert.equal(state.past.length, count);
  assert.deepEqual(state.baseline, state.present);
});

test("required components are permanently locked and cannot move", () => {
  const manifest = cloneWorkspaceLayoutManifestV3();
  const map = manifest.tabs.find((tab) => tab.id === "map");
  const rows = map.groups[0].rows;
  const required = rows.flatMap((row) => row.columns).flatMap((column) => column.items)
    .find((node) => node.kind === "production" && node.component === "results-map");
  const destination = rows.flatMap((row) => row.columns).find((column) => !column.items.some((node) => node.id === required.id));
  assert.ok(required && destination);
  const unlocked = setWorkspaceNodeLockV3(manifest, required.id, false);
  const lockedNode = unlocked.tabs.flatMap((tab) => tab.groups).flatMap((group) => group.rows)
    .flatMap((row) => row.columns).flatMap((column) => column.items).find((node) => node.id === required.id);
  assert.equal(lockedNode.locked, true);
  assert.deepEqual(moveWorkspaceNodeV3(unlocked, required.id, destination.id, 0), unlocked);
});

test("only custom components duplicate", () => {
  const manifest = cloneWorkspaceLayoutManifestV3();
  const map = manifest.tabs.find((tab) => tab.id === "map");
  const column = map.groups[0].rows[0].columns[0];
  const production = column.items[0];
  assert.deepEqual(duplicateWorkspaceNodeV3(manifest, production.id), manifest);
  const custom = createWorkspaceCustomNodeV2("callout", "custom-callout-test");
  column.items.push(custom);
  const duplicated = duplicateWorkspaceNodeV3(manifest, custom.id);
  assert.equal(duplicated.tabs.find((tab) => tab.id === "map").groups[0].rows[0].columns[0].items.length, column.items.length + 1);
});
test("invalid drag destinations never remove source content", () => {
  const manifest = cloneWorkspaceLayoutManifestV3();
  const map = manifest.tabs.find((tab) => tab.id === "map");
  assert.ok(map);

  const makeNode = (id) => createWorkspaceCustomNodeV2("callout", id);
  const sourceColumn = {
    id: "custom-source-column",
    items: [makeNode("custom-source-node")],
    span: { desktop: 12, mobile: 12, tablet: 12 },
  };
  const sourceRow = {
    columns: [sourceColumn],
    id: "custom-source-row",
  };
  const sourceGroup = {
    id: "custom-source-group",
    name: "Source",
    rows: [sourceRow],
  };
  const targetRow = {
    columns: Array.from({ length: 4 }, (_, index) => ({
      id: `custom-target-column-${index}`,
      items: [makeNode(`custom-target-node-${index}`)],
      span: { desktop: 3, mobile: 12, tablet: 6 },
    })),
    id: "custom-target-row",
  };
  const targetGroup = {
    id: "custom-target-group",
    locked: true,
    name: "Locked target",
    rows: [targetRow],
  };
  map.groups.push(sourceGroup, targetGroup);
  const before = structuredClone(manifest);

  assert.deepEqual(moveWorkspaceRowV3(manifest, sourceRow.id, targetGroup.id, 0), before);
  assert.deepEqual(moveWorkspaceColumnV3(manifest, sourceColumn.id, targetRow.id, 0), before);

  targetGroup.locked = false;
  const beforeFullRow = structuredClone(manifest);
  assert.deepEqual(moveWorkspaceColumnV3(manifest, sourceColumn.id, targetRow.id, 0), beforeFullRow);
  targetRow.columns[0].locked = true;
  const beforeLockedColumn = structuredClone(manifest);
  assert.deepEqual(moveWorkspaceNodeV3(manifest, sourceColumn.items[0].id, targetRow.columns[0].id, 0), beforeLockedColumn);

  sourceGroup.locked = true;
  const beforeLockedGroup = structuredClone(manifest);
  assert.deepEqual(moveWorkspaceGroupV3(manifest, map.id, sourceGroup.id, 0), beforeLockedGroup);
});
