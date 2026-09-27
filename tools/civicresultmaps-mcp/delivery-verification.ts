import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { calculateStagedIndicators, compareFamilyRows, sourceProjectionContext, type ProjectionFamily } from "./projection.ts";
import { McpToolError, resolveReadableInsideRepo, type RuntimeContext } from "./runtime.ts";
import { RESULT_LEVELS } from "./evidence.ts";

type RecordValue = Record<string, unknown>;
export type DeliveryFamily = "results" | "review" | "turnout" | "historical" | "sources" | "indicators" | "jurisdictions";
export type DeliveryRequest = { target: "local" | "production"; state: string; year?: number; family: DeliveryFamily; level?: string };
export type DeliveryApiResult = { rows: RecordValue[]; complete: boolean; source: string | null; endpoint: string; capturedAt: string; error?: string; meta?: RecordValue };
export type DeliveryVerificationInput = { state: string; year: 2012 | 2016 | 2020 | 2024; target: "local" | "production"; browser?: boolean; browserMode?: "smoke" | "values"; expectedStagingSha256?: string };
export type DeliveryVerificationDeps = { readApi: (request: DeliveryRequest) => Promise<DeliveryApiResult>; browser?: (input: DeliveryVerificationInput, expectedResults?: RecordValue[]) => Promise<RecordValue> };

/**
 * Compares the reviewed native staging representation with the public read API.
 * It intentionally does not claim that source cells were certified or that a browser
 * renderer displayed all data; those are separate evidence boundaries.
 */
