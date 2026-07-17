import {
  cloneWorkspaceLayoutGroupV3,
  cloneWorkspaceLayoutManifestV3,
  flattenWorkspaceNodesV3,
  isWorkspaceGroupCustomOnlyV3,
  workspaceV3Id,
  type WorkspaceLayoutColumnV3,
  type WorkspaceLayoutGroupV3,
  type WorkspaceLayoutManifestV3,
  type WorkspaceLayoutNodeV3,
  type WorkspaceLayoutRowV3,
} from "./workspace-layout-v3.ts";
import { workspaceLayoutRegistryV2 } from "./workspace-layout-v2.ts";

export const WORKSPACE_LAYOUT_HISTORY_LIMIT = 100;

export type WorkspaceLayoutEditorState = {
  baseline: WorkspaceLayoutManifestV3;
  future: WorkspaceLayoutManifestV3[];
  groupKey: string | null;
  past: WorkspaceLayoutManifestV3[];
  present: WorkspaceLayoutManifestV3;
};

export type WorkspaceLayoutEditorAction =
  | { groupKey?: string; type: "commit"; updater: (manifest: WorkspaceLayoutManifestV3) => WorkspaceLayoutManifestV3 }
  | { manifest: WorkspaceLayoutManifestV3; type: "load" }
  | { manifest?: WorkspaceLayoutManifestV3; type: "rebase" }
  | { type: "close-group" }
  | { type: "redo" }
  | { type: "reset" }
  | { type: "undo" };

export function createWorkspaceLayoutEditorState(
  manifest: WorkspaceLayoutManifestV3,
): WorkspaceLayoutEditorState {
  const baseline = cloneWorkspaceLayoutManifestV3(manifest);
  return {
    baseline,
    future: [],
    groupKey: null,
    past: [],
    present: cloneWorkspaceLayoutManifestV3(manifest),
  };
}

export function workspaceLayoutEditorReducer(
  state: WorkspaceLayoutEditorState,
  action: WorkspaceLayoutEditorAction,
): WorkspaceLayoutEditorState {
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    if (!previous) return { ...state, groupKey: null };
    return {
      ...state,
      future: [cloneWorkspaceLayoutManifestV3(state.present), ...state.future].slice(0, WORKSPACE_LAYOUT_HISTORY_LIMIT),
      groupKey: null,
      past: state.past.slice(0, -1),
      present: cloneWorkspaceLayoutManifestV3(previous),
    };
  }
  if (action.type === "redo") {
    const next = state.future[0];
    if (!next) return { ...state, groupKey: null };
    return {
      ...state,
      future: state.future.slice(1),
      groupKey: null,
      past: capHistory([...state.past, cloneWorkspaceLayoutManifestV3(state.present)]),
      present: cloneWorkspaceLayoutManifestV3(next),
    };
  }
  if (action.type === "rebase") {
    return {
      ...state,
      baseline: cloneWorkspaceLayoutManifestV3(action.manifest ?? state.present),
      groupKey: null,
    };
  }
  if (action.type === "reset") {
    if (sameManifest(state.present, state.baseline)) return state;
    return {
      ...state,
      future: [],
      groupKey: null,
      past: capHistory([...state.past, cloneWorkspaceLayoutManifestV3(state.present)]),
      present: cloneWorkspaceLayoutManifestV3(state.baseline),
    };
  }
  if (action.type === "load") return createWorkspaceLayoutEditorState(action.manifest);
  if (action.type === "close-group") return state.groupKey ? { ...state, groupKey: null } : state;

  const next = action.updater(cloneWorkspaceLayoutManifestV3(state.present));
  if (sameManifest(next, state.present)) return state;
  if (action.groupKey && action.groupKey === state.groupKey && state.past.length > 0 && state.future.length === 0) {
    return { ...state, present: cloneWorkspaceLayoutManifestV3(next) };
  }
  return {
    ...state,
    future: [],
    groupKey: action.groupKey ?? null,
    past: capHistory([...state.past, cloneWorkspaceLayoutManifestV3(state.present)]),
    present: cloneWorkspaceLayoutManifestV3(next),
  };
}

