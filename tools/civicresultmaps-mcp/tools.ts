import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { TOOL_NAMES, type CompareTarget, type ToolEnvelope, type ValidatorName, type WorkflowMode } from "./contracts.ts";
import {
  assertRuntimeRepo,
  describeStagingArtifact,
  describeStateInventory,
  loadPackageScripts,
  loadStagingArtifact,
  loadStateCatalog,
  requireCatalogState,
  stagingRowSets,
} from "./catalog.ts";
import {
  McpToolError,
  fileExists,
  parseJsonOutput,
  relativeToRepo,
  repoSnapshot,
  resolveInsideRepo,
  runAuditedWorkflow,
  runtimeVersion,
  stepPassed,
  summarizeStep,
  writeAuditJson,
  type AuditedRun,
  type RuntimeContext,
} from "./runtime.ts";
import {
  collectWorkflowDrift,
  registeredSpecialStates,
  resolveStateWorkflow,
  resolveValidatorWorkflow,
  validatorNames,
  unregisteredWorkflowScripts,
  type WorkflowStep,
} from "./workflows.ts";

type ToolCallResult = {
  content: Array<{ text: string; type: "text" }>;
  isError?: boolean;
  structuredContent: ToolEnvelope;
};

type JsonRecord = Record<string, unknown>;

const TARGET_BASES: Record<CompareTarget, string> = {
  local: "http://127.0.0.1:3000",
  production: "https://www.civicresultmaps.org",
};

const TIMEOUTS = {
  compare: 15 * 60_000,
  import: 60 * 60_000,
  validate: 30 * 60_000,
  validator: 30 * 60_000,
};

export async function handleDoctor(context: RuntimeContext): Promise<ToolCallResult> {
  await assertRuntimeRepo(context);
  const [catalog, scripts, nodeVersion, pythonVersion, activeConfig, configTemplate] = await Promise.all([
    loadStateCatalog(context),
    loadPackageScripts(context),
    runtimeVersion(context, "node"),
    runtimeVersion(context, "python"),
    fileExists(resolveInsideRepo(context, ".codex/config.toml")),
    fileExists(resolveInsideRepo(context, ".codex/config.toml.example")),
  ]);
  const drift = collectWorkflowDrift(scripts, catalog.states.map((state) => state.code));
  const unregisteredCandidates = unregisteredWorkflowScripts(scripts, catalog.states.map((state) => state.code));
  const warnings = [
    ...catalog.configOnly.map((state) => `${state} has a config but no state metadata entry.`),
    ...catalog.metadataOnly.map((state) => `${state} has metadata but no ETL config.`),
    ...drift.map((entry) => `${entry.script} differs from its reviewed MCP registry value and is disabled.`),
    ...(!activeConfig ? ["The private .codex/config.toml connection file is not installed."] : []),
  ];
  return success(context, "CivicResultMaps MCP doctor completed.", {
    disabledActions: [
      "arbitrary shell, command, path, URL, SQL, or environment input",
      "native production promotion and existing-database mutation",
      "jurisdiction backfill --apply",
      "Git commit, push, branch, merge, or pull-request publication",
      "unregistered collection, normalization, or validation scripts",
    ],
    localConnection: {
      activeConfig,
      configPath: ".codex/config.toml",
      templateInstalled: configTemplate,
      transport: "stdio",
    },
    repository: {
      configOnlyStates: catalog.configOnly,
      metadataOnlyStates: catalog.metadataOnly,
      supportedStateCount: catalog.states.length,
    },
    runtimes: { node: nodeVersion, python: pythonVersion },
    server: {
      protocolSupport: ["2025-era initialize", "2026-07-28 server/discover"],
      refreshBehavior: {
        liveWithoutRestart: ["state metadata", "state configs", "inventories", "package script drift", "staging artifacts"],
        restartRequired: ["tool schemas", "server code", "workflow registry", "new validators"],
      },
      stagingDirectory: ".etl/staging",
      toolCount: TOOL_NAMES.length,
    },
    specialWorkflows: registeredSpecialStates(),
    validators: validatorNames(),
    unregisteredCandidates,
    workflowDrift: drift,
  }, warnings);
}

