import { readFile, stat } from "node:fs/promises";
import { fileExists, readJsonFile, resolveInsideRepo, resolveReadableInsideRepo, type RuntimeContext } from "./runtime.ts";
import { loadStateCatalog } from "./catalog.ts";
import type { EvidenceRequest, PublicApiEvidence } from "./evidence.ts";

type RecordValue = Record<string, unknown>;
export const COVERAGE_GAP_YEARS = [2012, 2016, 2020, 2024] as const;
const MAX_STATES = 5;
export type CoverageTarget = "none" | "local" | "production";
export type CoverageFamily = "results" | "comparison" | "review" | "turnout" | "historical";
export type CoverageGapsInput = { states?: string[]; years?: number[]; target?: CoverageTarget };
export type { EvidenceRequest } from "./evidence.ts";
export type CoverageGapDependencies = { readPublicApi?: (request: EvidenceRequest) => Promise<PublicApiEvidence> };
type Staging = { state: "absent" | "malformed" | "valid"; path: string; native: RecordValue | null };
type ResultLevelScope = { levels: string[]; completeness: "staged_supported_levels" | "county_fallback_incomplete" };
type StateInputs = { context: RuntimeContext; state: string; config: RecordValue; staging: Staging; acquisition: RecordValue[]; native: RecordValue | null; discovery: RecordValue | null };

/** Read-only evidence report. Fixed API rows are evidence only, never browser-display confirmation. */
export async function buildCoverageGaps(context: RuntimeContext, input: CoverageGapsInput = {}, dependencies: CoverageGapDependencies = {}) {
  const target = normalizedTarget(input.target);
  const years = normalizedYears(input.years);
  const catalog = await loadStateCatalog(context);
  const states = normalizedStates(input.states, catalog.states.map((state) => state.code));
  const [acquisition, native] = await Promise.all([readJsonFile<RecordValue>(context, "data/source-acquisition-tiers.json"), readJsonFile<RecordValue>(context, "data/native-import-source-packages.json")]);
  const inputs = await Promise.all(states.map((state) => loadInputs(context, state, acquisition, native)));
  const records = (await Promise.all(inputs.flatMap((item) => years.map((year) => recordFor(item, year, target, dependencies.readPublicApi))))).sort(byStateYear);
  const gaps = records.filter((item) => Number(object(item.priority)?.order) < 6).sort(byPriority);
  return { generatedAt: new Date().toISOString(), methodology: { target, years, families: ["results", "comparison", "review", "turnout", "historical"], caveat: "API row observations do not verify browser display. Inventory readiness is not live confirmation. Earlier years inspect historical baseline rows only; historical review/comparison rows are outside this report unless a future explicit configuration is added." }, summary: summary(records, gaps), gaps, records };
}

async function loadInputs(context: RuntimeContext, state: string, acquisition: RecordValue, native: RecordValue): Promise<StateInputs> {
  const config = await readJsonFile<RecordValue>(context, `etl/state-configs/${state.toLowerCase()}.json`);
  if (stateCode(config.code) !== state) throw new Error(`State config identity mismatch for ${state}.`);
  const path = `.etl/staging/${state.toLowerCase()}-2024-staging.json`;
  return { context, state, config, staging: await stagingFor(context, state, path), acquisition: objects(acquisition.states).filter((row) => stateCode(row.state) === state), native: objects(native.states).find((row) => stateCode(row.state) === state) ?? null, discovery: objects(native.sourceDiscoveryQueue).find((row) => stateCode(row.state) === state) ?? null };
}

async function stagingFor(context: RuntimeContext, state: string, path: string): Promise<Staging> {
  const lexical = resolveInsideRepo(context, path);
  if (!(await fileExists(lexical))) return { state: "absent", path, native: null };
  try {
    const absolute = await resolveReadableInsideRepo(context, path);
    const artifact = JSON.parse(await readFile(absolute, "utf8")) as RecordValue;
    const native = object(artifact.native);
    if (!native || stateCode(object(artifact.state)?.code) !== state || Number(object(artifact.election)?.year) !== 2024) return { state: "malformed", path, native: null };
    return { state: "valid", path, native };
  } catch { return { state: "malformed", path, native: null }; }
}

