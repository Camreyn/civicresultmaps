import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  McpToolError,
  fileExists,
  readJsonFile,
  resolveInsideRepo,
  resolveReadableInsideRepo,
  sha256File,
  type RuntimeContext,
} from "./runtime.ts";
import { resolveStateWorkflow } from "./workflows.ts";

type StateMetadata = {
  code: string;
  fips: string;
  name: string;
  priority?: string;
};

type StateCatalogEntry = StateMetadata & {
  configPath: string;
};

export type StateCatalog = {
  configOnly: string[];
  metadataOnly: string[];
  states: StateCatalogEntry[];
};

type JsonRecord = Record<string, unknown>;

export async function loadPackageScripts(context: RuntimeContext): Promise<Record<string, string>> {
  const packageJson = await readJsonFile<{ scripts?: Record<string, unknown> }>(context, "package.json");
  return Object.fromEntries(
    Object.entries(packageJson.scripts ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export async function loadStateCatalog(context: RuntimeContext): Promise<StateCatalog> {
  const metadataPath = resolveInsideRepo(context, "scripts/state-metadata.mjs");
  const metadataStats = await stat(metadataPath);
  const metadataModule = await import(`${pathToFileURL(metadataPath).href}?mtime=${metadataStats.mtimeMs}-${metadataStats.size}`) as { states?: unknown };
  if (!Array.isArray(metadataModule.states)) {
    throw new McpToolError("invalid_state_metadata", "scripts/state-metadata.mjs does not export a states array.", "Repair the state metadata module.");
  }
  const metadata = metadataModule.states.map(validateStateMetadata);
  const configDirectory = resolveInsideRepo(context, "etl/state-configs");
  const configCodes = (await readdir(configDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^[a-z]{2}\.json$/i.test(entry.name))
    .map((entry) => entry.name.slice(0, 2).toUpperCase())
    .sort();
  const metadataCodes = metadata.map((state) => state.code).sort();
  const configSet = new Set(configCodes);
  const metadataSet = new Set(metadataCodes);
  return {
    configOnly: configCodes.filter((code) => !metadataSet.has(code)),
    metadataOnly: metadataCodes.filter((code) => !configSet.has(code)),
    states: metadata
      .filter((state) => configSet.has(state.code))
      .map((state) => ({ ...state, configPath: `etl/state-configs/${state.code.toLowerCase()}.json` }))
      .sort((left, right) => left.code.localeCompare(right.code)),
  };
}

export async function requireCatalogState(context: RuntimeContext, value: string): Promise<StateCatalogEntry> {
  const state = String(value).toUpperCase();
  const catalog = await loadStateCatalog(context);
  const entry = catalog.states.find((candidate) => candidate.code === state);
  if (!entry) {
    throw new McpToolError(
      "unsupported_state",
      `${state} is not present in both state metadata and ETL configs.`,
      "Run crm_doctor to inspect metadata/config drift, then add or repair the state config.",
      { configOnly: catalog.configOnly, metadataOnly: catalog.metadataOnly },
    );
  }
  return entry;
}

export async function describeStateInventory(context: RuntimeContext, stateValue: string) {
  const state = await requireCatalogState(context, stateValue);
  const [config, acquisition, nativePackages, scripts, staging] = await Promise.all([
    readJsonFile<JsonRecord>(context, state.configPath),
    readJsonFile<JsonRecord>(context, "data/source-acquisition-tiers.json"),
    readJsonFile<JsonRecord>(context, "data/native-import-source-packages.json"),
    loadPackageScripts(context),
    describeStagingArtifact(context, state.code),
  ]);
  const acquisitionRows = arrayOfRecords(acquisition.states).filter((row) => normalizedState(row.state) === state.code);
  const completedStates = Array.isArray(nativePackages.completedNativeStates)
    ? nativePackages.completedNativeStates.map(normalizedState).filter(Boolean)
    : [];
  const nativeState = arrayOfRecords(nativePackages.states).find((row) => normalizedState(row.state) === state.code) ?? null;
  const discoveryState = arrayOfRecords(nativePackages.sourceDiscoveryQueue).find((row) => normalizedState(row.state) === state.code) ?? null;
  const validateWorkflow = workflowAvailability("validate", state.code, scripts);
  const importWorkflow = workflowAvailability("import", state.code, scripts);

  return {
    config: {
      authority: config.authority ?? null,
      capabilities: config.capabilities ?? null,
      code: config.code ?? state.code,
      electionYear: config.electionYear ?? null,
      expected: config.expected ?? null,
      historicalBaselineCount: Array.isArray(config.historicalBaselines) ? config.historicalBaselines.length : 0,
      name: config.name ?? state.name,
      office: config.office ?? null,
      path: state.configPath,
      sourceCount: Array.isArray(config.sources) ? config.sources.length : 0,
    },
    documentation: [
      "docs/native-import-source-packages.md",
      "docs/turnout-collection-inventory.md",
      "docs/developer/precinct-gis-implementation.md",
    ],
    inventories: {
      acquisition: acquisitionRows,
      native: {
        completed: completedStates.includes(state.code),
        discovery: discoveryState,
        package: nativeState,
      },
    },
    metadata: state,
    staging,
    workflows: { import: importWorkflow, validate: validateWorkflow },
  };
}

export async function describeStagingArtifact(context: RuntimeContext, stateValue: string) {
  const state = stateValue.toUpperCase();
  const relativePath = `.etl/staging/${state.toLowerCase()}-2024-staging.json`;
  const lexicalPath = resolveInsideRepo(context, relativePath);
  if (!(await fileExists(lexicalPath))) return { exists: false, path: relativePath };
  const filePath = await resolveReadableInsideRepo(context, relativePath);
  const [artifactStats, digest, artifactText] = await Promise.all([
    stat(filePath),
    sha256File(filePath),
    readFile(filePath, "utf8"),
  ]);
  let artifact: JsonRecord;
  try {
    artifact = JSON.parse(artifactText) as JsonRecord;
  } catch (error) {
    throw new McpToolError(
      "invalid_staging_json",
      `${relativePath} is not valid JSON.`,
      "Regenerate the staging artifact through crm_import_staging.",
      error instanceof Error ? error.message : String(error),
    );
  }
  validateStagingIdentity(artifact, state, relativePath);
  const native = isRecord(artifact.native) ? artifact.native : {};
  return {
    electionYear: isRecord(artifact.election) ? artifact.election.year ?? null : null,
    exists: true,
    modifiedAt: artifactStats.mtime.toISOString(),
    path: relativePath,
    rows: {
      historical: arrayLength(native.historicalRows),
      historicalReview: arrayLength(native.historicalReviewRows),
      results: arrayLength(native.resultRows),
      review: arrayLength(native.reviewRows),
      turnout: arrayLength(native.turnoutRows),
    },
    sha256: digest,
    sizeBytes: artifactStats.size,
    state,
  };
}

export async function loadStagingArtifact(context: RuntimeContext, stateValue: string): Promise<JsonRecord> {
  const state = stateValue.toUpperCase();
  const relativePath = `.etl/staging/${state.toLowerCase()}-2024-staging.json`;
  const filePath = resolveInsideRepo(context, relativePath);
  if (!(await fileExists(filePath))) {
    throw new McpToolError(
      "staging_missing",
      `No staging artifact exists for ${state} at ${relativePath}.`,
      `Run crm_import_staging for ${state} first.`,
    );
  }
  const artifact = await readJsonFile<JsonRecord>(context, relativePath);
  validateStagingIdentity(artifact, state, relativePath);
  return artifact;
}

export function stagingRowSets(artifact: JsonRecord) {
  const native = isRecord(artifact.native) ? artifact.native : {};
  const historicalRows = arrayOfRecords(native.historicalRows);
  const resultRows = arrayOfRecords(native.resultRows).filter((row) => row.level === "county");
  const historicalByYear: Record<string, number> = {};
  for (const row of historicalRows) {
    const year = Number(row.electionYear);
    if (Number.isInteger(year)) historicalByYear[String(year)] = (historicalByYear[String(year)] ?? 0) + 1;
  }
  return {
    countyResults2024: resultRows.length,
    historicalByYear,
    historicalRows: historicalRows.length,
  };
}

export async function assertRuntimeRepo(context: RuntimeContext): Promise<void> {
  const required = ["package.json", "AGENTS.md", "scripts/state-metadata.mjs", "civic_etl/cli.py"];
  const missing: string[] = [];
  for (const relativePath of required) {
    if (!(await fileExists(resolveInsideRepo(context, relativePath)))) missing.push(relativePath);
  }
  if (missing.length) {
    throw new McpToolError(
      "invalid_repo_root",
      `The configured MCP repository root is missing required files: ${missing.join(", ")}`,
      "Set cwd and CRM_MCP_REPO_ROOT to the CivicResultMaps checkout.",
      { root: context.repoRoot },
    );
  }
}

function workflowAvailability(kind: "import" | "validate", state: string, scripts: Record<string, string>) {
  const full = resolveStateWorkflow(kind, state, "full", scripts);
  return {
    configOnly: true,
    full: full.drift.length === 0,
    packageScripts: full.packageScripts,
    steps: full.steps.map((step) => step.label),
    drift: full.drift,
  };
}

function validateStateMetadata(value: unknown): StateMetadata {
  if (!isRecord(value)) throw new McpToolError("invalid_state_metadata", "State metadata contains a non-object entry.", "Repair scripts/state-metadata.mjs.");
  const code = normalizedState(value.code);
  if (!code || typeof value.name !== "string" || typeof value.fips !== "string") {
    throw new McpToolError("invalid_state_metadata", "State metadata contains an invalid code, name, or FIPS value.", "Repair scripts/state-metadata.mjs.", value);
  }
  return {
    code,
    fips: value.fips,
    name: value.name,
    ...(typeof value.priority === "string" ? { priority: value.priority } : {}),
  };
}

function validateStagingIdentity(artifact: JsonRecord, state: string, relativePath: string) {
  const artifactState = isRecord(artifact.state) ? normalizedState(artifact.state.code) : null;
  const electionYear = isRecord(artifact.election) ? Number(artifact.election.year) : NaN;
  if (artifactState !== state || electionYear !== 2024 || !isRecord(artifact.native)) {
    throw new McpToolError(
      "invalid_staging_identity",
      `${relativePath} does not contain a ${state} 2024 native staging artifact.`,
      "Regenerate the artifact through the reviewed state importer.",
      { artifactState, electionYear },
    );
  }
}

function arrayOfRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function normalizedState(value: unknown): string {
  const state = String(value ?? "").toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : "";
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
