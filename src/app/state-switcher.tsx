"use client";

import {
  BarChart3,
  Database,
  FileCheck2,
  History,
  MapIcon,
  Search,
  UsersRound,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useMemo, useState } from "react";
import type { CompletenessSummary, StateSummary } from "@/lib/types";

type StateSwitcherProps = {
  completenessReport: CompletenessSummary[];
  selectedState: string;
  states: StateSummary[];
};
type DataPresence = "loaded" | "partial" | "missing";
type StateFilter =
  | "all"
  | "complete"
  | "review-ready"
  | "results-only"
  | "needs-sources"
  | "missing-turnout"
  | "missing-review"
  | "has-turnout"
  | "has-history";
type StateDataBadge = {
  abbr: string;
  count: number | null;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  key: string;
  label: string;
  presence: DataPresence;
  title: string;
};

const stateFilterOptions: Array<{ label: string; value: StateFilter }> = [
  { label: "All states", value: "all" },
  { label: "Complete", value: "complete" },
  { label: "Review-ready", value: "review-ready" },
  { label: "Results only", value: "results-only" },
  { label: "Needs sources", value: "needs-sources" },
  { label: "Missing turnout", value: "missing-turnout" },
  { label: "Missing review", value: "missing-review" },
  { label: "Has turnout", value: "has-turnout" },
  { label: "Has history", value: "has-history" },
];

function stateStatus(summary: CompletenessSummary | undefined, state: StateSummary) {
  if (!summary) {
    return state.capabilities.certifiedResults
      ? { className: "status-partial", label: "Tracked" }
      : { className: "status-waiting", label: "Waiting" };
  }

  if (summary.status === "complete") {
    return { className: "status-ready", label: "Complete" };
  }

  if (summary.status === "review_ready") {
    return { className: "status-partial", label: "Review" };
  }

  if (summary.status === "results_only") {
    return { className: "status-results", label: "Results" };
  }

  if (summary.status === "needs_sources") {
    return { className: "status-gap", label: "Sources" };
  }

  return { className: "status-waiting", label: "Waiting" };
}

function dataPresence(input: { capability?: boolean; count?: number | null; partialWhen?: boolean }) {
  if ((input.count ?? 0) > 0) {
    return "loaded" as const;
  }

  if (input.partialWhen || input.capability) {
    return "partial" as const;
  }

  return "missing" as const;
}

function countLabel(count: number | null, unit: string) {
  if (count === null) {
    return "Status only";
  }

  return `${count.toLocaleString()} ${unit}${count === 1 ? "" : "s"}`;
}

function stateDataBadges(state: StateSummary, summary: CompletenessSummary | undefined): StateDataBadge[] {
  const capabilities = summary?.capabilities ?? state.capabilities;
  const resultRows = summary?.resultRows ?? 0;
  const sourceCount = summary?.sourceCount ?? 0;
  const missingSourceUrls = summary?.sourcesMissingUrls ?? 0;
  const reviewRows = summary?.reviewRowCount ?? 0;
  const indicators = summary?.indicatorCount ?? 0;
  const turnoutRows = summary?.turnoutRowCount ?? 0;
  const historicalRows = summary?.historicalRowCount ?? 0;

  return [
    {
      abbr: "Rs",
      count: resultRows,
      icon: Database,
      key: "results",
      label: "Results",
      presence: dataPresence({ capability: capabilities.certifiedResults, count: resultRows }),
      title: `Certified results: ${countLabel(resultRows, "row")}`,
    },
    {
      abbr: "So",
      count: sourceCount,
      icon: FileCheck2,
      key: "sources",
      label: "Sources",
      presence: sourceCount > 0 && missingSourceUrls === 0 ? "loaded" : sourceCount > 0 ? "partial" : "missing",
      title:
        missingSourceUrls > 0
          ? `Sources: ${sourceCount.toLocaleString()} record${sourceCount === 1 ? "" : "s"}, ${missingSourceUrls.toLocaleString()} missing URL${missingSourceUrls === 1 ? "" : "s"}`
          : `Sources: ${countLabel(sourceCount, "record")}`,
    },
    {
      abbr: "Mp",
      count: null,
      icon: MapIcon,
      key: "map",
      label: "Map",
      presence: capabilities.map ? "loaded" : "missing",
      title: capabilities.map ? "Map geometry available" : "Map geometry not present",
    },
    {
      abbr: "Rv",
      count: reviewRows,
      icon: BarChart3,
      key: "review",
      label: "Review",
      presence: dataPresence({
        capability: capabilities.reviewGraphs,
        count: reviewRows,
        partialWhen: indicators > 0,
      }),
      title: `Review rows: ${countLabel(reviewRows, "row")}; advisory flags: ${indicators.toLocaleString()}`,
    },
    {
      abbr: "Tu",
      count: turnoutRows,
      icon: UsersRound,
      key: "turnout",
      label: "Turnout",
      presence: dataPresence({ capability: capabilities.turnout, count: turnoutRows }),
      title: `Turnout: ${countLabel(turnoutRows, "row")}`,
    },
    {
      abbr: "Hy",
      count: historicalRows,
      icon: History,
      key: "history",
      label: "History",
      presence: dataPresence({ capability: capabilities.historicalBaseline, count: historicalRows }),
      title: `Historical baseline: ${countLabel(historicalRows, "row")}`,
    },
  ];
}

