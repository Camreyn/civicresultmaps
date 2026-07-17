import type { WorkspaceTabId } from "@/lib/workspace-layout";
import {
  WORKSPACE_LAYOUT_MAX_CUSTOM_BLOCKS_PER_TAB,
  WORKSPACE_LAYOUT_MAX_ROWS_PER_TAB,
  createWorkspaceCustomNodeV2,
  workspaceLayoutRegistryV2,
  type WorkspaceCustomBlockKindV2,
  type WorkspaceLayoutDesktopSpanV2,
} from "@/lib/workspace-layout-v2";
import {
  WORKSPACE_LAYOUT_MAX_GROUPS_PER_TAB,
  cloneWorkspaceLayoutGroupV3,
  flattenWorkspaceNodesV3,
  workspaceV3Id,
  type WorkspaceLayoutColumnV3,
  type WorkspaceLayoutGroupV3,
  type WorkspaceLayoutManifestV3,
  type WorkspaceLayoutNodeV3,
  type WorkspaceLayoutRowV3,
} from "@/lib/workspace-layout-v3";
import type { LayoutSelection, LayoutViewport } from "./layout-editor-v4-types";

export const desktopSpans = [3, 4, 6, 8, 9, 12] as const;
export const tabletSpans = [6, 12] as const;

export function findGroup(manifest: WorkspaceLayoutManifestV3, groupId: string) {
  return manifest.tabs.flatMap((tab) => tab.groups).find((group) => group.id === groupId);
}

export function findRow(manifest: WorkspaceLayoutManifestV3, rowId: string) {
  return manifest.tabs.flatMap((tab) => tab.groups).flatMap((group) => group.rows)
    .find((row) => row.id === rowId);
}

export function findColumn(manifest: WorkspaceLayoutManifestV3, columnId: string) {
  return manifest.tabs.flatMap((tab) => tab.groups).flatMap((group) => group.rows)
    .flatMap((row) => row.columns).find((column) => column.id === columnId);
}

export function findNode(manifest: WorkspaceLayoutManifestV3, nodeId: string) {
  return manifest.tabs.flatMap(flattenWorkspaceNodesV3).find((node) => node.id === nodeId);
}

function findGroupLocation(manifest: WorkspaceLayoutManifestV3, groupId: string) {
  for (const tab of manifest.tabs) {
    const group = tab.groups.find((item) => item.id === groupId);
    if (group) return { group, tabId: tab.id };
  }
  return undefined;
}

function findRowLocation(manifest: WorkspaceLayoutManifestV3, rowId: string) {
  for (const tab of manifest.tabs) {
    for (const group of tab.groups) {
      const row = group.rows.find((item) => item.id === rowId);
      if (row) return { group, row, tabId: tab.id };
    }
  }
  return undefined;
}

function findColumnLocation(manifest: WorkspaceLayoutManifestV3, columnId: string) {
  for (const tab of manifest.tabs) {
    for (const group of tab.groups) {
      for (const row of group.rows) {
        const column = row.columns.find((item) => item.id === columnId);
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
          const node = column.items.find((item) => item.id === nodeId);
          if (node) return { column, group, node, row, tabId: tab.id };
        }
      }
    }
  }
  return undefined;
}

export function mapGroups(
  manifest: WorkspaceLayoutManifestV3,
  mapper: (group: WorkspaceLayoutGroupV3) => WorkspaceLayoutGroupV3,
) {
  return { ...manifest, tabs: manifest.tabs.map((tab) => ({ ...tab, groups: tab.groups.map(mapper) })) };
}

export function mapRows(
  manifest: WorkspaceLayoutManifestV3,
  mapper: (row: WorkspaceLayoutRowV3) => WorkspaceLayoutRowV3,
) {
  return mapGroups(manifest, (group) => ({ ...group, rows: group.rows.map(mapper) }));
}

export function mapColumns(
  manifest: WorkspaceLayoutManifestV3,
  mapper: (column: WorkspaceLayoutColumnV3) => WorkspaceLayoutColumnV3,
) {
  return mapRows(manifest, (row) => ({ ...row, columns: row.columns.map(mapper) }));
}

export function mapNodes(
  manifest: WorkspaceLayoutManifestV3,
  mapper: (node: WorkspaceLayoutNodeV3) => WorkspaceLayoutNodeV3,
) {
  return mapColumns(manifest, (column) => ({ ...column, items: column.items.map(mapper) }));
}