export async function handleStateInventory(context: RuntimeContext, state: string): Promise<ToolCallResult> {
  const inventory = await describeStateInventory(context, state);
  const warnings: string[] = [];
  if (!inventory.staging.exists) warnings.push(`${inventory.metadata.code} has no current staging artifact.`);
  if (!inventory.workflows.validate.full) warnings.push(`${inventory.metadata.code} full validation is disabled by workflow drift.`);
  if (!inventory.workflows.import.full) warnings.push(`${inventory.metadata.code} full import is disabled by workflow drift.`);
  return success(context, `Inspected ${inventory.metadata.code} metadata, sources, workflows, and staging status.`, inventory, warnings);
}

export async function handleValidateState(
  context: RuntimeContext,
  stateValue: string,
  mode: WorkflowMode,
  signal?: AbortSignal,
): Promise<ToolCallResult> {
  const state = await requireCatalogState(context, stateValue);
  const scripts = await loadPackageScripts(context);
  const workflow = resolveStateWorkflow("validate", state.code, mode, scripts);
  assertNoDrift(workflow.drift, `${state.code} validation`);
  const run = await runAuditedWorkflow({
    context,
    name: `validate-${state.code.toLowerCase()}-${mode}`,
    signal,
    steps: workflow.steps,
    timeoutMs: TIMEOUTS.validate,
  });
  assertRunPassed(run, `${state.code} validation`);
  const validation = await withRunContext(run, () => parseJsonOutput(run.steps.at(-1)!));
  return success(context, `${state.code} validation passed.`, {
    state: state.code,
    validation,
    workflow: {
      mode,
      packageScripts: workflow.packageScripts,
      steps: run.steps.map(summarizeStep),
    },
  }, [], run);
}

export async function handleImportStaging(
  context: RuntimeContext,
  stateValue: string,
  mode: WorkflowMode,
  signal?: AbortSignal,
): Promise<ToolCallResult> {
  const state = await requireCatalogState(context, stateValue);
  const scripts = await loadPackageScripts(context);
  const workflow = resolveStateWorkflow("import", state.code, mode, scripts);
  assertNoDrift(workflow.drift, `${state.code} import`);
  const run = await runAuditedWorkflow({
    context,
    name: `import-${state.code.toLowerCase()}-${mode}`,
    signal,
    steps: workflow.steps,
    timeoutMs: TIMEOUTS.import,
  });
  assertRunPassed(run, `${state.code} import`);
  const staging = await withRunContext(run, () => describeStagingArtifact(context, state.code));
  if (!staging.exists) {
    throw new McpToolError(
      "staging_missing_after_import",
      `${state.code} import exited successfully but did not create its expected staging artifact.`,
      "Inspect the import audit and the civic_etl staging path calculation.",
      { run: run.reference },
    );
  }
  const indicators = await withRunContext(run, () => indicatorReport(context, [state.code], 2024));
  const selectedIndicator = indicators.states.find((entry) => entry.state === state.code) ?? null;
  const warnings = selectedIndicator?.indicatorRows === 0
    ? [`${state.code} produced zero advisory indicator rows; review evaluationReason and evaluationCaveat.`]
    : [];
  return success(context, `${state.code} staging import passed and its advisory-indicator path was evaluated.`, {
    indicators: selectedIndicator,
    staging,
    state: state.code,
    workflow: {
      mode,
      packageScripts: workflow.packageScripts,
      steps: run.steps.map(summarizeStep),
    },
  }, warnings, run);
}

