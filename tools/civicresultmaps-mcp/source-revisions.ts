import { createHash } from "node:crypto";
import { lstat, open, readFile, readdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDirectoryInsideRepo, McpToolError, relativeToRepo, resolveInsideRepo, resolveReadableInsideRepo, type RuntimeContext } from "./runtime.ts";

type RecordValue = Record<string, unknown>;
export type SourceRevisionInput = { state: string; sourceId: string; confirmation?: "RECORD_SOURCE_REVISION" };
export type ReadSourceRevisionInput = { state: string; sourceId: string; revisionSha256: string };

const DIGEST = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const MAX_STAGING_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 100_000;
const MAX_PARSER_FILES = 5_000;
const MAX_PARSER_BYTES = 25 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 20 * 1024 * 1024;

/** Builds a bounded, read-only revision proposal from config-selected retained bytes. */
export async function buildSourceRevision(context: RuntimeContext, input: SourceRevisionInput) {
  const selected = await selectSource(context, input);
  const sourceSnapshot = await stableFileBytes(selected.retainedPath, MAX_SOURCE_BYTES, "retained source");
  const stagingSnapshot = await stableFileBytes(selected.stagingPath, MAX_STAGING_BYTES, "staging artifact");
  const staging = parseObject(stagingSnapshot.bytes, selected.stagingRelative);
  validateStaging(staging, selected.state);
  const manifest = await buildManifest(context, selected, sourceSnapshot, stagingSnapshot, staging);
  const existing = await readExistingManifest(context, selected.state, selected.sourceId, manifest.contentSha256);
  if (existing) return { status: "already_recorded", confirmationRequired: "RECORD_SOURCE_REVISION", revision: existing.manifest, existingManifestPath: existing.path, existingManifestSha256: existing.sha256, currentBindingStatus: bindingStatus(existing.manifest, manifest) };
  return {
    status: "ready_to_record",
    confirmationRequired: "RECORD_SOURCE_REVISION",
    revision: manifest,
  };
}

/** Stores immutable content-addressed bytes and a manifest. Repeated identical bytes are idempotent. */
export async function recordSourceRevision(context: RuntimeContext, input: SourceRevisionInput) {
  validateInput(input, true);
  const proposal = await buildSourceRevision(context, input);
  if (proposal.status === "already_recorded") return { ...proposal, status: "already_recorded", wrote: false };
  const revision = proposal.revision as RevisionManifest;
  const directoryRelative = revisionDirectory(revision.state, revision.sourceId, revision.contentSha256);
  const directory = await ensureDirectoryInsideRepo(context, directoryRelative);
  const sourcePath = path.join(directory, "source.bin");
  const manifestPath = path.join(directory, "manifest.json");

  // Re-read after directory creation; if source changed, never label an old proposal as current.
  await (context as RuntimeContext & { beforeSourceRevisionPersistence?: () => Promise<void> | void }).beforeSourceRevisionPersistence?.();
  const selected = await selectSource(context, input);
  const current = await stableFileBytes(selected.retainedPath, MAX_SOURCE_BYTES, "retained source");
  const currentStaging = await stableFileBytes(selected.stagingPath, MAX_STAGING_BYTES, "staging artifact");
  const currentArtifact = parseObject(currentStaging.bytes, selected.stagingRelative); validateStaging(currentArtifact, selected.state);
  const currentRevision = await buildManifest(context, selected, current, currentStaging, currentArtifact);
  if (digest(current.bytes) !== revision.contentSha256 || currentRevision.stateConfig.sha256 !== revision.stateConfig.sha256 || currentRevision.staging.sha256 !== revision.staging.sha256 || JSON.stringify(currentRevision.parserIdentity) !== JSON.stringify(revision.parserIdentity)) throw new McpToolError("source_mutated_during_record", "Source, config/parser identity, or staging changed while the revision was being recorded.", "Retry after all selected lineage inputs are stable; no revision was written.");
  await writeImmutable(sourcePath, current.bytes, revision.contentSha256);
  const persisted = await readFile(sourcePath);
  if (digest(persisted) !== revision.contentSha256) throw new McpToolError("immutable_artifact_mismatch", "The immutable source artifact does not match the revision digest.", "Inspect the revision directory before retrying.");
  const previous = await latestPreviousManifest(context, revision.state, revision.sourceId, revision.contentSha256);
  const complete: RevisionManifest = { ...revision, previousRevision: previous?.contentSha256 ?? null, diffFromPrevious: previous ? diffSummaries(previous.stagingSummary, revision.stagingSummary) : null };
  const manifestBytes = Buffer.from(`${JSON.stringify(complete, null, 2)}\n`);
  if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new McpToolError("source_manifest_size_limit", "Source revision metadata exceeds the 20 MiB bound.", "Use a bounded staging artifact.");
  const manifestSha256 = digest(manifestBytes);
  await writeImmutable(manifestPath, manifestBytes, manifestSha256);
  return { status: "recorded", wrote: true, revision: complete, manifestSha256, manifestPath: relativeToRepo(context, manifestPath), artifactPath: relativeToRepo(context, sourcePath) };
}