export function updateGroup(
  manifest: WorkspaceLayoutManifestV3,
  groupId: string,
  updater: (group: WorkspaceLayoutGroupV3) => WorkspaceLayoutGroupV3,
) {
  return mapGroups(manifest, (group) => group.id === groupId ? updater(group) : group);
}

export function updateRow(
  manifest: WorkspaceLayoutManifestV3,
  rowId: string,
  updater: (row: WorkspaceLayoutRowV3) => WorkspaceLayoutRowV3,
) {
  return mapRows(manifest, (row) => row.id === rowId ? updater(row) : row);
}

export function updateColumn(
  manifest: WorkspaceLayoutManifestV3,
  columnId: string,
  updater: (column: WorkspaceLayoutColumnV3) => WorkspaceLayoutColumnV3,
) {
  return mapColumns(manifest, (column) => column.id === columnId ? updater(column) : column);
}

export function updateNode(
  manifest: WorkspaceLayoutManifestV3,
  nodeId: string,
  updater: (node: WorkspaceLayoutNodeV3) => WorkspaceLayoutNodeV3,
) {
  return mapNodes(manifest, (node) => node.id === nodeId ? updater(node) : node);
}

export function createCustomNodeV3(component: WorkspaceCustomBlockKindV2) {
  const node = createWorkspaceCustomNodeV2(component, workspaceV3Id(`custom-${component}`));
  return {
    ...node,
    presentation: {
      ...node.presentation,
      height: "auto" as const,
    },
  };
}

export function createRowWithNode(node: WorkspaceLayoutNodeV3 = createCustomNodeV3("rich-text")): WorkspaceLayoutRowV3 {
  return {
    columns: [{
      id: workspaceV3Id("column"),
      items: [node],
      span: { desktop: 12, mobile: 12, tablet: 12 },
    }],
    gap: "medium",
    id: workspaceV3Id("row"),
  };
}

export function appendCustomBlock(
  manifest: WorkspaceLayoutManifestV3,
  tabId: WorkspaceTabId,
  component: WorkspaceCustomBlockKindV2,
  destinationColumnId?: string,
  destinationGroupId?: string,
) {
  const tab = manifest.tabs.find((item) => item.id === tabId);
  if (!tab) return manifest;
  const customCount = flattenWorkspaceNodesV3(tab).filter((node) => node.kind === "custom").length;
  if (customCount >= WORKSPACE_LAYOUT_MAX_CUSTOM_BLOCKS_PER_TAB) return manifest;
  const node = createCustomNodeV3(component);
  if (destinationColumnId) {
    const destination = findColumnLocation(manifest, destinationColumnId);
    if (!destination || destination.tabId !== tabId || destination.group.locked
      || destination.row.locked || destination.column.locked) {
      return manifest;
    }
    return updateColumn(manifest, destinationColumnId, (column) => ({ ...column, items: [...column.items, node] }));
  }
  const destination = destinationGroupId
    ? findGroupLocation(manifest, destinationGroupId)
    : tab.groups.map((group) => ({ group, tabId })).find((item) => !item.group.locked);
  if (!destination || destination.tabId !== tabId || destination.group.locked) return manifest;
  const rowCount = tab.groups.reduce((total, group) => total + group.rows.length, 0);
  if (rowCount >= WORKSPACE_LAYOUT_MAX_ROWS_PER_TAB) return manifest;
  return updateGroup(manifest, destination.group.id, (group) => ({
    ...group,
    rows: [...group.rows, createRowWithNode(node)],
  }));
}

export function appendGroup(
  manifest: WorkspaceLayoutManifestV3,
  tabId: WorkspaceTabId,
  source?: WorkspaceLayoutGroupV3,
) {
  const tab = manifest.tabs.find((item) => item.id === tabId);
  if (!tab || tab.groups.length >= WORKSPACE_LAYOUT_MAX_GROUPS_PER_TAB) return manifest;
  const group = source ? cloneWorkspaceLayoutGroupV3(source) : {
    id: workspaceV3Id("group"),
    name: "New group",
    presentation: { spacing: "comfortable" as const, surface: "plain" as const },
    rows: [createRowWithNode()],
  };
  const rowCount = tab.groups.reduce((total, item) => total + item.rows.length, 0);
  const customCount = flattenWorkspaceNodesV3(tab).filter((node) => node.kind === "custom").length;
  const groupCustomCount = group.rows.flatMap((row) => row.columns)
    .flatMap((column) => column.items).filter((node) => node.kind === "custom").length;
  if (rowCount + group.rows.length > WORKSPACE_LAYOUT_MAX_ROWS_PER_TAB
    || customCount + groupCustomCount > WORKSPACE_LAYOUT_MAX_CUSTOM_BLOCKS_PER_TAB) {
    return manifest;
  }
  return {
    ...manifest,
    tabs: manifest.tabs.map((item) => item.id === tabId ? { ...item, groups: [...item.groups, group] } : item),
  };
}

