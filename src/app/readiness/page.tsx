import { ArrowLeft, CheckCircle2, CircleDashed, Database, FileWarning, ListChecks } from "lucide-react";
import { listCompletenessReport } from "@/lib/api";
import type { CompletenessSummary } from "@/lib/types";

const selectedYear = 2024;
export const dynamic = "force-dynamic";

type ReadinessTask = {
  key: string;
  label: string;
  severity: "high" | "medium" | "low";
};

function missingTasks(state: CompletenessSummary): ReadinessTask[] {
  const tasks: ReadinessTask[] = [];

  if (!state.capabilities.certifiedResults || state.resultRows === 0) {
    tasks.push({ key: "results", label: "Certified result rows", severity: "high" });
  }

  if (!state.capabilities.map) {
    tasks.push({ key: "map", label: "Map geometry join", severity: "high" });
  }

  if (state.sourceCount === 0) {
    tasks.push({ key: "sources", label: "Source records", severity: "high" });
  }

  if (state.sourcesMissingUrls > 0) {
    tasks.push({ key: "source-urls", label: `${state.sourcesMissingUrls} source URL gap${state.sourcesMissingUrls === 1 ? "" : "s"}`, severity: "medium" });
  }

  if (!state.capabilities.reviewGraphs || state.reviewRowCount === 0) {
    tasks.push({ key: "review", label: "Review rows", severity: "medium" });
  }

  if (!state.capabilities.turnout || state.turnoutRowCount === 0) {
    tasks.push({ key: "turnout", label: "Turnout rows", severity: "medium" });
  }

  if (!state.capabilities.historicalBaseline || state.historicalRowCount === 0) {
    tasks.push({ key: "historical", label: "Historical baseline rows", severity: "low" });
  }

  if (state.importRunCount === 0) {
    tasks.push({ key: "imports", label: "Import run record", severity: "low" });
  }

  return tasks;
}

function statusLabel(status: CompletenessSummary["status"]) {
  return {
    complete: "Complete",
    needs_sources: "Needs sources",
    pending: "Pending",
    results_only: "Results only",
    review_ready: "Review ready",
  }[status];
}

function taskSummary(tasks: ReadinessTask[]) {
  const high = tasks.filter((task) => task.severity === "high").length;
  const medium = tasks.filter((task) => task.severity === "medium").length;
  const low = tasks.filter((task) => task.severity === "low").length;
  return { high, low, medium };
}

export default async function ReadinessPage() {
  const report = await listCompletenessReport({ year: selectedYear });
  const rows = report
    .map((state) => {
      const tasks = missingTasks(state);
      const summary = taskSummary(tasks);
      return { ...state, taskSummary: summary, tasks };
    })
    .sort((a, b) => b.taskSummary.high - a.taskSummary.high || b.taskSummary.medium - a.taskSummary.medium || a.name.localeCompare(b.name));

  const statesComplete = rows.filter((state) => state.tasks.length === 0).length;
  const statesMissingHistorical = rows.filter((state) => state.tasks.some((task) => task.key === "historical")).length;
  const statesMissingReview = rows.filter((state) => state.tasks.some((task) => task.key === "review")).length;
  const statesMissingTurnout = rows.filter((state) => state.tasks.some((task) => task.key === "turnout")).length;
  const highPriorityStates = rows.filter((state) => state.taskSummary.high > 0).length;

  return (
    <main className="readiness-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden>
            CRM
          </span>
          <div>
            <strong>Civic Result Maps</strong>
            <span>Readiness dashboard</span>
          </div>
        </a>
        <div className="topbar-actions">
          <a className="topbar-link" href="/">
            <ArrowLeft aria-hidden size={15} />
            Workspace
          </a>
          <span className="domain">civicresultmaps.org</span>
        </div>
      </header>

      <section className="readiness-hero">
        <div>
          <p className="section-label">Data Readiness</p>
          <h1>{selectedYear} missing data dashboard</h1>
          <p>
            A contributor-facing view of what each state still needs before maps, review graphs, turnout, historical
            baselines, sources, and exports can be treated as complete.
          </p>
        </div>
        <a className="readiness-api-link" href={`/api/completeness?year=${selectedYear}`} target="_blank" rel="noreferrer">
          Completeness API
        </a>
      </section>

      <section className="readiness-metrics" aria-label="Readiness summary">
        <article>
          <CheckCircle2 aria-hidden size={18} />
          <span>Fully ready states</span>
          <strong>
            {statesComplete} / {rows.length}
          </strong>
        </article>
        <article>
          <FileWarning aria-hidden size={18} />
          <span>High-priority states</span>
          <strong>{highPriorityStates}</strong>
        </article>
        <article>
          <ListChecks aria-hidden size={18} />
          <span>Missing review rows</span>
          <strong>{statesMissingReview}</strong>
        </article>
        <article>
          <Database aria-hidden size={18} />
          <span>Missing turnout / history</span>
          <strong>
            {statesMissingTurnout} / {statesMissingHistorical}
          </strong>
        </article>
      </section>

      <section className="readiness-panel">
        <div className="readiness-panel-head">
          <div>
            <h2>State Work Queue</h2>
            <span>Sorted by highest-impact missing data first</span>
          </div>
          <div className="readiness-legend" aria-label="Priority legend">
            <span className="task-pill task-high">High</span>
            <span className="task-pill task-medium">Medium</span>
            <span className="task-pill task-low">Low</span>
          </div>
        </div>

        <div className="readiness-table-wrap">
          <table className="readiness-table">
            <thead>
              <tr>
                <th>State</th>
                <th>Status</th>
                <th>Loaded Rows</th>
                <th>Missing Work</th>
                <th>Latest Import</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((state) => (
                <tr key={state.state}>
                  <td>
                    <strong>{state.name}</strong>
                    <span className="mono">{state.state}</span>
                  </td>
                  <td>
                    <span className={`overview-status status-${state.status.replace("_", "-")}`}>
                      {state.tasks.length === 0 ? <CheckCircle2 aria-hidden size={13} /> : <CircleDashed aria-hidden size={13} />}
                      {statusLabel(state.status)}
                    </span>
                  </td>
                  <td className="readiness-counts">
                    <span>{state.resultJurisdictions.toLocaleString()} jurisdictions</span>
                    <span>{state.reviewRowCount.toLocaleString()} review</span>
                    <span>{state.turnoutRowCount.toLocaleString()} turnout</span>
                    <span>{state.historicalRowCount.toLocaleString()} historical</span>
                  </td>
                  <td>
                    {state.tasks.length ? (
                      <div className="task-list">
                        {state.tasks.map((task) => (
                          <span className={`task-pill task-${task.severity}`} key={task.key}>
                            {task.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="available">No tracked gaps</span>
                    )}
                  </td>
                  <td>
                    {state.latestImportAt ? (
                      <span className="mono">{new Date(state.latestImportAt).toLocaleDateString("en-US")}</span>
                    ) : (
                      <span className="pending">No import</span>
                    )}
                  </td>
                  <td>
                    <a className="readiness-open-link" href={`/?state=${state.state}&tab=planner`}>
                      Workspace
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