async function recordFor(input: StateInputs, year: number, target: CoverageTarget, reader: CoverageGapDependencies["readPublicApi"]) {
  const families = {
    results: await family(input, year, "results", target, reader),
    comparison: await family(input, year, "comparison", target, reader),
    review: await family(input, year, "review", target, reader),
    turnout: await family(input, year, "turnout", target, reader),
    historical: await family(input, year, "historical", target, reader),
  };
  return { state: input.state, year, grain: grain(input.config, input.acquisition, year), families, displayStatus: "display_unverified", priority: priority(families), caveats: caveats(input, year, families) };
}

async function family(input: StateInputs, year: number, name: CoverageFamily, target: CoverageTarget, reader: CoverageGapDependencies["readPublicApi"]) {
  if (!applicable(year, name)) return { applicable: false, status: "not_applicable", reason: `${name} is not evaluated for ${year}.` };
  const refs = references(input.config, name, year);
  const rows = stagedRows(input.staging, name, year);
  const api = await apiRows(input.state, year, name, target, reader, resultLevels(input.staging));
  const retention = await retainedEvidence(input, refs, name, year);
  const status = api.status === "rows_observed" ? "api_rows_observed" : rows > 0 ? "staged" : retention.status === "retained_file_not_staged" ? "retained_file_not_staged" : retention.status === "inventory_lead_unverified" ? "inventory_lead_unverified" : refs.length ? "configured_not_staged" : "missing_source";
  return { applicable: true, status, sourceReferences: refs, staging: { artifact: input.staging.state, path: input.staging.path, rows }, retention, api };
}

