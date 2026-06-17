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
  HeartHandshake,
  History,
  ListChecks,
  Mail,
  MapIcon,
  Search,
  ShieldCheck,
  Server,
  TriangleAlert,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useEffect, useMemo, useState } from "react";
import { Eli5 } from "./eli5";
import { ResultsExplorer } from "./results-explorer";
import type {
  AnalysisIndicator,
  CoverageSummary,
  HistoricalResultRowSummary,
  ImportRunSummary,
  ResultRow,
  ReviewRowSummary,
  SourceSummary,
  StateSummary,
} from "@/lib/types";

type WorkspaceTabsProps = {
  coverage: CoverageSummary | null;
  countyLabel: string;
  historicalRows: HistoricalResultRowSummary[];
  importRuns: ImportRunSummary[];
  indicators: AnalysisIndicator[];
  reviewRows: ReviewRowSummary[];
  results: ResultRow[];
  selectedState: StateSummary | undefined;
  selectedStateCode: string;
  sources: SourceSummary[];
  totalVotes: number;
};

type TabKey =
  | "map"
  | "review"
  | "history"
  | "planner"
  | "data"
  | "methodology"
  | "exports"
  | "imports"
  | "support"
  | "contact";
type ScreeningGraphType = "voteShareScatter" | "dropoffHistogram";
type HistoricalGraphType = "share" | "margin" | "movement" | "klimek" | "shpilkin";

