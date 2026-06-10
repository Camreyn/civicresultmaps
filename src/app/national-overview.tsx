"use client";

import { CheckCircle2, ChevronDown, CircleDashed, Database, FileWarning, MapIcon } from "lucide-react";
import { useState } from "react";
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

export function NationalOverview({ report, year }: NationalOverviewProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const statesWithResults = report.filter((state) => state.resultRows > 0).length;
  const completeStates = report.filter((state) => state.status === "complete").length;
  const statesWithMap = report.filter((state) => state.capabilities.map).length;
  const rawReviewRows = report.reduce((sum, state) => sum + state.reviewRowCount, 0);

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
              <span>Raw review rows</span>
              <strong>{rawReviewRows.toLocaleString()}</strong>
            </article>
          </div>

          <div className="overview-table-wrap">
            <table className="overview-table">
          <thead>
            <tr>
              <th>State</th>
              <th>Status</th>
              <th>Rows</th>
              <th>Sources</th>
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