function applicable(year: number, family: CoverageFamily) { return family === "historical" ? year !== 2024 : year === 2024; }
function references(config: RecordValue, family: CoverageFamily, year: number) {
  if (family === "results") return year === 2024 ? ids(object(config.certifiedResults)) : [];
  if (family === "comparison") return ids(object(config.comparisonContest));
  if (family === "review") return ids(object(config.reviewCharts));
  if (family === "turnout") return ids(object(config.turnout));
  return historicalYears(config).includes(year) ? ids(object(config.historicalBaselines)) : [];
}
function ids(value: RecordValue | null) { return value ? [value.sourceId, value.registrationSourceId].filter((v): v is string => typeof v === "string").sort() : []; }
function stagedRows(staging: Staging, family: CoverageFamily, year: number) {
  const native = staging.native; if (!native) return 0;
  if (family === "results") return objects(native.resultRows).length;
  if (family === "comparison") return objects(native.reviewRows).filter((row) => [row.comparisonDemVotes, row.comparisonRepVotes, row.comparisonTotalVotes, row.comparisonContest].some((v) => v != null)).length;
  if (family === "review") return objects(native.reviewRows).length;
  if (family === "turnout") return objects(native.turnoutRows).length;
  return objects(native.historicalRows).filter((row) => Number(row.electionYear) === year).length;
}
async function retainedEvidence(input: StateInputs, references: string[], family: CoverageFamily, year: number) {
  const sources = objects(input.config.sources).filter((source) => references.includes(String(source.id)));
  const retainedFiles = (await Promise.all(sources.map(async (source) => {
    if (typeof source.localFile !== "string" || !source.localFile) return null;
    try { const file = await resolveReadableInsideRepoForSource(input, source.localFile); await stat(file); return source.localFile; } catch { return null; }
  }))).filter((value): value is string => Boolean(value));
  if (retainedFiles.length) return { status: "retained_file_not_staged", files: retainedFiles };
  const readiness = String(input.native?.nativeReadiness ?? "").toLowerCase();
  const lead = Boolean(input.discovery) || /candidate|blocked|partial|unparsed|lead/.test(readiness) || input.acquisition.some((row) => acquisitionMatches(row, family, year) && /candidate|blocked|partial|unparsed|lead/.test(JSON.stringify(row).toLowerCase()));
  return lead ? { status: "inventory_lead_unverified" } : { status: "none" };
}
function acquisitionMatches(row: RecordValue, family: CoverageFamily, year: number) {
  const years = Array.isArray(row.years) ? row.years.map(Number) : [Number(row.electionYear)];
  const name = String(row.dataFamily ?? "").toLowerCase();
  return years.includes(year) && (name.includes(family) || family === "results" && name.includes("result"));
}
async function resolveReadableInsideRepoForSource(input: StateInputs, localFile: string) {
  // Some legacy configs retain multiple local paths in one source field; only a single repository path is proof.
  if (localFile.includes(";") || localFile.includes("\n")) throw new Error("multiple_local_files_not_individually_verified");
  return resolveReadableInsideRepo(input.context, localFile);
}
function resultLevels(staging: Staging): ResultLevelScope {
  const allowed = new Set(["county", "state", "district", "precinct", "city", "city_town", "town", "federal_precincts", "non_geographic"]);
  const levels = [...new Set(objects(staging.native?.resultRows).map((row) => String(row.level ?? "")).filter((level) => allowed.has(level)))].sort();
  return levels.length ? { levels, completeness: "staged_supported_levels" } : { levels: ["county"], completeness: "county_fallback_incomplete" };
}
async function reviewApiRows(state: string, year: number, target: CoverageTarget, reader: CoverageGapDependencies["readPublicApi"], comparisonOnly: boolean) {
  if (target === "none") return { status: "not_checked", reason: "target_none" };
  if (!reader) return { status: "unknown", reason: "public_api_reader_unavailable" };
  try {
    const response = await reader({ state, year, family: "review", target });
    if (!response.complete) return { status: "unknown", reason: response.error ?? "incomplete_read", source: response.source };
    if (response.source !== "database") return { status: "unknown", reason: "non_database_source", source: response.source };
    const rows = response.rows.filter((row) => stateCode(row.state ?? row.stateCode) === state && Number(row.electionYear ?? row.year) === year && (!comparisonOnly || [row.comparisonDemVotes, row.comparisonRepVotes, row.comparisonTotalVotes, row.comparisonContest].some((value) => value != null)));
    return rows.length ? { status: "rows_observed", source: "database", rows: rows.length, capturedAt: response.capturedAt, derivedFrom: comparisonOnly ? "review_rows_with_same_row_comparison_fields" : undefined } : { status: "unknown", reason: comparisonOnly ? "complete_read_without_same_row_comparison_fields" : "complete_read_without_matching_state_year_rows", source: "database" };
  } catch (error) { return { status: "unknown", reason: "reader_error", detail: error instanceof Error ? error.message : String(error) }; }
}
async function apiRows(state: string, year: number, family: CoverageFamily, target: CoverageTarget, reader: CoverageGapDependencies["readPublicApi"], scope: ResultLevelScope) {
  if (family === "comparison") return reviewApiRows(state, year, target, reader, true);
  if (target === "none") return { status: "not_checked", reason: "target_none" };
  if (!reader) return { status: "unknown", reason: "public_api_reader_unavailable" };
  try {
    if (family === "review") return reviewApiRows(state, year, target, reader, false);
    const requests = family === "results" ? scope.levels.map((level) => ({ state, year, family, target, level })) : [{ state, year, family, target }];
    const responses = await Promise.all(requests.map((request) => reader(request as EvidenceRequest)));
    if (responses.some((response) => !response.complete)) return { status: "unknown", reason: responses.find((response) => !response.complete)?.error ?? "incomplete_read" };
    if (responses.some((response) => response.source !== "database")) return { status: "unknown", reason: "non_database_source" };
    const observed = responses.map((response) => response.rows.filter((row) => stateCode(row.state ?? row.stateCode) === state && Number(row.electionYear ?? row.year) === year));
    if (observed.some((rows) => rows.length === 0)) return { status: "unknown", reason: "complete_read_without_matching_state_year_rows", levelScope: family === "results" ? scope.levels : undefined, levelScopeCompleteness: family === "results" ? scope.completeness : undefined };
    return { status: "rows_observed", source: "database", rows: observed.reduce((sum, rows) => sum + rows.length, 0), levelScope: family === "results" ? scope.levels : undefined, levelScopeCompleteness: family === "results" ? scope.completeness : undefined, capturedAt: responses[0]?.capturedAt };
  } catch (error) { return { status: "unknown", reason: "reader_error", detail: error instanceof Error ? error.message : String(error) }; }
}
function priority(families: Record<CoverageFamily, RecordValue>) {
  const active = Object.entries(families).filter(([, value]) => value.applicable === true) as [CoverageFamily, RecordValue][];
  for (const [status, order, phrase] of [["missing_source", 1, "No source configuration exists"], ["inventory_lead_unverified", 2, "An inventory lead is not a verified retained local file"], ["retained_file_not_staged", 3, "A retained local file lacks staged rows"], ["configured_not_staged", 4, "Configured evidence lacks staged rows"], ["staged", 5, "Staged rows lack observed fixed database API rows"]] as const) {
    const names = active.filter(([, value]) => value.status === status).map(([name]) => name);
    if (names.length) return { order, reason: `${phrase} for: ${names.join(", ")}.` };
  }
  return { order: 6, reason: "Applicable families have API row evidence or are not API-readable." };
}
function caveats(input: StateInputs, year: number, families: Record<CoverageFamily, RecordValue>) {
  const output: string[] = [];
  const warning = object(input.config.historicalBaselines)?.warning;
  if (year !== 2024 && typeof warning === "string") output.push(warning);
  if (input.state === "DC") output.push("D.C. is a single Census county-equivalent; no sub-county FIPS geography is inferred.");
  if (families.comparison.status === "missing_source") output.push("No same-grain comparison-contest configuration was found.");
  if (families.turnout.status === "missing_source") output.push("No turnout or registration denominator configuration was found.");
  if (object(input.config.capabilities)?.reviewGraphs === false) output.push("The state configuration declares review-graph capability unavailable.");
  return output;
}
function grain(config: RecordValue, acquisition: RecordValue[], year: number) {
  const explicit = acquisition.map((row) => typeof row.reportingGrain === "string" ? row.reportingGrain : null).find(Boolean);
  const format = String((year === 2024 ? object(config.certifiedResults) : object(config.historicalBaselines))?.format ?? "");
  return explicit ?? (/county/i.test(format) ? "county_or_county_equivalent" : /precinct|ward|town|vtd/i.test(format) ? "local_reporting_unit" : "unspecified");
}
function summary(records: RecordValue[], gaps: RecordValue[]) { const byPriority: Record<string, number> = {}; for (const row of records) { const key = String(object(row.priority)?.order); byPriority[key] = (byPriority[key] ?? 0) + 1; } return { evaluated: records.length, gaps: gaps.length, byPriority }; }
function normalizedStates(values: string[] | undefined, supported: string[]) { if (!values) return [...supported].sort(); const states = values.map(stateCode); if (!states.length || states.length > MAX_STATES || states.some((s) => !s) || new Set(states).size !== states.length) throw new Error(`states must contain one to ${MAX_STATES} unique supported two-letter codes.`); const unsupported = states.filter((s) => !supported.includes(s)); if (unsupported.length) throw new Error(`Unsupported state code(s): ${unsupported.join(", ")}.`); return states.sort(); }
function normalizedYears(values: number[] | undefined) { const years = values ?? [2024]; if (!years.length || years.length > COVERAGE_GAP_YEARS.length || new Set(years).size !== years.length || years.some((year) => !COVERAGE_GAP_YEARS.includes(year as typeof COVERAGE_GAP_YEARS[number]))) throw new Error("years must be unique members of 2012, 2016, 2020, 2024."); return [...years].sort(); }
function normalizedTarget(value: CoverageTarget | undefined): CoverageTarget { const target = value ?? "none"; if (target !== "none" && target !== "local" && target !== "production") throw new Error("target must be none, local, or production."); return target; }
function historicalYears(config: RecordValue) { const years = object(object(config.historicalBaselines)?.expected)?.years; return Array.isArray(years) ? years.map(Number).filter(Number.isInteger) : []; }
function byStateYear(a: RecordValue, b: RecordValue) { return String(a.state).localeCompare(String(b.state)) || Number(a.year) - Number(b.year); }
function byPriority(a: RecordValue, b: RecordValue) { return Number(object(a.priority)?.order) - Number(object(b.priority)?.order) || byStateYear(a, b); }
function objects(value: unknown): RecordValue[] { return Array.isArray(value) ? value.filter((item): item is RecordValue => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []; }
function object(value: unknown): RecordValue | null { return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null; }
function stateCode(value: unknown) { const code = String(value ?? "").toUpperCase(); return /^[A-Z]{2}$/.test(code) ? code : ""; }
