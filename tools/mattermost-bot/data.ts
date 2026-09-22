import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { requireCatalogState } from "../civicresultmaps-mcp/catalog.ts";
import { resolveReadableInsideRepo, type RuntimeContext } from "../civicresultmaps-mcp/runtime.ts";

export type Row = Record<string, unknown>;
export const FAMILIES = ["results", "turnout", "historical", "sources"] as const;
export type Family = typeof FAMILIES[number];
export const YEARS = [2012, 2016, 2020, 2024] as const;
export const CAVEAT = "Local staging, not a live website or certification check. Advisory signals are for review and reconciliation, not proof of fraud or misconduct. Reporting grains and source limitations must be preserved.";
export const MAX_CSV_BYTES = 8 * 1024 * 1024;
export const MAX_ARTIFACT_BYTES = 128 * 1024 * 1024;
export const MAX_ROWS = 100_000;

export class BotError extends Error {}
export function record(value: unknown): Row {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}
export function rows(value: unknown): Row[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => item === null || typeof item !== "object" || Array.isArray(item))) {
    throw new BotError("Malformed staging rows; ask the data maintainer to inspect the artifact.");
  }
  return value as Row[];
}

// Project only approved public fields; never serialize raw MCP envelopes or metadata.
export function publicText(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return "";
  return String(value)
    .replace(/(?:\b[a-z]:[\\/]|\\\\)[^\s,;"<>]+/gi, "[local path omitted]")
    .replace(/\/(?:Users|home|tmp|var|mnt)\/[^\s,;"<>]+/g, "[local path omitted]")
    .replace(/(?:postgres(?:ql)?|mysql):\/\/[^\s]+/gi, "[credential omitted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [omitted]")
    .replace(/\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+/gi, "[credential omitted]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}
export function publicUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const credentialPath = /(?:^|\/)(?:api[-_]?key|access[-_]?token|token|secret|password|credential|signature)(?:[=:_-]|\/|$)/i.test(url.pathname);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")
      || /^(?:0|10|127)\./.test(hostname) || /^169\.254\./.test(hostname) || /^192\.168\./.test(hostname)
      || /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname) || hostname.startsWith("[")
      || credentialPath || /(?:token|secret|password|key|signature|credential)/i.test(url.search + url.hash)) return "";
    return url.href;
  } catch { return ""; }
}
export function pick(row: Row, fields: readonly string[]): Row {
  return Object.fromEntries(fields.map(field => [field, (typeof row[field] === "number" && Number.isFinite(row[field])) || typeof row[field] === "boolean"
    ? row[field] : row[field] == null ? "" : publicText(row[field])]));
}

const COMMON = ["jurisdictionCode", "jurisdictionName", "jurisdictionGeoid", "jurisdictionTag", "county", "localUnit", "reportingUnit", "level", "sourceLevel", "sourceId", "sourceDocumentId"];
const FIELDS: Record<Family, string[]> = {
  results: [...COMMON, "totalVotes", "margin", "marginPct", "candidate", "votes"],
  turnout: [...COMMON, "ballotsCast", "registeredVoters", "votingAgePopulation", "votingEligiblePopulation", "denominatorType", "registrationDenominatorTiming", "turnoutPct", "warningRequired", "notes", "caveat"],
  historical: [...COMMON, "sourceDisplayName", "sourceJurisdictionName", "rowMethod", "demVotes", "repVotes", "otherVotes", "totalVotes", "notes", "caveat"],
  sources: ["id", "category", "authority", "status", "confidence", "timestampBasis", "parser"],
};
const SOURCE_FIELDS = ["sourceUrl", "sourceAuthority", "sourceConfidence", "sourceStatus", "sourceTimestampBasis", "sourceParser", "sourceMatch"];

export type Snapshot = { artifact: Row; sha256: string; modifiedAt: string };
// Called only with code-selected paths, never chat input. Config/inventory reads
// are bounded as well as staging reads.
export async function readMetadata(context: RuntimeContext, relativePath: string): Promise<Row> {
  const filename = await resolveReadableInsideRepo(context, relativePath);
  const file = await open(filename, "r");
  const limit = 8 * 1024 * 1024;
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > limit) throw new BotError("Metadata exceeds the safe read limit.");
    const buffer = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await file.stat();
    if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new BotError("Metadata changed during the read. Please retry.");
    return record(JSON.parse(buffer.subarray(0, length).toString("utf8")));
  } finally { await file.close(); }
}
export async function readSnapshot(context: RuntimeContext, state: string): Promise<Snapshot> {
  if (!/^[A-Z]{2}$/.test(state)) throw new BotError("Use a two-letter state code, such as WI.");
  await requireCatalogState(context, state);
  let file;
  try {
    const filename = await resolveReadableInsideRepo(context, `.etl/staging/${state.toLowerCase()}-2024-staging.json`);
    file = await open(filename, "r");
  } catch { throw new BotError("No readable staging artifact for this state. The bot cannot collect or import data."); }
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > MAX_ARTIFACT_BYTES) throw new BotError("Staging artifact exceeds the safe read limit.");
    // Bounded read even if a writer grows the artifact after stat().
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(1024 * 1024, MAX_ARTIFACT_BYTES + 1 - size));
      const { bytesRead } = await file.read(chunk);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > MAX_ARTIFACT_BYTES) throw new BotError("Staging artifact exceeds the safe read limit.");
      chunks.push(chunk.subarray(0, bytesRead));
    }
    const after = await file.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || size !== before.size) {
      throw new BotError("Staging changed during the read. Please retry.");
    }
    const bytes = Buffer.concat(chunks);
    let artifact: Row;
    try { artifact = record(JSON.parse(bytes.toString("utf8"))); }
    catch { throw new BotError("Staging JSON is invalid. Ask the data maintainer to inspect it."); }
    if (record(artifact.state).code !== state || record(artifact.election).year !== 2024 || !artifact.native || typeof artifact.native !== "object" || Array.isArray(artifact.native)) {
      throw new BotError("Staging state or election identity is invalid.");
    }
    return { artifact, sha256: createHash("sha256").update(bytes).digest("hex"), modifiedAt: before.mtime.toISOString() };
  } finally { await file.close(); }
}