export function moveWorkspaceGroupV3(
  manifest: WorkspaceLayoutManifestV3,
  tabId: string,
  groupId: string,
  destinationIndex: number,
) {
  return mapTab(manifest, tabId, (tab) => {
    const sourceIndex = tab.groups.findIndex((group) => group.id === groupId);
    const source = tab.groups[sourceIndex];
    return !source || source.locked ? tab : { ...tab, groups: moveItem(tab.groups, sourceIndex, destinationIndex) };
  });
}

export function moveWorkspaceRowV3(
  manifest: WorkspaceLayoutManifestV3,
  rowId: string,
  destinationGroupId: string,
  destinationIndex: number,
) {
  const source = findRowLocation(manifest, rowId);
  const destination = findGroupLocation(manifest, destinationGroupId);
  if (!source || !destination || source.tabId !== destination.tabId
    || source.group.locked || source.row.locked || destination.group.locked) {
    return manifest;
  }
  const row = source.row;
  let changed = false;
  const tabs = manifest.tabs.map((tab) => ({
    ...tab,
    groups: tab.groups.map((group) => {
      if (group.locked) return group;
      const without = group.rows.filter((candidate) => candidate.id !== rowId);
      if (without.length !== group.rows.length) changed = true;
      if (group.id !== destinationGroupId) return without.length === group.rows.length ? group : { ...group, rows: without };
      const index = Math.max(0, Math.min(destinationIndex, without.length));
      const rows = [...without];
      rows.splice(index, 0, row);
      changed = true;
      return { ...group, rows };
    }),
  }));
  return changed ? { ...manifest, tabs } : manifest;
}

export function moveWorkspaceColumnV3(
  manifest: WorkspaceLayoutManifestV3,
  columnId: string,
  destinationRowId: string,
  destinationIndex: number,
) {
  const source = findColumnLocation(manifest, columnId);
  const destination = findRowLocation(manifest, destinationRowId);
  if (!source || !destination || source.tabId !== destination.tabId
    || source.group.locked || source.row.locked || source.column.locked
    || destination.group.locked || destination.row.locked
    || (source.row.id !== destination.row.id && destination.row.columns.length >= 4)) {
    return manifest;
  }
  const column = source.column;
  return mapRows(manifest, (row) => {
    if (row.locked) return row;
    const columns = row.columns.filter((candidate) => candidate.id !== columnId);
    if (row.id !== destinationRowId) return columns.length === row.columns.length ? row : { ...row, columns };
    if (columns.length >= 4) return row;
    const index = Math.max(0, Math.min(destinationIndex, columns.length));
    columns.splice(index, 0, column);
    return { ...row, columns };
  });
}

export function moveWorkspaceNodeV3(
  manifest: WorkspaceLayoutManifestV3,
  nodeId: string,
  destinationColumnId: string,
  destinationIndex: number,
) {
  const source = findNodeLocation(manifest, nodeId);
  const destination = findColumnLocation(manifest, destinationColumnId);
  if (!source || !destination || source.tabId !== destination.tabId
    || source.group.locked || source.row.locked || source.column.locked || isWorkspaceNodeLockedV3(source.node)
    || destination.group.locked || destination.row.locked || destination.column.locked) {
    return manifest;
  }
  const node = source.node;
  return mapColumns(manifest, (column) => {
    if (column.locked) return column;
    const items = column.items.filter((candidate) => candidate.id !== nodeId);
    if (column.id !== destinationColumnId) return items.length === column.items.length ? column : { ...column, items };
    const index = Math.max(0, Math.min(destinationIndex, items.length));
    items.splice(index, 0, node);
    return { ...column, items };
  });
}

export function removeWorkspaceNodeV3(manifest: WorkspaceLayoutManifestV3, nodeId: string) {
  const source = findNodeLocation(manifest, nodeId);
  if (!source || source.node.kind !== "custom" || isWorkspaceNodeLockedV3(source.node)
    || source.group.locked || source.row.locked || source.column.locked) {
    return manifest;
  }

  const tab = manifest.tabs.find((candidate) => candidate.id === source.tabId);
  if (!tab) return manifest;

  const groups = tab.groups.flatMap((group) => {
    if (group.id !== source.group.id) return [group];
    const rows = group.rows.flatMap((row) => {
      if (row.id !== source.row.id) return [row];
      const columns = row.columns.flatMap((column) => {
        if (column.id !== source.column.id) return [column];
        const items = column.items.filter((node) => node.id !== nodeId);
        return items.length ? [{ ...column, items }] : [];
      });
      return columns.length ? [{ ...row, columns }] : [];
    });
    return rows.length ? [{ ...group, rows }] : [];
  });

  if (!groups.length || groups.every((group) => group.rows.length === 0)) return manifest;
  return mapTab(manifest, source.tabId, (current) => ({ ...current, groups }));
}