export async function handleReportIndicators(
  context: RuntimeContext,
  stateValues: string[],
  year: number,
): Promise<ToolCallResult> {
  const states = normalizeStates(stateValues);
  await Promise.all(states.map((state) => requireCatalogState(context, state)));
  const report = await indicatorReport(context, states, year);
  const missingStates = states.filter((state) => !report.states.some((entry) => entry.state === state));
  const warnings = [
    ...missingStates.map((state) => `${state} has no 2024 staging artifact to evaluate for ${year}.`),
    ...report.states
      .filter((entry) => entry.indicatorRows === 0)
      .map((entry) => `${entry.state} produced zero advisory indicators: ${entry.evaluationReason}.`),
  ];
  return success(context, `Evaluated ${year} advisory indicators for ${report.states.length} staged state(s).`, {
    caveat: "Advisory indicators identify review and reconciliation signals only; they are not proof of fraud or misconduct.",
    missingStates,
    states: report.states,
    year,
  }, warnings);
}

export async function handleCompareStaging(
  context: RuntimeContext,
  stateValues: string[],
  target: CompareTarget,
  signal?: AbortSignal,
): Promise<ToolCallResult> {
  const states = normalizeStates(stateValues);
  await Promise.all(states.map(async (state) => {
    await requireCatalogState(context, state);
    await loadStagingArtifact(context, state);
  }));
  const base = TARGET_BASES[target];
  const overlayArg = states.join(",");
  const steps = comparisonSteps(base, overlayArg);
  const run = await runAuditedWorkflow({
    context,
    name: `compare-staging-${target}-${states.join("-").toLowerCase()}`,
    signal,
    steps,
    timeoutMs: TIMEOUTS.compare,
  });
  assertRunPassed(run, `${target} staging comparison`);
  const { coverage2016, flips2016To2020, flips2016To2024, stateComparisons } = await withRunContext(run, async () => {
    const coverage2016 = asRecord(parseJsonOutput(run.steps[0]), "2016 coverage report");
    const flips2016To2020 = asRecord(parseJsonOutput(run.steps[1]), "2016-2020 flip report");
    const flips2016To2024 = asRecord(parseJsonOutput(run.steps[2]), "2016-2024 flip report");
    for (const report of [coverage2016, flips2016To2020, flips2016To2024]) verifyOverlay(report, states);
    const stateComparisons = await Promise.all(states.map((state) => compareStateRows(context, state, base, signal)));
    return { coverage2016, flips2016To2020, flips2016To2024, stateComparisons };
  });

  const blockingReasons = stateComparisons.flatMap((comparison) => comparison.blockingReasons);
  const promotionReview = blockingReasons.length ? "blocked" : "clear";
  const summary = {
    base,
    caveat: "This is a read-only promotion review. The MCP server exposes no promotion or production-write tool.",
    promotionReview,
    rawReports: {
      coverage2016: run.steps[0] ? `${relativeToRepo(context, run.auditDirectory)}/coverage-2016.json` : null,
      flips2016To2020: `${relativeToRepo(context, run.auditDirectory)}/flips-2016-2020.json`,
      flips2016To2024: `${relativeToRepo(context, run.auditDirectory)}/flips-2016-2024.json`,
    },
    reports: {
      coverage2016: selectCoverageSummary(coverage2016, states),
      flips2016To2020: selectFlipSummary(flips2016To2020, states),
      flips2016To2024: selectFlipSummary(flips2016To2024, states),
    },
    stateComparisons,
    states,
    target,
  };
  await Promise.all([
    writeAuditJson(run, "coverage-2016.json", coverage2016),
    writeAuditJson(run, "flips-2016-2020.json", flips2016To2020),
    writeAuditJson(run, "flips-2016-2024.json", flips2016To2024),
    writeAuditJson(run, "comparison-summary.json", summary),
  ]);
  const warnings = blockingReasons.length
    ? blockingReasons
    : ["No row-set reduction was detected; source caveats and normal human promotion review still apply."];
  return success(context, `Compared ${states.join(", ")} staging with the fixed ${target} API target: ${promotionReview}.`, summary, warnings, run);
}

