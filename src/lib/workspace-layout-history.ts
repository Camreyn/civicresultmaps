import {
  cloneWorkspaceLayoutManifestV2,
  type WorkspaceLayoutManifestV2,
} from "./workspace-layout-v2.ts";

export type WorkspaceLayoutHistory = {
  entries: WorkspaceLayoutManifestV2[];
  groupKey: string | null;
  index: number;
};

export function createWorkspaceLayoutHistory(
  manifest: WorkspaceLayoutManifestV2,
): WorkspaceLayoutHistory {
  return {
    entries: [cloneWorkspaceLayoutManifestV2(manifest)],
    groupKey: null,
    index: 0,
  };
}

export function commitWorkspaceLayoutHistory(
  history: WorkspaceLayoutHistory,
  updater: (manifest: WorkspaceLayoutManifestV2) => WorkspaceLayoutManifestV2,
  groupKey?: string,
): WorkspaceLayoutHistory {
  const present = history.entries[history.index];
  const next = updater(cloneWorkspaceLayoutManifestV2(present));
  if (JSON.stringify(next) === JSON.stringify(present)) return history;

  const entries = history.entries.slice(0, history.index + 1);
  if (
    groupKey
    && history.groupKey === groupKey
    && history.index > 0
    && history.index === history.entries.length - 1
  ) {
    entries[history.index] = next;
    return { entries, groupKey, index: history.index };
  }

  return {
    entries: [...entries, next],
    groupKey: groupKey ?? null,
    index: entries.length,
  };
}

export function closeWorkspaceLayoutHistoryGroup(
  history: WorkspaceLayoutHistory,
): WorkspaceLayoutHistory {
  return history.groupKey ? { ...history, groupKey: null } : history;
}

export function undoWorkspaceLayoutHistory(
  history: WorkspaceLayoutHistory,
): WorkspaceLayoutHistory {
  return {
    ...history,
    groupKey: null,
    index: Math.max(0, history.index - 1),
  };
}

export function redoWorkspaceLayoutHistory(
  history: WorkspaceLayoutHistory,
): WorkspaceLayoutHistory {
  return {
    ...history,
    groupKey: null,
    index: Math.min(history.entries.length - 1, history.index + 1),
  };
}
