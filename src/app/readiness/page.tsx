import { ArrowLeft, CheckCircle2, CircleDashed, Database, FileWarning, GitBranch, ListChecks } from "lucide-react";
import { listCompletenessReport } from "@/lib/api";
import {
  getNativeSourcePackage,
  nativeSourcePackageArtifactHint,
  nativeSourcePackageArtifacts,
  type NativeSourcePackage,
} from "@/lib/native-source-packages";
import type { CompletenessSummary } from "@/lib/types";

const selectedYear = 2024;
export const dynamic = "force-dynamic";

type ReadinessTask = {
  key: string;
  label: string;
  severity: "high" | "medium" | "low";
};

type ChecklistStatus = "good" | "warn" | "missing";

type DetailChecklistItem = {
  label: string;
  value: string;
  status: ChecklistStatus;
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

  if (state.sourceTier === "legacy_bundle" || state.sourceTier === "seed_fallback") {
    tasks.push({ key: "native-parser", label: "Native official parser", severity: "medium" });
  }

  if (state.nativeImportCount > 0 && state.reviewRowCount > 0 && numericMetric(state, "nativeComparisonRows") === 0) {
    tasks.push({ key: "comparison", label: "Comparison contest rows", severity: "low" });
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

function sourceTierLabel(tier: CompletenessSummary["sourceTier"]) {
  return {
    legacy_bundle: "Legacy bundle",
    mixed: "Mixed",
    native_official: "Native official",
    pending: "Pending",
    seed_fallback: "Seed fallback",
  }[tier];
}

function taskSummary(tasks: ReadinessTask[]) {
  const high = tasks.filter((task) => task.severity === "high").length;
  const medium = tasks.filter((task) => task.severity === "medium").length;
  const low = tasks.filter((task) => task.severity === "low").length;
  return { high, low, medium };
}

function numericMetric(state: CompletenessSummary, key: string) {
  const value = state.latestNativeImportSummary?.[key] ?? state.latestImportSummary?.[key];
  return typeof value === "number" ? value : 0;
}

function importStatusLabel(status: CompletenessSummary["latestImportStatus"]) {
  if (!status) {
    return "No import";
  }

  return {
    failed: "Failed",
    promoted: "Promoted",
    staged: "Staged",
    validated: "Validated",
  }[status];
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function expectedValue(sourcePackage: NativeSourcePackage | undefined, key: keyof NativeSourcePackage["expected"]) {
  return sourcePackage?.expected[key] ?? null;
}

function compareCount(loaded: number, expected: number | null) {
  if (expected === null) {
    return loaded > 0 ? `${formatNumber(loaded)} loaded` : "No expected total";
  }

  const delta = loaded - expected;
  if (delta === 0) {
    return `${formatNumber(loaded)} / ${formatNumber(expected)}`;
  }

  const sign = delta > 0 ? "+" : "";
  return `${formatNumber(loaded)} / ${formatNumber(expected)} (${sign}${formatNumber(delta)})`;
}

function compareStatus(loaded: number, expected: number | null): ChecklistStatus {
  if (expected === null) {
    return loaded > 0 ? "good" : "warn";
  }

  if (loaded === expected) {
    return "good";
  }

  return loaded > 0 ? "warn" : "missing";
}

function stateChecklist(state: CompletenessSummary, sourcePackage: NativeSourcePackage | undefined): DetailChecklistItem[] {
  const nativeResults = numericMetric(state, "nativeResultRows");
  const nativeReview = numericMetric(state, "nativeReviewRows");
  const nativeComparison = numericMetric(state, "nativeComparisonRows");
  const nativeTurnout = numericMetric(state, "nativeTurnoutRows");
  const expectedReview = expectedValue(sourcePackage, "localReviewRows");
  const expectedTurnout = expectedValue(sourcePackage, "turnoutRows");

  return [
    {
      label: "Official source package",
      value: sourcePackage ? `${sourcePackage.configFile}` : "Needed from data team",
      status: sourcePackage ? "good" : "missing",
    },
    {
      label: "Native parser/import",
      value: state.nativeImportCount ? `${state.nativeImportCount} native run${state.nativeImportCount === 1 ? "" : "s"}` : "No native import yet",
      status: state.nativeImportCount ? "good" : "missing",
    },
    {
      label: "County results",
      value: compareCount(nativeResults || state.resultJurisdictions, expectedValue(sourcePackage, "countyRows")),
      status: compareStatus(nativeResults || state.resultJurisdictions, expectedValue(sourcePackage, "countyRows")),
    },
    {
      label: "Review rows",
      value: compareCount(nativeReview || state.reviewRowCount, expectedReview),
      status: compareStatus(nativeReview || state.reviewRowCount, expectedReview),
    },
    {
      label: "Comparison contest",
      value: nativeComparison ? `${formatNumber(nativeComparison)} comparison rows` : "No comparison rows",
      status: nativeComparison ? "good" : sourcePackage ? "warn" : "missing",
    },
    {
      label: "Turnout",
      value: compareCount(nativeTurnout || state.turnoutRowCount, expectedTurnout),
      status: compareStatus(nativeTurnout || state.turnoutRowCount, expectedTurnout),
    },
    {
      label: "Source provenance",
      value: state.sourcesMissingUrls ? `${state.sourcesMissingUrls} missing URL${state.sourcesMissingUrls === 1 ? "" : "s"}` : `${state.sourceCount} source${state.sourceCount === 1 ? "" : "s"}`,
      status: state.sourceCount === 0 ? "missing" : state.sourcesMissingUrls ? "warn" : "good",
    },
    {
      label: "Historical baselines",
      value: state.historicalRowCount ? `${formatNumber(state.historicalRowCount)} rows` : "No historical rows",
      status: state.historicalRowCount ? "good" : "warn",
    },
  ];
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
  const nativeStates = rows.filter((state) => state.sourceTier === "native_official" || state.sourceTier === "mixed").length;
  const legacyOnlyStates = rows.filter((state) => state.sourceTier === "legacy_bundle").length;
  const comparisonReadyStates = rows.filter((state) => numericMetric(state, "nativeComparisonRows") > 0).length;
  const turnoutReadyStates = rows.filter((state) => state.turnoutRowCount > 0).length;

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
        <div className="readiness-hero-actions">
          <a className="readiness-api-link" href={`/api/completeness?year=${selectedYear}`} target="_blank" rel="noreferrer">
            Completeness API
          </a>
          <a className="readiness-api-link" href="/api/native-source-packages" target="_blank" rel="noreferrer">
            Source Packages API
          </a>
        </div>
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
          <span>Native official states</span>
          <strong>{nativeStates}</strong>
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
        <article>
          <Database aria-hidden size={18} />
          <span>Legacy-only states</span>
          <strong>{legacyOnlyStates}</strong>
        </article>
        <article>
          <GitBranch aria-hidden size={18} />
          <span>Comparison / turnout ready</span>
          <strong>
            {comparisonReadyStates} / {turnoutReadyStates}
          </strong>
        </article>
      </section>

      <section className="readiness-panel">
        <div className="readiness-panel-head">
          <div>
            <h2>Native Import Coverage</h2>
            <span>Operational view of parser coverage, validation counts, and provenance readiness</span>
          </div>
        </div>

        <div className="native-coverage-grid">
          {rows
            .filter((state) => state.sourceTier === "native_official" || state.sourceTier === "mixed")
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((state) => {
              const nativeResults = numericMetric(state, "nativeResultRows");
              const nativeReview = numericMetric(state, "nativeReviewRows");
              const nativeComparison = numericMetric(state, "nativeComparisonRows");
              const nativeTurnout = numericMetric(state, "nativeTurnoutRows");
              return (
                <article className="native-coverage-card" key={state.state}>
                  <header>
                    <div>
                      <strong>{state.name}</strong>
                      <span className="mono">{state.state}</span>
                    </div>
                    <span className={`import-status import-${state.latestImportStatus ?? "none"}`}>
                      {importStatusLabel(state.latestImportStatus)}
                    </span>
                  </header>
                  <div className="coverage-chips" aria-label={`${state.name} native import coverage`}>
                    <span className={`coverage-chip ${nativeResults ? "coverage-good" : "coverage-missing"}`}>
                      Results {nativeResults ? nativeResults.toLocaleString() : "missing"}
                    </span>
                    <span className={`coverage-chip ${nativeReview ? "coverage-good" : "coverage-missing"}`}>
                      Review {nativeReview ? nativeReview.toLocaleString() : "missing"}
                    </span>
                    <span className={`coverage-chip ${nativeComparison ? "coverage-good" : "coverage-warn"}`}>
                      Comparison {nativeComparison ? nativeComparison.toLocaleString() : "none"}
                    </span>
                    <span className={`coverage-chip ${nativeTurnout ? "coverage-good" : "coverage-warn"}`}>
                      Turnout {nativeTurnout ? nativeTurnout.toLocaleString() : "none"}
                    </span>
                    <span className={`coverage-chip ${state.sourcesMissingUrls ? "coverage-warn" : "coverage-good"}`}>
                      Sources {state.sourceCount.toLocaleString()}
                    </span>
                  </div>
                  <p>{state.latestParser ?? "No parser recorded"}</p>
                </article>
              );
            })}
        </div>
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
                <th>Lineage</th>
                <th>Native Coverage</th>
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
                  <td className="readiness-lineage">
                    <span className={`lineage-pill lineage-${state.sourceTier.replace("_", "-")}`}>
                      {sourceTierLabel(state.sourceTier)}
                    </span>
                    <span>{state.latestParser ?? "No parser yet"}</span>
                  </td>
                  <td>
                    <div className="coverage-chips compact">
                      <span className={`coverage-chip ${numericMetric(state, "nativeResultRows") ? "coverage-good" : "coverage-missing"}`}>
                        R {numericMetric(state, "nativeResultRows") || "-"}
                      </span>
                      <span className={`coverage-chip ${numericMetric(state, "nativeReviewRows") ? "coverage-good" : "coverage-missing"}`}>
                        V {numericMetric(state, "nativeReviewRows") || "-"}
                      </span>
                      <span className={`coverage-chip ${numericMetric(state, "nativeComparisonRows") ? "coverage-good" : "coverage-warn"}`}>
                        C {numericMetric(state, "nativeComparisonRows") || "-"}
                      </span>
                      <span className={`coverage-chip ${numericMetric(state, "nativeTurnoutRows") ? "coverage-good" : "coverage-warn"}`}>
                        T {numericMetric(state, "nativeTurnoutRows") || "-"}
                      </span>
                    </div>
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

      <section className="readiness-panel">
        <div className="readiness-panel-head">
          <div>
            <h2>State Import Details</h2>
            <span>Per-state source package status, validation counts, parser readiness, and remaining blockers</span>
          </div>
        </div>

        <div className="readiness-detail-list">
          {rows.map((state) => {
            const sourcePackage = getNativeSourcePackage(state.state);
            const checklist = stateChecklist(state, sourcePackage);
            return (
              <details className="readiness-detail" key={state.state}>
                <summary>
                  <span>
                    <strong>{state.name}</strong>
                    <span className="mono">{state.state}</span>
                  </span>
                  <span className={`lineage-pill lineage-${state.sourceTier.replace("_", "-")}`}>
                    {sourceTierLabel(state.sourceTier)}
                  </span>
                  <span className={`import-status import-${state.latestImportStatus ?? "none"}`}>
                    {importStatusLabel(state.latestImportStatus)}
                  </span>
                  <span className="detail-gap-count">
                    {state.tasks.length ? `${state.tasks.length} tracked gap${state.tasks.length === 1 ? "" : "s"}` : "No tracked gaps"}
                  </span>
                </summary>

                <div className="readiness-detail-body">
                  <div className="detail-checklist" aria-label={`${state.name} import checklist`}>
                    {checklist.map((item) => (
                      <article className={`detail-check detail-${item.status}`} key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </article>
                    ))}
                  </div>

                  <div className="detail-columns">
                    <article>
                      <h3>Missing Work</h3>
                      {state.tasks.length ? (
                        <div className="task-list">
                          {state.tasks.map((task) => (
                            <span className={`task-pill task-${task.severity}`} key={task.key}>
                              {task.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="available">No tracked gaps</p>
                      )}
                    </article>

                    <article>
                      <h3>Latest Import Summary</h3>
                      <dl className="detail-summary-grid">
                        <div>
                          <dt>Parser</dt>
                          <dd>{state.latestParser ?? "No parser yet"}</dd>
                        </div>
                        <div>
                          <dt>Imported</dt>
                          <dd>{state.latestImportAt ? new Date(state.latestImportAt).toLocaleString("en-US") : "No import"}</dd>
                        </div>
                        <div>
                          <dt>Native runs</dt>
                          <dd>{state.nativeImportCount.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>Legacy runs</dt>
                          <dd>{state.legacyImportCount.toLocaleString()}</dd>
                        </div>
                      </dl>
                    </article>
                  </div>

                  {sourcePackage ? (
                    <div className="detail-source-package">
                      <div className="detail-package-head">
                        <div>
                          <h3>Native Source Package</h3>
                          <p>{sourcePackage.authority}</p>
                        </div>
                        <span className="task-pill task-low">Priority {sourcePackage.priority}</span>
                      </div>

                      <div className="detail-artifact-grid">
                        {nativeSourcePackageArtifacts(sourcePackage).map(([label, artifact]) => (
                          <article className="detail-artifact" key={label}>
                            <span>{label}</span>
                            <strong>{artifact.sourceTitle}</strong>
                            <code>{artifact.localFile}</code>
                            <p>{nativeSourcePackageArtifactHint(artifact)}</p>
                            <a href={artifact.sourceUrl} target="_blank" rel="noreferrer">
                              Official source
                            </a>
                          </article>
                        ))}
                      </div>

                      <div className="detail-columns">
                        <article>
                          <h3>Expected Totals</h3>
                          <dl className="detail-summary-grid">
                            <div>
                              <dt>Counties</dt>
                              <dd>{formatNumber(sourcePackage.expected.countyRows)}</dd>
                            </div>
                            <div>
                              <dt>Geometry</dt>
                              <dd>{formatNumber(sourcePackage.expected.geometryFeatures)}</dd>
                            </div>
                            <div>
                              <dt>State total</dt>
                              <dd>{formatNumber(sourcePackage.expected.stateTotal)}</dd>
                            </div>
                            <div>
                              <dt>Review rows</dt>
                              <dd>{formatNumber(sourcePackage.expected.localReviewRows)}</dd>
                            </div>
                          </dl>
                        </article>
                        <article>
                          <h3>Caveats</h3>
                          <ul className="detail-caveats">
                            {sourcePackage.caveats.map((caveat) => (
                              <li key={caveat}>{caveat}</li>
                            ))}
                          </ul>
                        </article>
                      </div>
                    </div>
                  ) : (
                    <div className="detail-source-package detail-source-package-empty">
                      <h3>Native Source Package Needed</h3>
                      <p>
                        Ask the data team for official result artifacts, local review/comparison data, turnout denominators,
                        county geometry, expected totals, parser hints, caveats, and source URLs for this state.
                      </p>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </main>
  );
}