export async function handleRunValidator(
  context: RuntimeContext,
  validator: ValidatorName,
  signal?: AbortSignal,
): Promise<ToolCallResult> {
  const scripts = await loadPackageScripts(context);
  const workflow = resolveValidatorWorkflow(validator, scripts);
  assertNoDrift(workflow.drift, `${validator} validator`);
  const run = await runAuditedWorkflow({
    context,
    name: `validator-${validator}`,
    signal,
    steps: workflow.steps,
    timeoutMs: TIMEOUTS.validator,
  });
  assertRunPassed(run, `${validator} validator`);
  const results = run.steps.map((step) => ({
    ...summarizeStep(step),
    parsed: tryParseJson(step.stdout),
  }));
  return success(context, `${validator} validator passed.`, {
    packageScripts: workflow.packageScripts,
    results,
    validator,
  }, [], run);
}

export async function errorResult(context: RuntimeContext, error: unknown): Promise<ToolCallResult> {
  const repo = await repoSnapshot(context);
  const known = error instanceof McpToolError;
  const details = known ? error.details : null;
  const run = extractRunReference(details);
  const envelope: ToolEnvelope = {
    ok: false,
    repo,
    result: {
      code: known ? error.code : "internal_error",
      details,
      message: error instanceof Error ? error.message : "The MCP tool failed.",
      remediation: known ? error.remediation : "Inspect the server stderr and local run audit, then retry.",
    },
    ...(run ? { run } : {}),
    warnings: [],
  };
  return {
    content: [{ text: `${(envelope.result as JsonRecord).message}`, type: "text" }],
    isError: true,
    structuredContent: envelope,
  };
}

export function verifyOverlay(report: JsonRecord, expectedStates: string[]): void {
  const overlay = isRecord(report.stagingOverlay) ? report.stagingOverlay : null;
  const actualStates = overlay && Array.isArray(overlay.states)
    ? overlay.states.map((state) => String(state).toUpperCase()).sort()
    : [];
  const expected = [...expectedStates].sort();
  if (!overlay || JSON.stringify(actualStates) !== JSON.stringify(expected)) {
    throw new McpToolError(
      "invalid_staging_overlay",
      `A comparison report did not confirm the exact staging overlay: expected ${expected.join(", ")}.`,
      "Do not trust the comparison; inspect the report command and staging artifacts.",
      { actualStates, expectedStates: expected },
    );
  }
}

async function success(
  context: RuntimeContext,
  summary: string,
  result: unknown,
  warnings: string[] = [],
  run?: AuditedRun,
): Promise<ToolCallResult> {
  const envelope: ToolEnvelope = {
    ok: true,
    repo: run?.postRunRepo ?? await repoSnapshot(context),
    result,
    ...(run ? { run: run.reference } : {}),
    warnings,
  };
  return {
    content: [{ text: [summary, ...warnings.map((warning) => `Warning: ${warning}`)].join("\n"), type: "text" }],
    structuredContent: envelope,
  };
}