export function duplicateWorkspaceNodeV3(manifest: WorkspaceLayoutManifestV3, nodeId: string) {
  const location = findNodeLocation(manifest, nodeId);
  if (!location || location.node.kind !== "custom" || location.node.locked
    || location.group.locked || location.row.locked || location.column.locked) {
    return manifest;
  }
  const source = location.node;
  return mapColumns(manifest, (column) => {
    const index = column.items.findIndex((node) => node.id === nodeId);
    if (index < 0 || column.locked) return column;
    const copy = structuredClone(source);
    copy.id = workspaceV3Id(`custom-${copy.component}`);
    return { ...column, items: insertAfter(column.items, index, copy) };
  });
}

export function duplicateWorkspaceRowV3(manifest: WorkspaceLayoutManifestV3, rowId: string) {
  const source = findRow(manifest, rowId);
  if (!source || source.locked || !rowIsCustomOnly(source)) return manifest;
  return mapGroups(manifest, (group) => {
    const index = group.rows.findIndex((row) => row.id === rowId);
    if (index < 0 || group.locked) return group;
    return { ...group, rows: insertAfter(group.rows, index, cloneRow(source)) };
  });
}

export function duplicateWorkspaceGroupV3(manifest: WorkspaceLayoutManifestV3, groupId: string) {
  return {
    ...manifest,
    tabs: manifest.tabs.map((tab) => {
      const index = tab.groups.findIndex((group) => group.id === groupId);
      const source = tab.groups[index];
      if (!source || source.locked || !isWorkspaceGroupCustomOnlyV3(source)) return tab;
      const copy = cloneWorkspaceLayoutGroupV3(source);
      copy.name = `${source.name} copy`.slice(0, 80);
      return { ...tab, groups: insertAfter(tab.groups, index, copy) };
    }),
  };
}

export function removeWorkspaceGroupV3(manifest: WorkspaceLayoutManifestV3, groupId: string) {
  return {
    ...manifest,
    tabs: manifest.tabs.map((tab) => {
      const source = tab.groups.find((group) => group.id === groupId);
      if (!source || source.locked || !isWorkspaceGroupCustomOnlyV3(source) || tab.groups.length <= 1) return tab;
      return { ...tab, groups: tab.groups.filter((group) => group.id !== groupId) };
    }),
  };
}

export function setWorkspaceNodeLockV3(manifest: WorkspaceLayoutManifestV3, nodeId: string, locked: boolean) {
  return mapColumns(manifest, (column) => ({
    ...column,
    items: column.items.map((node) => node.id === nodeId
      ? { ...node, locked: isRequiredProductionNode(node) ? true : locked }
      : node),
  }));
}

export function isWorkspaceNodeLockedV3(node: WorkspaceLayoutNodeV3) {
  return node.locked === true || isRequiredProductionNode(node);
}

export function mapWorkspaceGroupsV3(
  manifest: WorkspaceLayoutManifestV3,
  mapper: (group: WorkspaceLayoutGroupV3) => WorkspaceLayoutGroupV3,
) {
  return mapGroups(manifest, mapper);
}

export function mapWorkspaceRowsV3(
  manifest: WorkspaceLayoutManifestV3,
  mapper: (row: WorkspaceLayoutRowV3) => WorkspaceLayoutRowV3,
) {
  return mapRows(manifest, mapper);
}

export function mapWorkspaceColumnsV3(
  manifest: WorkspaceLayoutManifestV3,
  mapper: (column: WorkspaceLayoutColumnV3) => WorkspaceLayoutColumnV3,
) {
  return mapColumns(manifest, mapper);
}

function mapTab(
  manifest: WorkspaceLayoutManifestV3,
  tabId: string,
  mapper: (tab: WorkspaceLayoutManifestV3["tabs"][number]) => WorkspaceLayoutManifestV3["tabs"][number],
) {
  return { ...manifest, tabs: manifest.tabs.map((tab) => tab.id === tabId ? mapper(tab) : tab) };
}