export function appendRow(manifest: WorkspaceLayoutManifestV3, groupId: string) {
  const destination = findGroupLocation(manifest, groupId);
  const tab = destination && manifest.tabs.find((item) => item.id === destination.tabId);
  if (!destination || !tab || destination.group.locked) return manifest;
  const rowCount = tab.groups.reduce((total, group) => total + group.rows.length, 0);
  const customCount = flattenWorkspaceNodesV3(tab).filter((node) => node.kind === "custom").length;
  if (rowCount >= WORKSPACE_LAYOUT_MAX_ROWS_PER_TAB
    || customCount >= WORKSPACE_LAYOUT_MAX_CUSTOM_BLOCKS_PER_TAB) return manifest;
  return updateGroup(manifest, groupId, (group) => ({ ...group, rows: [...group.rows, createRowWithNode()] }));
}

export function appendColumn(manifest: WorkspaceLayoutManifestV3, rowId: string) {
  const destination = findRowLocation(manifest, rowId);
  const tab = destination && manifest.tabs.find((item) => item.id === destination.tabId);
  if (!destination || !tab || destination.group.locked || destination.row.locked
    || destination.row.columns.length >= 4
    || flattenWorkspaceNodesV3(tab).filter((node) => node.kind === "custom").length
      >= WORKSPACE_LAYOUT_MAX_CUSTOM_BLOCKS_PER_TAB) return manifest;
  const row = destination.row;
  const width = row.columns.length === 1 ? 6 : row.columns.length === 2 ? 4 : 3;
  return updateRow(manifest, rowId, (current) => ({
    ...current,
    columns: [
      ...current.columns.map((column) => ({
        ...column,
        span: { ...column.span, desktop: width as WorkspaceLayoutDesktopSpanV2 },
      })),
      {
        id: workspaceV3Id("column"),
        items: [createCustomNodeV3("rich-text")],
        span: { desktop: width as WorkspaceLayoutDesktopSpanV2, mobile: 12, tablet: 12 },
      },
    ],
  }));
}

export function removeCustomNode(manifest: WorkspaceLayoutManifestV3, nodeId: string) {
  const source = findNodeLocation(manifest, nodeId);
  if (!source || source.node.kind !== "custom" || source.node.locked
    || source.group.locked || source.row.locked || source.column.locked
    || source.column.items.length <= 1) return manifest;
  return updateColumn(manifest, source.column.id, (column) => ({
    ...column,
    items: column.items.filter((item) => item.id !== nodeId),
  }));
}

export function removeCustomRow(manifest: WorkspaceLayoutManifestV3, rowId: string) {
  const row = findRow(manifest, rowId);
  if (!row || row.locked || !rowIsCustomOnly(row)) return manifest;
  return mapGroups(manifest, (group) => group.locked || !group.rows.some((item) => item.id === rowId)
    ? group
    : { ...group, rows: group.rows.filter((item) => item.id !== rowId) });
}

export function removeCustomColumn(manifest: WorkspaceLayoutManifestV3, columnId: string) {
  const source = findColumnLocation(manifest, columnId);
  if (!source || source.group.locked || source.row.locked || source.column.locked
    || !columnIsCustomOnly(source.column) || source.row.columns.length <= 1) return manifest;
  return updateRow(manifest, source.row.id, (row) => ({
    ...row,
    columns: row.columns.filter((item) => item.id !== columnId),
  }));
}

