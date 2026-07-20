import type { SourceSummary } from "./types.ts";

export const workspaceSourceCatalogSorts = ["grouped", "title", "status", "attention"] as const;
export type WorkspaceSourceCatalogSort = (typeof workspaceSourceCatalogSorts)[number];
export type WorkspaceSourceCatalogLinkFilter = "all" | "linked" | "missing";

export type WorkspaceSourceCatalogFilters = {
  category: string;
  link: WorkspaceSourceCatalogLinkFilter;
  query: string;
  sort: WorkspaceSourceCatalogSort;
  status: "all" | SourceSummary["status"];
};

const sourceStatusPriority: Record<SourceSummary["status"], number> = {
  needs_data: 0,
  candidate: 1,
  documented_exclusion: 2,
  superseded: 3,
  loaded: 4,
};

const sourceStatusLabels: Record<SourceSummary["status"], string> = {
  candidate: "Candidate",
  documented_exclusion: "Documented exclusion",
  loaded: "Loaded",
  needs_data: "Needs data",
  superseded: "Superseded",
};

export function workspaceSourceStatusLabel(status: SourceSummary["status"]) {
  return sourceStatusLabels[status];
}

export function filterAndSortWorkspaceSources(
  sources: SourceSummary[],
  filters: WorkspaceSourceCatalogFilters,
) {
  const query = filters.query.trim().toLocaleLowerCase();
  const filtered = sources.filter((source) => {
    if (filters.category !== "all" && source.category !== filters.category) return false;
    if (filters.status !== "all" && source.status !== filters.status) return false;
    if (filters.link === "linked" && !source.sourceUrl) return false;
    if (filters.link === "missing" && source.sourceUrl) return false;
    if (!query) return true;
    return [
      source.id,
      source.title,
      source.category,
      source.authority,
      source.parser,
      source.localArtifact,
      source.confidence,
      source.status,
      source.timestampBasis,
    ].some((value) => value.toLocaleLowerCase().includes(query));
  });

  return [...filtered].sort((left, right) => {
    if (filters.sort === "title") return compareTitle(left, right);
    if (filters.sort === "status") {
      return sourceStatusPriority[left.status] - sourceStatusPriority[right.status] || compareTitle(left, right);
    }
    if (filters.sort === "attention") {
      return Number(Boolean(left.sourceUrl)) - Number(Boolean(right.sourceUrl))
        || sourceStatusPriority[left.status] - sourceStatusPriority[right.status]
        || compareTitle(left, right);
    }
    return left.category.localeCompare(right.category)
      || compareTitle(left, right);
  });
}

function compareTitle(left: SourceSummary, right: SourceSummary) {
  return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}