export function sourceFields(row: Row, sources: Row[], state: string): Row {
  const ids = [row.sourceDocumentId, row.sourceId, `${state.toLowerCase()}-${row.sourceId}`].filter(Boolean);
  const matches = sources.filter(source => ids.includes(source.id));
  const source = matches.length === 1 ? matches[0] : {};
  return {
    sourceUrl: publicUrl(row.sourceUrl) || publicUrl(source.sourceUrl ?? source.url),
    sourceAuthority: publicText(source.authority), sourceConfidence: publicText(source.confidence),
    sourceStatus: publicText(source.status), sourceTimestampBasis: publicText(source.timestampBasis),
    sourceParser: publicText(source.parser), sourceMatch: matches.length === 1 ? "matched" : matches.length ? "ambiguous" : "missing",
  };
}

export function csvCell(value: unknown): string {
  let text = publicText(value);
  // Protect spreadsheet users from formulas, including whitespace-prefixed formulas.
  // True finite numbers remain numeric; missing values remain empty, never zero.
  if (typeof value !== "number" && (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text))) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function makeCsv(columns: string[], data: Row[]): string {
  if (data.length > MAX_ROWS) throw new BotError("Export exceeds 100,000 rows. Choose a narrower dataset/year.");
  let bytes = 3;
  const lines: string[] = [];
  for (const values of [columns, ...data.map(row => columns.map(column => row[column]))]) {
    const line = values.map(csvCell).join(",") + "\r\n";
    bytes += Buffer.byteLength(line);
    if (bytes > MAX_CSV_BYTES) throw new BotError("Export exceeds 8 MiB. Choose a narrower dataset/year; no partial CSV was generated.");
    lines.push(line);
  }
  return "\uFEFF" + lines.join("");
}

