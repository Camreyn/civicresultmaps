"use client";

import { CheckCircle2, ChevronDown, CircleDashed, Database, FileWarning, MapIcon } from "lucide-react";
import { useState } from "react";
import { Eli5 } from "./eli5";
import type { CompletenessSummary } from "@/lib/types";

type NationalOverviewProps = {
  report: CompletenessSummary[];
  year: number;
};

function statusLabel(status: CompletenessSummary["status"]) {
  return {
    complete: "Complete",
    needs_sources: "Needs sources",
    pending: "Pending",
    results_only: "Results only",
    review_ready: "Review ready",
  }[status];
}

function statusClass(status: CompletenessSummary["status"]) {
  return `overview-status status-${status.replace("_", "-")}`;
}

function sourceTierLabel(tier: CompletenessSummary["sourceTier"]) {
  return {
    legacy_bundle: "Legacy bundle",
    mixed: "Mixed",
    native_official: "Native official",
    pending: "Pending",
    seed_fallback: "Seed fallback",
  }[tier];
}

export function NationalOverview({ report, year }: NationalOverviewProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const statesWithResults = report.filter((state) => state.resultRows > 0).length;
  const completeStates = report.filter((state) => state.status === "complete").length;
  const statesWithMap = report.filter((state) => state.capabilities.map).length;
  const nativeStates = report.filter((state) => state.sourceTier === "native_official" || state.sourceTier === "mixed").length;

  return (
    <section className="national-overview" aria-label={`${year} national data completeness`}>
      <div className="overview-head">
        <div>
          <p className="section-label">National Overview</p>
          <h2>{year} data readiness</h2>
        </div>
        <div className="overview-actions">
          <button
            aria-controls="national-overview-body"
            aria-expanded={!isCollapsed}
            onClick={() => setIsCollapsed((value) => !value)}
            type="button"
          >
            <ChevronDown aria-hidden className={isCollapsed ? "" : "is-open"} size={16} />
            {isCollapsed ? "Expand" : "Collapse"}
          </button>
          <a href={`/api/completeness?year=${year}`} target="_blank" rel="noreferrer">
            Completeness API
          </a>
          <Eli5>
            This is the scoreboard for the whole project. If a state is like a homework folder, this shows which folders
            have results, sources, review rows, and missing pieces before someone opens one state in detail.
          </Eli5>
        </div>
      </div>

      {!isCollapsed && (
        <div id="national-overview-body">
          <div className="overview-metrics">
            <article>
              <Database aria-hidden size={18} />
              <span>States with results</span>
              <strong>
                {statesWithResults} / {report.length}
              </strong>
            </article>
            <article>
              <CheckCircle2 aria-hidden size={18} />
              <span>Complete review states</span>
              <strong>{completeStates}</strong>
            </article>
            <article>
              <MapIcon aria-hidden size={18} />
              <span>Map-ready states</span>
              <strong>{statesWithMap}</strong>
            </article>
            <article>
              <FileWarning aria-hidden size={18} />
              <span>Native official states</span>
              <strong>
                {nativeStates} / {report.length}
              </strong>
            </article>
          </div>

          <div className="overview-table-wrap">
            <div className="table-helper-row">
              <Eli5>
                This table is like a checklist for each state. A row with gaps means the state has some papers in the
                folder, but not every paper needed for the full set of maps, graphs, and review tools.
              </Eli5>
            </div>
            <table className="overview-table">
          <thead>
            <tr>
              <th>State</th>
              <th>Status</th>
              <th>Rows</th>
              <th>Sources</th>
              <th>Lineage</th>
              <th>Flags</th>
              <th>Raw Rows</th>
              <th>Gaps</th>
            </tr>
          </thead>
          <tbody>
            {report.map((state) => (
              <tr key={state.state}>
                <td>
                  <a href={`/?state=${state.state}&tab=map`}>
                    <strong>{state.name}</strong>
                    <span className="mono">{state.state}</span>
                  </a>
                </td>
                <td>
                  <span className={statusClass(state.status)}>
                    {state.status === "complete" ? (
                      <CheckCircle2 aria-hidden size={13} />
                    ) : (
                      <CircleDashed aria-hidden size={13} />
                    )}
                    {statusLabel(state.status)}
                  </span>
                </td>
                <td className="mono">{state.resultJurisdictions.toLocaleString()}</td>
                <td className="mono">
                  {state.sourceCount.toLocaleString()}
                  {state.sourcesMissingUrls > 0 ? ` (${state.sourcesMissingUrls} missing URL)` : ""}
                </td>
                <td>
                  <span className={`lineage-pill lineage-${state.sourceTier.replace("_", "-")}`}>
                    {sourceTierLabel(state.sourceTier)}
                  </span>
                </td>
                <td className="mono">{state.indicatorCount.toLocaleString()}</td>
                <td className="mono">
                  {state.reviewRowCount.toLocaleString()}
                  {state.turnoutRowCount > 0 ? ` / ${state.turnoutRowCount.toLocaleString()} turnout` : ""}
                </td>
                <td>
                  {state.gaps.length ? (
                    <span>{state.gaps.slice(0, 3).join("; ")}</span>
                  ) : (
                    <span className="available">No tracked gaps</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
