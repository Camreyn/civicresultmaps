import {
  isWorkspaceCustomBlock,
  workspaceComponentLabel,
  workspaceLayoutRegistry,
  type WorkspaceLayoutItemV1,
  type WorkspaceLayoutManifestV1,
  type WorkspaceSectionId,
  type WorkspaceTabId,
} from "@/lib/workspace-layout";

export type BuilderViewport = "desktop" | "tablet" | "mobile";
export type BuilderCompareMode = "draft" | "baseline" | "split";
export type BuilderTarget =
  | { kind: "workspace" }
  | { kind: "tab"; tabId: WorkspaceTabId }
  | { itemId: string; kind: "item"; tabId: WorkspaceTabId };

export function moveBuilderItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

export function normalizeBuilderItems(items: WorkspaceLayoutItemV1[]) {
  return [
    ...items.filter((item) => !isWorkspaceCustomBlock(item)),
    ...items.filter(isWorkspaceCustomBlock),
  ];
}

export function builderItemLabel(tabId: WorkspaceTabId, item: WorkspaceLayoutItemV1) {
  if (isWorkspaceCustomBlock(item)) return item.title || workspaceComponentLabel(item.component);
  return workspaceLayoutRegistry
    .find((tab) => tab.id === tabId)
    ?.sections.find((section) => section.id === item.id)
    ?.label ?? item.id;
}

export function builderItemDescription(tabId: WorkspaceTabId, item: WorkspaceLayoutItemV1) {
  if (isWorkspaceCustomBlock(item)) return `Custom ${workspaceComponentLabel(item.component).toLowerCase()} block`;
  const descriptions: Partial<Record<WorkspaceSectionId, string>> = {
    "results-map": "Interactive map, controls, legend, and result table",
    "source-provenance": "Authorities, source links, parser details, and confidence",
    "coverage-context": "Availability and reporting-grain context",
    "state-snapshot": "Statewide candidate totals and vote share",
    "historical-charts": "Historical comparison charts and diagnostics",
    "indicators": "Advisory indicator results and review context",
    "downloads": "Public download actions",
    "api-links": "Documented API routes",
  };
  return descriptions[item.id] ?? `${builderItemLabel(tabId, item)} production section`;
}

export function findBuilderItem(
  manifest: WorkspaceLayoutManifestV1,
  tabId: WorkspaceTabId,
  itemId: string,
) {
  return manifest.tabs.find((tab) => tab.id === tabId)?.sections.find((item) => item.id === itemId);
}