export function exportSnapshot(snapshot: Snapshot, state: string, family: Family, year?: number) {
  if (!FAMILIES.includes(family) || (year !== undefined && !YEARS.includes(year as typeof YEARS[number]))) throw new BotError("Unsupported dataset or year.");
  if (family === "sources" && year !== undefined) throw new BotError("The sources inventory covers the whole staging package; omit the year.");
  if ((family === "results" || family === "turnout") && year !== undefined && year !== 2024) {
    throw new BotError("Results and turnout exports currently cover 2024. Use historical for 2012, 2016, or 2020.");
  }
  const { artifact } = snapshot;
  if (record(artifact.state).code !== state || record(artifact.election).year !== 2024) throw new BotError("Export state/election identity does not match the artifact.");
  const sources = rows(artifact.sources);
  const native = record(artifact.native);
  const raw = family === "sources" ? sources : rows(native[{ results: "resultRows", turnout: "turnoutRows", historical: "historicalRows" }[family]]);
  const selected = family === "historical" ? raw.filter(row => year === undefined || row.electionYear === year) : raw;
  const output: Row[] = [];
  for (const row of selected) {
    for (const field of ["totalVotes", "demVotes", "repVotes", "otherVotes", "ballotsCast", "registeredVoters", "votingAgePopulation", "votingEligiblePopulation"]) {
      if (row[field] !== undefined && row[field] !== null && (!Number.isSafeInteger(row[field]) || Number(row[field]) < 0)) {
        throw new BotError("Staging contains an invalid integer vote/turnout count. No partial CSV was generated.");
      }
    }
    const rowYear = family === "sources" ? "" : family === "historical" ? row.electionYear : 2024;
    if (family === "historical" && !YEARS.includes(rowYear as typeof YEARS[number])) throw new BotError("Historical rows have an invalid election year.");
    const common: Row = { state, electionYear: rowYear, dataset: family, dataOrigin: "local-staging", ...pick(row, FIELDS[family]),
      ...sourceFields(family === "sources" ? { sourceId: row.id } : row, sources, state), exportCaveat: CAVEAT };
    if (family !== "sources" && row.reportingUnit !== null && typeof row.reportingUnit === "object" && !Array.isArray(row.reportingUnit)) {
      // Preserve declared source-unit identifiers without leaking arbitrary
      // nested metadata or inventing a crosswalk/reporting grain.
      common.reportingUnit = JSON.stringify(pick(record(row.reportingUnit), ["sourceUnitId", "sourceDisplayName", "reportingGrain", "parentGeoid", "isGeographic"]));
    }
    if (family === "results") {
      const candidates = Object.entries(record(row.votes));
      if (!candidates.length || candidates.some(([, votes]) => typeof votes !== "number" || !Number.isSafeInteger(votes) || votes < 0)) {
        throw new BotError("Result rows have missing or invalid candidate vote counts.");
      }
      for (const [candidate, votes] of candidates) output.push({ ...common, candidate: publicText(candidate), votes });
    } else output.push(common);
    if (output.length > MAX_ROWS) throw new BotError("Export exceeds 100,000 rows. No partial CSV was generated.");
  }
  if (!output.length) throw new BotError("No rows for that dataset/year in local staging. Missing data is not zero.");
  const columns = ["state", "electionYear", "dataset", "dataOrigin", ...FIELDS[family], ...SOURCE_FIELDS, "exportCaveat"];
  const csv = makeCsv(columns, output);
  const label = family === "sources" || (family === "historical" && year === undefined) ? "all-years" : String(year ?? 2024);
  return {
    filename: `crm-${state.toLowerCase()}-${family}-${label}-staging.csv`, csv,
    state, family, year: year ?? (family === "results" || family === "turnout" ? 2024 : null),
    rowCount: output.length, nativeRowCount: selected.length, columns,
    artifactSha256: snapshot.sha256, artifactModifiedAt: snapshot.modifiedAt,
    csvSha256: createHash("sha256").update(csv).digest("hex"), bytes: Buffer.byteLength(csv),
    caveat: CAVEAT,
    notes: family === "results" ? "One row per candidate per native reporting unit. totalVotes is repeated per candidate; do not sum that column across candidates."
      : family === "sources" ? "Inventory status does not establish source certification or election applicability. An empty electionYear is intentional."
        : "Native reporting units and denominator definitions are preserved; no county aggregation or crosswalk is inferred.",
  };
}

export async function exportState(context: RuntimeContext, state: string, family: Family, year?: number) {
  return exportSnapshot(await readSnapshot(context, state), state, family, year);
}
