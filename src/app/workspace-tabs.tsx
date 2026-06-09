"use client";

import {
  Activity,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Database,
  Download,
  FileCheck2,
  GitBranch,
  ListChecks,
  MapIcon,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useEffect, useMemo, useState } from "react";
import { ResultsExplorer } from "./results-explorer";
import type {
  AnalysisIndicator,
  CoverageSummary,
  ImportRunSummary,
  ResultRow,
  SourceSummary,
  StateSummary,
} from "@/lib/types";

type WorkspaceTabsProps = {
  coverage: CoverageSummary | null;
  countyLabel: string;
  importRuns: ImportRunSummary[];
  indicators: AnalysisIndicator[];
  results: ResultRow[];
  selectedState: StateSummary | undefined;
  selectedStateCode: string;
  sources: SourceSummary[];
  totalVotes: number;
};

type TabKey = "map" | "review" | "planner" | "data" | "methodology" | "exports" | "imports";

const tabs: Array<{ icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>; key: TabKey; label: string }> = [
  { icon: MapIcon, key: "map", label: "Map" },
  { icon: BarChart3, key: "review", label: "Review Center" },
  { icon: ListChecks, key: "planner", label: "Source Planner" },
  { icon: FileCheck2, key: "data", label: "Data & Sources" },
  { icon: BookOpen, key: "methodology", label: "Methodology" },
  { icon: Download, key: "exports", label: "Exports & API" },
  { icon: GitBranch, key: "imports", label: "Import Runs" },
];