export async function buildDeliveryVerification(context: RuntimeContext, input: DeliveryVerificationInput, deps: DeliveryVerificationDeps) {
  validate(input);
  const state = input.state.toUpperCase();
  const stagingPath = `.etl/staging/${state.toLowerCase()}-2024-staging.json`;
  let bytes: Buffer;
  try { bytes = await readFile(await resolveReadableInsideRepo(context, stagingPath)); }
  catch (error) { return unavailableReport(state, input, stagingPath, "staging_missing", errorMessage(error)); }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (input.expectedStagingSha256 && input.expectedStagingSha256 !== sha256) {
    return unavailableReport(state, input, stagingPath, "staging_digest_mismatch", "The reviewed staging artifact digest differs from expectedStagingSha256.", sha256);
  }
  let artifact: RecordValue;
  try { artifact = object(JSON.parse(bytes.toString("utf8")), "staging artifact"); }
  catch (error) { return unavailableReport(state, input, stagingPath, "invalid_staging", errorMessage(error), sha256); }
  if (!isReviewedArtifact(artifact, state)) {
    return unavailableReport(state, input, stagingPath, "invalid_staging_identity", "The artifact does not identify the requested state or has no native rows.", sha256);
  }
  let sourceContext: ReturnType<typeof sourceProjectionContext>;
  try { sourceContext = sourceProjectionContext(artifact, state); }
  catch (error) { return unavailableReport(state, input, stagingPath, "invalid_staging_sources", errorMessage(error), sha256); }

  const native = artifact.native as RecordValue;
  const capturedAt = new Date().toISOString();
  const api = async (request: Omit<DeliveryRequest, "target" | "state">) => {
    try { return await deps.readApi({ ...request, target: input.target, state }); }
    catch (error) { return { rows: [], complete: false, source: null, endpoint: "unavailable", capturedAt, error: errorMessage(error) }; }
  };
  const sourceResponsesPromise = Promise.all(sourceContext.sourceYears.map((year) => api({ family: "sources", year })));
  const [review, turnout, historical, indicators, jurisdictions, sourceResponses, ...resultResponses] = await Promise.all([
    api({ family: "review", year: input.year }), api({ family: "turnout", year: input.year }),
    api({ family: "historical", year: input.year }), api({ family: "indicators", year: input.year }),
    api({ family: "jurisdictions" }), sourceResponsesPromise,
    ...(input.year === 2024 ? RESULT_LEVELS.map((level) => api({ family: "results", year: input.year, level })) : []),
  ]);
  const staged = {
    results: input.year === 2024 ? rows(native.resultRows) : [],
    review: reviewRowsForYear(native, input.year),
    turnout: input.year === 2024 ? rows(native.turnoutRows) : [],
    historical: rows(native.historicalRows).filter((row) => number(row.electionYear) === input.year),
  };
  const unknownSources = Object.values(staged).flat().flatMap(sourceIds).filter((id) => !Object.hasOwn(sourceContext.sourceSlugs, id));
  if (unknownSources.length) return unavailableReport(state, input, stagingPath, "invalid_staging_sources", "A selected staged row references a source absent from the artifact source records.", sha256);
  const requiredSources = requiredSourceRows(rows(artifact.sources), staged, sourceContext.sourceSlugs);
  const sourceRows = sourceResponses.flatMap((response) => response.rows)
    .filter((row) => requiredSources.some((source) => sourceSlugsMatch(source, row, sourceContext.sourceSlugs)));
  const advisory = await indicatorCheck(context, artifact, state, input.year, indicators);
  const checks = [
    compareFamily("results", staged.results, resultResponses.flatMap((result) => result.rows), resultResponses, state, input.year, sourceContext.sourceSlugs),
    compareFamily("review", staged.review, review.rows, [review], state, input.year, sourceContext.sourceSlugs),
    compareFamily("turnout", staged.turnout, turnout.rows, [turnout], state, input.year, sourceContext.sourceSlugs),
    compareFamily("historical", staged.historical, historical.rows, [historical], state, input.year, sourceContext.sourceSlugs),
    advisory,
    compareFamily("sources", requiredSources, sourceRows, sourceResponses, state, input.year, sourceContext.sourceSlugs),
    mapJoinCheck(staged.results, resultResponses.flatMap((result) => result.rows), resultResponses, jurisdictions),
  ];
  const revisions = new Set([review, turnout, historical, ...resultResponses].map((response) => (response as DeliveryApiResult).meta?.dataRevision).filter((revision) => typeof revision === "string"));
  if (revisions.size > 1) checks.push(check("apiRevision", "inconclusive", 0, 0, { reason: "data_changed_between_api_families", revisions: [...revisions] }));
  if (input.browser) {
    const resultsCheck = checks.find((entry) => entry.name === (input.year === 2024 ? "results" : "historical"));
    const expectedResults = resultsCheck?.status === "pass" ? input.year === 2024 ? resultResponses.flatMap((response) => response.rows) : historical.rows : undefined;
    checks.push(await browserCheck(input, deps, expectedResults));
  }
  if (!Object.values(staged).some((family) => family.length > 0)) checks.push(check("requestedData", "inconclusive", 0, 0, { reason: "no_staged_data_for_requested_year" }));
  const finalSha256 = createHash("sha256").update(await readFile(await resolveReadableInsideRepo(context, stagingPath))).digest("hex");
  if (finalSha256 !== sha256) checks.push(check("artifact", "inconclusive", 0, 0, { reason: "staging_changed_during_verification", initialSha256: sha256, finalSha256 }));
  const statuses = checks.map((check) => check.status);
  const blockingInconclusive = checks.some((entry) => entry.status === "inconclusive" && !nonApplicable(entry));
  return {
    status: statuses.includes("fail") ? "fail" : blockingInconclusive ? "inconclusive" : "pass",
    state, year: input.year, target: input.target, capturedAt,
    verificationScope: "Selected-year staged data families only; inspect omittedChecks. Use release readiness for all replacement years.",
    omittedChecks: checks.filter(nonApplicable).map((entry) => entry.name),
    artifact: { path: stagingPath, sha256, identity: state, status: "reviewed_staging_not_publication" },
    checks,
    caveats: [
      "API equivalence is limited to complete public read responses; seed fallback, capped responses, and unavailable targets are inconclusive.",
      "Source-link comparison confirms exposed source identifiers/URLs only; it does not certify source-to-cell lineage.",
      "Map evidence checks canonical county tags returned by the public API; it does not prove renderer coverage.",
      "This year-scoped report does not claim to verify every historical or current replacement year in the staging artifact.",
    ],
  };
}

function compareFamily(name: ProjectionFamily, staged: RecordValue[], delivered: RecordValue[], responses: DeliveryApiResult[], state: string, year: number, sourceSlugs: Record<string, string>, allowEmpty = false) {
  const blocked = responseProblem(responses);
  if (blocked) return check(name, "inconclusive", staged.length, delivered.length, { reason: blocked, endpoints: responses.map(endpointEvidence) });
  if (!staged.length && !allowEmpty) return check(name, "inconclusive", 0, delivered.length, { reason: `${name}_not_staged_for_requested_year`, endpoints: responses.map(endpointEvidence) });
  const comparison = compareFamilyRows(name, staged, delivered, { state, year, sourceSlugs });
  const changed = comparison.counts.added + comparison.counts.removed + comparison.counts.changed;
  return check(name, comparison.status === "fail" || changed ? "fail" : "pass", staged.length, delivered.length, { ...comparison, endpoints: responses.map(endpointEvidence) });
}