function mapGroups(manifest: WorkspaceLayoutManifestV3, mapper: (group: WorkspaceLayoutGroupV3) => WorkspaceLayoutGroupV3) {
  return { ...manifest, tabs: manifest.tabs.map((tab) => ({ ...tab, groups: tab.groups.map(mapper) })) };
}

function mapRows(manifest: WorkspaceLayoutManifestV3, mapper: (row: WorkspaceLayoutRowV3) => WorkspaceLayoutRowV3) {
  return mapGroups(manifest, (group) => ({ ...group, rows: group.rows.map(mapper) }));
}

function mapColumns(manifest: WorkspaceLayoutManifestV3, mapper: (column: WorkspaceLayoutColumnV3) => WorkspaceLayoutColumnV3) {
  return mapRows(manifest, (row) => ({ ...row, columns: row.columns.map(mapper) }));
}

function findRow(manifest: WorkspaceLayoutManifestV3, rowId: string) {
  return manifest.tabs.flatMap((tab) => tab.groups).flatMap((group) => group.rows).find((row) => row.id === rowId);
}

function findColumn(manifest: WorkspaceLayoutManifestV3, columnId: string) {
  return manifest.tabs.flatMap((tab) => tab.groups).flatMap((group) => group.rows).flatMap((row) => row.columns)
    .find((column) => column.id === columnId);
}

function findNode(manifest: WorkspaceLayoutManifestV3, nodeId: string) {
  return manifest.tabs.flatMap(flattenWorkspaceNodesV3).find((node) => node.id === nodeId);
}

function findGroupLocation(manifest: WorkspaceLayoutManifestV3, groupId: string) {
  for (const tab of manifest.tabs) {
    const group = tab.groups.find((candidate) => candidate.id === groupId);
    if (group) return { group, tabId: tab.id };
  }
  return undefined;
}

function findRowLocation(manifest: WorkspaceLayoutManifestV3, rowId: string) {
  for (const tab of manifest.tabs) {
    for (const group of tab.groups) {
      const row = group.rows.find((candidate) => candidate.id === rowId);
      if (row) return { group, row, tabId: tab.id };
    }
  }
  return undefined;
}

function findColumnLocation(manifest: WorkspaceLayoutManifestV3, columnId: string) {
  for (const tab of manifest.tabs) {
    for (const group of tab.groups) {
      for (const row of group.rows) {
        const column = row.columns.find((candidate) => candidate.id === columnId);
        if (column) return { column, group, row, tabId: tab.id };
      }
    }
  }
  return undefined;
}

function findNodeLocation(manifest: WorkspaceLayoutManifestV3, nodeId: string) {
  for (const tab of manifest.tabs) {
    for (const group of tab.groups) {
      for (const row of group.rows) {
        for (const column of row.columns) {
          const node = column.items.find((candidate) => candidate.id === nodeId);
          if (node) return { column, group, node, row, tabId: tab.id };
        }
      }
    }
  }
  return undefined;
}

function cloneRow(row: WorkspaceLayoutRowV3): WorkspaceLayoutRowV3 {
  return {
    ...structuredClone(row),
    id: workspaceV3Id("row"),
    columns: row.columns.map((column) => ({
      ...structuredClone(column),
      id: workspaceV3Id("column"),
      items: column.items.map((node) => ({ ...structuredClone(node), id: workspaceV3Id(`custom-${node.component}`) })),
    })),
  };
}

function rowIsCustomOnly(row: WorkspaceLayoutRowV3) {
  return row.columns.every((column) => column.items.every((node) => node.kind === "custom"));
}

function isRequiredProductionNode(node: WorkspaceLayoutNodeV3) {
  return node.kind === "production" && workspaceLayoutRegistryV2.some(
    (tab) => tab.components.some((component) => component.id === node.component && component.required),
  );
}

function insertAfter<T>(items: T[], index: number, value: T) {
  const next = [...items];
  next.splice(index + 1, 0, value);
  return next;
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (from < 0 || from >= items.length) return items;
  const destination = Math.max(0, Math.min(to, items.length - 1));
  if (destination === from) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(destination, 0, item!);
  return next;
}

function capHistory(entries: WorkspaceLayoutManifestV3[]) {
  return entries.slice(-WORKSPACE_LAYOUT_HISTORY_LIMIT);
}

function sameManifest(left: WorkspaceLayoutManifestV3, right: WorkspaceLayoutManifestV3) {
  return JSON.stringify(left) === JSON.stringify(right);
}
