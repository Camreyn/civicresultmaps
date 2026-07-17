import {
  toWorkspaceLayoutManifestV3,
  type WorkspaceLayoutManifestAny,
} from "./workspace-layout-v3.ts";

export type WorkspaceLayoutDiffEntry = {
  after?: unknown;
  before?: unknown;
  kind: "added" | "changed" | "removed";
  label: string;
  path: string;
};

export type WorkspaceLayoutDiff = {
  added: number;
  changed: number;
  entries: WorkspaceLayoutDiffEntry[];
  removed: number;
  truncated: boolean;
};

export function diffWorkspaceLayoutManifests(
  before: WorkspaceLayoutManifestAny,
  after: WorkspaceLayoutManifestAny,
  limit = 200,
): WorkspaceLayoutDiff {
  const entries: WorkspaceLayoutDiffEntry[] = [];
  walk(
    toWorkspaceLayoutManifestV3(before),
    toWorkspaceLayoutManifestV3(after),
    [],
    entries,
    Math.max(1, Math.min(limit, 1000)),
  );
  return {
    added: entries.filter((entry) => entry.kind === "added").length,
    changed: entries.filter((entry) => entry.kind === "changed").length,
    entries,
    removed: entries.filter((entry) => entry.kind === "removed").length,
    truncated: entries.length >= limit,
  };
}

function walk(
  before: unknown,
  after: unknown,
  path: string[],
  entries: WorkspaceLayoutDiffEntry[],
  limit: number,
) {
  if (entries.length >= limit || Object.is(before, after)) return;
  if (before === undefined) return push(entries, path, "added", undefined, after);
  if (after === undefined) return push(entries, path, "removed", before, undefined);

  if (Array.isArray(before) && Array.isArray(after)) {
    const keyed = keyedArray(before) && keyedArray(after);
    if (keyed) {
      const beforeMap = new Map(before.map((value) => [String((value as { id: unknown }).id), value]));
      const afterMap = new Map(after.map((value) => [String((value as { id: unknown }).id), value]));
      const ids = [...new Set([...beforeMap.keys(), ...afterMap.keys()])];
      for (const id of ids) {
        walk(beforeMap.get(id), afterMap.get(id), [...path, id], entries, limit);
        if (entries.length >= limit) break;
      }
      const beforeOrder = before.map((value) => String((value as { id: unknown }).id));
      const afterOrder = after.map((value) => String((value as { id: unknown }).id));
      if (JSON.stringify(beforeOrder) !== JSON.stringify(afterOrder)) {
        push(entries, [...path, "order"], "changed", beforeOrder, afterOrder);
      }
      return;
    }
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      walk(before[index], after[index], [...path, String(index)], entries, limit);
      if (entries.length >= limit) break;
    }
    return;
  }

  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      walk(before[key], after[key], [...path, key], entries, limit);
      if (entries.length >= limit) break;
    }
    return;
  }

  push(entries, path, "changed", before, after);
}

function push(
  entries: WorkspaceLayoutDiffEntry[],
  path: string[],
  kind: WorkspaceLayoutDiffEntry["kind"],
  before: unknown,
  after: unknown,
) {
  const normalizedPath = path.join(".");
  entries.push({
    after: compactValue(after),
    before: compactValue(before),
    kind,
    label: pathLabel(path),
    path: normalizedPath,
  });
}

function compactValue(value: unknown) {
  if (Array.isArray(value) && value.length > 12) return [...value.slice(0, 12), `+${value.length - 12} more`];
  if (typeof value === "string" && value.length > 180) return `${value.slice(0, 177)}...`;
  return value;
}

function pathLabel(path: string[]) {
  const significant = path.filter((part) => !/^\d+$/.test(part));
  return significant.slice(-3).map((part) => part
    .replace(/^group-/, "Group ")
    .replace(/^row-/, "Row ")
    .replace(/^column-/, "Column ")
    .replace(/^production-/, "")
    .replace(/^custom-/, "Custom ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()))
    .join(" / ") || "Workspace";
}

function keyedArray(value: unknown[]) {
  return value.every((item) => isRecord(item) && typeof item.id === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