/** Reads one immutable manifest by its content-addressed revision identifier. */
export async function readSourceRevision(context: RuntimeContext, input: ReadSourceRevisionInput) {
  validateReadInput(input);
  const relative = `${revisionDirectory(input.state.toUpperCase(), input.sourceId, input.revisionSha256)}/manifest.json`;
  const file = await regularReadable(context, relative, "immutable revision manifest");
  if ((await stat(file)).size > MAX_MANIFEST_BYTES) throw new McpToolError("immutable_manifest_mismatch", "The immutable revision manifest exceeds the permitted size.", "Do not use oversized revision metadata as lineage evidence.");
  const value = parseObject(await readFile(file), relative);
  if (value.contentSha256 !== input.revisionSha256 || value.state !== input.state.toUpperCase() || value.sourceId !== input.sourceId) throw new McpToolError("immutable_manifest_mismatch", "The requested revision manifest identity does not match its content-addressed location.", "Do not use a mismatched revision as lineage evidence.");
  const sourceRelative = `${revisionDirectory(input.state.toUpperCase(), input.sourceId, input.revisionSha256)}/source.bin`;
  const sourceFile = await regularReadable(context, sourceRelative, "immutable revision source"); if ((await stat(sourceFile)).size > MAX_SOURCE_BYTES) throw new McpToolError("immutable_artifact_mismatch", "The immutable source artifact exceeds the permitted size.", "Do not use oversized revision bytes as lineage evidence."); const bytes = await readFile(sourceFile);
  if (digest(bytes) !== input.revisionSha256 || value.sizeBytes !== bytes.length) throw new McpToolError("immutable_artifact_mismatch", "The revision manifest does not match its immutable source bytes.", "Do not use this revision as lineage evidence.");
  return value;
}

type Selected = { state: string; sourceId: string; config: RecordValue; source: RecordValue; retainedPath: string; retainedRelative: string; stagingPath: string; stagingRelative: string };
type StagingSummary = { numericFields: Record<string, number>; rowCount: number; sourceIds: string[]; rowFingerprints: Record<string, string[]>; status: "observed" | "unknown" };
type RevisionManifest = { version: 1; state: string; sourceId: string; contentSha256: string; sizeBytes: number; retainedArtifactPath: string; observed: RecordValue; declaredDigest: string | null; declaredDigestStatus: "verified" | "missing" | "invalid" | "mismatch"; parserIdentity: RecordValue; stateConfig: { path: string; sha256: string }; staging: { path: string; sha256: string }; stagingSummary: StagingSummary; lineage: { page: string | null; sheet: string | null; cell: string | null; row: string | null; status: "declared" | "missing" }; recordedAt: string; previousRevision?: string | null; diffFromPrevious?: unknown };

