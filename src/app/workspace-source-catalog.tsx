"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkspaceProductionConfigV2 } from "@/lib/workspace-layout-v2";
import {
  filterAndSortWorkspaceSources,
  workspaceSourceCatalogSorts,
  workspaceSourceStatusLabel,
  type WorkspaceSourceCatalogLinkFilter,
  type WorkspaceSourceCatalogSort,
} from "@/lib/workspace-source-catalog";
import type { SourceSummary } from "@/lib/types";

type WorkspaceSourceCatalogProps = {
  initiallyOpen: boolean;
  sources: SourceSummary[];
  stateName: string;
  variant: NonNullable<WorkspaceProductionConfigV2["provenanceVariant"]>;
};

const sourceStatuses: SourceSummary["status"][] = [
  "loaded",
  "candidate",
  "needs_data",
  "superseded",
  "documented_exclusion",
];

export function WorkspaceSourceCatalog({ initiallyOpen, sources, stateName, variant }: WorkspaceSourceCatalogProps) {
  const [category, setCategory] = useState("all");
  const [link, setLink] = useState<WorkspaceSourceCatalogLinkFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<WorkspaceSourceCatalogSort>("grouped");
  const [status, setStatus] = useState<"all" | SourceSummary["status"]>("all");
  const [open, setOpen] = useState(initiallyOpen);
  const categories = useMemo(
    () => Array.from(new Set(sources.map((source) => source.category))).sort((left, right) => left.localeCompare(right)),
    [sources],
  );
  const filteredSources = useMemo(
    () => filterAndSortWorkspaceSources(sources, { category, link, query, sort, status }),
    [category, link, query, sort, sources, status],
  );
  const missingUrlCount = sources.filter((source) => !source.sourceUrl).length;
  const linkedUrlCount = sources.length - missingUrlCount;
  const hasFilters = category !== "all" || link !== "all" || query.trim() !== "" || status !== "all";

  useEffect(() => {
    setOpen(initiallyOpen);
  }, [initiallyOpen]);

  const clearFilters = () => {
    setCategory("all");
    setLink("all");
    setQuery("");
    setStatus("all");
  };

  const content = sources.length === 0 ? (
    <div className="source-catalog-empty">
      <strong>No source records are loaded for {stateName}</strong>
      <span>The catalog will appear when source metadata is available for this state.</span>
    </div>
  ) : (
    <>
      <div className="source-catalog-controls">
        <label className="source-catalog-search">
          <span>Search sources</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title, authority, parser, artifact..."
            type="search"
            value={query}
          />
        </label>
        <label>
          <span>Category</span>
          <select onChange={(event) => setCategory(event.target.value)} value={category}>
            <option value="all">All categories</option>
            {categories.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select onChange={(event) => setStatus(event.target.value as "all" | SourceSummary["status"])} value={status}>
            <option value="all">All statuses</option>
            {sourceStatuses.map((value) => <option key={value} value={value}>{workspaceSourceStatusLabel(value)}</option>)}
          </select>
        </label>
        <label>
          <span>Official link</span>
          <select onChange={(event) => setLink(event.target.value as WorkspaceSourceCatalogLinkFilter)} value={link}>
            <option value="all">Any link status</option>
            <option value="linked">Linked only</option>
            <option value="missing">Missing link</option>
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select onChange={(event) => setSort(event.target.value as WorkspaceSourceCatalogSort)} value={sort}>
            {workspaceSourceCatalogSorts.map((value) => (
              <option key={value} value={value}>{sourceSortLabel(value)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="source-catalog-results" aria-live="polite">
        <span>{filteredSources.length} of {sources.length} source records</span>
        <span>{missingUrlCount} missing official URL{missingUrlCount === 1 ? "" : "s"}</span>
        {hasFilters && <button onClick={clearFilters} type="button">Clear filters</button>}
      </div>
      {filteredSources.length > 0 ? (
        <div className="source-catalog-list">
          {filteredSources.map((source) => (
            <details className="source-catalog-record" key={source.id}>
              <summary>
                <span className="source-catalog-category">{source.category}</span>
                <strong>{source.title}</strong>
                <span className="source-catalog-status" data-status={source.status}>{workspaceSourceStatusLabel(source.status)}</span>
              </summary>
              <div className="source-catalog-record-body">
                <p>{source.confidence || "No confidence note recorded."}</p>
                <dl>
                  <div><dt>Authority</dt><dd>{source.authority || "Not recorded"}</dd></div>
                  <div><dt>Election</dt><dd>{source.state} {source.electionYear}</dd></div>
                  <div><dt>Parser</dt><dd className="mono">{source.parser || "Not recorded"}</dd></div>
                  <div><dt>Artifact</dt><dd className="mono">{source.localArtifact || "Not recorded"}</dd></div>
                  <div><dt>Timestamp basis</dt><dd>{source.timestampBasis || "Not recorded"}</dd></div>
                  <div><dt>Record ID</dt><dd className="mono">{source.id}</dd></div>
                </dl>
                {source.sourceUrl ? (
                  <a href={source.sourceUrl} rel="noreferrer" target="_blank">Open official source</a>
                ) : (
                  <span className="pending">Official source URL missing</span>
                )}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="source-catalog-empty">
          <strong>No source records match these filters</strong>
          <span>Clear the filters or broaden the search terms.</span>
          <button onClick={clearFilters} type="button">Show all sources</button>
        </div>
      )}
    </>
  );

  if (variant === "expanded") {
    return (
      <section aria-label={`${stateName} source catalog`} className="source-catalog" data-variant={variant}>
        <div className="source-catalog-heading">
          <div><strong>Source catalog</strong><span>Search, filter, and expand the provenance behind this workspace.</span></div>
          <span>{sources.length} records</span>
        </div>
        {content}
      </section>
    );
  }

  if (variant === "summary") {
    return (
      <section aria-label={`${stateName} source catalog summary`} className="source-catalog" data-variant={variant}>
        <div className="source-catalog-heading">
          <div><strong>Source catalog summary</strong><span>A quick provenance inventory with the full catalog one step away.</span></div>
          <span>{sources.length} records</span>
        </div>
        <div aria-label="Source catalog counts" className="source-catalog-summary-grid" role="group">
          <div><strong>{sources.length}</strong><span>Records</span></div>
          <div><strong>{categories.length}</strong><span>Categories</span></div>
          <div><strong>{linkedUrlCount}</strong><span>Official links</span></div>
          <div><strong>{missingUrlCount}</strong><span>Links needed</span></div>
        </div>
        <details
          className="source-catalog-summary-browse"
          onToggle={(event) => setOpen(event.currentTarget.open)}
          open={open}
        >
          <summary>
            <span>Browse source records</span>
            <span>{open ? "Hide catalog" : "Search and filter"}</span>
          </summary>
          <div className="source-catalog-disclosure-body">{content}</div>
        </details>
      </section>
    );
  }

  return (
    <details
      className="source-catalog source-catalog-disclosure"
      data-variant={variant}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary>
        <span><strong>Source catalog</strong><small>Search and inspect {sources.length} provenance records</small></span>
        <span>{missingUrlCount ? `${missingUrlCount} need links` : "Links recorded"}</span>
      </summary>
      <div className="source-catalog-disclosure-body">{content}</div>
    </details>
  );
}

function sourceSortLabel(value: WorkspaceSourceCatalogSort) {
  if (value === "grouped") return "Category, then title";
  if (value === "title") return "Title";
  if (value === "status") return "Status needing work";
  return "Needs attention";
}