async function indicatorReport(context: RuntimeContext, states: string[], year: number) {
  const modulePath = resolveInsideRepo(context, "scripts/report-staging-indicator-counts.mjs");
  const moduleStats = await stat(modulePath);
  const module = await import(`${pathToFileURL(modulePath).href}?mtime=${moduleStats.mtimeMs}`) as {
    buildStagingIndicatorReport?: (options: { stagingDir: string; year: number }) => Promise<JsonRecord>;
  };
  if (typeof module.buildStagingIndicatorReport !== "function") {
    throw new McpToolError(
      "indicator_report_unavailable",
      "The staging indicator report no longer exports buildStagingIndicatorReport.",
      "Restore the export or update the reviewed MCP integration.",
    );
  }
  const stagingDirectory = resolveInsideRepo(context, ".etl/staging");
  const raw = await module.buildStagingIndicatorReport({ stagingDir: stagingDirectory, year });
  const reportStates = Array.isArray(raw.states) ? raw.states.filter(isRecord) : [];
  return {
    states: reportStates
      .filter((entry) => states.includes(String(entry.state).toUpperCase()))
      .map((entry) => ({
        broadSignalWarning: entry.broadSignalWarning ?? null,
        byLevel: entry.byLevel ?? {},
        byType: entry.byType ?? {},
        comparisonCoverageModes: entry.comparisonCoverageModes ?? [],
        evaluated: entry.evaluated ?? false,
        evaluationCaveat: entry.evaluationCaveat ?? null,
        evaluationReason: entry.evaluationReason ?? null,
        flaggedAreas: entry.flaggedAreas ?? 0,
        indicatorRows: entry.indicatorRows ?? 0,
        reviewRows: entry.reviewRows ?? 0,
        state: String(entry.state).toUpperCase(),
        uniqueFlaggedCountyJurisdictions: entry.uniqueFlaggedCountyJurisdictions ?? 0,
        uniqueFlaggedJurisdictions: entry.uniqueFlaggedJurisdictions ?? 0,
        year: entry.year ?? year,
      })),
  };
}

function comparisonSteps(base: string, overlayStates: string): WorkflowStep[] {
  const common = [`--base=${base}`, "--staging-dir=.etl/staging", `--overlay-states=${overlayStates}`];
  return [
    {
      args: ["--experimental-strip-types", "scripts/report-2024-county-list-coverage.mjs", "--year=2016", "--family=historical", ...common],
      label: "Compare 2016 county-tag coverage with staging overlay",
      runtime: "node",
    },
    {
      args: ["--experimental-strip-types", "scripts/report-national-county-flips.mjs", "--from=2016", "--to=2020", ...common],
      label: "Compare 2016-2020 county flips with staging overlay",
      runtime: "node",
    },
    {
      args: ["--experimental-strip-types", "scripts/report-national-county-flips.mjs", "--from=2016", "--to=2024", ...common],
      label: "Compare 2016-2024 county flips with staging overlay",
      runtime: "node",
    },
  ];
}

async function compareStateRows(context: RuntimeContext, state: string, base: string, signal?: AbortSignal) {
  const artifact = await loadStagingArtifact(context, state);
  const staged = stagingRowSets(artifact);
  const [historicalResponse, resultsResponse] = await Promise.all([
    fixedApiJson(`${base}/api/historical-baselines?state=${state}&limit=5000`, signal),
    fixedApiJson(`${base}/api/results?state=${state}&year=2024&level=county`, signal),
  ]);
  const liveHistoricalRows = arrayOfRecords(historicalResponse.data);
  const liveResultRows = arrayOfRecords(resultsResponse.data);
  const liveHistoricalByYear: Record<string, number> = {};
  for (const row of liveHistoricalRows) {
    const year = Number(row.electionYear);
    if (Number.isInteger(year)) liveHistoricalByYear[String(year)] = (liveHistoricalByYear[String(year)] ?? 0) + 1;
  }

  const blockingReasons: string[] = [];
  if (staged.historicalRows > 0) {
    for (const [year, liveCount] of Object.entries(liveHistoricalByYear)) {
      const stagedCount = staged.historicalByYear[year] ?? 0;
      if (stagedCount === 0) blockingReasons.push(`${state} staging omits live historical year ${year} (${liveCount} live rows).`);
      else if (stagedCount < liveCount) blockingReasons.push(`${state} staging reduces ${year} historical rows from ${liveCount} to ${stagedCount}.`);
    }
  }
  if (staged.countyResults2024 < liveResultRows.length) {
    blockingReasons.push(`${state} staging reduces 2024 county result rows from ${liveResultRows.length} to ${staged.countyResults2024}.`);
  }
  return {
    blockingReasons,
    live: {
      countyResults2024: liveResultRows.length,
      historicalByYear: liveHistoricalByYear,
      historicalRows: liveHistoricalRows.length,
    },
    staged,
    state,
  };
}