async function selectSource(context: RuntimeContext, input: SourceRevisionInput): Promise<Selected> {
  validateInput(input, false); const state = input.state.toUpperCase();
  const configRelative = `etl/state-configs/${state.toLowerCase()}.json`; const configPath = await resolveReadableInsideRepo(context, configRelative);
  const config = parseObject(await readFile(configPath), configRelative);
  if (String(config.code ?? "").toUpperCase() !== state) throw new McpToolError("invalid_config_identity", "State config identity does not match the requested state.", "Repair the state config before recording lineage.");
  const source = records(config.sources).find((item) => item.id === input.sourceId);
  if (!source) throw new McpToolError("source_not_found", "sourceId is not declared by this state config.", "Choose an exact source ID from the selected state config.");
  const localFile = typeof source.localFile === "string" ? source.localFile : "";
  if (!localFile || localFile.includes(";")) throw new McpToolError("retained_source_not_single_path", "The selected source does not declare one retained localFile path.", "Record a single config-selected retained artifact before creating a revision.");
  const retainedPath = await regularReadable(context, localFile, "retained source");
  const stagingRelative = `.etl/staging/${state.toLowerCase()}-2024-staging.json`;
  return { state, sourceId: input.sourceId, config, source, retainedPath, retainedRelative: relativeToRepo(context, retainedPath), stagingPath: await regularReadable(context, stagingRelative, "staging artifact"), stagingRelative };
}

async function buildManifest(context: RuntimeContext, selected: Selected, source: { bytes: Buffer }, staging: { bytes: Buffer }, artifact: RecordValue): Promise<RevisionManifest> {
  const declaredDigest = stringOrNull(selected.source.sha256); const actual = digest(source.bytes);
  const declaredDigestStatus = !declaredDigest ? "missing" : !DIGEST.test(declaredDigest) ? "invalid" : declaredDigest === actual ? "verified" : "mismatch";
  const lineage = structuredLineage(selected.source);
  return { version: 1, state: selected.state, sourceId: selected.sourceId, contentSha256: actual, sizeBytes: source.bytes.length, retainedArtifactPath: selected.retainedRelative,
    observed: { authority: stringOrNull(selected.source.authority), url: safeHttpsUrl(selected.source.url), electionYear: numberOrNull(selected.source.electionYear) ?? numberOrNull(selected.config.electionYear), reportingGrain: stringOrNull(selected.source.reportingGrain) ?? stringOrNull(selected.source.grain), retrieval: structuredRetrieval(selected.source) },
    declaredDigest, declaredDigestStatus, parserIdentity: { ...parserIdentity(selected.config, selected.sourceId, selected.source), observedImplementation: await observedParserImplementation(context) }, stateConfig: { path: `etl/state-configs/${selected.state.toLowerCase()}.json`, sha256: digest(Buffer.from(JSON.stringify(selected.config))) }, staging: { path: selected.stagingRelative, sha256: digest(staging.bytes) }, stagingSummary: summarizeStaging(artifact), lineage, recordedAt: new Date().toISOString() };
}