export function duplicateCustomColumn(manifest: WorkspaceLayoutManifestV3, columnId: string) {
  const source = findColumnLocation(manifest, columnId);
  const tab = source && manifest.tabs.find((item) => item.id === source.tabId);
  if (!source || !tab || source.group.locked || source.row.locked || source.column.locked
    || !columnIsCustomOnly(source.column) || source.row.columns.length >= 4
    || flattenWorkspaceNodesV3(tab).filter((node) => node.kind === "custom").length + source.column.items.length
      > WORKSPACE_LAYOUT_MAX_CUSTOM_BLOCKS_PER_TAB) return manifest;
  const index = source.row.columns.findIndex((column) => column.id === columnId);
  const copy: WorkspaceLayoutColumnV3 = {
    ...structuredClone(source.column),
    id: workspaceV3Id("column"),
    items: source.column.items.map((node) => ({ ...structuredClone(node), id: workspaceV3Id(`custom-${node.component}`) })),
  };
  return updateRow(manifest, source.row.id, (row) => {
    const columns = [...row.columns];
    columns.splice(index + 1, 0, copy);
    return { ...row, columns };
  });
}

export function resizeColumn(
  manifest: WorkspaceLayoutManifestV3,
  columnId: string,
  viewport: LayoutViewport,
  delta: -1 | 1,
) {
  const source = findColumnLocation(manifest, columnId);
  if (!source || source.group.locked || source.row.locked || source.column.locked
    || viewport === "mobile") return manifest;
  const column = source.column;
  const options = viewport === "desktop" ? allowedDesktopSpans(column) : tabletSpans;
  const current = column.span[viewport];
  const currentIndex = Math.max(0, options.indexOf(current as never));
  const next = options[Math.max(0, Math.min(options.length - 1, currentIndex + delta))];
  if (!next || next === current) return manifest;
  return updateColumn(manifest, columnId, (item) => ({ ...item, span: { ...item.span, [viewport]: next } }));
}

export function allowedDesktopSpans(column: WorkspaceLayoutColumnV3): readonly WorkspaceLayoutDesktopSpanV2[] {
  const production = column.items.filter((node) => node.kind === "production");
  if (!production.length) return desktopSpans;
  const allowed = desktopSpans.filter((span) => production.every((node) => {
    let componentSpans: readonly number[] | undefined;
    for (const tab of workspaceLayoutRegistryV2) {
      for (const component of tab.components) {
        if (component.id === node.component) componentSpans = component.allowedDesktopSpans;
      }
    }
    return !componentSpans || componentSpans.includes(span);
  }));
  return allowed.length ? allowed : desktopSpans;
}

export function requiredProductionNode(node: WorkspaceLayoutNodeV3) {
  return node.kind === "production" && workspaceLayoutRegistryV2.some(
    (tab) => tab.components.some((component) => component.id === node.component && component.required),
  );
}

export function nodeLabel(node: WorkspaceLayoutNodeV3) {
  if (node.kind === "custom") return node.title?.trim() || titleCase(node.component);
  for (const tab of workspaceLayoutRegistryV2) {
    const component = tab.components.find((item) => item.id === node.component);
    if (component) return component.label;
  }
  return titleCase(node.component);
}

export function tabLabel(tabId: WorkspaceTabId) {
  return workspaceLayoutRegistryV2.find((tab) => tab.id === tabId)?.label ?? titleCase(tabId);
}

export function selectionLabel(manifest: WorkspaceLayoutManifestV3, selection: LayoutSelection) {
  if (selection.kind === "workspace") return "Workspace design";
  if (selection.kind === "tab") return `${tabLabel(selection.tabId)} tab`;
  if (selection.kind === "group") return findGroup(manifest, selection.groupId)?.name ?? "Group";
  if (selection.kind === "row") return "Row";
  if (selection.kind === "column") return "Column";
  const node = findNode(manifest, selection.nodeId);
  return node ? nodeLabel(node) : "Component";
}

export function rowIsCustomOnly(row: WorkspaceLayoutRowV3) {
  return row.columns.every(columnIsCustomOnly);
}

export function columnIsCustomOnly(column: WorkspaceLayoutColumnV3) {
  return column.items.every((node) => node.kind === "custom");
}

export function tabCustomBlockCount(manifest: WorkspaceLayoutManifestV3, tabId: WorkspaceTabId) {
  const tab = manifest.tabs.find((item) => item.id === tabId);
  return tab ? flattenWorkspaceNodesV3(tab).filter((node) => node.kind === "custom").length : 0;
}

export function titleCase(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