async function indicatorCheck(context: RuntimeContext, artifact: RecordValue, state: string, year: number, api: DeliveryApiResult) {
  const native = artifact.native as RecordValue;
  const review = reviewRowsForYear(native, year);
  const currentReviewReplacement = year === 2024 && rows(native.resultRows).length > 0 && isRecord(native.metrics) && Object.hasOwn(native.metrics, "nativeReviewRows");
  if (!review.length && !currentReviewReplacement) return check("advisoryIndicators", "inconclusive", 0, api.rows.length, { reason: "advisoryIndicators_not_staged_for_requested_year", endpoint: endpointEvidence(api) });
  const blocked = responseProblem([api]);
  if (blocked) return check("advisoryIndicators", "inconclusive", 0, api.rows.length, { reason: blocked, endpoint: endpointEvidence(api) });
  if (year === 2012) return check("advisoryIndicators", "inconclusive", 0, api.rows.length, { reason: "indicator_calculation_unsupported_for_2012", endpoint: endpointEvidence(api) });
  try { return { ...compareFamily("indicators", await calculateStagedIndicators(context, artifact, state, year), api.rows, [api], state, year, sourceProjectionContext(artifact, state).sourceSlugs, true), name: "advisoryIndicators" }; }
  catch (error) { return check("advisoryIndicators", "inconclusive", 0, api.rows.length, { reason: `indicator_calculation_unavailable:${errorMessage(error)}`, endpoint: endpointEvidence(api) }); }
}

function mapJoinCheck(staged: RecordValue[], results: RecordValue[], resultResponses: DeliveryApiResult[], jurisdictions: DeliveryApiResult) {
  const blocked = responseProblem([...resultResponses, jurisdictions]);
  const county = results.filter((row) => text(row.level) === "county");
  if (!staged.length) return check("countyMapJoin", "inconclusive", 0, county.length, { reason: "no_staged_2024_results_for_requested_year" });
  if (blocked) return check("countyMapJoin", "inconclusive", staged.length, county.length, { reason: blocked, endpoint: endpointEvidence(jurisdictions) });
  if (!county.length) return check("countyMapJoin", "inconclusive", staged.length, 0, { reason: "no_api_county_rows_for_requested_year", endpoint: endpointEvidence(jurisdictions) });
  const tags = new Set(jurisdictions.rows.map((row) => text(row.jurisdictionTag)).filter(Boolean));
  const missingTags = county.filter((row) => !text(row.jurisdictionTag) || !tags.has(text(row.jurisdictionTag)!));
  return check("countyMapJoin", missingTags.length ? "fail" : "pass", staged.length, county.length, { missing: missingTags.slice(0, 10).map((row) => ({ jurisdictionName: text(row.jurisdictionName), jurisdictionTag: text(row.jurisdictionTag) })), endpoint: endpointEvidence(jurisdictions) });
}

async function browserCheck(input: DeliveryVerificationInput, deps: DeliveryVerificationDeps, expectedResults?: RecordValue[]) {
  if (!deps.browser) return check("browser", "inconclusive", 0, 0, { reason: "browser_adapter_unavailable" });
  try {
    const evidence = await deps.browser(input, expectedResults);
    const status = evidence.status === "pass" ? "pass" : evidence.status === "fail" ? "fail" : "inconclusive";
    return check("browser", status, 0, 0, evidence);
  } catch (error) { return check("browser", "inconclusive", 0, 0, { reason: errorMessage(error) }); }
}

