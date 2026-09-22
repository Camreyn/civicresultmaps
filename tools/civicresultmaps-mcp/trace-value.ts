import { createHash } from "node:crypto";
import { realpath, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { McpToolError, relativeToRepo, resolveInsideRepo, resolveReadableInsideRepo, type RuntimeContext } from "./runtime.ts";
import { observedParserImplementation, readSourceRevision } from "./source-revisions.ts";

type RecordValue = Record<string, unknown>;
export type TraceValueInput = {
  state: string;
  year: 2012 | 2016 | 2020 | 2024;
  family: "results" | "review" | "turnout" | "historical";
  /** A top-level scalar field; results may use `votes` with `candidate`. */
  field: string;
  candidate?: string;
  jurisdictionTag?: string;
  jurisdictionName?: string;
  sourceId?: string;
  expectedArtifactDigest?: string;
  /** Optional immutable retained-byte revision, not a source URL or path. */
  sourceRevisionSha256?: string;
};

const SAFE_TEXT = /^[^\u0000\r\n]{1,240}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;

/**
 * Read-only staged-value lineage. This deliberately reports only evidence recorded
 * in the staging artifact and state config; it does not assert publication or certification.
 */
export async function buildTraceValue(context: RuntimeContext, input: TraceValueInput) {
  validateInput(input);
  const state = input.state.toUpperCase();
  const stagingPath = `.etl/staging/${state.toLowerCase()}-2024-staging.json`;
  const stagingFile = await resolveReadableInsideRepo(context, stagingPath);
  const [stagingBytes, config] = await Promise.all([
    readFile(stagingFile),
    readJson(context, `etl/state-configs/${state.toLowerCase()}.json`),
  ]);
  const stagingDigest = digest(stagingBytes);
  if (input.expectedArtifactDigest && input.expectedArtifactDigest !== stagingDigest) {
    throw new McpToolError("staging_digest_mismatch", "The current staging artifact does not match expectedArtifactDigest.", "Refresh the trace against the current reviewed staging artifact.", { actual: stagingDigest, expected: input.expectedArtifactDigest });
  }
  const artifact = parseJson(stagingBytes, stagingPath);
  if (!isRecord(artifact.state) || String(artifact.state.code).toUpperCase() !== state || Number(isRecord(artifact.election) ? artifact.election.year : NaN) !== 2024 || !isRecord(artifact.native)) {
    throw new McpToolError("invalid_staging_identity", `${stagingPath} is not a ${state} native staging artifact.`, "Regenerate the reviewed staging artifact.");
  }
  if (String(config.code ?? "").toUpperCase() !== state) throw new McpToolError("invalid_config_identity", `The state config does not declare code ${state}.`, "Repair the state config identity before tracing staged values.");
  const rows = rowsFor(artifact.native, input.family, input.year, state);
  const matches = rows.filter((row) => rowMatches(row, input));
  if (!matches.length) {
    throw new McpToolError("value_not_found", "No staged row matched the bounded selectors.", "Check family, year, field, and exact selectors.", { family: input.family, year: input.year });
  }
  const resolved = matches.map((row) => resolveField(row, input));
  const invalid = resolved.find((entry) => entry.error);
  if (invalid) throw new McpToolError("unsupported_field", invalid.error!, "Use a scalar field recorded on the selected row, or results field `votes` with an exact candidate.", { availableFields: Object.keys(invalid.row).filter((key) => scalar(invalid.row[key])).sort() });
  if (resolved.length !== 1) {
    return {
      status: "ambiguous",
      message: "More than one staged row matched; refine with an exact jurisdictionTag, jurisdictionName, or sourceId.",
      candidates: resolved.slice(0, 25).map(({ row, value }) => candidateSummary(row, value)),
      candidateCount: resolved.length,
      stagedEvidence: stagedEvidence(stagingPath, stagingDigest),
      publicDisplay: { checked: false, status: "not_checked" },
    };
  }
  const { row, value } = resolved[0];
  const sourceId = sourceIdFor(row);
  const source = arrayRecords(config.sources).find((entry) => entry.id === sourceId) ?? null;
  const lineage = source ? await sourceEvidence(context, source) : { status: "missing_source", sourceId, caveats: ["The selected staged row has no matching source entry in the state config."] };
  const lineageRecord = lineage as RecordValue;
  const sourceRevision = source && sourceId ? await sourceRevisionEvidence(context, state, sourceId, input.sourceRevisionSha256 ?? (typeof lineageRecord.actualSha256 === "string" ? lineageRecord.actualSha256 : null), config, stagingDigest, row) : { status: "unavailable", reason: "No selected staged source can be matched to a recorded immutable revision." };
  return {
    status: source ? "resolved" : "missing_source",
    value,
    field: input.field,
    ...(input.candidate ? { candidate: input.candidate } : {}),
    row: candidateSummary(row, value),
    sourceId,
    parserAndNormalization: parserPath(config, sourceId, source),
    lineage,
    sourceRevision,
    selectedRowLineage: rowLineage(row),
    stagedEvidence: stagedEvidence(stagingPath, stagingDigest),
    publicDisplay: { checked: false, status: "not_checked", caveat: "This trace reads staging and config only; it does not confirm public API or website display." },
  };
}

function validateInput(input: TraceValueInput) {
  if (!/^[A-Za-z]{2}$/.test(input.state) || ![2012, 2016, 2020, 2024].includes(input.year) || !["results", "review", "turnout", "historical"].includes(input.family)) throw new McpToolError("invalid_trace_input", "state, year, or family is invalid.", "Use a two-letter state, a supported year, and a supported family.");
  for (const [key, value] of Object.entries(input)) if (typeof value === "string" && !SAFE_TEXT.test(value)) throw new McpToolError("invalid_trace_input", `${key} contains unsafe text.`, "Use a short exact selector without control characters.");
  if (!input.field || (input.candidate && !(input.family === "results" && input.field === "votes"))) throw new McpToolError("invalid_trace_input", "candidate is only supported with results field `votes`.", "Use a scalar field, or field `votes` plus an exact candidate.");
  if (input.expectedArtifactDigest && !DIGEST.test(input.expectedArtifactDigest)) throw new McpToolError("invalid_trace_input", "expectedArtifactDigest must be a lowercase SHA-256 digest.", "Supply the 64-character digest reported for the staging artifact.");
  if (input.sourceRevisionSha256 && !DIGEST.test(input.sourceRevisionSha256)) throw new McpToolError("invalid_trace_input", "sourceRevisionSha256 must be a lowercase SHA-256 digest.", "Supply the immutable retained-byte revision digest.");
}

async function sourceRevisionEvidence(context: RuntimeContext, state: string, sourceId: string, revisionSha256: string | null, config: RecordValue, stagingSha256: string, row: RecordValue) {
  if (!revisionSha256) return { status: "absent", reason: "No current retained-byte digest is available to locate a source revision." };
  try {
    const revision = await readSourceRevision(context, { state, sourceId, revisionSha256 });
    const currentSource = arrayRecords(config.sources).find((entry) => entry.id === sourceId) ?? null;
    const currentParser = { sourceParser: currentSource ? stringOrNull(currentSource.parser) : null, configSections: Object.entries(config).filter(([, value]) => isRecord(value) && value.sourceId === sourceId).map(([key]) => key).sort(), status: "declared_fields_only", observedImplementation: await observedParserImplementation(context) };
    const currentConfigSha256 = digest(Buffer.from(JSON.stringify(config)));
    const stale = {
      config: (revision.stateConfig as RecordValue | undefined)?.sha256 !== currentConfigSha256,
      parser: JSON.stringify(revision.parserIdentity) !== JSON.stringify(currentParser),
      staging: (revision.staging as RecordValue | undefined)?.sha256 !== stagingSha256,
    };
    return {
      status: stale.config || stale.parser || stale.staging ? "recorded_stale" : "recorded_current",
      revisionSha256,
      recordedArtifactIntegrity: "verified",
      declaredSourceDigest: { value: revision.declaredDigest ?? null, status: revision.declaredDigestStatus ?? "unknown", caveat: "A recorded revision proves retained bytes only; it does not make an absent or mismatched configured digest reviewed." },
      recordedLineage: revision.lineage ?? { status: "missing" },
      selectedRowLineage: rowLineage(row),
      stale,
    };
  } catch (error) {
    if (error instanceof McpToolError && ["immutable_artifact_mismatch", "immutable_manifest_mismatch", "unsafe_path"].includes(error.code)) return { status: "integrity_mismatch", revisionSha256, reason: error.message };
    if (error instanceof McpToolError || (error as NodeJS.ErrnoException).code === "ENOENT") return { status: "absent", revisionSha256, reason: error instanceof Error ? error.message : "Recorded source revision is absent." };
    return { status: "unavailable", revisionSha256, reason: "Recorded source revision could not be read." };
  }
}
function rowLineage(row: RecordValue) { const values = { page: stringOrNull(row.page), sheet: stringOrNull(row.sheet) ?? stringOrNull(row.sheetName), cell: stringOrNull(row.cell), row: stringOrNull(row.row) }; return { ...values, status: values.page || values.sheet || values.cell || values.row ? "declared" : "missing", caveat: values.page || values.sheet || values.cell || values.row ? "These are explicit selected-row fields." : "No page, sheet, cell, or row was recorded on the selected staged row; source-level revision lineage is not attributed to this row." }; }

function rowsFor(native: RecordValue, family: TraceValueInput["family"], year: number, state: string) {
  const keys = family === "results" ? ["resultRows"] : family === "review" ? ["reviewRows", "historicalReviewRows"] : family === "turnout" ? ["turnoutRows"] : ["historicalRows"];
  return keys.flatMap((key) => arrayRecords(native[key]).map((row) => ({ key, row })))
    .filter(({ key, row }) => key === "historicalRows" || key === "historicalReviewRows" ? Number(row.electionYear) === year : year === 2024)
    .map(({ row }) => { validateRowIdentity(row, state, year); return row; });
}

function validateRowIdentity(row: RecordValue, state: string, year: number) {
  const rowState = stringOrNull(row.stateCode) ?? stringOrNull(row.state);
  if (rowState && rowState.toUpperCase() !== state) throw new McpToolError("invalid_row_identity", "A selected staged row declares a different state.", "Regenerate the staging artifact with state-consistent rows.");
  if (row.electionYear !== undefined && Number(row.electionYear) !== year) throw new McpToolError("invalid_row_identity", "A selected staged row declares a different election year.", "Refine the requested year or regenerate the staging artifact.");
}

function rowMatches(row: RecordValue, input: TraceValueInput) {
  return (!input.jurisdictionTag || row.jurisdictionTag === input.jurisdictionTag)
    && (!input.jurisdictionName || row.jurisdictionName === input.jurisdictionName || row.county === input.jurisdictionName || row.localUnit === input.jurisdictionName)
    && (!input.sourceId || sourceIdFor(row) === input.sourceId);
}

function resolveField(row: RecordValue, input: TraceValueInput) {
  const value = input.candidate ? (isRecord(row.votes) ? row.votes[input.candidate] : undefined) : row[input.field];
  return { row, value, error: scalar(value) ? undefined : `Field ${input.field} is not a recorded scalar value for this row.` };
}

async function sourceEvidence(context: RuntimeContext, source: RecordValue) {
  const localFile = typeof source.localFile === "string" ? source.localFile : null;
  const base = { authority: stringOrNull(source.authority), officialUrl: safeUrl(source.url), page: stringOrNull(source.page), cell: stringOrNull(source.cell), caveats: strings(source.confidence, source.timestampBasis) };
  if (!localFile || localFile.includes(";")) return { status: "retained_artifact_not_single_path", ...base, localArtifactPath: localFile, caveats: [...base.caveats, "No single retained local artifact path is recorded for this source."] };
  try {
    const filePath = await safeRetainedFile(context, localFile);
    const bytes = await readFile(filePath);
    const actualSha256 = digest(bytes);
    const declaredSha256 = stringOrNull(source.sha256);
    const evidence = { ...base, localArtifactPath: relativeToRepo(context, filePath), actualSha256, declaredSha256, sizeBytes: bytes.length };
    if (!declaredSha256) return { status: "retained_artifact_present_digest_unverified", ...evidence, caveats: [...base.caveats, "No structured declared SHA-256 is recorded for this source; the observed digest is not a reviewed match."] };
    if (!DIGEST.test(declaredSha256)) return { status: "retained_artifact_declared_digest_invalid", ...evidence, caveats: [...base.caveats, "The source record's declared SHA-256 is malformed; the observed digest is not verified."] };
    if (declaredSha256 !== actualSha256) return { status: "retained_artifact_digest_mismatch", ...evidence, caveats: [...base.caveats, "The retained artifact does not match the structured declared SHA-256."] };
    return { status: "verified_retained_artifact", ...evidence };
  } catch (error) {
    return { status: "retained_artifact_unavailable", ...base, localArtifactPath: localFile, caveats: [...base.caveats, error instanceof Error ? error.message : "Retained artifact could not be verified."] };
  }
}

async function safeRetainedFile(context: RuntimeContext, relative: string) {
  const unresolved = resolveInsideRepo(context, relative);
  const [root, target] = await Promise.all([realpath(context.repoRoot), realpath(unresolved)]);
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new McpToolError("unsafe_retained_artifact", "The retained artifact resolves outside the repository.", "Repair the source record with a repository-contained artifact path.");
  const info = await stat(target);
  if (!info.isFile()) throw new McpToolError("unsafe_retained_artifact", "The retained artifact is not a regular file.", "Repair the source record with a retained file.");
  return target;
}

function parserPath(config: RecordValue, sourceId: string | null, source: RecordValue | null) {
  const sections = Object.entries(config).filter(([, value]) => isRecord(value) && value.sourceId === sourceId).map(([key]) => key);
  return { sourceParser: source ? stringOrNull(source.parser) : null, configSections: sections, configPath: `etl/state-configs/${String(config.code ?? "").toLowerCase()}.json` };
}
function stagedEvidence(pathname: string, sha256: string) { return { artifactPath: pathname, sha256, status: "staged_not_publicly_verified" }; }
function candidateSummary(row: RecordValue, value: unknown) { return { jurisdictionTag: stringOrNull(row.jurisdictionTag), jurisdictionName: stringOrNull(row.jurisdictionName) ?? stringOrNull(row.county) ?? stringOrNull(row.localUnit), sourceId: sourceIdFor(row), value }; }
function sourceIdFor(row: RecordValue) { return stringOrNull(row.sourceId) ?? stringOrNull(row.sourceDocumentId); }
function safeUrl(value: unknown) { try { const parsed = new URL(typeof value === "string" ? value : ""); return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : null; } catch { return null; } }
function digest(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
async function readJson(context: RuntimeContext, relative: string) { return parseJson(await readFile(await resolveReadableInsideRepo(context, relative)), relative); }
function parseJson(bytes: Uint8Array, label: string): RecordValue { try { const value = JSON.parse(Buffer.from(bytes).toString("utf8")); if (!isRecord(value)) throw new Error("not object"); return value; } catch { throw new McpToolError("invalid_json", `${label} is not a JSON object.`, "Regenerate or repair the recorded artifact."); } }
function arrayRecords(value: unknown): RecordValue[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function isRecord(value: unknown): value is RecordValue { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function scalar(value: unknown) { return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null; }
function stringOrNull(value: unknown) { return typeof value === "string" ? value : null; }
function strings(...values: unknown[]) { return values.filter((value): value is string => typeof value === "string" && value.length > 0); }
