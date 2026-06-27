import { ArrowLeft, CheckCircle2, CircleDashed, Database, FileWarning, GitBranch, ListChecks, Radar } from "lucide-react";
import { listAdminSourceStatuses, listCompletenessReport, listNativeSourcePackages, listSourceAcquisitionTiers, listTurnoutSourceStatuses } from "@/lib/api";
import {
  getNativeSourcePackage,
  nativeSourcePackageArtifactHint,
  nativeSourcePackageArtifacts,
  type NativeSourceDiscoveryQueueEntry,
  type NativeSourcePackage,
} from "@/lib/native-source-packages";
import type { SourceAcquisitionTierRow } from "@/lib/source-acquisition-tiers";
import type { TurnoutSourceStatus } from "@/lib/turnout-source-packages";
import type { AdminSourceStatusSummary, CompletenessSummary } from "@/lib/types";

const selectedYear = 2024;
export const dynamic = "force-dynamic";

const readinessGuideCards = [
  {
    title: "Start with the chips",
    body:
      "Green means rows or source records are loaded. Gold means usable but limited. Red means the app is still waiting on that data family.",
  },
  {
    title: "Prioritize high gaps",
    body:
      "Certified results, map joins, and source records come first. Review charts, turnout, and historical context should stay caveated until their row families are present.",
  },
  {
    title: "Treat flags as prompts",
    body:
      "A review-ready state is not a conclusion-ready state. Advisory rows point reviewers toward source checks, local context, and documented alternative explanations.",
  },
];

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

function turnoutSourceTask(turnoutSource: TurnoutSourceStatus | undefined): ReadinessTask | null {
  if (!turnoutSource || turnoutSource.status === "loaded" || turnoutSource.status === "documented_exclusion") {
    return null;
  }

  if (turnoutSource.status === "partial") {
    return { key: "turnout-source-partial", label: "Partial turnout source", severity: "medium" };
  }

  if (turnoutSource.status === "candidate") {
    return { key: "turnout-source-candidate", label: "Collect candidate turnout source", severity: "medium" };
  }

  if (turnoutSource.status === "blocked") {
    return { key: "turnout-source-blocked", label: "Blocked turnout source", severity: "high" };
  }

  return { key: "turnout-source-needed", label: "Turnout source needed", severity: "medium" };
}