function reviewRowsForYear(native: RecordValue, year: number) { return year === 2024 ? rows(native.reviewRows) : rows(native.historicalReviewRows).filter((row) => number(row.electionYear) === year); }
function responseProblem(responses: DeliveryApiResult[]) { const unavailable = responses.find((response) => response.error); if (unavailable) return `api_unavailable:${unavailable.error}`; const incomplete = responses.find((response) => !response.complete); if (incomplete) return `api_incomplete:${incomplete.endpoint}`; const seeded = responses.find((response) => /seed/i.test(response.source ?? "")); return seeded ? `seeded_api_response:${seeded.endpoint}` : null; }
function endpointEvidence(response: DeliveryApiResult) { return { endpoint: response.endpoint, source: response.source, capturedAt: response.capturedAt, complete: response.complete, error: response.error ?? null }; }
function check(name: string, status: "pass" | "fail" | "inconclusive", stagedCount: number, apiCount: number, evidence: RecordValue) { return { name, status, stagedCount, apiCount, evidence }; }
function rows(value: unknown): RecordValue[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function isRecord(value: unknown): value is RecordValue { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function object(value: unknown, label: string) { if (!isRecord(value)) throw new Error(`${label} is not an object`); return value; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function boolean(value: unknown) { return typeof value === "boolean" ? value : null; }
function unique(values: string[]) { return [...new Set(values)].sort(); }
function sourceId(row: RecordValue) { return text(row.sourceId) ?? text(row.sourceDocumentId); }
function sourceIds(row: RecordValue) { return [sourceId(row), text(row.comparisonSourceId)].filter((value): value is string => Boolean(value)); }
function requiredSourceRows(sources: RecordValue[], staged: Record<string, RecordValue[]>, sourceSlugs: Record<string, string>) {
  const required = new Set(Object.values(staged).flat().flatMap(sourceIds));
  return sources.filter((source) => { const id = text(source.id); return Boolean(id && required.has(id) && sourceSlugs[id]); });
}
function sourceSlugsMatch(source: RecordValue, api: RecordValue, sourceSlugs: Record<string, string>) { const id = text(source.id); return Boolean(id && text(api.id) === sourceSlugs[id]); }
function nonApplicable(entry: { status: string; evidence: RecordValue }) {
  const reason = text(entry.evidence.reason) ?? "";
  return reason.endsWith("_not_staged_for_requested_year") || reason === "indicator_calculation_unsupported_for_2012" || reason === "no_staged_2024_results_for_requested_year";
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function validate(input: DeliveryVerificationInput) { if (!/^[A-Za-z]{2}$/.test(input.state) || ![2012, 2016, 2020, 2024].includes(input.year) || !["local", "production"].includes(input.target)) throw new McpToolError("invalid_delivery_input", "state, year, or target is invalid.", "Use a two-letter state, supported election year, and local or production target."); if (input.expectedStagingSha256 && !/^[a-f0-9]{64}$/.test(input.expectedStagingSha256)) throw new McpToolError("invalid_delivery_input", "expectedStagingSha256 must be a lowercase SHA-256 digest.", "Use the current staging artifact digest."); }
function unavailableReport(state: string, input: DeliveryVerificationInput, path: string, reason: string, message: string, sha256: string | null = null) { return { status: "inconclusive", state, year: input.year, target: input.target, capturedAt: new Date().toISOString(), artifact: { path, sha256, status: reason }, checks: [check("artifact", "inconclusive", 0, 0, { reason, message })], caveats: ["No public delivery claim was evaluated because the staging artifact is unavailable or untrusted."] }; }
function isReviewedArtifact(artifact: RecordValue, state: string) {
  const artifactState = isRecord(artifact.state) ? artifact.state : null;
  const election = isRecord(artifact.election) ? artifact.election : null;
  const validation = isRecord(artifact.validation) ? artifact.validation : null;
  const sources = rows(artifact.sources);
  return String(artifactState?.code ?? "").toUpperCase() === state
    && number(election?.year) === 2024
    && isRecord(artifact.native)
    && validNativeRows(artifact.native as RecordValue)
    && validation?.passed === true
    && sources.length > 0
    && sources.every((source) => ["id", "authority", "sourceUrl", "localArtifact", "parser", "status"].every((key) => typeof source[key] === "string" && source[key]!.length > 0));
}
function validNativeRows(native: RecordValue) {
  const required = ["resultRows", "reviewRows", "turnoutRows"];
  return required.every((key) => Array.isArray(native[key]) && native[key].every(isRecord))
    && (native.historicalRows === undefined || (Array.isArray(native.historicalRows) && native.historicalRows.every(isRecord)))
    && (native.historicalReviewRows === undefined || (Array.isArray(native.historicalReviewRows) && native.historicalReviewRows.every(isRecord)));
}