function parserIdentity(config: RecordValue, sourceId: string, source: RecordValue) { return { sourceParser: stringOrNull(source.parser), configSections: Object.entries(config).filter(([, v]) => isRecord(v) && v.sourceId === sourceId).map(([k]) => k).sort(), status: "declared_fields_only" }; }
function structuredLineage(source: RecordValue) { const values = { page: stringOrNull(source.page), sheet: stringOrNull(source.sheet) ?? stringOrNull(source.sheetName), cell: stringOrNull(source.cell), row: stringOrNull(source.row) }; return { ...values, status: values.page || values.sheet || values.cell || values.row ? "declared" as const : "missing" as const }; }
function structuredRetrieval(source: RecordValue) { const retrieval = isRecord(source.retrieval) ? source.retrieval : {}; return { retrievedAt: stringOrNull(retrieval.retrievedAt) ?? stringOrNull(source.retrievedAt) ?? stringOrNull(source.timestampBasis), method: stringOrNull(retrieval.method) ?? stringOrNull(source.retrievalMethod), sourceUrl: safeHttpsUrl(retrieval.url) ?? safeHttpsUrl(source.retrievalUrl) }; }
function summarizeStaging(artifact: RecordValue): StagingSummary { const native = isRecord(artifact.native) ? artifact.native : null; if (!native) return { numericFields: {}, rowCount: 0, sourceIds: [], rowFingerprints: {}, status: "unknown" }; const numericFields: Record<string, number> = {}; const sourceIds = new Set<string>(); const rowFingerprints: Record<string, string[]> = {}; let rowCount = 0; for (const [family, value] of Object.entries(native)) { if (!Array.isArray(value)) continue; for (const row of value) { if (!isRecord(row)) continue; if (++rowCount > MAX_ROWS) throw new McpToolError("staging_row_limit", "The staging artifact exceeds the source-revision row limit.", "Use a reviewed bounded staging artifact before recording lineage."); const id = stringOrNull(row.sourceId) ?? stringOrNull(row.sourceDocumentId); if (id) sourceIds.add(id); const key = `${family}|${Number(row.electionYear) || 2024}|${stringOrNull(row.jurisdictionTag) ?? stringOrNull(row.jurisdictionName) ?? stringOrNull(row.county) ?? "unknown"}|${stringOrNull(row.localUnit) ?? "none"}|${stringOrNull(row.candidate) ?? "none"}|${stringOrNull(row.contest) ?? stringOrNull(row.office) ?? "none"}|${id ?? "none"}`; (rowFingerprints[key] ??= []).push(digest(Buffer.from(stableJson(row)))); for (const [field, fieldValue] of Object.entries(row)) { if (typeof fieldValue === "number" && Number.isFinite(fieldValue)) numericFields[`${family}.${field}`] = (numericFields[`${family}.${field}`] ?? 0) + fieldValue; if (isRecord(fieldValue)) for (const [key, value] of Object.entries(fieldValue)) if (typeof value === "number" && Number.isFinite(value)) numericFields[`${family}.${field}.${key}`] = (numericFields[`${family}.${field}.${key}`] ?? 0) + value; } } } for (const values of Object.values(rowFingerprints)) values.sort(); return { numericFields, rowCount, sourceIds: [...sourceIds].sort(), rowFingerprints, status: "observed" }; }
function diffSummaries(previous: StagingSummary, current: StagingSummary) { if (previous.status !== "observed" || current.status !== "observed") return { status: "unknown", reason: "A staging summary was unavailable; no values were inferred." }; const fields = [...new Set([...Object.keys(previous.numericFields), ...Object.keys(current.numericFields)])].sort(); const keys = [...new Set([...Object.keys(previous.rowFingerprints), ...Object.keys(current.rowFingerprints)])].sort(); return { status: "observed", numericFields: fields.filter((key) => previous.numericFields[key] !== current.numericFields[key]).map((key) => ({ field: key, previous: previous.numericFields[key] ?? null, current: current.numericFields[key] ?? null })), canonicalRows: { added: keys.filter((key) => !(key in previous.rowFingerprints)), removed: keys.filter((key) => !(key in current.rowFingerprints)), changed: keys.filter((key) => key in previous.rowFingerprints && JSON.stringify(previous.rowFingerprints[key]) !== JSON.stringify(current.rowFingerprints[key])) }, sourceIds: { added: current.sourceIds.filter((id) => !previous.sourceIds.includes(id)), removed: previous.sourceIds.filter((id) => !current.sourceIds.includes(id)) }, rowCount: { previous: previous.rowCount, current: current.rowCount } }; }