async function fixedApiJson(url: string, signal?: AbortSignal): Promise<JsonRecord> {
  const timeoutSignal = AbortSignal.timeout(20_000);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: combinedSignal });
  } catch (error) {
    throw new McpToolError(
      "comparison_network_error",
      `Could not read the fixed comparison API endpoint ${new URL(url).origin}.`,
      "Start the local development server when target=local, or retry production after network access is available.",
      error instanceof Error ? error.message : String(error),
    );
  }
  if (!response.ok) {
    throw new McpToolError(
      "comparison_http_error",
      `${new URL(url).pathname} returned HTTP ${response.status}.`,
      "Treat the comparison as inconclusive and inspect the selected fixed API target.",
    );
  }
  const value = await response.json();
  return asRecord(value, "comparison API response");
}

function selectCoverageSummary(report: JsonRecord, states: string[]) {
  return {
    family: report.family ?? null,
    stateProblems: arrayOfRecords(report.stateProblems).filter((row) => states.includes(String(row.state).toUpperCase())),
    totals: report.totals ?? null,
    year: report.year ?? null,
  };
}

function selectFlipSummary(report: JsonRecord, states: string[]) {
  return {
    comparison: report.comparison ?? null,
    coverage: report.coverage ?? null,
    flips: arrayOfRecords(report.flips).filter((row) => states.includes(String(row.state).toUpperCase())),
    stateSummaries: arrayOfRecords(report.stateSummaries).filter((row) => states.includes(String(row.state).toUpperCase())),
  };
}


async function withRunContext<T>(run: AuditedRun, operation: () => Promise<T> | T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof McpToolError) {
      throw new McpToolError(
        error.code,
        error.message,
        error.remediation,
        { cause: error.details, run: run.reference },
      );
    }
    throw new McpToolError(
      "post_run_failure",
      "A post-run MCP verification step failed.",
      "Inspect the completed run audit and the server stderr before retrying.",
      { cause: error instanceof Error ? error.message : String(error), run: run.reference },
    );
  }
}

function assertNoDrift(drift: unknown[], label: string) {
  if (!drift.length) return;
  throw new McpToolError(
    "workflow_drift",
    `${label} is disabled because its package-script contract changed.`,
    "Review the package script, update the declarative MCP workflow registry, and rerun the MCP tests.",
    { drift },
  );
}

function assertRunPassed(run: AuditedRun, label: string) {
  const failedStep = run.steps.find((step) => !stepPassed(step));
  if (!failedStep && run.reference.status === "passed") return;
  throw new McpToolError(
    "workflow_failed",
    `${label} failed${failedStep ? ` during: ${failedStep.label}` : ""}.`,
    "Inspect the returned run audit before changing source data or retrying.",
    { run: run.reference, step: failedStep ? summarizeStep(failedStep) : null },
  );
}

function normalizeStates(values: string[]): string[] {
  const states = values.map((value) => String(value).toUpperCase());
  const unique = Array.from(new Set(states));
  if (unique.length !== states.length) {
    throw new McpToolError("duplicate_states", "State lists must remain unique after case normalization.", "Remove duplicate state codes.");
  }
  return unique.sort();
}

function extractRunReference(details: unknown) {
  if (!isRecord(details) || !isRecord(details.run)) return null;
  const run = details.run;
  if (
    typeof run.auditPath === "string"
    && typeof run.durationMs === "number"
    && typeof run.id === "string"
    && (run.status === "failed" || run.status === "passed")
  ) {
    return {
      auditPath: run.auditPath,
      durationMs: run.durationMs,
      id: run.id,
      status: run.status,
    } as const;
  }
  return null;
}

function tryParseJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new McpToolError("invalid_structured_output", `${label} is not a JSON object.`, "Inspect the producer and its local audit output.");
  }
  return value;
}

function arrayOfRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
