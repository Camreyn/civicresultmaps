import type { CSSProperties } from "react";
import {
  defaultWorkspaceLayoutSettingsV2,
  evaluateWorkspaceVisibility,
  findProductionNode,
  flattenWorkspaceNodes,
  isWorkspaceCustomNodeV2,
  type WorkspaceCustomNodeV2,
  type WorkspaceLayoutManifestV2,
  type WorkspaceLayoutNodeV2,
  type WorkspaceProductionComponentIdV2,
  type WorkspaceVisibilityContext,
} from "./workspace-layout-v2.ts";
import type { WorkspaceSectionId, WorkspaceTabId } from "./workspace-layout.ts";

export type WorkspaceRuntimeCustomNode = WorkspaceCustomNodeV2 & {
  columnId: string;
  order: number;
  rowId: string;
  span: { desktop: number; mobile: number; tablet: number };
};

export function visibleWorkspaceTabsV2(manifest: WorkspaceLayoutManifestV2) {
  return manifest.tabs.filter((tab) => tab.visible);
}

export function resolveVisibleWorkspaceTabV2(
  manifest: WorkspaceLayoutManifestV2,
  requested?: string,
): WorkspaceTabId {
  const visibleTabs = visibleWorkspaceTabsV2(manifest);
  const visible = new Set(visibleTabs.map((tab) => tab.id));
  if (requested && visible.has(requested as WorkspaceTabId)) return requested as WorkspaceTabId;
  if (visible.has(manifest.settings.defaultTab)) return manifest.settings.defaultTab;
  return visible.has("map") ? "map" : visibleTabs[0]?.id ?? "map";
}

export function workspaceLayoutSettingsV2(manifest: WorkspaceLayoutManifestV2) {
  return { ...defaultWorkspaceLayoutSettingsV2, ...manifest.settings };
}

export function workspaceSectionStateV2(
  manifest: WorkspaceLayoutManifestV2,
  tabId: WorkspaceTabId,
  sectionId: WorkspaceSectionId | "review-center",
  context?: WorkspaceVisibilityContext,
) {
  const tab = manifest.tabs.find((candidate) => candidate.id === tabId);
  if (!tab) return missingState();
  const wanted = tabId === "review" && isLegacyReviewSection(sectionId) ? "review-center" : sectionId;
  let order = 0;
  for (const row of tab.rows) {
    for (const column of row.columns) {
      for (const node of column.items) {
        if (node.kind === "production" && node.component === wanted) {
          const conditionallyVisible = context ? evaluateWorkspaceVisibility(node.visibility, context) : true;
          return {
            config: node.config,
            order,
            presentation: {
              ...node.presentation,
              span: column.span,
            },
            visibility: node.visibility,
            visible: tab.visible && node.visible && conditionallyVisible,
          };
        }
        order += 1;
      }
    }
  }
  return missingState();
}

export function workspaceProductionNodeV2(
  manifest: WorkspaceLayoutManifestV2,
  tabId: WorkspaceTabId,
  component: WorkspaceProductionComponentIdV2,
) {
  const tab = manifest.tabs.find((candidate) => candidate.id === tabId);
  return tab ? findProductionNode(tab, component) : undefined;
}

export function workspaceCustomBlocksV2(
  manifest: WorkspaceLayoutManifestV2,
  tabId: WorkspaceTabId,
  context?: WorkspaceVisibilityContext,
): WorkspaceRuntimeCustomNode[] {
  const tab = manifest.tabs.find((candidate) => candidate.id === tabId);
  if (!tab?.visible) return [];
  let order = 0;
  const result: WorkspaceRuntimeCustomNode[] = [];
  for (const row of tab.rows) {
    for (const column of row.columns) {
      for (const node of column.items) {
        const currentOrder = order;
        order += 1;
        if (!isWorkspaceCustomNodeV2(node) || !node.visible) continue;
        if (context && !evaluateWorkspaceVisibility(node.visibility, context)) continue;
        result.push({
          ...node,
          columnId: column.id,
          order: currentOrder,
          rowId: row.id,
          span: column.span,
        });
      }
    }
  }
  return result;
}

export type WorkspaceRuntimeCustomColumn = {
  columnId: string;
  items: WorkspaceRuntimeCustomNode[];
  span: { desktop: number; mobile: number; tablet: number };
};

export type WorkspaceRuntimeCustomRow = {
  align?: "center" | "start" | "stretch";
  columns: WorkspaceRuntimeCustomColumn[];
  gap?: "large" | "medium" | "small";
  rowId: string;
};

export function workspaceCustomRowsV2(
  manifest: WorkspaceLayoutManifestV2,
  tabId: WorkspaceTabId,
  context?: WorkspaceVisibilityContext,
): WorkspaceRuntimeCustomRow[] {
  const tab = manifest.tabs.find((candidate) => candidate.id === tabId);
  if (!tab?.visible) return [];
  const visibleNodes = new Map(
    workspaceCustomBlocksV2(manifest, tabId, context).map((node) => [node.id, node]),
  );
  return tab.rows
    .map((row) => ({
      align: row.align,
      columns: row.columns.map((column) => ({
        columnId: column.id,
        items: column.items.flatMap((node) => {
          const visible = visibleNodes.get(node.id);
          return visible ? [visible] : [];
        }),
        span: column.span,
      })),
      gap: row.gap,
      rowId: row.id,
    }))
    .filter((row) => row.columns.some((column) => column.items.length > 0));
}

export function workspaceNodeStyleV2(
  node: WorkspaceLayoutNodeV2,
  span: { desktop: number; mobile: number; tablet: number },
  order: number,
): CSSProperties {
  return {
    "--layout-span-desktop": span.desktop,
    "--layout-span-mobile": span.mobile,
    "--layout-span-tablet": span.tablet,
    order,
  } as CSSProperties;
}

export function reviewViewConfigurationV2(manifest: WorkspaceLayoutManifestV2) {
  const node = workspaceProductionNodeV2(manifest, "review", "review-center");
  const viewOrder = node?.config?.viewOrder ?? ["overview", "evidence-tools", "screening", "indicators", "methodology"];
  const visible = new Set(node?.config?.visibleViews ?? viewOrder);
  return {
    defaultView: node?.config?.defaultView ?? "overview",
    navigationStyle: node?.config?.navigationStyle ?? "tabs",
    viewOrder: viewOrder.filter((view) => visible.has(view)),
  };
}

export function workspaceGridRowsV2(manifest: WorkspaceLayoutManifestV2, tabId: WorkspaceTabId) {
  return manifest.tabs.find((tab) => tab.id === tabId)?.rows ?? [];
}

export function flattenVisibleWorkspaceNodesV2(
  manifest: WorkspaceLayoutManifestV2,
  tabId: WorkspaceTabId,
  context?: WorkspaceVisibilityContext,
) {
  const tab = manifest.tabs.find((candidate) => candidate.id === tabId);
  return tab
    ? flattenWorkspaceNodes(tab).filter((node) => node.visible && (!context || evaluateWorkspaceVisibility(node.visibility, context)))
    : [];
}

function missingState() {
  return {
    config: undefined,
    order: Number.MAX_SAFE_INTEGER,
    presentation: undefined,
    visibility: undefined,
    visible: false,
  };
}

function isLegacyReviewSection(value: string) {
  return ["overview", "evidence-tools", "screening", "indicators", "methodology"].includes(value);
}