const tabs: Array<{ icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>; key: TabKey; label: string }> = [
  { icon: MapIcon, key: "map", label: "Map" },
  { icon: BarChart3, key: "review", label: "Review Center" },
  { icon: History, key: "history", label: "History" },
  { icon: ListChecks, key: "planner", label: "Source Planner" },
  { icon: FileCheck2, key: "data", label: "Data & Sources" },
  { icon: BookOpen, key: "methodology", label: "Methodology" },
  { icon: Download, key: "exports", label: "Exports & API" },
  { icon: GitBranch, key: "imports", label: "Import Runs" },
  { icon: HeartHandshake, key: "support", label: "Support" },
  { icon: Mail, key: "contact", label: "Contact" },
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

function indicatorExplanation(type: string) {
  if (type.includes("margin")) {
    return "Margin-related indicators compare the size of the local winner margin against the imported review metrics.";
  }

  if (type.includes("turnout")) {
    return "Turnout indicators should be read against the state source denominator and any local reporting notes.";
  }

  if (type.includes("vote") || type.includes("share")) {
    return "Vote-share indicators highlight unusual candidate-share or total-vote patterns for human review.";
  }

  if (type.includes("missing")) {
    return "Missing-data indicators mean a required input was absent or could not be reconciled in the imported bundle.";
  }

  return "This advisory indicator marks a pattern from the imported review data that deserves human review.";
}

function severityBucket(severity: number) {
  if (severity >= 0.85) {
    return "High review priority";
  }

  if (severity >= 0.55) {
    return "Medium review priority";
  }

  return "Low review priority";
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

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function linearRegression(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) {
    return null;
  }

  const count = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);
  const denominator = count * sumXX - sumX * sumX;

  if (denominator === 0) {
    return null;
  }

  const slope = (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;
  return { intercept, slope };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizePct(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.abs(value) <= 1 ? value * 100 : value;
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
  historicalRows,
  importRuns,
  indicators,
  reviewRows,
  results,
  selectedState,
  selectedStateCode,
  sources,
  totalVotes,
}: WorkspaceTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("map");
  const [enabledScreeningGraphs, setEnabledScreeningGraphs] = useState<ScreeningGraphType[]>([
    "voteShareScatter",
    "dropoffHistogram",
  ]);
  const [screeningJurisdiction, setScreeningJurisdiction] = useState("");
  const [enabledHistoricalYears, setEnabledHistoricalYears] = useState<number[]>([]);
  const [enabledHistoricalGraphs, setEnabledHistoricalGraphs] = useState<HistoricalGraphType[]>([
    "share",
    "margin",
    "movement",
    "klimek",
    "shpilkin",
  ]);
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

  const reviewJurisdictionOptions = useMemo(() => {
    const counts = new Map<string, { jurisdictionName: string; rows: number }>();

    for (const row of reviewRows) {
      const current = counts.get(row.jurisdictionCode) ?? {
        jurisdictionName: row.jurisdictionName,
        rows: 0,
      };
      current.rows += 1;
      counts.set(row.jurisdictionCode, current);
    }

    return Array.from(counts.entries())
      .map(([jurisdictionCode, entry]) => ({
        jurisdictionCode,
        jurisdictionName: entry.jurisdictionName,
        rows: entry.rows,
      }))
      .sort((a, b) => b.rows - a.rows || a.jurisdictionName.localeCompare(b.jurisdictionName));
  }, [reviewRows]);

  useEffect(() => {
    const fallback = reviewJurisdictionOptions[0]?.jurisdictionCode ?? "";
    setScreeningJurisdiction((current) =>
      current && reviewJurisdictionOptions.some((option) => option.jurisdictionCode === current) ? current : fallback,
    );
  }, [reviewJurisdictionOptions]);

  const selectedReviewRows = useMemo(
    () => reviewRows.filter((row) => row.jurisdictionCode === screeningJurisdiction),
    [reviewRows, screeningJurisdiction],
  );
  const selectedReviewJurisdiction = reviewJurisdictionOptions.find(
    (option) => option.jurisdictionCode === screeningJurisdiction,
  );
  const reviewGraphCoverageIsPartial =
    reviewRows.length > 0 && reviewJurisdictionOptions.length < Math.max(1, results.length);
  const screeningGraphOptions: Array<{ key: ScreeningGraphType; label: string }> = [
    { key: "voteShareScatter", label: "Vote-Share Scatterplot" },
    { key: "dropoffHistogram", label: "Drop-Off Histogram" },
  ];
  const scatterRows = selectedReviewRows.filter(
    (row) =>
      (row.harrisVotes ?? 0) > 0 &&
      (row.trumpVotes ?? 0) > 0 &&
      normalizePct(row.harrisShare) !== null &&
      normalizePct(row.trumpShare) !== null,
  );
  const scatterMaxVotes = Math.max(
    1,
    ...scatterRows.flatMap((row) => [row.harrisVotes ?? 0, row.trumpVotes ?? 0]),
  );
  const harrisScatterPoints = scatterRows.map((row) => ({
    id: row.id,
    label: row.localUnit,
    votes: row.harrisVotes ?? 0,
    x: row.harrisVotes ?? 0,
    y: normalizePct(row.harrisShare) ?? 0,
  }));
  const trumpScatterPoints = scatterRows.map((row) => ({
    id: row.id,
    label: row.localUnit,
    votes: row.trumpVotes ?? 0,
    x: row.trumpVotes ?? 0,
    y: normalizePct(row.trumpShare) ?? 0,
  }));
  const harrisTrend = linearRegression(harrisScatterPoints);
  const trumpTrend = linearRegression(trumpScatterPoints);
  const dropoffBucketSize = 5;
  const dropoffBuckets = Array.from({ length: 13 }, (_, index) => {
    const low = -30 + index * dropoffBucketSize;
    return {
      dem: 0,
      high: low + dropoffBucketSize,
      label: `${low}% to ${low + dropoffBucketSize}%`,
      low,
      rep: 0,
    };
  });

  for (const row of selectedReviewRows) {
    const demDropoff = normalizePct(row.demDropoff);
    const repDropoff = normalizePct(row.repDropoff);

    for (const [key, value] of [
      ["dem", demDropoff],
      ["rep", repDropoff],
    ] as const) {
      if (value === null) {
        continue;
      }

      const bucketIndex = clamp(Math.floor((clamp(value, -30, 30) + 30) / dropoffBucketSize), 0, dropoffBuckets.length - 1);
      dropoffBuckets[bucketIndex][key] += 1;
    }
  }

  const maxDropoffBucket = Math.max(1, ...dropoffBuckets.flatMap((bucket) => [bucket.dem, bucket.rep]));

  const candidateTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of results) {
      for (const [candidate, votes] of Object.entries(row.votes)) {
        totals.set(candidate, (totals.get(candidate) ?? 0) + votes);
      }
    }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [results]);

  const historicalYears = useMemo(
    () => Array.from(new Set(historicalRows.map((row) => row.electionYear))).sort((a, b) => a - b),
    [historicalRows],
  );

  useEffect(() => {
    setEnabledHistoricalYears(historicalYears);
  }, [historicalYears.join(",")]);

  const historicalYearSummaries = useMemo(() => {
    const summaries = new Map<
      number,
      {
        demVotes: number;
        otherVotes: number;
        repVotes: number;
        rows: number;
        sourceIds: Set<string>;
        totalVotes: number;
      }
    >();

    for (const row of historicalRows) {
      const summary = summaries.get(row.electionYear) ?? {
        demVotes: 0,
        otherVotes: 0,
        repVotes: 0,
        rows: 0,
        sourceIds: new Set<string>(),
        totalVotes: 0,
      };
      summary.demVotes += row.demVotes ?? 0;
      summary.repVotes += row.repVotes ?? 0;
      summary.otherVotes += row.otherVotes ?? 0;
      summary.totalVotes += row.totalVotes ?? 0;
      summary.rows += 1;
      summary.sourceIds.add(row.sourceId);
      summaries.set(row.electionYear, summary);
    }

    return Array.from(summaries.entries())
      .map(([year, summary]) => {
        const marginVotes = Math.abs(summary.demVotes - summary.repVotes);
        const winner = summary.demVotes >= summary.repVotes ? "Democratic" : "Republican";
        return {
          ...summary,
          marginPct: summary.totalVotes > 0 ? (marginVotes / summary.totalVotes) * 100 : 0,
          marginVotes,
          sourceCount: summary.sourceIds.size,
          winner,
          year,
        };
      })
      .sort((a, b) => b.year - a.year);
  }, [historicalRows]);

  const visibleHistoricalYearSet = useMemo(
    () => new Set(enabledHistoricalYears),
    [enabledHistoricalYears],
  );
  const filteredHistoricalSummaries = historicalYearSummaries.filter((summary) => visibleHistoricalYearSet.has(summary.year));
  const filteredHistoricalRows = historicalRows.filter((row) => visibleHistoricalYearSet.has(row.electionYear));
  const visibleHistoricalRows = filteredHistoricalRows.slice(0, 150);
  const maxHistoricalMargin = Math.max(1, ...filteredHistoricalSummaries.map((summary) => summary.marginPct));
  const historicalGraphOptions: Array<{ key: HistoricalGraphType; label: string }> = [
    { key: "share", label: "Vote Share" },
    { key: "margin", label: "Margin Trend" },
    { key: "movement", label: "County Movement" },
    { key: "klimek", label: "Klimek Fingerprints" },
    { key: "shpilkin", label: "Shpilkin Diagnostics" },
  ];
  const historicalCountyTrends = useMemo(() => {
    const rowsByCounty = new Map<string, HistoricalResultRowSummary[]>();

    for (const row of filteredHistoricalRows) {
      rowsByCounty.set(row.jurisdictionName, [...(rowsByCounty.get(row.jurisdictionName) ?? []), row]);
    }

    return Array.from(rowsByCounty.entries())
      .map(([county, rows]) => {
        const sorted = rows.sort((a, b) => a.electionYear - b.electionYear);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const firstDemShare = first?.totalVotes ? ((first.demVotes ?? 0) / first.totalVotes) * 100 : 0;
        const lastDemShare = last?.totalVotes ? ((last.demVotes ?? 0) / last.totalVotes) * 100 : 0;
        return {
          county,
          demShareChange: lastDemShare - firstDemShare,
          rows: sorted,
          totalVotes: sorted.reduce((sum, row) => sum + (row.totalVotes ?? 0), 0),
        };
      })
      .filter((trend) => trend.rows.length >= 2)
      .sort((a, b) => Math.abs(b.demShareChange) - Math.abs(a.demShareChange))
      .slice(0, 12);
  }, [filteredHistoricalRows]);
  const historicalRowsByYear = useMemo(() => {
    const rowsByYear = new Map<number, HistoricalResultRowSummary[]>();

    for (const row of filteredHistoricalRows) {
      rowsByYear.set(row.electionYear, [...(rowsByYear.get(row.electionYear) ?? []), row]);
    }

    return Array.from(rowsByYear.entries())
      .map(([year, rows]) => ({
        maxTotalVotes: Math.max(1, ...rows.map((row) => row.totalVotes ?? 0)),
        rows: rows
          .filter((row) => (row.totalVotes ?? 0) > 0)
          .sort((a, b) => (b.totalVotes ?? 0) - (a.totalVotes ?? 0)),
        year,
      }))
      .sort((a, b) => a.year - b.year);
  }, [filteredHistoricalRows]);
  const shpilkinRowsByYear = useMemo(
    () =>
      historicalRowsByYear.map((yearGroup) => {
        const buckets = Array.from({ length: 10 }, (_, index) => {
          const low = index * 10;
          const high = low + 10;
          const rows = yearGroup.rows.filter((row) => {
            const demShare = row.totalVotes ? ((row.demVotes ?? 0) / row.totalVotes) * 100 : 0;
            return index === 9 ? demShare >= low && demShare <= high : demShare >= low && demShare < high;
          });
          const totalVotes = rows.reduce((sum, row) => sum + (row.totalVotes ?? 0), 0);
          const demVotes = rows.reduce((sum, row) => sum + (row.demVotes ?? 0), 0);
          const repVotes = rows.reduce((sum, row) => sum + (row.repVotes ?? 0), 0);
          return {
            demVotes,
            high,
            label: `${low}-${high}%`,
            low,
            repVotes,
            rows: rows.length,
            totalVotes,
          };
        });

        return {
          buckets,
          maxBucketVotes: Math.max(1, ...buckets.map((bucket) => bucket.totalVotes)),
          year: yearGroup.year,
        };
      }),
    [historicalRowsByYear],
  );
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

  const downloadSvgElement = (elementId: string, filename: string) => {
    const svg = document.getElementById(elementId);
    if (!svg) {
      return;
    }

    const content = new XMLSerializer().serializeToString(svg);
    downloadTextFile(filename, content, "image/svg+xml;charset=utf-8");
  };

  const screeningSlug = `${selectedStateCode.toLowerCase()}-${screeningJurisdiction.toLowerCase() || "review"}`;
  const scatterSvgId = `${screeningSlug}-vote-share-scatter`;
  const dropoffSvgId = `${screeningSlug}-dropoff-histogram`;
  const scatterX = (votes: number) => 52 + (votes / scatterMaxVotes) * 438;
  const scatterY = (share: number) => 246 - (share / 100) * 210;
  const trendY = (trend: { intercept: number; slope: number } | null, x: number) =>
    trend ? scatterY(clamp(trend.intercept + trend.slope * x, 0, 100)) : null;

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
                  <div className="header-actions">
                    <Eli5>
                      This is the ingredient label for the data. It says where the numbers came from, what parser read
                      them, and how confident the import record is.
                    </Eli5>
                    <FileCheck2 aria-hidden size={18} />
                  </div>
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
                  <div className="header-actions">
                    <Eli5>
                      This is like a checklist for the selected state. Available means the app has that kind of data;
                      pending means the importer has not received enough rows for that feature.
                    </Eli5>
                    <ShieldCheck aria-hidden size={18} />
                  </div>
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
                  <div className="header-actions">
                    <Eli5>
                      This is the quick scoreboard. The bars show how the selected state's imported votes split across
                      candidates, like counting colored blocks in one big box.
                    </Eli5>
                    <Database aria-hidden size={18} />
                  </div>
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
              <div className="header-actions">
                <Eli5>
                  This section is like a smoke alarm, not a verdict. It shows patterns that deserve a closer look, such
                  as unusual vote-share or drop-off patterns, and then lists the places connected to those patterns.
                </Eli5>
                <BarChart3 aria-hidden size={18} />
              </div>
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
            {reviewRows.length ? (
              <section className="screening-section" aria-label="Statistical screening graphs">
                <div className="screening-toolbar">
                  <label className="sort-select-label" htmlFor="screening-jurisdiction">
                    <MapIcon aria-hidden size={16} />
                    <select
                      className="sort-select"
                      id="screening-jurisdiction"
                      onChange={(event) => setScreeningJurisdiction(event.target.value)}
                      value={screeningJurisdiction}
                    >
                      {reviewJurisdictionOptions.map((option) => (
                        <option key={option.jurisdictionCode} value={option.jurisdictionCode}>
                          {option.jurisdictionName} ({option.rows} rows)
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="history-controls graph-controls compact-controls" aria-label="Screening graph toggles">
                    <span>Show screening graphs</span>
                    {screeningGraphOptions.map((option) => (
                      <label key={option.key}>
                        <input
                          checked={enabledScreeningGraphs.includes(option.key)}
                          onChange={(event) => {
                            setEnabledScreeningGraphs((graphs) =>
                              event.target.checked
                                ? [...graphs, option.key]
                                : graphs.filter((entry) => entry !== option.key),
                            );
                          }}
                          type="checkbox"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
                {reviewGraphCoverageIsPartial && (
                  <div className="data-warning strong-warning" role="status">
                    <TriangleAlert aria-hidden size={18} />
                    <div>
                      <strong>Partial screening data</strong>
                      <span>
                        These graphs cover {reviewJurisdictionOptions.length.toLocaleString()} of{" "}
                        {results.length.toLocaleString()} result jurisdictions with local review rows. Use them as
                        advisory screening views, not statewide precinct coverage.
                      </span>
                    </div>
                  </div>
                )}

                <div className="screening-grid">
                  {enabledScreeningGraphs.includes("voteShareScatter") && (
                    <article className="screening-card">
                      <div className="screening-card-head">
                        <div>
                          <span>Statistical Screening Graph</span>
                          <strong>Vote-Share by Vote-Count Scatterplot</strong>
                          <small>
                            {selectedReviewJurisdiction?.jurisdictionName ?? stateName}: {scatterRows.length} local rows
                          </small>
                        </div>
                        <button
                          className="secondary-button"
                          onClick={() => downloadSvgElement(scatterSvgId, `${screeningSlug}-vote-share-scatter.svg`)}
                          type="button"
                        >
                          <Download aria-hidden size={15} />
                          Download SVG
                        </button>
                        <Eli5>
                          Imagine lining up jars by how many marbles are inside, then marking what share of each jar is
                          blue or red. This chart asks whether bigger local rows lean differently than smaller rows.
                        </Eli5>
                      </div>
                      <div className="screening-chart-frame">
                        <svg
                          aria-label={`${selectedReviewJurisdiction?.jurisdictionName ?? stateName} vote-share by vote-count scatterplot`}
                          id={scatterSvgId}
                          role="img"
                          viewBox="0 0 560 300"
                        >
                          <rect className="screening-svg-bg" height="300" width="560" />
                          {[0, 25, 50, 75, 100].map((share) => (
                            <g key={share}>
                              <line className="screening-gridline" x1="52" x2="490" y1={scatterY(share)} y2={scatterY(share)} />
                              <text className="screening-axis-label" x="22" y={scatterY(share) + 4}>
                                {share}%
                              </text>
                            </g>
                          ))}
                          {[0, 0.5, 1].map((ratio) => (
                            <g key={ratio}>
                              <line
                                className="screening-gridline"
                                x1={52 + ratio * 438}
                                x2={52 + ratio * 438}
                                y1="36"
                                y2="246"
                              />
                              <text className="screening-axis-label" x={42 + ratio * 438} y="274">
                                {Math.round(scatterMaxVotes * ratio).toLocaleString()}
                              </text>
                            </g>
                          ))}
                          <text className="screening-title" x="52" y="24">
                            {selectedReviewJurisdiction?.jurisdictionName ?? stateName}: local vote-share chart
                          </text>
                          <text className="screening-axis-title centered" x="271" y="286">
                            Candidate votes in local row
                          </text>
                          <text className="screening-axis-title vertical" transform="translate(14 186) rotate(-90)">
                            Candidate vote share
                          </text>
                          {harrisScatterPoints.map((point) => (
                            <circle
                              className="screening-dot dem"
                              cx={scatterX(point.x)}
                              cy={scatterY(point.y)}
                              key={`harris-${point.id}`}
                              r="3"
                            >
                              <title>
                                {point.label}: Harris {point.votes.toLocaleString()} votes, {point.y.toFixed(2)}%
                              </title>
                            </circle>
                          ))}
                          {trumpScatterPoints.map((point) => (
                            <circle
                              className="screening-dot rep"
                              cx={scatterX(point.x)}
                              cy={scatterY(point.y)}
                              key={`trump-${point.id}`}
                              r="3"
                            >
                              <title>
                                {point.label}: Trump {point.votes.toLocaleString()} votes, {point.y.toFixed(2)}%
                              </title>
                            </circle>
                          ))}
                          {harrisTrend && trendY(harrisTrend, 0) !== null && trendY(harrisTrend, scatterMaxVotes) !== null && (
                            <line
                              className="screening-trend dem"
                              x1={scatterX(0)}
                              x2={scatterX(scatterMaxVotes)}
                              y1={trendY(harrisTrend, 0) ?? 0}
                              y2={trendY(harrisTrend, scatterMaxVotes) ?? 0}
                            />
                          )}
                          {trumpTrend && trendY(trumpTrend, 0) !== null && trendY(trumpTrend, scatterMaxVotes) !== null && (
                            <line
                              className="screening-trend rep"
                              x1={scatterX(0)}
                              x2={scatterX(scatterMaxVotes)}
                              y1={trendY(trumpTrend, 0) ?? 0}
                              y2={trendY(trumpTrend, scatterMaxVotes) ?? 0}
                            />
                          )}
                          <g className="screening-legend">
                            <circle className="screening-dot rep" cx="430" cy="24" r="4" />
                            <text x="440" y="28">Trump</text>
                            <circle className="screening-dot dem" cx="486" cy="24" r="4" />
                            <text x="496" y="28">Harris</text>
                          </g>
                        </svg>
                      </div>
                      <details className="how-to-read">
                        <summary>How to read this</summary>
                        <p>
                          Each dot is one local result row. Left-to-right shows how many votes a candidate received in
                          that row; up-and-down shows that candidate&apos;s share of the same row.
                        </p>
                        <p>
                          The trend lines help show whether larger local rows lean differently than smaller ones. A flag
                          means &quot;look closer,&quot; not proof that something happened.
                        </p>
                      </details>
                    </article>
                  )}

                  {enabledScreeningGraphs.includes("dropoffHistogram") && (
                    <article className="screening-card">
                      <div className="screening-card-head">
                        <div>
                          <span>Statistical Screening Graph</span>
                          <strong>Presidential-Versus-Comparison Drop-Off Histogram</strong>
                          <small>
                            {selectedReviewJurisdiction?.jurisdictionName ?? stateName}: DEM and REP local drop-off rates
                          </small>
                        </div>
                        <button
                          className="secondary-button"
                          onClick={() => downloadSvgElement(dropoffSvgId, `${screeningSlug}-dropoff-histogram.svg`)}
                          type="button"
                        >
                          <Download aria-hidden size={15} />
                          Download SVG
                        </button>
                        <Eli5>
                          Imagine comparing two receipts from the same store trip. If one item is much larger or smaller
                          than expected across many receipts, the bars show where those differences pile up.
                        </Eli5>
                      </div>
                      <div className="screening-chart-frame">
                        <svg
                          aria-label={`${selectedReviewJurisdiction?.jurisdictionName ?? stateName} presidential versus comparison drop-off histogram`}
                          id={dropoffSvgId}
                          role="img"
                          viewBox="0 0 560 300"
                        >
                          <rect className="screening-svg-bg" height="300" width="560" />
                          {[0, 0.5, 1].map((ratio) => (
                            <g key={ratio}>
                              <line
                                className="screening-gridline"
                                x1="52"
                                x2="506"
                                y1={246 - ratio * 210}
                                y2={246 - ratio * 210}
                              />
                              <text className="screening-axis-label" x="26" y={250 - ratio * 210}>
                                {Math.round(maxDropoffBucket * ratio)}
                              </text>
                            </g>
                          ))}
                          <line className="screening-midline" x1="279" x2="279" y1="36" y2="246" />
                          <text className="screening-title" x="52" y="24">
                            {selectedReviewJurisdiction?.jurisdictionName ?? stateName}: President vs comparison drop-off rates
                          </text>
                          <text className="screening-axis-title centered" x="279" y="284">
                            <tspan x="279" dy="0">Presidential votes minus comparison votes</tspan>
                            <tspan x="279" dy="12">as % of presidential votes</tspan>
                          </text>
                          <text className="screening-axis-title vertical" transform="translate(14 172) rotate(-90)">
                            Local row count
                          </text>
                          {dropoffBuckets.map((bucket, index) => {
                            const x = 58 + index * 34;
                            const demHeight = (bucket.dem / maxDropoffBucket) * 196;
                            const repHeight = (bucket.rep / maxDropoffBucket) * 196;
                            return (
                              <g key={bucket.label}>
                                <rect
                                  className="screening-bar dem"
                                  height={Math.max(1, demHeight)}
                                  width="12"
                                  x={x}
                                  y={246 - demHeight}
                                >
                                  <title>
                                    DEM {bucket.label}: {bucket.dem} local rows
                                  </title>
                                </rect>
                                <rect
                                  className="screening-bar rep"
                                  height={Math.max(1, repHeight)}
                                  width="12"
                                  x={x + 14}
                                  y={246 - repHeight}
                                >
                                  <title>
                                    REP {bucket.label}: {bucket.rep} local rows
                                  </title>
                                </rect>
                              </g>
                            );
                          })}
                          <text className="screening-axis-label" x="48" y="274">-30%</text>
                          <text className="screening-axis-label" x="270" y="274">0%</text>
                          <text className="screening-axis-label" x="482" y="274">+30%</text>
                          <g className="screening-legend">
                            <rect className="screening-bar dem" height="10" width="10" x="430" y="16" />
                            <text x="444" y="25">DEM</text>
                            <rect className="screening-bar rep" height="10" width="10" x="486" y="16" />
                            <text x="500" y="25">REP</text>
                          </g>
                        </svg>
                      </div>
                      <details className="how-to-read">
                        <summary>How to read this</summary>
                        <p>
                          This compares presidential votes with a same-party comparison contest in the same local row.
                          Bars near zero mean the two contests moved similarly in that place.
                        </p>
                        <p>
                          Bars far left or right show larger drop-off differences. Normal split-ticket voting can cause
                          differences; the chart helps show whether those differences cluster oddly.
                        </p>
                      </details>
                    </article>
                  )}
                </div>
              </section>
            ) : (
              <div className="empty-state compact">
                <strong>No statistical screening rows loaded for {stateName}</strong>
                <span>These graphs need reviewCharts.metadata.rows from the legacy bundle.</span>
              </div>
            )}
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
                      <span className="review-explainer">{indicatorExplanation(indicator.type)}</span>
                      <small>{indicator.detail}</small>
                    </article>
                  ))}
                </div>
                <div className="table-wrap">
                  <div className="table-helper-row">
                    <Eli5>
                      This table is the list behind the warning lights. Each row names a place, the type of pattern, and
                      how strongly the imported screening data says someone should review it.
                    </Eli5>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Jurisdiction</th>
                        <th>Flag</th>
                        <th>Severity</th>
                        <th>Priority</th>
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
                          <td>{severityBucket(indicator.severity)}</td>
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
              <Eli5>
                This chart is like sorting warning sticky notes into piles. Bigger piles mean more places had the same
                kind of advisory pattern.
              </Eli5>
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

      {activeTab === "history" && (
        <div className="tab-panel-content">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Historical Baselines</h2>
                <span>
                  {historicalRows.length
                    ? `${historicalRows.length.toLocaleString()} rows across ${historicalYearSummaries.length} election years`
                  : "Waiting on historical rows from the legacy bundle"}
                </span>
              </div>
              <div className="header-actions">
                <Eli5>
                  This section is like looking at old report cards before reading the new one. It shows whether the same
                  places changed over past presidential elections, when those old rows are available.
                </Eli5>
                <History aria-hidden size={18} />
              </div>
            </div>
            {historicalRows.length ? (
              <>
                <div className="history-controls" aria-label="Historical year toggles">
                  <span>Show years</span>
                  {historicalYears.map((year) => (
                    <label key={year}>
                      <input
                        checked={visibleHistoricalYearSet.has(year)}
                        onChange={(event) => {
                          setEnabledHistoricalYears((years) =>
                            event.target.checked ? [...years, year].sort() : years.filter((entry) => entry !== year),
                          );
                        }}
                        type="checkbox"
                      />
                      {year}
                    </label>
                  ))}
                </div>
                <div className="history-controls graph-controls" aria-label="Historical graph toggles">
                  <span>Show graphs</span>
                  {historicalGraphOptions.map((option) => (
                    <label key={option.key}>
                      <input
                        checked={enabledHistoricalGraphs.includes(option.key)}
                        onChange={(event) => {
                          setEnabledHistoricalGraphs((graphs) =>
                            event.target.checked
                              ? [...graphs, option.key]
                              : graphs.filter((entry) => entry !== option.key),
                          );
                        }}
                        type="checkbox"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <div className="history-summary-grid">
                  {filteredHistoricalSummaries.map((summary) => (
                    <article key={summary.year}>
                      <span>{summary.year} President</span>
                      <strong>{summary.winner}</strong>
                      <dl>
                        <div>
                          <dt>Dem</dt>
                          <dd>{summary.demVotes.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>Rep</dt>
                          <dd>{summary.repVotes.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>Total</dt>
                          <dd>{summary.totalVotes.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>Margin</dt>
                          <dd>
                            {summary.marginVotes.toLocaleString()} ({summary.marginPct.toFixed(2)}%)
                          </dd>
                        </div>
                      </dl>
                      <small>
                        {summary.rows.toLocaleString()} rows · {summary.sourceCount} source
                        {summary.sourceCount === 1 ? "" : "s"}
                      </small>
                    </article>
                  ))}
                </div>
                <div className="history-chart-grid">
                  {enabledHistoricalGraphs.includes("share") && (
                    <article className="history-chart-card">
                      <div>
                        <strong>Statewide Vote Share</strong>
                        <span>Democratic, Republican, and other share by enabled year</span>
                        <Eli5>
                          This is like dividing a pizza each year. The colored pieces show how much of the vote went to
                          each group, so you can compare the slices from year to year.
                        </Eli5>
                      </div>
                      <div className="history-share-chart" role="img" aria-label="Statewide historical vote share chart">
                        {filteredHistoricalSummaries.map((summary) => {
                          const demShare = summary.totalVotes > 0 ? (summary.demVotes / summary.totalVotes) * 100 : 0;
                          const repShare = summary.totalVotes > 0 ? (summary.repVotes / summary.totalVotes) * 100 : 0;
                          const otherShare = Math.max(0, 100 - demShare - repShare);
                          return (
                            <div className="history-share-row" key={summary.year}>
                              <span>{summary.year}</span>
                              <div>
                                <i className="history-dem" style={{ width: `${demShare}%` }} title={`Dem ${demShare.toFixed(2)}%`} />
                                <i className="history-rep" style={{ width: `${repShare}%` }} title={`Rep ${repShare.toFixed(2)}%`} />
                                <i className="history-other" style={{ width: `${otherShare}%` }} title={`Other ${otherShare.toFixed(2)}%`} />
                              </div>
                              <strong>
                                D {demShare.toFixed(1)}% / R {repShare.toFixed(1)}%
                              </strong>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  )}

                  {enabledHistoricalGraphs.includes("margin") && (
                    <article className="history-chart-card">
                      <div>
                        <strong>Margin Trend</strong>
                        <span>Winner margin as a share of total votes</span>
                        <Eli5>
                          This shows how big the winner's lead was each year. A longer bar means the winner had more room
                          between them and second place.
                        </Eli5>
                      </div>
                      <div className="history-margin-chart" role="img" aria-label="Historical winner margin chart">
                        {filteredHistoricalSummaries.map((summary) => {
                          const width = Math.max(4, (summary.marginPct / maxHistoricalMargin) * 100);
                          return (
                            <div className="history-margin-row" key={summary.year}>
                              <span>{summary.year}</span>
                              <div>
                                <i
                                  className={summary.winner === "Democratic" ? "history-dem" : "history-rep"}
                                  style={{ width: `${width}%` }}
                                />
                              </div>
                              <strong>{summary.marginPct.toFixed(2)}%</strong>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  )}

                  {enabledHistoricalGraphs.includes("movement") && (
                    <article className="history-chart-card wide">
                      <div>
                        <strong>Largest County Dem-Share Movement</strong>
                        <span>Change between earliest and latest enabled historical year</span>
                        <Eli5>
                          This is like asking which counties moved their chair the farthest between the first selected
                          year and the last selected year. Blue means movement toward Democrats; red means movement away.
                        </Eli5>
                      </div>
                      <div className="history-swing-list">
                        {historicalCountyTrends.map((trend) => {
                          const width = Math.min(100, Math.max(5, Math.abs(trend.demShareChange) * 4));
                          return (
                            <div className="history-swing-row" key={trend.county}>
                              <span>{trend.county}</span>
                              <div>
                                <i
                                  className={trend.demShareChange >= 0 ? "history-dem" : "history-rep"}
                                  style={{ width: `${width}%` }}
                                />
                              </div>
                              <strong>
                                {trend.demShareChange >= 0 ? "+" : ""}
                                {trend.demShareChange.toFixed(2)} pts
                              </strong>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  )}

                  {enabledHistoricalGraphs.includes("klimek") && (
                    <article className="history-chart-card wide">
                      <div>
                        <strong>Klimek-Style Vote Fingerprints</strong>
                        <span>
                          Separate year charts plotting Democratic share against county vote volume as a temporary turnout
                          proxy. True Klimek fingerprints will use turnout percentages once denominators are imported.
                        </span>
                        <Eli5>
                          Imagine each county as a dot. The dot's left-right position is vote share, and its height is
                          vote size for now. This is only a practice version until real turnout denominators are loaded.
                        </Eli5>
                      </div>
                      <div className="data-warning strong-warning" role="status">
                        <TriangleAlert aria-hidden size={18} />
                        <div>
                          <strong>Proxy graph, not a complete Klimek fingerprint</strong>
                          <span>
                            This uses county vote volume because true turnout percentages are not imported for these
                            historical rows. Do not interpret it as a complete turnout-fingerprint test.
                          </span>
                        </div>
                      </div>
                      <div className="fingerprint-grid">
                        {historicalRowsByYear.map((yearGroup) => (
                          <div className="fingerprint-panel" key={yearGroup.year}>
                            <strong>{yearGroup.year}</strong>
                            <svg role="img" viewBox="0 0 260 170" aria-label={`${yearGroup.year} Klimek-style vote fingerprint`}>
                              <line className="fingerprint-axis" x1="34" x2="244" y1="136" y2="136" />
                              <line className="fingerprint-axis" x1="34" x2="34" y1="16" y2="136" />
                              <line className="fingerprint-midline" x1="139" x2="139" y1="16" y2="136" />
                              <text className="fingerprint-label" x="34" y="154">0% D</text>
                              <text className="fingerprint-label" x="128" y="154">50%</text>
                              <text className="fingerprint-label" x="220" y="154">100%</text>
                              <text className="fingerprint-label" x="38" y="24">High volume</text>
                              {yearGroup.rows.map((row) => {
                                const demShare = row.totalVotes ? ((row.demVotes ?? 0) / row.totalVotes) * 100 : 0;
                                const x = 34 + (demShare / 100) * 210;
                                const y = 136 - Math.sqrt((row.totalVotes ?? 0) / yearGroup.maxTotalVotes) * 112;
                                const radius = Math.max(2.4, Math.min(7.5, Math.sqrt((row.totalVotes ?? 0) / yearGroup.maxTotalVotes) * 7));
                                return (
                                  <circle
                                    className={demShare >= 50 ? "fingerprint-dem-dot" : "fingerprint-rep-dot"}
                                    cx={x.toFixed(2)}
                                    cy={y.toFixed(2)}
                                    key={row.id}
                                    r={radius.toFixed(2)}
                                  >
                                    <title>
                                      {row.jurisdictionName}: D {demShare.toFixed(2)}%, total {(row.totalVotes ?? 0).toLocaleString()}
                                    </title>
                                  </circle>
                                );
                              })}
                            </svg>
                          </div>
                        ))}
                      </div>
                    </article>
                  )}

                  {enabledHistoricalGraphs.includes("shpilkin") && (
                    <article className="history-chart-card wide">
                      <div>
                        <strong>Shpilkin-Style Vote-Share Diagnostics</strong>
                        <span>
                          Vote volume grouped by Democratic share bucket for each enabled year. This separates the
                          distribution diagnostic from the Klimek fingerprint view.
                        </span>
                        <Eli5>
                          Imagine sorting counties into buckets by how Democratic they were, then stacking their votes in
                          each bucket. Tall buckets show where a lot of votes are concentrated.
                        </Eli5>
                      </div>
                      <div className="data-warning strong-warning" role="status">
                        <TriangleAlert aria-hidden size={18} />
                        <div>
                          <strong>Diagnostic view with limited inputs</strong>
                          <span>
                            This groups county vote volume by vote-share buckets. It does not replace precinct-level
                            distributions or turnout-based review when those data are missing.
                          </span>
                        </div>
                      </div>
                      <div className="shpilkin-grid">
                        {shpilkinRowsByYear.map((yearGroup) => (
                          <div className="shpilkin-panel" key={yearGroup.year}>
                            <strong>{yearGroup.year}</strong>
                            <div className="shpilkin-bars" role="img" aria-label={`${yearGroup.year} Shpilkin-style vote-share bucket chart`}>
                              {yearGroup.buckets.map((bucket) => {
                                const height = Math.max(4, (bucket.totalVotes / yearGroup.maxBucketVotes) * 100);
                                const demShare = bucket.totalVotes ? (bucket.demVotes / bucket.totalVotes) * 100 : 0;
                                return (
                                  <div className="shpilkin-bucket" key={bucket.label}>
                                    <i
                                      className={demShare >= 50 ? "shpilkin-dem-bar" : "shpilkin-rep-bar"}
                                      style={{ height: `${height}%` }}
                                    >
                                      <span>
                                        {bucket.label}: {bucket.totalVotes.toLocaleString()} votes, {bucket.rows} rows
                                      </span>
                                    </i>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="shpilkin-labels" aria-hidden="true">
                              <span>0% D</span>
                              <span>50%</span>
                              <span>100%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  )}
                </div>
                <div className="table-wrap">
                  <div className="table-helper-row">
                    <Eli5>
                      This table is the raw list feeding the history charts. Each row is one place in one election year,
                      with Democratic, Republican, other, and total votes.
                    </Eli5>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Year</th>
                        <th>{countyLabel}</th>
                        <th>Dem</th>
                        <th>Rep</th>
                        <th>Other</th>
                        <th>Total</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleHistoricalRows.map((row) => (
                        <tr key={row.id}>
                          <td className="mono">{row.electionYear}</td>
                          <td>{row.jurisdictionName}</td>
                          <td className="mono">{(row.demVotes ?? 0).toLocaleString()}</td>
                          <td className="mono">{(row.repVotes ?? 0).toLocaleString()}</td>
                          <td className="mono">{(row.otherVotes ?? 0).toLocaleString()}</td>
                          <td className="mono">{(row.totalVotes ?? 0).toLocaleString()}</td>
                          <td className="mono">{row.sourceId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredHistoricalRows.length > visibleHistoricalRows.length && (
                  <div className="table-note">
                    Showing first {visibleHistoricalRows.length.toLocaleString()} rows from the enabled years. Use the
                    historical API for the full selected-state extract.
                  </div>
                )}
              </>
            ) : (
              <div className="empty-panel">
                <strong>No historical baseline rows loaded for {stateName}</strong>
                <span>
                  The importer looks for historicalBaseline.series rows in the legacy state bundle. Current repo data
                  only exposes populated historical series for a subset of states.
                </span>
              </div>
            )}
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
              <div className="header-actions">
                <Eli5>
                  This is the project checklist for one state. It says which drawers have useful data inside and which
                  drawers are still waiting for files from the data pipeline.
                </Eli5>
                <ListChecks aria-hidden size={18} />
              </div>
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
              <div className="header-actions">
                <Eli5>
                  This is the bibliography. If someone asks where a number came from, this section should point to the
                  official source, local artifact, parser, and confidence note.
                </Eli5>
                <FileCheck2 aria-hidden size={18} />
              </div>
            </div>
            <div className="source-links-panel">
              <div>
                <strong>Official Source Links</strong>
                <span>
                  Every imported source record for {stateName} should include an auditable URL or documented
                  artifact reference.
                </span>
                <Eli5>
                  These are links back to the original paperwork. A missing URL is like a recipe without the cookbook
                  page number: the data may exist, but it is harder to audit.
                </Eli5>
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
                  {source.sourceUrl ? (
                    <a href={source.sourceUrl} rel="noreferrer" target="_blank">
                      Open source
                    </a>
                  ) : (
                    <span className="pending">Source URL missing</span>
                  )}
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
              <div className="header-actions">
                <Eli5>
                  This is the rulebook. It explains what the app is allowed to claim, what the warnings mean, and what
                  should not be overinterpreted.
                </Eli5>
                <BookOpen aria-hidden size={18} />
              </div>
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
              <div className="header-actions">
                <Eli5>
                  This is the takeout counter. You can download the same data shown on screen or use API links so another
                  tool can ask for the data directly.
                </Eli5>
                <Database aria-hidden size={18} />
              </div>
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
              <li className="api-helper">
                <Eli5>
                  Each API row is like a vending-machine button. Change the state code or limit in the URL, and the app
                  returns that slice of data as JSON.
                </Eli5>
              </li>
              <li>
                <strong>Results</strong>
                <code>/api/results?state={selectedStateCode}&amp;year=2024&amp;level=county</code>
              </li>
              <li>
                <strong>Indicators</strong>
                <code>/api/indicators?state={selectedStateCode}&amp;year=2024</code>
              </li>
              <li>
                <strong>Raw review rows</strong>
                <code>/api/review-rows?state={selectedStateCode}&amp;year=2024&amp;limit=500</code>
              </li>
              <li>
                <strong>Turnout</strong>
                <code>/api/turnout?state={selectedStateCode}&amp;year=2024&amp;limit=500</code>
              </li>
              <li>
                <strong>Historical baselines</strong>
                <code>/api/historical-baselines?state={selectedStateCode}&amp;limit=500</code>
              </li>
              <li>
                <strong>Sources</strong>
                <code>/api/sources?state={selectedStateCode}&amp;year=2024</code>
              </li>
              <li>
                <strong>Coverage</strong>
                <code>/api/coverage?state={selectedStateCode}&amp;year=2024</code>
              </li>
              <li>
                <strong>Completeness</strong>
                <code>/api/completeness?year=2024</code>
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
              <div className="header-actions">
                <Eli5>
                  This is the delivery log. Each entry says when the importer carried data from the source bundle into
                  the database and whether that trip finished cleanly.
                </Eli5>
                {importRuns.length ? <GitBranch aria-hidden size={18} /> : <Activity aria-hidden size={18} />}
              </div>
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

      {activeTab === "support" && (
        <div className="tab-panel-content support-grid">
          <section className="panel support-panel">
            <div className="panel-header">
              <div>
                <h2>Support Civic Result Maps</h2>
                <span>Help cover server costs and continued development</span>
              </div>
              <HeartHandshake aria-hidden size={18} />
            </div>
            <div className="support-card">
              <div className="support-copy">
                <span className="section-label">Project funding</span>
                <strong>Keep the maps, APIs, and data pipeline online.</strong>
                <p>
                  Civic Result Maps is maintained as an independent public data project. Contributions help pay for
                  hosting, database capacity, source collection, validation work, and ongoing development.
                </p>
              </div>
              <div className="support-summary-grid">
                <article>
                  <Server aria-hidden size={18} />
                  <strong>Server costs</strong>
                  <span>Hosting, database usage, API traffic, and build infrastructure.</span>
                </article>
                <article>
                  <GitBranch aria-hidden size={18} />
                  <strong>Development</strong>
                  <span>ETL tooling, source audits, coverage checks, and interface improvements.</span>
                </article>
              </div>
              <a className="support-button" href="https://ko-fi.com/camreyn" rel="noreferrer" target="_blank">
                <HeartHandshake aria-hidden size={16} />
                Support on Ko-fi
              </a>
            </div>
          </section>
        </div>
      )}

      {activeTab === "contact" && (
        <div className="tab-panel-content contact-grid">
          <section className="panel contact-panel">
            <div className="panel-header">
              <div>
                <h2>Contact</h2>
                <span>Civic Result Maps project contact</span>
              </div>
              <Mail aria-hidden size={18} />
            </div>
            <div className="contact-card">
              <div>
                <span className="section-label">Project lead</span>
                <strong>Camreyn</strong>
              </div>
              <div>
                <span className="section-label">Email</span>
                <a href="mailto:camreyn@protonmail.com">camreyn@protonmail.com</a>
              </div>
              <a className="contact-button" href="mailto:camreyn@protonmail.com">
                <Mail aria-hidden size={16} />
                Email Camreyn
              </a>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