function missingTasks(
  state: CompletenessSummary,
  turnoutSource?: TurnoutSourceStatus,
  adminSource?: AdminSourceStatusSummary,
): ReadinessTask[] {
  const tasks: ReadinessTask[] = [];

  if (!state.capabilities.certifiedResults || state.resultRows === 0) {
    tasks.push({ key: "results", label: "Certified result rows", severity: "high" });
  }

  if (!state.capabilities.map || state.mapGeometrySourceCount === 0) {
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

  const sourceTask = turnoutSourceTask(turnoutSource);
  if (sourceTask) {
    tasks.push(sourceTask);
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

  return [...tasks, ...adminSourceTasks(adminSource)];
}

function statusLabel(status: CompletenessSummary["status"]) {
  return {
    complete: "Map package complete",
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

function turnoutSourceStatusLabel(status: TurnoutSourceStatus["status"] | undefined) {
  if (!status) {
    return "Untracked";
  }

  return {
    blocked: "Blocked",
    candidate: "Candidate",
    documented_exclusion: "Excluded",
    loaded: "Loaded",
    needs_data: "Needs data",
    partial: "Partial",
  }[status];
}

function adminSourceStatusLabel(status: AdminSourceStatusSummary["status"] | undefined) {
  if (!status) {
    return "Untracked";
  }

  return {
    blocked: "Blocked",
    candidate: "Candidate",
    documented_exclusion: "Excluded",
    loaded: "Loaded",
    needs_data: "Needs data",
    partial: "Partial",
  }[status];
}

function adminCoverageClass(status: AdminSourceStatusSummary["status"] | undefined) {
  if (status === "loaded") {
    return "coverage-good";
  }

  if (status === "partial" || status === "candidate") {
    return "coverage-warn";
  }

  return "coverage-missing";
}

function sourceAcquisitionTierShortLabel(tier: string | undefined) {
  if (!tier) {
    return "Unknown";
  }

  return {
    tier_1_official_export_database: "Tier 1",
    tier_2_official_dashboard_endpoint: "Tier 2",
    tier_3_sanctioned_bulk_partial: "Tier 3",
    tier_4_local_scattershot: "Tier 4",
    tier_5_digital_inconsistent: "Tier 5",
    tier_6_official_pdf_hostile: "Tier 6",
    tier_7_scanned_system_printout: "Tier 7",
    tier_8_scanned_handwritten: "Tier 8",
    unknown: "Unknown",
  }[tier] ?? tier;
}

function sourceAcquisitionCoverageClass(row: SourceAcquisitionTierRow | undefined) {
  if (!row || row.tier === "unknown") {
    return "coverage-missing";
  }

  if (row.tier === "tier_1_official_export_database" || row.tier === "tier_2_official_dashboard_endpoint") {
    return "coverage-good";
  }

  return "coverage-warn";
}

function sourceAcquisitionPriorityRows(rows: SourceAcquisitionTierRow[]) {
  return rows
    .filter((row) => row.tier !== "unknown")
    .sort((a, b) => {
      const aTier = Number(sourceAcquisitionTierShortLabel(a.tier).replace("Tier ", "")) || 99;
      const bTier = Number(sourceAcquisitionTierShortLabel(b.tier).replace("Tier ", "")) || 99;
      return aTier - bTier || a.state.localeCompare(b.state) || a.jurisdictionName.localeCompare(b.jurisdictionName);
    });
}

function sourceAcquisitionReviewTask(
  state: CompletenessSummary,
  rows: SourceAcquisitionTierRow[],
): ReadinessTask | null {
  if (state.reviewRowCount === 0 || state.indicatorCount > 0) {
    return null;
  }

  const loadedCountyContext = rows.some(
    (row) => row.reportingGrain === "county" && /loaded/i.test(row.parserStatus),
  );
  const pendingSubcountyPath = rows.some((row) => {
    const targetLooksLocal = /precinct|ward|municipal|local/i.test(row.reportingGrain);
    const statusLooksPending = /review-gated|not parsed|future|find|acquire|needs/i.test(
      `${row.parserStatus} ${row.nextAction}`,
    );
    return targetLooksLocal && statusLooksPending;
  });

  if (!loadedCountyContext && !pendingSubcountyPath) {
    return null;
  }

  return {
    key: "subcounty-review",
    label: "Subcounty review rows",
    severity: "medium",
  };
}

function adminSourceTasks(adminSource: AdminSourceStatusSummary | undefined): ReadinessTask[] {
  if (!adminSource) {
    return [{ key: "admin-source-registry", label: "Admin source registry", severity: "medium" }];
  }

  const tasks: ReadinessTask[] = [];
  if (adminSource.equipment.status !== "loaded") {
    tasks.push({ key: "equipment-context", label: "Equipment context", severity: "medium" });
  }
  if (adminSource.audit.status !== "loaded" && adminSource.audit.status !== "documented_exclusion") {
    tasks.push({ key: "audit-context", label: "Audit source context", severity: "low" });
  }
  if (adminSource.cvr.status !== "loaded" && adminSource.cvr.status !== "documented_exclusion") {
    tasks.push({ key: "cvr-context", label: "CVR availability context", severity: "low" });
  }
  if (adminSource.incidents.status !== "loaded" && adminSource.incidents.status !== "documented_exclusion") {
    tasks.push({ key: "incident-context", label: "Incident/correction context", severity: "low" });
  }

  return tasks;
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

function sourceDiscoveryStatusLabel(status: NativeSourceDiscoveryQueueEntry["currentStatus"]) {
  return status.replaceAll("_", " ");
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

function stateChecklist(
  state: CompletenessSummary,
  sourcePackage: NativeSourcePackage | undefined,
  turnoutSource: TurnoutSourceStatus | undefined,
): DetailChecklistItem[] {
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
      label: "Turnout source status",
      value: turnoutSource
        ? `${turnoutSourceStatusLabel(turnoutSource.status)} / ${turnoutSource.sourceLevel}`
        : "Not in registry",
      status: turnoutSource?.status === "loaded" ? "good" : turnoutSource?.status === "partial" || turnoutSource?.status === "candidate" ? "warn" : "missing",
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
  const turnoutSources = listTurnoutSourceStatuses({ year: selectedYear });
  const adminSources = listAdminSourceStatuses({ year: selectedYear });
  const nativeSourcePackages = listNativeSourcePackages();
  const sourceAcquisition = listSourceAcquisitionTiers();
  const sourceAcquisitionRows = sourceAcquisitionPriorityRows(sourceAcquisition.states);
  const sourceDiscoveryQueue = nativeSourcePackages.sourceDiscoveryQueue;
  const sourceDiscoveryByState = new Map(sourceDiscoveryQueue.map((entry) => [entry.state, entry]));
  const sourceAcquisitionByState = new Map<string, SourceAcquisitionTierRow[]>();
  for (const entry of sourceAcquisition.states) {
    sourceAcquisitionByState.set(entry.state, [...(sourceAcquisitionByState.get(entry.state) ?? []), entry]);
  }
  const turnoutSourceByState = new Map(turnoutSources.states.map((entry) => [entry.state, entry]));
  const adminSourceByState = new Map(adminSources.states.map((entry) => [entry.state, entry]));
  const rows = report
    .map((state) => {
      const turnoutSource = turnoutSourceByState.get(state.state);
      const adminSource = adminSourceByState.get(state.state);
      const sourceDiscovery = sourceDiscoveryByState.get(state.state);
      const sourceAcquisitionRowsForState = sourceAcquisitionByState.get(state.state) ?? [];
      const sourceAcquisitionPrimary = sourceAcquisitionRowsForState[0];
      const acquisitionTask = sourceAcquisitionReviewTask(state, sourceAcquisitionRowsForState);
      const tasks = acquisitionTask
        ? [...missingTasks(state, turnoutSource, adminSource), acquisitionTask]
        : missingTasks(state, turnoutSource, adminSource);
      const summary = taskSummary(tasks);
      return { ...state, adminSource, sourceAcquisitionPrimary, sourceAcquisitionRows: sourceAcquisitionRowsForState, sourceDiscovery, taskSummary: summary, tasks, turnoutSource };
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
          <a className="topbar-link" href="/timeline">
            <Radar aria-hidden size={15} />
            Timeline
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
          <a className="readiness-api-link" href={`/api/turnout-sources?year=${selectedYear}`} target="_blank" rel="noreferrer">
            Turnout Sources API
          </a>
          <a className="readiness-api-link" href={`/api/admin-sources?year=${selectedYear}`} target="_blank" rel="noreferrer">
            Admin Sources API
          </a>
          <a className="readiness-api-link" href="/api/source-acquisition-tiers" target="_blank" rel="noreferrer">
            Source Acquisition API
          </a>
        </div>
      </section>

      <section className="readiness-guide" aria-label="How to use the readiness dashboard">
        <div className="readiness-guide-copy">
          <p className="section-label">How to Use This Dashboard</p>
          <h2>Read status first, then inspect sources.</h2>
          <p>
            This page is meant to make the work queue visible. It separates loaded data from partial or missing
            data so reviewers can see why a chart, map layer, or source family is not ready yet.
          </p>
        </div>
        <div className="readiness-guide-cards">
          {readinessGuideCards.map((card) => (
            <article key={card.title}>
              <strong>{card.title}</strong>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
        <div className="readiness-status-key" aria-label="Readiness status key">
          <span className="coverage-chip coverage-good">Loaded</span>
          <span className="coverage-chip coverage-warn">Partial or fallback</span>
          <span className="coverage-chip coverage-missing">Missing or blocked</span>
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
        <article>
          <ListChecks aria-hidden size={18} />
          <span>Turnout source queue</span>
          <strong>
            {turnoutSources.summary.loaded + turnoutSources.summary.partial} / {turnoutSources.summary.total}
          </strong>
        </article>
        <article>
          <Database aria-hidden size={18} />
          <span>Equipment source registry</span>
          <strong>
            {adminSources.familySummary.equipment.loaded} / {adminSources.familySummary.equipment.total}
          </strong>
        </article>
        <article>
          <FileWarning aria-hidden size={18} />
          <span>Audit / CVR / incidents</span>
          <strong>
            {adminSources.familySummary.audit.loaded} / {adminSources.familySummary.cvr.loaded} / {adminSources.familySummary.incidents.loaded}
          </strong>
        </article>
        <article>
          <GitBranch aria-hidden size={18} />
          <span>High ROI / unknown source tiers</span>
          <strong>
            {sourceAcquisition.summary.highRoiRows} / {sourceAcquisition.summary.unknownRows}
          </strong>
        </article>
      </section>

      <section className="readiness-panel">
        <div className="readiness-panel-head">
          <div>
            <h2>Administration Source Inventory</h2>
            <span>Equipment, audit, CVR, and incident context are tracked separately from vote and turnout rows</span>
          </div>
          <a className="readiness-api-link" href={`/api/admin-sources?year=${selectedYear}`} target="_blank" rel="noreferrer">
            Admin Sources API
          </a>
        </div>
        <div className="native-coverage-grid">
          {[
            {
              body:
                "Verifier equipment context is loaded nationally and shown as context only. It is not a vote or turnout source.",
              label: "Equipment",
              summary: adminSources.familySummary.equipment,
            },
            {
              body:
                "Post-election audit artifacts are not yet inventoried nationally. These would support audit-method and audit-result review.",
              label: "Audit",
              summary: adminSources.familySummary.audit,
            },
            {
              body:
                "CVR availability varies by state and county. It needs a separate availability/source registry before any CVR-based checks.",
              label: "CVR",
              summary: adminSources.familySummary.cvr,
            },
            {
              body:
                "Incident, correction, litigation, recount, and canvass notes still need normalized source packages.",
              label: "Incidents",
              summary: adminSources.familySummary.incidents,
            },
          ].map((family) => (
            <article className="native-coverage-card" key={family.label}>
              <header>
                <div>
                  <strong>{family.label}</strong>
                  <span className="mono">{family.summary.loaded} loaded / {family.summary.total} states</span>
                </div>
                <span className={`coverage-chip ${family.summary.loaded === family.summary.total ? "coverage-good" : family.summary.loaded ? "coverage-warn" : "coverage-missing"}`}>
                  {family.summary.loaded === family.summary.total ? "Loaded" : family.summary.loaded ? "Partial" : "Needs data"}
                </span>
              </header>
              <div className="coverage-chips">
                <span className="coverage-chip coverage-good">Loaded {family.summary.loaded}</span>
                <span className="coverage-chip coverage-warn">Partial/candidate {family.summary.partial + family.summary.candidate}</span>
                <span className="coverage-chip coverage-missing">Needs data {family.summary.needsData + family.summary.blocked}</span>
              </div>
              <p>{family.body}</p>
            </article>
          ))}
        </div>
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
            <h2>Source Acquisition Tiers</h2>
            <span>Leif-style source difficulty and scripting ROI; this builds on loaded data rather than replacing it</span>
          </div>
          <a className="readiness-api-link" href="/api/source-acquisition-tiers" target="_blank" rel="noreferrer">
            Source Acquisition API
          </a>
        </div>

        <div className="native-coverage-grid">
          {[
            {
              label: "Tiers 1-2",
              value: sourceAcquisition.summary.highRoiRows,
              body: "Official exports and dashboard endpoints with the best scripting ROI.",
              status: "coverage-good",
            },
            {
              label: "Tiers 3-4",
              value:
                (sourceAcquisition.summary.byTier.tier_3_sanctioned_bulk_partial ?? 0) +
                (sourceAcquisition.summary.byTier.tier_4_local_scattershot ?? 0),
              body: "Useful bulk sources and local sources that may need stitching across jurisdictions.",
              status: "coverage-warn",
            },
            {
              label: "Tiers 5-8",
              value: sourceAcquisition.summary.humanSetupRows,
              body: "Inconsistent digital sources, hostile PDFs, scanned printouts, and handwritten material.",
              status: "coverage-warn",
            },
            {
              label: "Unknown",
              value: sourceAcquisition.summary.unknownRows,
              body: "States with statewide acquisition paths still waiting for classification.",
              status: "coverage-missing",
            },
          ].map((bucket) => (
            <article className="native-coverage-card" key={bucket.label}>
              <header>
                <div>
                  <strong>{bucket.label}</strong>
                  <span className="mono">{bucket.value} source row{bucket.value === 1 ? "" : "s"}</span>
                </div>
                <span className={`coverage-chip ${bucket.status}`}>{bucket.label}</span>
              </header>
              <p>{bucket.body}</p>
            </article>
          ))}
        </div>

        <div className="source-discovery-grid">
          {sourceAcquisitionRows.map((entry) => (
            <article className="source-discovery-card" key={`${entry.state}-${entry.jurisdictionName}-${entry.dataFamily}`}>
              <header>
                <div>
                  <strong>{entry.stateName}</strong>
                  <span className="mono">{entry.state} / {entry.jurisdictionName}</span>
                </div>
                <span className={`coverage-chip ${sourceAcquisitionCoverageClass(entry)}`}>
                  {sourceAcquisitionTierShortLabel(entry.tier)}
                </span>
              </header>
              <div className="coverage-chips">
                <span className="coverage-chip coverage-warn">{entry.reportingGrain}</span>
                <span className="coverage-chip coverage-warn">{entry.manualReviewBurden} review</span>
                <span className="coverage-chip coverage-warn">{entry.confidence}</span>
              </div>
              <p>{entry.nextAction}</p>
              <dl className="source-discovery-meta">
                <div>
                  <dt>Parser Status</dt>
                  <dd>{entry.parserStatus}</dd>
                </div>
                <div>
                  <dt>Missing Fields</dt>
                  <dd>{entry.missingFields.join("; ")}</dd>
                </div>
              </dl>
              <div className="source-discovery-links">
                {entry.sourceUrls.map((sourceUrl, index) => (
                  <a href={sourceUrl} key={sourceUrl} target="_blank" rel="noreferrer">
                    Source {index + 1}
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="readiness-panel">
        <div className="readiness-panel-head">
          <div>
            <h2>Result Source Discovery Queue</h2>
            <span>States needing official local reporting-unit rows before comparable advisory flags can be calculated</span>
          </div>
          <a className="readiness-api-link" href="/api/native-source-packages" target="_blank" rel="noreferrer">
            Source Packages API
          </a>
        </div>

        <div className="source-discovery-grid">
          {sourceDiscoveryQueue.map((entry) => (
            <article className="source-discovery-card" key={entry.state}>
              <header>
                <div>
                  <strong>{entry.name}</strong>
                  <span className="mono">{entry.state}</span>
                </div>
                <span className="task-pill task-medium">Priority {entry.priority}</span>
              </header>
              <div className="coverage-chips">
                <span className="coverage-chip coverage-missing">{sourceDiscoveryStatusLabel(entry.currentStatus)}</span>
                <span className="coverage-chip coverage-warn">{entry.preferredComparisonContest}</span>
              </div>
              <p>{entry.blocker}</p>
              <dl className="source-discovery-meta">
                <div>
                  <dt>Parser</dt>
                  <dd>{entry.parserNeeded}</dd>
                </div>
                <div>
                  <dt>Needed</dt>
                  <dd>{entry.requiredArtifacts.join("; ")}</dd>
                </div>
              </dl>
              <div className="source-discovery-links">
                {entry.officialSourcePages.map((sourceUrl, index) => (
                  <a href={sourceUrl} key={sourceUrl} target="_blank" rel="noreferrer">
                    Official source {index + 1}
                  </a>
                ))}
              </div>
            </article>
          ))}
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
                <th>Map Package</th>
                <th>Lineage</th>
                <th>Parser Counts</th>
                <th>Loaded Data</th>
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
                        Results {numericMetric(state, "nativeResultRows") || "-"}
                      </span>
                      <span className={`coverage-chip ${numericMetric(state, "nativeReviewRows") ? "coverage-good" : "coverage-missing"}`}>
                        Review {numericMetric(state, "nativeReviewRows") || "-"}
                      </span>
                      <span className={`coverage-chip ${numericMetric(state, "nativeComparisonRows") ? "coverage-good" : "coverage-warn"}`}>
                        Compare {numericMetric(state, "nativeComparisonRows") || "-"}
                      </span>
                      <span className={`coverage-chip ${numericMetric(state, "nativeTurnoutRows") ? "coverage-good" : "coverage-warn"}`}>
                        Turnout rows {numericMetric(state, "nativeTurnoutRows") || "-"}
                      </span>
                      <span className={`coverage-chip ${state.turnoutSource?.status === "loaded" ? "coverage-good" : state.turnoutSource?.status === "partial" || state.turnoutSource?.status === "candidate" ? "coverage-warn" : "coverage-missing"}`}>
                        Turnout source {turnoutSourceStatusLabel(state.turnoutSource?.status)}
                      </span>
                      <span className={`coverage-chip ${adminCoverageClass(state.adminSource?.equipment.status)}`}>
                        Equipment {adminSourceStatusLabel(state.adminSource?.equipment.status)}
                      </span>
                      <span className={`coverage-chip ${adminCoverageClass(state.adminSource?.audit.status)}`}>
                        Audit {adminSourceStatusLabel(state.adminSource?.audit.status)}
                      </span>
                      <span className={`coverage-chip ${adminCoverageClass(state.adminSource?.cvr.status)}`}>
                        CVR {adminSourceStatusLabel(state.adminSource?.cvr.status)}
                      </span>
                      <span className={`coverage-chip ${adminCoverageClass(state.adminSource?.incidents.status)}`}>
                        Incidents {adminSourceStatusLabel(state.adminSource?.incidents.status)}
                      </span>
                      <span className={`coverage-chip ${sourceAcquisitionCoverageClass(state.sourceAcquisitionPrimary)}`}>
                        Acquisition {sourceAcquisitionTierShortLabel(state.sourceAcquisitionPrimary?.tier)}
                      </span>
                    </div>
                  </td>
                  <td className="readiness-counts">
                    <span>Jurisdictions: {state.resultJurisdictions.toLocaleString()}</span>
                    <span>Review rows: {state.reviewRowCount.toLocaleString()}</span>
                    <span>Turnout rows: {state.turnoutRowCount.toLocaleString()}</span>
                    <span>Historical rows: {state.historicalRowCount.toLocaleString()}</span>
                    <span>Equipment rows: {state.equipmentRowCount.toLocaleString()}</span>
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
            const checklist = stateChecklist(state, sourcePackage, state.turnoutSource);
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

                  <div className="detail-source-package">
                    <div className="detail-package-head">
                      <div>
                        <h3>Source Acquisition Tier</h3>
                        <p>
                          Acquisition tiers classify source difficulty and scripting ROI. They do not replace loaded results,
                          review rows, turnout rows, or provenance records.
                        </p>
                      </div>
                      <span className={`coverage-chip ${sourceAcquisitionCoverageClass(state.sourceAcquisitionPrimary)}`}>
                        {sourceAcquisitionTierShortLabel(state.sourceAcquisitionPrimary?.tier)}
                      </span>
                    </div>
                    {state.sourceAcquisitionRows.length ? (
                      <div className="detail-artifact-grid">
                        {state.sourceAcquisitionRows.map((entry) => (
                          <article className="detail-artifact" key={`${entry.state}-${entry.jurisdictionName}-${entry.dataFamily}`}>
                            <span>{entry.jurisdictionName}</span>
                            <strong>{sourceAcquisitionTierShortLabel(entry.tier)} / {entry.reportingGrain}</strong>
                            <code>{entry.exportFormats.join("; ")}</code>
                            <p>{entry.nextAction}</p>
                            {entry.sourceUrls.map((sourceUrl, index) => (
                              <a href={sourceUrl} key={sourceUrl} target="_blank" rel="noreferrer">
                                Source {index + 1}
                              </a>
                            ))}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p>No acquisition tier has been registered for this state.</p>
                    )}
                  </div>
                  <div className="detail-source-package">
                    <div className="detail-package-head">
                      <div>
                        <h3>Turnout Source Status</h3>
                        <p>{state.turnoutSource?.statusNote ?? "No turnout source status is registered for this state."}</p>
                      </div>
                      <span className="task-pill task-medium">{turnoutSourceStatusLabel(state.turnoutSource?.status)}</span>
                    </div>
                    {state.turnoutSource ? (
                      <div className="detail-artifact-grid">
                        <article className="detail-artifact">
                          <span>{state.turnoutSource.sourceLevel}</span>
                          <strong>{state.turnoutSource.sourceTitle}</strong>
                          <code>{state.turnoutSource.localFile || "local artifact needed"}</code>
                          <p>{state.turnoutSource.nextAction}</p>
                          <a href={state.turnoutSource.sourceUrl} target="_blank" rel="noreferrer">
                            Official or fallback source
                          </a>
                        </article>
                      </div>
                    ) : null}
                  </div>

                  <div className="detail-source-package">
                    <div className="detail-package-head">
                      <div>
                        <h3>Administration Source Status</h3>
                        <p>
                          Equipment context is loaded from the Verified Voting Verifier registry where available. Audit,
                          CVR, incident, correction, and litigation context are tracked separately because they answer
                          different review questions.
                        </p>
                      </div>
                      <span className="task-pill task-low">
                        Equipment {adminSourceStatusLabel(state.adminSource?.equipment.status)}
                      </span>
                    </div>
                    <div className="detail-artifact-grid">
                      <article className="detail-artifact">
                        <span>Equipment</span>
                        <strong>{adminSourceStatusLabel(state.adminSource?.equipment.status)}</strong>
                        <code>{state.adminSource?.equipment.normalizedArtifact ?? "normalized artifact needed"}</code>
                        <p>{state.adminSource?.equipment.caveat ?? "Equipment context has not been registered for this state."}</p>
                        {state.adminSource?.equipment.sourceUrl ? (
                          <a href={state.adminSource.equipment.sourceUrl} target="_blank" rel="noreferrer">
                            Verified Voting source
                          </a>
                        ) : null}
                      </article>
                      <article className="detail-artifact">
                        <span>Audit</span>
                        <strong>{adminSourceStatusLabel(state.adminSource?.audit.status)}</strong>
                        <code>audit package pending</code>
                        <p>{state.adminSource?.audit.why ?? "Audit source status has not been registered for this state."}</p>
                      </article>
                      <article className="detail-artifact">
                        <span>CVR</span>
                        <strong>{adminSourceStatusLabel(state.adminSource?.cvr.status)}</strong>
                        <code>CVR package pending</code>
                        <p>{state.adminSource?.cvr.why ?? "CVR source status has not been registered for this state."}</p>
                      </article>
                      <article className="detail-artifact">
                        <span>Incidents</span>
                        <strong>{adminSourceStatusLabel(state.adminSource?.incidents.status)}</strong>
                        <code>incident package pending</code>
                        <p>{state.adminSource?.incidents.why ?? "Incident/correction source status has not been registered for this state."}</p>
                      </article>
                    </div>
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
                      {state.sourceDiscovery ? (
                        <div className="detail-artifact-grid">
                          <article className="detail-artifact">
                            <span>{sourceDiscoveryStatusLabel(state.sourceDiscovery.currentStatus)}</span>
                            <strong>{state.sourceDiscovery.preferredComparisonContest}</strong>
                            <code>{state.sourceDiscovery.parserNeeded}</code>
                            <p>{state.sourceDiscovery.blocker}</p>
                            {state.sourceDiscovery.officialSourcePages.map((sourceUrl, index) => (
                              <a href={sourceUrl} key={sourceUrl} target="_blank" rel="noreferrer">
                                Official source {index + 1}
                              </a>
                            ))}
                          </article>
                          <article className="detail-artifact">
                            <span>Required artifacts</span>
                            <strong>Local reporting-unit rows</strong>
                            <code>{state.sourceDiscovery.requiredArtifacts.join("; ")}</code>
                            <p>
                              County-only result tables are tracked as insufficient for comparable advisory flag generation.
                            </p>
                          </article>
                        </div>
                      ) : (
                        <p>
                          Ask the data team for official result artifacts, local review/comparison data, turnout denominators,
                          county geometry, expected totals, parser hints, caveats, and source URLs for this state.
                        </p>
                      )}
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