function stateMatchesFilter(summary: CompletenessSummary | undefined, filter: StateFilter) {
  if (filter === "all") {
    return true;
  }

  if (!summary) {
    return false;
  }

  if (filter === "complete") {
    return summary.status === "complete";
  }

  if (filter === "review-ready") {
    return summary.status === "review_ready" || summary.status === "complete";
  }

  if (filter === "results-only") {
    return summary.status === "results_only";
  }

  if (filter === "needs-sources") {
    return summary.status === "needs_sources" || summary.sourceCount === 0 || summary.sourcesMissingUrls > 0;
  }

  if (filter === "missing-turnout") {
    return summary.turnoutRowCount === 0;
  }

  if (filter === "missing-review") {
    return summary.reviewRowCount === 0;
  }

  if (filter === "has-turnout") {
    return summary.turnoutRowCount > 0;
  }

  return summary.historicalRowCount > 0;
}

export function StateSwitcher({ completenessReport, selectedState, states }: StateSwitcherProps) {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const normalizedQuery = query.trim().toLowerCase();
  const completenessByState = useMemo(
    () => new Map(completenessReport.map((summary) => [summary.state, summary])),
    [completenessReport],
  );
  const filteredStates = useMemo(
    () =>
      states.filter((state) => {
        const summary = completenessByState.get(state.code);

        if (!stateMatchesFilter(summary, stateFilter)) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        return (
          state.code.toLowerCase().includes(normalizedQuery) ||
          state.name.toLowerCase().includes(normalizedQuery) ||
          state.authority.toLowerCase().includes(normalizedQuery)
        );
      }),
    [completenessByState, normalizedQuery, stateFilter, states],
  );

  return (
    <div className="state-switcher">
      <div className="state-data-legend" aria-label="State data legend">
        <span><i className="data-dot loaded" /> Loaded</span>
        <span><i className="data-dot partial" /> Partial</span>
        <span><i className="data-dot missing" /> Missing</span>
      </div>
      <label className="state-filter" htmlFor="state-filter">
        <span>Show</span>
        <select
          id="state-filter"
          onChange={(event) => setStateFilter(event.target.value as StateFilter)}
          value={stateFilter}
        >
          {stateFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="state-search" htmlFor="state-search">
        <Search aria-hidden size={16} />
        <input
          autoComplete="off"
          id="state-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search or pick a state"
          type="search"
          value={query}
        />
      </label>

      <div className="state-list" data-count={filteredStates.length}>
        {filteredStates.map((state) => {
          const summary = completenessByState.get(state.code);
          const status = stateStatus(summary, state);
          const badges = stateDataBadges(state, summary);

          return (
            <a
              aria-pressed={state.code === selectedState}
              href={`/?state=${state.code}`}
              className="state-button"
              key={state.code}
            >
              <div className="state-button-head">
                <strong>
                  {state.name} <span className="mono">{state.code}</span>
                </strong>
                <span className={`state-status ${status.className}`}>{status.label}</span>
              </div>
              <div className="state-meta-row">
                <span>{state.authority}</span>
                {summary?.sourceTier && <span className="state-tier">{summary.sourceTier.replaceAll("_", " ")}</span>}
              </div>
              <div className="state-data-grid" aria-label={`${state.name} data availability`}>
                {badges.map((badge) => {
                  const Icon = badge.icon;

                  return (
                    <span
                      aria-label={`${badge.label}: ${badge.presence}`}
                      className={`state-data-badge ${badge.presence}`}
                      key={badge.key}
                      title={badge.title}
                    >
                      <Icon aria-hidden size={13} />
                      <span>{badge.abbr}</span>
                    </span>
                  );
                })}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
