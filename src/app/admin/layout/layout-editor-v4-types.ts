import type { WorkspaceTabId } from "@/lib/workspace-layout";
import type {
  WorkspaceLayoutGroupV3,
  WorkspaceLayoutManifestV3,
} from "@/lib/workspace-layout-v3";

export type LayoutRevisionSummary = {
  actorEmail: string;
  changeSummary: string;
  createdAt: string;
  id: string;
  manifest: WorkspaceLayoutManifestV3;
  manifestDigest: string;
  parentRevisionId: string | null;
};

export type LayoutPublicationSummary = {
  action: string;
  attemptCount: number;
  cancelledAt: string | null;
  channel: string;
  completedAt: string | null;
  environment: string;
  failureMessage: string | null;
  id: string;
  maxAttempts: number;
  nextAttemptAt: string | null;
  requestedAt: string;
  revisionId: string;
  scheduledFor: string | null;
  status: string;
};

export type LayoutAssetSummary = {
  alt: string;
  contentType: string;
  height: number;
  id: string;
  pathname: string;
  sizeBytes: number;
  url: string;
  width: number;
};

export type LayoutTemplateSummary = {
  actorEmail: string;
  description: string;
  id: string;
  manifest: WorkspaceLayoutManifestV3;
  name: string;
  updatedAt: string;
};

export type LayoutDraftSummary = {
  archivedAt: string | null;
  baseRevisionId: string | null;
  createdAt: string;
  id: string;
  manifest: WorkspaceLayoutManifestV3;
  name: string;
  updatedAt: string;
  version: number;
};

export type LayoutGroupTemplateSummary = {
  actorEmail: string;
  description: string;
  group: WorkspaceLayoutGroupV3;
  id: string;
  name: string;
  updatedAt: string;
};

export type LayoutEditorV4Props = {
  activeDraftRevisionId?: string;
  assets: LayoutAssetSummary[];
  baseManifest: WorkspaceLayoutManifestV3;
  builderV4Enabled: boolean;
  drafts: LayoutDraftSummary[];
  groupTemplates: LayoutGroupTemplateSummary[];
  parentRevisionId: string | null;
  publications: LayoutPublicationSummary[];
  publisherEnabled: boolean;
  requestKey: string;
  revisions: LayoutRevisionSummary[];
  templates: LayoutTemplateSummary[];
  testMode?: boolean;
};

export type LayoutViewport = "desktop" | "tablet" | "mobile";
export type LayoutCompareMode = "baseline" | "draft" | "split";

export type LayoutSettingsClipboard = {
  kind: "group" | "row" | "column" | "node";
  label: string;
  value: Record<string, unknown>;
};

export type LayoutSelection =
  | { kind: "workspace" }
  | { kind: "tab"; tabId: WorkspaceTabId }
  | { groupId: string; kind: "group"; tabId: WorkspaceTabId }
  | { groupId: string; kind: "row"; rowId: string; tabId: WorkspaceTabId }
  | { columnId: string; groupId: string; kind: "column"; rowId: string; tabId: WorkspaceTabId }
  | { columnId: string; groupId: string; kind: "node"; nodeId: string; rowId: string; tabId: WorkspaceTabId };
