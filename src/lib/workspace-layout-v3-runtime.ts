import {
  evaluateWorkspaceVisibility,
  type WorkspaceVisibilityContext,
} from "./workspace-layout-v2.ts";
import {
  defaultWorkspaceLayoutSettingsV3,
  type WorkspaceLayoutManifestV3,
  type WorkspaceLayoutNodeV3,
} from "./workspace-layout-v3.ts";
import type { WorkspaceTabId } from "./workspace-layout.ts";

export type WorkspaceRuntimeGroupV3 = {
  description?: string;
  heading?: string;
  id: string;
  name: string;
  presentation: {
    headingAlign: "left" | "center";
    showDivider: boolean;
    spacing: "compact" | "comfortable" | "spacious";
    surface: "plain" | "section" | "card";
  };
  rows: Array<{
    align: "start" | "center" | "stretch";
    columns: Array<{
      id: string;
      items: WorkspaceLayoutNodeV3[];
      span: { desktop: number; mobile: number; tablet: number };
    }>;
    gap: "small" | "medium" | "large";
    id: string;
  }>;
};

export function workspaceLayoutSettingsV3(manifest: WorkspaceLayoutManifestV3) {
  return { ...defaultWorkspaceLayoutSettingsV3, ...manifest.settings };
}

export function workspaceRuntimeGroupsV3(
  manifest: WorkspaceLayoutManifestV3,
  tabId: WorkspaceTabId,
  context?: WorkspaceVisibilityContext,
): WorkspaceRuntimeGroupV3[] {
  const tab = manifest.tabs.find((candidate) => candidate.id === tabId);
  if (!tab?.visible) return [];
  return tab.groups.flatMap((group) => {
    const rows = group.rows.flatMap((row) => {
      const columns = row.columns.flatMap((column) => {
        const items = column.items.filter((node) => isVisibleWorkspaceNode(node, context));
        return items.length ? [{ id: column.id, items, span: column.span }] : [];
      });
      return columns.length ? [{
        align: row.align ?? "stretch" as const,
        columns,
        gap: row.gap ?? "medium" as const,
        id: row.id,
      }] : [];
    });
    if (!rows.length && !group.heading && !group.description) return [];
    return [{
      description: group.description,
      heading: group.heading,
      id: group.id,
      name: group.name,
      presentation: {
        headingAlign: group.presentation?.headingAlign ?? "left",
        showDivider: group.presentation?.showDivider ?? false,
        spacing: group.presentation?.spacing ?? "comfortable",
        surface: group.presentation?.surface ?? "plain",
      },
      rows,
    }];
  });
}

export function workspaceProductionGroupIdV3(
  manifest: WorkspaceLayoutManifestV3,
  tabId: WorkspaceTabId,
  componentId: string,
) {
  const tab = manifest.tabs.find((candidate) => candidate.id === tabId);
  for (const group of tab?.groups ?? []) {
    if (group.rows.some((row) => row.columns.some((column) => column.items.some(
      (node) => node.kind === "production" && node.component === componentId,
    )))) return group.id;
  }
  return undefined;
}

function isVisibleWorkspaceNode(
  node: WorkspaceLayoutNodeV3,
  context?: WorkspaceVisibilityContext,
): boolean {
  return node.visible
    && (!context || evaluateWorkspaceVisibility(node.visibility, context));
}