function formatCapability(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function statusLabel(value: boolean | undefined) {
  return value ? "Available" : "Pending";
}

function indicatorLabel(type: string) {
  return type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pct(value: number, total: number) {
  return total > 0 ? `${((value / total) * 100).toFixed(2)}%` : "0.00%";
}

function summaryValue(value: unknown) {
  if (typeof value === "number") {
    return value.toLocaleString();
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  return "";
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function dateLabel(value: string | null) {
  if (!value) {
    return "Not finished";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function WorkspaceTabs({
  coverage,
  countyLabel,
  importRuns,
  indicators,
  results,
  selectedState,
  selectedStateCode,
  sources,
  totalVotes,
}: WorkspaceTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("map");
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewType, setReviewType] = useState("all");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as TabKey | null;
    if (tab && tabs.some((item) => item.key === tab)) {
      setActiveTab(tab);
    }
  }, []);

  const selectTab = (tab: TabKey) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("state", selectedStateCode);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
  };

  const indicatorTypes = useMemo(
    () => Array.from(new Set(indicators.map((indicator) => indicator.type))).sort(),
    [indicators],
  );

  const filteredIndicators = useMemo(() => {
    const query = reviewQuery.trim().toLowerCase();
    return indicators.filter((indicator) => {
      const typeMatches = reviewType === "all" || indicator.type === reviewType;
      const queryMatches =
        !query ||
        indicator.jurisdictionName.toLowerCase().includes(query) ||
        indicator.label.toLowerCase().includes(query) ||
        indicator.summary.toLowerCase().includes(query);
      return typeMatches && queryMatches;
    });
  }, [indicators, reviewQuery, reviewType]);

  const groupedIndicatorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const indicator of indicators) {
      counts.set(indicator.label, (counts.get(indicator.label) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [indicators]);

  const candidateTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of results) {
      for (const [candidate, votes] of Object.entries(row.votes)) {
        totals.set(candidate, (totals.get(candidate) ?? 0) + votes);
      }
    }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [results]);

  const topIndicators = filteredIndicators.slice(0, 6);
  const capabilityEntries = coverage
    ? Object.entries(coverage.capabilities).filter(([key]) => key !== "notes")
    : [];
  const pendingCapabilities = capabilityEntries.filter(([, value]) => !value);
  const readyCapabilities = capabilityEntries.filter(([, value]) => value);
  const selectedImportRuns = importRuns.filter((run) => run.state === selectedStateCode);
  const latestRun = selectedImportRuns[0];
  const sourcesWithoutUrls = sources.filter((source) => !source.sourceUrl.trim());
  const validationChecks = [
    {
      detail: `${coverage?.loadedJurisdictions ?? results.length} loaded jurisdictions`,
      label: "Result rows loaded",
      passed: results.length > 0,
    },
    {
      detail: `${sources.length} source document record${sources.length === 1 ? "" : "s"}`,
      label: "Source provenance",
      passed: sources.length > 0,
    },
    {
      detail: coverage?.validation.passed ? "Coverage summary passes" : "Coverage summary has gaps",
      label: "Coverage validation",
      passed: Boolean(coverage?.validation.passed),
    },
    {
      detail: "Covered by npm run validate:maps before release",
      label: "Map join validation",
      passed: Boolean(selectedState?.capabilities.map),
    },
    {
      detail: indicators.length ? `${indicators.length} indicators loaded` : "Waiting on review rows",
      label: "Review data",
      passed: indicators.length > 0,
    },
  ];

  const stateName = selectedState?.name ?? selectedStateCode;
  const exportSlug = `${selectedStateCode.toLowerCase()}-2024-president`;

  const exportResults = () =>
    downloadCsv(
      `${exportSlug}-results.csv`,
      ["jurisdiction", "winner", "harris", "trump", "other", "total", "margin_votes", "margin_pct", "source"],
      results.map((row) => [
        row.jurisdictionName,
        row.winner,
        row.votes.Harris ?? 0,
        row.votes.Trump ?? 0,
        row.votes.Other ?? 0,
        row.totalVotes,
        row.marginVotes,
        row.marginPct,
        row.sourceId,
      ]),
    );

  const exportIndicators = () =>
    downloadCsv(
      `${exportSlug}-review-indicators.csv`,
      ["jurisdiction", "label", "type", "severity", "summary", "detail"],
      indicators.map((indicator) => [
        indicator.jurisdictionName,
        indicator.label,
        indicator.type,
        indicator.severity,
        indicator.summary,
        indicator.detail,
      ]),
    );

  const exportSources = () =>
    downloadCsv(
      `${exportSlug}-sources.csv`,
      ["category", "title", "authority", "source_url", "local_artifact", "parser", "timestamp_basis", "confidence", "status"],
      sources.map((source) => [
        source.category,
        source.title,
        source.authority,
        source.sourceUrl,
        source.localArtifact,
        source.parser,
        source.timestampBasis,
        source.confidence,
        source.status,
      ]),
    );

  const exportCoverage = () =>
    downloadCsv(
      `${exportSlug}-coverage.csv`,
      ["state", "expected_jurisdictions", "loaded_jurisdictions", "result_rows", "sources", "validation", "warnings"],
      [
        [
          selectedStateCode,
          coverage?.expectedJurisdictions ?? "",
          coverage?.loadedJurisdictions ?? results.length,
          coverage?.resultRows ?? results.length,
          coverage?.sourceCount ?? sources.length,
          coverage?.validation.passed ? "pass" : "gap",
          coverage?.validation.warnings.join(" ") ?? "",
        ],
      ],
    );

  return (
    <section className="workspace-tabs" aria-label={`${stateName} workspace`}>
      <nav className="tab-bar" aria-label="Workspace sections">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              aria-selected={activeTab === tab.key}
              className="tab-button"
              key={tab.key}
              onClick={() => selectTab(tab.key)}
              type="button"
            >
              <Icon aria-hidden size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {activeTab === "map" && (
        <div className="tab-panel-content">
          <div className="content-grid">
            <ResultsExplorer
              countyLabel={countyLabel}
              indicators={indicators}
              results={results}
              selectedState={selectedStateCode}
              sources={sources}
            />
            <div className="detail-stack">
              <section className="panel" aria-label="Provenance">
                <div className="panel-header">
                  <div>
                    <h2>Source Provenance</h2>
                    <span>Authority, parser, and confidence</span>
                  </div>
                  <FileCheck2 aria-hidden size={18} />
                </div>
                <ul className="source-list">
                  {sources.map((source) => (
                    <li key={source.id}>
                      <strong>{source.title}</strong>
                      <span>{source.confidence}</span>
                      <span className="mono">{source.parser}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="panel" aria-label="Coverage flags">
                <div className="panel-header">
                  <div>
                    <h2>Coverage</h2>
                    <span>Loaded platform capabilities</span>
                  </div>
                  <ShieldCheck aria-hidden size={18} />
                </div>
                <ul className="flag-list">
                  {coverage &&
                    capabilityEntries.map(([key, value]) => (
                      <li key={key}>
                        <strong>{formatCapability(key)}</strong>
                        <span className={value ? "available" : "pending"}>{statusLabel(Boolean(value))}</span>
                      </li>
                    ))}
                </ul>
              </section>

              <section className="panel" aria-label="Statewide vote breakdown">
                <div className="panel-header">
                  <div>
                    <h2>State Snapshot</h2>
                    <span>Candidate totals and vote share</span>
                  </div>
                  <Database aria-hidden size={18} />
                </div>
                <div className="candidate-bars">
                  {candidateTotals.map(([candidate, votes]) => (
                    <div className="candidate-bar-row" key={candidate}>
                      <div>
                        <strong>{candidate}</strong>
                        <span>
                          {votes.toLocaleString()} · {pct(votes, totalVotes)}
                        </span>
                      </div>
                      <i
                        className={
                          candidate === "Harris"
                            ? "candidate-bar-harris"
                            : candidate === "Trump"
                              ? "candidate-bar-trump"
                              : "candidate-bar-other"
                        }
                        style={{ width: `${Math.max(4, totalVotes ? (votes / totalVotes) * 100 : 0)}%` }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {activeTab === "review" && (
        <div className="tab-panel-content">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Review Center</h2>
                <span>{indicators.length} advisory indicators for {stateName}</span>
              </div>
              <BarChart3 aria-hidden size={18} />
            </div>
            <div className="review-summary-grid">
              <article>
                <span>Flagged jurisdictions</span>
                <strong>{new Set(indicators.map((indicator) => indicator.jurisdictionCode)).size}</strong>
              </article>
              <article>
                <span>Indicators</span>
                <strong>{indicators.length}</strong>
              </article>
              <article>
                <span>Highest severity</span>
                <strong>{indicators[0]?.severity.toFixed(2) ?? "0.00"}</strong>
              </article>
            </div>
            <div className="review-tools">
              <label className="table-search" htmlFor="review-search">
                <Search aria-hidden size={16} />
                <input
                  autoComplete="off"
                  id="review-search"
                  onChange={(event) => setReviewQuery(event.target.value)}
                  placeholder="Filter review indicators"
                  type="search"
                  value={reviewQuery}
                />
              </label>
              <label className="sort-select-label" htmlFor="review-type">
                <ListChecks aria-hidden size={16} />
                <select
                  className="sort-select"
                  id="review-type"
                  onChange={(event) => setReviewType(event.target.value)}
                  value={reviewType}
                >
                  <option value="all">All flag types</option>
                  {indicatorTypes.map((type) => (
                    <option key={type} value={type}>
                      {indicatorLabel(type)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {indicators.length ? (
              <div className="review-layout">
                <div className="priority-list">
                  {topIndicators.map((indicator) => (
                    <article className="priority-card" key={indicator.id}>
                      <div>
                        <span className="indicator-pill">! {indicator.label}</span>
                        <strong>{indicator.jurisdictionName}</strong>
                      </div>
                      <p>{indicator.summary}</p>
                      <small>{indicator.detail}</small>
                    </article>
                  ))}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Jurisdiction</th>
                        <th>Flag</th>
                        <th>Severity</th>
                        <th>Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIndicators.map((indicator) => (
                        <tr key={indicator.id}>
                          <td>{indicator.jurisdictionName}</td>
                          <td>
                            <span className="indicator-pill">! {indicator.label}</span>
                          </td>
                          <td className="mono">{indicator.severity.toFixed(3)}</td>
                          <td>{indicator.summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <strong>No advisory review rows loaded yet</strong>
                <span>When the legacy repo exposes review chart rows for this state, the importer will populate this tab.</span>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Flag Mix</h2>
                <span>Counts by advisory indicator type</span>
              </div>
            </div>
            <div className="mini-bars">
              {groupedIndicatorCounts.length ? (
                groupedIndicatorCounts.map(([label, count]) => (
                  <div className="mini-bar-row" key={label}>
                    <span>{label}</span>
                    <strong>{count}</strong>
                    <i style={{ width: `${Math.max(8, (count / indicators.length) * 100)}%` }} />
                  </div>
                ))
              ) : (
                <div className="empty-state compact">
                  <strong>Waiting on review data</strong>
                  <span>Expected path: reviewCharts.metadata.rows in the state bundle.</span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "planner" && (
        <div className="tab-panel-content">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Source Planner</h2>
                <span>Readiness by platform capability</span>
              </div>
              <ListChecks aria-hidden size={18} />
            </div>
            <div className="capability-grid">
              {capabilityEntries.map(([key, value]) => (
                <article className={value ? "capability-card ready" : "capability-card pending-card"} key={key}>
                  <span>{formatCapability(key)}</span>
                  <strong>{statusLabel(Boolean(value))}</strong>
                </article>
              ))}
            </div>
            <div className="planner-grid">
              <article>
                <strong>Ready now</strong>
                <ul>
                  {readyCapabilities.map(([key]) => (
                    <li key={key}>{formatCapability(key)}</li>
                  ))}
                </ul>
              </article>
              <article>
                <strong>Waiting on data</strong>
                <ul>
                  {pendingCapabilities.length ? (
                    pendingCapabilities.map(([key]) => <li key={key}>{formatCapability(key)}</li>)
                  ) : (
                    <li>All tracked capabilities are marked available.</li>
                  )}
                </ul>
              </article>
              <article>
                <strong>Latest selected-state import</strong>
                <span>
                  {latestRun
                    ? `${latestRun.status} · ${dateLabel(latestRun.finishedAt ?? latestRun.startedAt)}`
                    : "No import run found for this state."}
                </span>
              </article>
            </div>
            <div className="planner-note">
              <strong>Follow-up for data production</strong>
              <span>
                Review rows require local reporting-unit data at reviewCharts.metadata.rows. Turnout and historical tabs
                should remain pending until those row families are available in the repo bundle.
              </span>
            </div>
          </section>
        </div>
      )}

      {activeTab === "data" && (
        <div className="tab-panel-content">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Data & Sources</h2>
                <span>{sources.length} source document records</span>
              </div>
              <FileCheck2 aria-hidden size={18} />
            </div>
            <div className="source-links-panel">
              <div>
                <strong>Official Source Links</strong>
                <span>
                  Every imported source record for {stateName} should include an auditable URL or documented
                  artifact reference.
                </span>
              </div>
              {sourcesWithoutUrls.length > 0 && (
                <p className="source-warning">
                  {sourcesWithoutUrls.length} source record{sourcesWithoutUrls.length === 1 ? "" : "s"} missing a URL.
                </p>
              )}
              <ul>
                {sources.map((source) => (
                  <li key={`${source.id}-link`}>
                    <div>
                      <strong>{source.category}</strong>
                      <span>{source.title}</span>
                    </div>
                    {source.sourceUrl ? (
                      <a href={source.sourceUrl} rel="noreferrer" target="_blank">
                        Open official source
                      </a>
                    ) : (
                      <span className="pending">URL missing</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="source-card-grid">
              {sources.map((source) => (
                <article className="source-card" key={source.id}>
                  <span>{source.category}</span>
                  <strong>{source.title}</strong>
                  <p>{source.confidence}</p>
                  <dl>
                    <dt>Authority</dt>
                    <dd>{source.authority}</dd>
                    <dt>Parser</dt>
                    <dd>{source.parser}</dd>
                    <dt>Artifact</dt>
                    <dd>{source.localArtifact || "Not recorded"}</dd>
                    <dt>Status</dt>
                    <dd>{source.status}</dd>
                  </dl>
                  <a href={source.sourceUrl} rel="noreferrer" target="_blank">
                    Open source
                  </a>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === "methodology" && (
        <div className="tab-panel-content methodology-grid">
          <section className="panel text-panel">
            <div className="panel-header">
              <div>
                <h2>Methodology</h2>
                <span>How this release should be read</span>
              </div>
              <BookOpen aria-hidden size={18} />
            </div>
            <div className="method-list">
              <article>
                <strong>Certified result rows</strong>
                <p>Map shading and totals come from imported state bundles that reconcile to the generated source data.</p>
              </article>
              <article>
                <strong>Advisory indicators</strong>
                <p>Flags identify patterns that deserve review. They are not proof of tampering or a substitute for records.</p>
              </article>
              <article>
                <strong>Geometry joins</strong>
                <p>Every deployed state map is checked against production result rows with npm run validate:maps.</p>
              </article>
              <article>
                <strong>Private writes</strong>
                <p>Importer writes are token-gated and disabled in production unless a controlled backfill is running.</p>
              </article>
              <article>
                <strong>Current data gaps</strong>
                <p>Review graphs, turnout, and historical baselines only become active when the corresponding rows exist in the imported state bundle.</p>
              </article>
              <article>
                <strong>Exports</strong>
                <p>CSV exports are generated in the browser from the same selected-state data shown in the interface.</p>
              </article>
            </div>
            <div className="validation-list">
              {validationChecks.map((check) => (
                <article className={check.passed ? "validation-pass" : "validation-warn"} key={check.label}>
                  {check.passed ? <CheckCircle2 aria-hidden size={17} /> : <TriangleAlert aria-hidden size={17} />}
                  <div>
                    <strong>{check.label}</strong>
                    <span>{check.detail}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === "exports" && (
        <div className="tab-panel-content">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Exports & API</h2>
                <span>Download selected state data or use public read endpoints</span>
              </div>
              <Database aria-hidden size={18} />
            </div>
            <div className="export-grid">
              <button onClick={exportResults} type="button">
                <Download aria-hidden size={16} />
                Results CSV
              </button>
              <button onClick={exportIndicators} type="button">
                <Download aria-hidden size={16} />
                Review CSV
              </button>
              <button onClick={exportSources} type="button">
                <Download aria-hidden size={16} />
                Sources CSV
              </button>
              <button onClick={exportCoverage} type="button">
                <Download aria-hidden size={16} />
                Coverage CSV
              </button>
            </div>
            <div className="export-summary-grid">
              <article>
                <span>Rows</span>
                <strong>{results.length}</strong>
              </article>
              <article>
                <span>Indicators</span>
                <strong>{indicators.length}</strong>
              </article>
              <article>
                <span>Sources</span>
                <strong>{sources.length}</strong>
              </article>
              <article>
                <span>Total votes</span>
                <strong>{totalVotes.toLocaleString()}</strong>
              </article>
            </div>
            <ul className="api-list">
              <li>
                <strong>Results</strong>
                <code>/api/results?state={selectedStateCode}&amp;year=2024&amp;level=county</code>
              </li>
              <li>
                <strong>Indicators</strong>
                <code>/api/indicators?state={selectedStateCode}&amp;year=2024</code>
              </li>
              <li>
                <strong>Sources</strong>
                <code>/api/sources?state={selectedStateCode}&amp;year=2024</code>
              </li>
              <li>
                <strong>Coverage</strong>
                <code>/api/coverage?state={selectedStateCode}&amp;year=2024</code>
              </li>
            </ul>
          </section>
        </div>
      )}

      {activeTab === "imports" && (
        <div className="tab-panel-content">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Import Runs</h2>
                <span>Latest ETL promotion records</span>
              </div>
              {importRuns.length ? <GitBranch aria-hidden size={18} /> : <Activity aria-hidden size={18} />}
            </div>
            <ul className="source-list">
              {importRuns.map((run) => (
                <li key={run.id}>
                  <strong>
                    {run.state} {run.electionYear}
                  </strong>
                  <span>
                    {run.parser} · {dateLabel(run.startedAt)}
                  </span>
                  <span className="mono">{run.status}</span>
                  {Object.keys(run.summary).length > 0 && (
                    <span>
                      {Object.entries(run.summary)
                        .slice(0, 5)
                        .map(([key, value]) => `${key}: ${summaryValue(value)}`)
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </section>
  );
}
