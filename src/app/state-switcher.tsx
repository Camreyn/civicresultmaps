"use client";

import {
  BarChart3,
  Database,
  FileCheck2,
  History,
  MapIcon,
  Search,
  Settings2,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { hasBaseResultGeometry } from "@/lib/map-geometry";
import { affectedLocationText } from "@/lib/security-incident-summary";
import type { CompletenessSummary, SecurityIncidentStateSummary, StateSummary } from "@/lib/types";

type StateSwitcherProps = {
  completenessReport: CompletenessSummary[];
  securityIncidentStates: SecurityIncidentStateSummary[];
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
  | "has-result-map"
  | "has-security-incidents"
  | "equipment-map-only"
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

const stateListScrollStorageKey = "crm-state-list-scroll-top";
const emptyStateCapabilities: StateSummary["capabilities"] = {
  certifiedResults: false,
  historicalBaseline: false,
  map: false,
  notes: "Security incident records are available independently of election-result coverage.",
  reviewGraphs: false,
  sourcePlanner: false,
  turnout: false,
};

const stateFilterOptions: Array<{ label: string; value: StateFilter }> = [
  { label: "All states", value: "all" },
  { label: "Complete", value: "complete" },
  { label: "Review-ready", value: "review-ready" },
  { label: "Results only", value: "results-only" },
  { label: "Needs sources", value: "needs-sources" },
  { label: "Result maps", value: "has-result-map" },
  { label: "Loaded bomb-threat records", value: "has-security-incidents" },
  { label: "Equipment maps only", value: "equipment-map-only" },
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

function resultMapIsReady(summary: {
  capability: boolean;
  mapGeometrySourceCount: number;
  resultRows: number;
  stateCode: string;
}) {
  return (
    summary.resultRows > 0 &&
    hasBaseResultGeometry(summary.stateCode) &&
    summary.capability &&
    summary.mapGeometrySourceCount > 0
  );
}

function mapPresence(stateCode: string, capability: boolean, mapGeometrySourceCount: number, resultRows: number) {
  if (resultMapIsReady({ capability, mapGeometrySourceCount, resultRows, stateCode })) {
    return "loaded" as const;
  }

  if (resultRows > 0 && (capability || mapGeometrySourceCount > 0)) {
    return "partial" as const;
  }

  return "missing" as const;
}

function mapTitle(stateCode: string, capability: boolean, mapGeometrySourceCount: number, resultRows: number) {
  if (resultMapIsReady({ capability, mapGeometrySourceCount, resultRows, stateCode })) {
    return `Result map geometry available: ${countLabel(mapGeometrySourceCount, "loaded geometry source")}`;
  }

  if (resultRows === 0) {
    return "Result map unavailable until certified result rows are loaded";
  }

  if (capability) {
    return "Map capability is flagged, but no loaded geometry source is tracked";
  }

  if (mapGeometrySourceCount > 0) {
    return "Map geometry source is tracked, but the map capability flag is not enabled";
  }

  return "Map geometry not present";
}

function reviewTitle(reviewCapable: boolean, reviewRows: number, countyIndicators: number, totalIndicators: number, flaggedAreas: number) {
  if (reviewRows > 0) {
    const splitNote = flaggedAreas > countyIndicators ? `; ${flaggedAreas.toLocaleString()} flagged areas total` : "";
    return `Review rows: ${countLabel(reviewRows, "row")}; county indicators: ${countyIndicators.toLocaleString()}; total advisory indicators: ${totalIndicators.toLocaleString()}${splitNote}`;
  }

  if (reviewCapable) {
    return "Review capability is tracked, but no local review rows are loaded yet; advisory flags have not been evaluated";
  }

  return "Review rows are not loaded for this state; advisory flags have not been evaluated";
}
function stateDataBadges(state: StateSummary, summary: CompletenessSummary | undefined): StateDataBadge[] {
  const capabilities = summary?.capabilities ?? state.capabilities;
  const resultRows = summary?.resultRows ?? 0;
  const sourceCount = summary?.sourceCount ?? 0;
  const mapGeometrySourceCount = summary?.mapGeometrySourceCount ?? 0;
  const missingSourceUrls = summary?.sourcesMissingUrls ?? 0;
  const reviewRows = summary?.reviewRowCount ?? 0;
  const indicators = summary?.indicatorCount ?? 0;
  const countyIndicators = summary?.countyIndicatorCount ?? indicators;
  const flaggedAreas = summary?.flaggedAreas ?? summary?.flaggedJurisdictions ?? 0;
  const turnoutRows = summary?.turnoutRowCount ?? 0;
  const historicalRows = summary?.historicalRowCount ?? 0;
  const equipmentRows = summary?.equipmentRowCount ?? 0;

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
      presence: mapPresence(state.code, capabilities.map, mapGeometrySourceCount, resultRows),
      title: mapTitle(state.code, capabilities.map, mapGeometrySourceCount, resultRows),
    },
    {
      abbr: "Rv",
      count: countyIndicators,
      icon: BarChart3,
      key: "review",
      label: "Review",
      presence: dataPresence({
        capability: capabilities.reviewGraphs,
        count: reviewRows,
        partialWhen: indicators > 0,
      }),
      title: reviewTitle(capabilities.reviewGraphs, reviewRows, countyIndicators, indicators, flaggedAreas),
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
    {
      abbr: "Eq",
      count: equipmentRows,
      icon: Settings2,
      key: "equipment",
      label: "Equipment",
      presence: dataPresence({ count: equipmentRows }),
      title: `Equipment context: ${countLabel(equipmentRows, "row")}`,
    },
  ];
}

function stateMatchesFilter(
  state: StateSummary,
  summary: CompletenessSummary | undefined,
  filter: StateFilter,
  securityIncidentStateCodes: Set<string>,
) {
  if (filter === "all") {
    return true;
  }


  if (filter === "has-security-incidents") {
    return securityIncidentStateCodes.has(state.code);
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

  if (filter === "has-result-map") {
    return resultMapIsReady({
      capability: summary.capabilities.map,
      mapGeometrySourceCount: summary.mapGeometrySourceCount,
      resultRows: summary.resultRows,
      stateCode: state.code,
    });
  }

  if (filter === "equipment-map-only") {
    return (
      summary.equipmentRowCount > 0 &&
      !resultMapIsReady({
        capability: summary.capabilities.map,
        mapGeometrySourceCount: summary.mapGeometrySourceCount,
        resultRows: summary.resultRows,
        stateCode: state.code,
      })
    );
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

export function StateSwitcher({
  completenessReport,
  securityIncidentStates,
  selectedState,
  states,
}: StateSwitcherProps) {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const stateListRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const completenessByState = useMemo(
    () => new Map(completenessReport.map((summary) => [summary.state, summary])),
    [completenessReport],
  );
  const securityIncidentStateCodes = useMemo(
    () => new Set(securityIncidentStates.map((summary) => summary.state)),
    [securityIncidentStates],
  );
  const securitySummaryByState = useMemo(
    () => new Map(securityIncidentStates.map((summary) => [summary.state, summary])),
    [securityIncidentStates],
  );
  const filterableStates = useMemo(() => {
    if (stateFilter !== "has-security-incidents") {
      return states;
    }

    const knownCodes = new Set(states.map((state) => state.code));
    const securityOnlyStates: StateSummary[] = securityIncidentStates
      .filter((summary) => !knownCodes.has(summary.state))
      .map((summary) => ({
        authority: "Official county security records",
        capabilities: emptyStateCapabilities,
        code: summary.state,
        countyLabel: "County",
        name: summary.stateName,
      }));

    return [...states, ...securityOnlyStates].sort((left, right) => left.name.localeCompare(right.name));
  }, [securityIncidentStates, stateFilter, states]);
  const filteredStates = useMemo(
    () =>
      filterableStates.filter((state) => {
        const summary = completenessByState.get(state.code);

        if (!stateMatchesFilter(state, summary, stateFilter, securityIncidentStateCodes)) {
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
    [completenessByState, filterableStates, normalizedQuery, securityIncidentStateCodes, stateFilter],
  );

  useLayoutEffect(() => {
    const list = stateListRef.current;
    const savedScrollTop = Number(window.sessionStorage.getItem(stateListScrollStorageKey) ?? "0");

    if (!list || !Number.isFinite(savedScrollTop)) {
      return;
    }

    const restoreScroll = () => {
      list.scrollTop = savedScrollTop;
    };

    restoreScroll();
    const frameId = window.requestAnimationFrame(restoreScroll);
    const timeoutId = window.setTimeout(restoreScroll, 0);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [filteredStates.length, selectedState]);

  const rememberStateListScroll = () => {
    const list = stateListRef.current;

    if (!list) {
      return;
    }

    window.sessionStorage.setItem(stateListScrollStorageKey, String(list.scrollTop));
  };

  return (
    <div className="state-switcher">
      <div className="state-data-legend" aria-label="State data legend" data-tour="state-data-legend">
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
              {option.value === "has-security-incidents"
                ? `${option.label} (${securityIncidentStates.length})`
                : option.label}
            </option>
          ))}
        </select>
      </label>
      {stateFilter === "has-security-incidents" && (
        <p className="state-filter-note">
          Shows states with at least one loaded official county record. This is not a complete list of every state
          where threats may have occurred.
        </p>
      )}
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

      <div className="state-list" data-count={filteredStates.length} onScroll={rememberStateListScroll} ref={stateListRef}>
        {filteredStates.map((state) => {
          const summary = completenessByState.get(state.code);
          const securitySummary = securitySummaryByState.get(state.code);
          const status = stateFilter === "has-security-incidents"
            ? { className: "status-partial", label: "Security" }
            : stateStatus(summary, state);
          const badges = stateDataBadges(state, summary);

          return (
            <Link
              aria-pressed={state.code === selectedState}
              href={`/?state=${state.code}`}
              className="state-button"
              key={state.code}
              scroll={false}
              onClick={rememberStateListScroll}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  rememberStateListScroll();
                }
              }}
              onPointerDown={rememberStateListScroll}
            >
              <div className="state-button-head">
                <strong>
                  {state.name} <span className="mono">{state.code}</span>
                </strong>
                <span className={`state-status ${status.className}`}>{status.label}</span>
              </div>
              <div className="state-meta-row">
                <span>{state.authority}</span>
                {stateFilter !== "has-security-incidents" && summary?.sourceTier && (
                  <span className="state-tier">{summary.sourceTier.replaceAll("_", " ")}</span>
                )}
              </div>
              {stateFilter === "has-security-incidents" && securitySummary ? (
                <div
                  aria-label={`${state.name}: ${securitySummary.countyCount} loaded county records; ${affectedLocationText(securitySummary)}`}
                  className="state-security-summary"
                >
                  <ShieldAlert aria-hidden size={14} />
                  <strong>
                    {securitySummary.countyCount.toLocaleString()} loaded county{" "}
                    {securitySummary.countyCount === 1 ? "record" : "records"}
                  </strong>
                  <span>{affectedLocationText(securitySummary)}</span>
                </div>
              ) : (
              <div
                className="state-data-grid"
                aria-label={`${state.name} data availability`}
                data-tour={state.code === selectedState ? "selected-state-badges" : undefined}
              >
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
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