async function stableFileBytes(file: string, limit: number, label: string) { const before = await stat(file); if (!before.isFile() || before.size > limit) throw new McpToolError("source_size_limit", `${label} is not a regular file within the permitted size limit.`, "Use a bounded retained artifact."); const bytes = await readFile(file); const after = await stat(file); if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) throw new McpToolError("source_mutated_during_record", `${label} changed while it was being read.`, "Retry after the artifact is stable."); return { bytes }; }
async function regularReadable(context: RuntimeContext, relative: string, label: string) { try { const lexical = path.resolve(context.repoRoot, relative); const [root, parent] = await Promise.all([realpath(context.repoRoot), realpath(path.dirname(lexical))]); const parentRel = path.relative(root, parent); if (parentRel.startsWith("..") || path.isAbsolute(parentRel)) throw new McpToolError("unsafe_path", `${label} parent resolves outside the trusted checkout.`, "Replace the external symlink or junction with a retained repository directory."); const link = await lstat(lexical); if (link.isSymbolicLink()) throw new McpToolError("unsafe_path", `${label} is a symbolic link.`, "Replace the link with a retained repository file."); const target = await resolveReadableInsideRepo(context, relative); const info = await stat(target); if (!info.isFile()) throw new McpToolError("unsafe_path", `${label} is not a regular file inside the trusted checkout.`, "Replace an external symlink or junction with a retained repository file."); return target; } catch (error) { if (error instanceof McpToolError) throw error; throw new McpToolError("retained_source_unavailable", `${label} is unavailable inside the trusted checkout.`, "Restore the config-selected retained file before recording lineage."); } }
async function writeImmutable(target: string, bytes: Buffer, expected: string) { try { const handle = await open(target, "wx"); try { await handle.writeFile(bytes); } finally { await handle.close(); } } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; const link = await lstat(target); if (link.isSymbolicLink() || !link.isFile()) throw new McpToolError("immutable_artifact_mismatch", "An immutable revision path is not a regular file.", "Do not follow or overwrite a preexisting link."); const existing = await readFile(target); if (digest(existing) !== expected) throw new McpToolError("immutable_artifact_mismatch", "A revision path already contains different bytes.", "Do not overwrite immutable lineage artifacts."); } }
async function readExistingManifest(context: RuntimeContext, state: string, sourceId: string, sha: string) { const relative = `${revisionDirectory(state, sourceId, sha)}/manifest.json`; const lexical = resolveInsideRepo(context, relative); try { await lstat(lexical); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } const manifest = await readSourceRevision(context, { state, sourceId, revisionSha256: sha }) as RevisionManifest; return { path: relative, sha256: digest(await readFile(await regularReadable(context, relative, "immutable revision manifest"))), manifest }; }
function bindingStatus(recorded: RevisionManifest, current: RevisionManifest) { const stale = { config: recorded.stateConfig.sha256 !== current.stateConfig.sha256, staging: recorded.staging.sha256 !== current.staging.sha256, parserDeclared: JSON.stringify(declaredParser(recorded.parserIdentity)) !== JSON.stringify(declaredParser(current.parserIdentity)), parserImplementation: implementationSha(recorded.parserIdentity) !== implementationSha(current.parserIdentity) }; return { status: Object.values(stale).some(Boolean) ? "stale" : "current", stale, caveat: "Observed implementation fingerprints bind a bounded trusted code set at record/read time; they do not prove that code generated the retained artifact." }; }
function declaredParser(value: RecordValue) { const { observedImplementation: _ignored, ...declared } = value; return declared; } function implementationSha(value: RecordValue) { return isRecord(value.observedImplementation) ? stringOrNull(value.observedImplementation.sha256) : null; }
export async function observedParserImplementation(context: RuntimeContext) {
  const files: string[] = [];
  for (const root of ["civic_etl", "scripts"]) await collectParserFiles(context, root, files);
  for (const file of ["src/db/native-import.ts", "src/db/database-driver.ts", "src/db/neon-transaction.ts", "src/lib/analysis-indicators.ts"]) {
    try { await lstat(resolveInsideRepo(context, file)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    await regularReadable(context, file, "fixed parser implementation"); files.push(file);
  }
  const sorted = [...new Set(files)].sort(); let totalBytes = 0; const entries: string[] = [];
  const signatures: Array<{ file: string; size: number; mtimeMs: number }> = [];
  if (sorted.length >= MAX_PARSER_FILES) return { status: "incomplete", sha256: null, fileCount: sorted.length, totalBytes, caveat: "Fixed parser implementation file limit reached; no implementation hash was inferred." };
  for (const file of sorted) {
    const target = await regularReadable(context, file, "fixed parser implementation");
    const { bytes } = await stableFileBytes(target, MAX_PARSER_BYTES - totalBytes, "fixed parser implementation"); totalBytes += bytes.length;
    const info = await lstat(target); signatures.push({ file: target, size: info.size, mtimeMs: info.mtimeMs });
    entries.push(`${file}\0${digest(bytes)}`);
  }
  for (const saved of signatures) { const now = await lstat(saved.file); if (!now.isFile() || now.isSymbolicLink() || now.size !== saved.size || now.mtimeMs !== saved.mtimeMs) throw new McpToolError("source_mutated_during_record", "Parser implementation changed during its fingerprint scan.", "Retry after code is stable."); }
  return { status: "observed", sha256: digest(Buffer.from(entries.join("\n"))), fileCount: entries.length, totalBytes, caveat: "Observed bounded trusted implementation bytes; not proof that this code generated the retained artifact." };
}
async function collectParserFiles(context: RuntimeContext, relative: string, files: string[]) { let directory: string; try { directory = await regularDirectory(context, relative); } catch { return; } for (const entry of await readdir(directory, { withFileTypes: true })) { if (files.length >= MAX_PARSER_FILES) return; const child = `${relative}/${entry.name}`; if (entry.isDirectory()) await collectParserFiles(context, child, files); else if (entry.isFile() && /\.(?:py|mjs|ts|js)$/i.test(entry.name)) files.push(child); } }
async function regularDirectory(context: RuntimeContext, relative: string) { const target = await resolveReadableInsideRepo(context, relative); const info = await stat(target); if (!info.isDirectory()) throw new McpToolError("unsafe_path", "Fixed parser implementation path is not a directory.", "Repair the trusted checkout."); return target; }
async function latestPreviousManifest(context: RuntimeContext, state: string, sourceId: string, current: string): Promise<RevisionManifest | null> { const indexRelative = `.etl/source-revisions/${state.toLowerCase()}/${sourceId}/latest.json`; const indexDir = await ensureDirectoryInsideRepo(context, `.etl/source-revisions/${state.toLowerCase()}/${sourceId}`); const indexPath = path.join(indexDir, "latest.json"); let previous: RevisionManifest | null = null; try { const index = parseObject(await readFile(indexPath), indexRelative); if (typeof index.contentSha256 === "string" && index.contentSha256 !== current && DIGEST.test(index.contentSha256)) previous = await readSourceRevision(context, { state, sourceId, revisionSha256: index.contentSha256 }) as RevisionManifest; } catch { /* no prior revision is an expected first-record condition */ } const next = Buffer.from(`${JSON.stringify({ contentSha256: current }, null, 2)}\n`); const tmp = path.join(indexDir, `.latest-${process.pid}-${Date.now()}.tmp`); await writeFile(tmp, next, { flag: "wx" }); await rename(tmp, indexPath).catch(async () => { await unlink(tmp).catch(() => undefined); }); return previous; }
function revisionDirectory(state: string, sourceId: string, sha: string) { return `.etl/source-revisions/${state.toLowerCase()}/${sourceId}/${sha}`; }
function validateInput(input: SourceRevisionInput, confirmation: boolean) { if (!input || !/^[A-Za-z]{2}$/.test(input.state) || !SAFE_ID.test(input.sourceId)) throw new McpToolError("invalid_source_revision_input", "state or sourceId is invalid.", "Use a two-letter state and an exact bounded source ID."); if (confirmation && input.confirmation !== "RECORD_SOURCE_REVISION") throw new McpToolError("source_revision_confirmation_required", "Recording immutable source bytes requires explicit confirmation.", "Repeat with confirmation RECORD_SOURCE_REVISION."); }
function validateReadInput(input: ReadSourceRevisionInput) { validateInput(input, false); if (!DIGEST.test(input.revisionSha256)) throw new McpToolError("invalid_source_revision_input", "revisionSha256 must be a lowercase SHA-256 digest.", "Use the revision digest returned by the recorder."); }
function validateStaging(value: RecordValue, state: string) { if (!isRecord(value.state) || String(value.state.code ?? "").toUpperCase() !== state || !isRecord(value.election) || Number(value.election.year) !== 2024 || !isRecord(value.native)) throw new McpToolError("invalid_staging_identity", "The config-selected staging artifact is not a matching 2024 native artifact.", "Regenerate the reviewed state staging artifact."); }
function parseObject(bytes: Uint8Array, label: string): RecordValue { try { const value = JSON.parse(Buffer.from(bytes).toString("utf8")); if (!isRecord(value)) throw new Error(); return value; } catch { throw new McpToolError("invalid_json", `${label} is not a JSON object.`, "Repair or regenerate the retained JSON artifact."); } }
function digest(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); } function isRecord(value: unknown): value is RecordValue { return Boolean(value) && typeof value === "object" && !Array.isArray(value); } function records(value: unknown) { return Array.isArray(value) ? value.filter(isRecord) : []; } function stringOrNull(value: unknown) { return typeof value === "string" ? value : null; } function numberOrNull(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; } function safeHttpsUrl(value: unknown) { try { const url = new URL(typeof value === "string" ? value : ""); if (url.protocol !== "https:" || url.username || url.password) return null; url.search = ""; url.hash = ""; return url.toString(); } catch { return null; } } function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`; return JSON.stringify(value); }
