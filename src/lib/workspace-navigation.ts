import { isSupportedPresidentialYear, type SupportedPresidentialYear } from "./api-version.ts";
import type { WorkspaceTabId } from "./workspace-layout";

export const workspaceMapModes = [
  "winner",
  "margin",
  "volume",
  "method",
  "equipment",
  "security",
] as const;

export type WorkspaceMapMode = (typeof workspaceMapModes)[number];

export type WorkspaceNavigationContext = {
  fips?: string;
  mode?: WorkspaceMapMode;
  state: string;
  tab: WorkspaceTabId;
  year: SupportedPresidentialYear;
};

export type WorkspaceContextChangeDetail = {
  fips?: string | null;
  mode?: WorkspaceMapMode | null;
};

export const workspaceContextChangeEvent = "civicresultmaps:workspace-context-change";

const workspaceTabs = new Set<WorkspaceTabId>([
  "map",
  "review",
  "history",
  "electronic",
  "planner",
  "data",
  "methodology",
  "exports",
  "imports",
  "support",
  "contact",
]);
const historicalMapModes = new Set<WorkspaceMapMode>(["winner", "margin", "volume"]);

function normalizeState(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().slice(0, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(normalized ?? "") ? normalized! : fallback;
}

function normalizeTab(value: string | null | undefined, fallback: WorkspaceTabId) {
  return value && workspaceTabs.has(value as WorkspaceTabId)
    ? value as WorkspaceTabId
    : fallback;
}

function normalizeYear(value: string | number | null | undefined, fallback: SupportedPresidentialYear) {
  const parsed = Number(value);
  return isSupportedPresidentialYear(parsed) ? parsed : fallback;
}

function normalizeMapMode(value: string | null | undefined) {
  return workspaceMapModes.includes(value as WorkspaceMapMode)
    ? value as WorkspaceMapMode
    : undefined;
}

function normalizeFips(value: string | null | undefined) {
  return /^\d{5}$/.test(value ?? "") ? value! : undefined;
}

export function workspaceNavigationContextFromSearchParams(
  searchParams: URLSearchParams,
  fallback: WorkspaceNavigationContext,
): WorkspaceNavigationContext {
  const tab = normalizeTab(searchParams.get("tab"), fallback.tab);
  const year = tab === "map"
    ? normalizeYear(searchParams.get("year"), fallback.year)
    : 2024;
  const mode = tab === "map" ? normalizeMapMode(searchParams.get("mode")) : undefined;
  const fips = tab === "map" ? normalizeFips(searchParams.get("fips")) : undefined;

  return {
    fips,
    mode: year === 2024 || !mode || historicalMapModes.has(mode) ? mode : undefined,
    state: normalizeState(searchParams.get("state"), fallback.state),
    tab,
    year,
  };
}

export function workspaceNavigationHref(context: WorkspaceNavigationContext): `/?${string}` {
  const state = normalizeState(context.state, "WA");
  const tab = normalizeTab(context.tab, "map");
  const year = tab === "map" ? normalizeYear(context.year, 2024) : 2024;
  const mode = tab === "map" ? normalizeMapMode(context.mode) : undefined;
  const fips = tab === "map" ? normalizeFips(context.fips) : undefined;
  const params = new URLSearchParams({
    state,
    year: String(year),
    tab,
  });

  if (mode && (year === 2024 || historicalMapModes.has(mode))) {
    params.set("mode", mode);
  }
  if (fips) {
    params.set("fips", fips);
  }

  return `/?${params.toString()}`;
}

export function workspaceStateHref(context: WorkspaceNavigationContext, state: string) {
  const stateChanged = normalizeState(state, context.state) !== normalizeState(context.state, "WA");
  return workspaceNavigationHref({
    ...context,
    fips: stateChanged ? undefined : context.fips,
    state,
  });
}

export function notifyWorkspaceContextChange(detail: WorkspaceContextChangeDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<WorkspaceContextChangeDetail>(workspaceContextChangeEvent, { detail }));
}
