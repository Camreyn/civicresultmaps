/** Fixed, bounded public reads shared by the workflow-report tools.
 * No URL, headers, credentials, SQL, or environment come from MCP input.
 */
export type EvidenceRecord = Record<string, unknown>;
export type EvidenceTarget = "local" | "production";
export type EvidenceFamily = "results" | "review" | "turnout" | "historical" | "sources" | "indicators" | "jurisdictions";
export type EvidenceRequest = {
  target: EvidenceTarget;
  family: EvidenceFamily;
  state: string;
  year?: number;
  level?: string;
};
export type PublicApiEvidence = {
  rows: EvidenceRecord[];
  complete: boolean;
  source: string | null;
  endpoint: string;
  capturedAt: string;
  error?: string;
  meta: EvidenceRecord;
};
export type EvidenceDependencies = { fetchImpl?: typeof fetch; signal?: AbortSignal };

export const EVIDENCE_TARGETS: Readonly<Record<EvidenceTarget, string>> = Object.freeze({
  local: "http://127.0.0.1:3000",
  production: "https://www.civicresultmaps.org",
});
const ROUTES: Record<EvidenceFamily, string> = {
  results: "results", review: "review-rows", turnout: "turnout", historical: "historical-baselines",
  sources: "sources", indicators: "indicators", jurisdictions: "jurisdictions",
};
export const RESULT_LEVELS = ["county", "state", "district", "precinct", "city", "city_town", "town", "federal_precincts", "non_geographic"] as const;
const LEVELS = new Set<string>(RESULT_LEVELS);
const LIMITED = new Set<EvidenceFamily>(["review", "turnout", "historical"]);
const ROW_LIMIT = 5000;
const BYTE_LIMIT = 20 * 1024 * 1024;
const PAGE_SIZE = 1000;
const MAX_PAGES = 200;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;

export function evidenceUrl(request: EvidenceRequest): string {
  if (!Object.hasOwn(EVIDENCE_TARGETS, request.target) || !Object.hasOwn(ROUTES, request.family)) throw new Error("Unsupported evidence target or family.");
  if (!/^[A-Za-z]{2}$/.test(request.state)) throw new Error("Evidence state must be a two-letter code.");
  if (request.year !== undefined && (!Number.isInteger(request.year) || request.year < 1788 || request.year > 2100)) throw new Error("Invalid evidence year.");
  if (request.level !== undefined && !LEVELS.has(request.level)) throw new Error("Unsupported result level.");
  const url = new URL(`/api/${ROUTES[request.family]}`, EVIDENCE_TARGETS[request.target]);
  url.searchParams.set("state", request.state.toUpperCase());
  if (request.family !== "jurisdictions" && request.year !== undefined) url.searchParams.set("year", String(request.year));
  if (request.family === "results") url.searchParams.set("level", request.level ?? "county");
  if (LIMITED.has(request.family) || request.family === "jurisdictions") url.searchParams.set("limit", String(ROW_LIMIT));
  if (request.family === "review" || request.family === "historical") url.searchParams.set("includeMetrics", "true");
  return url.toString();
}

export async function readPublicApi(request: EvidenceRequest, dependencies: EvidenceDependencies = {}): Promise<PublicApiEvidence> {
  const endpoint = evidenceUrl(request);
  if (LIMITED.has(request.family)) return readPagedPublicApi(request, dependencies);
  return readEvidencePage(request, endpoint, dependencies);
}

async function readEvidencePage(request: EvidenceRequest, endpoint: string, dependencies: EvidenceDependencies, paginated = false): Promise<PublicApiEvidence> {
  const evidence: PublicApiEvidence = { rows: [], complete: false, source: null, endpoint, capturedAt: new Date().toISOString(), meta: {} };
  const signal = dependencies.signal
    ? AbortSignal.any([dependencies.signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000);
  try {
    const response = await (dependencies.fetchImpl ?? fetch)(endpoint, {
      method: "GET", redirect: "error", credentials: "omit", cache: "no-store",
      headers: { accept: "application/json" }, signal,
    });
    if (!response.ok) { await response.body?.cancel(); return { ...evidence, error: `http_${response.status}` }; }
    if (!response.headers.get("content-type")?.toLowerCase().includes("json")) { await response.body?.cancel(); return { ...evidence, error: "non_json_response" }; }
    const body = await boundedBody(response);
    const parsed: unknown = JSON.parse(body);
    if (!record(parsed) || parsed.error || !Array.isArray(parsed.data) || !parsed.data.every(record)) return { ...evidence, error: "invalid_api_envelope" };
    const meta = record(parsed.meta) ? parsed.meta : {};
    for (const key of ["source", "schemaVersion", "generatedAt", "releaseId", "hasMore", "limit", "offset", "total", "rowCount", "paginationVersion", "nextOffset", "dataRevision"]) {
      if (["string", "number", "boolean"].includes(typeof meta[key]) || meta[key] === null) evidence.meta[key] = meta[key];
    }
    evidence.source = typeof meta.source === "string" ? meta.source : null;
    evidence.rows = parsed.data;
    evidence.meta.responseBytes = Buffer.byteLength(body);
    const expectedSource = request.family === "jurisdictions" ? "canonical-jurisdictions" : "database";
    if (evidence.source !== expectedSource) return { ...evidence, error: "unverified_or_seed_data_source" };
    if (!paginated && (meta.hasMore === true || (typeof meta.total === "number" && meta.total > evidence.rows.length)
      || (LIMITED.has(request.family) && evidence.rows.length >= ROW_LIMIT))) return { ...evidence, error: "incomplete_or_capped_response" };
    if (evidence.rows.some((row) => typeof row.state !== "string" || row.state.toUpperCase() !== request.state.toUpperCase())) return { ...evidence, error: "state_scope_mismatch" };
    if (request.year !== undefined && evidence.rows.some((row) => {
      const rowYear = row.electionYear ?? row.year;
      return request.family !== "jurisdictions" && (typeof rowYear !== "number" || rowYear !== request.year);
    })) return { ...evidence, error: "year_scope_mismatch" };
    if (request.family !== "jurisdictions" && evidence.rows.some((row) => !Number.isInteger(row.electionYear ?? row.year))) return { ...evidence, error: "missing_year_scope" };
    if (request.family === "results" && evidence.rows.some((row) => row.level !== (request.level ?? "county"))) return { ...evidence, error: "result_level_scope_mismatch" };
    return { ...evidence, complete: true };
  } catch (error) {
    return { ...evidence, error: signal.aborted ? (dependencies.signal?.aborted ? "cancelled" : "timeout") : error instanceof SyntaxError ? "invalid_json" : "public_read_failed" };
  }
}

/** New servers provide revision-fenced pages. Older servers are retried with the
 * original 5,000-row request and still fail closed at their cap. */
async function readPagedPublicApi(request: EvidenceRequest, dependencies: EvidenceDependencies): Promise<PublicApiEvidence> {
  const legacy = evidenceUrl(request);
  const url = new URL(legacy);
  url.searchParams.set("paginate", "true");
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", "0");
  const signal = dependencies.signal
    ? AbortSignal.any([dependencies.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
  const deps = { ...dependencies, signal };
  let page = await readEvidencePage(request, url.toString(), deps, true);
  if (page.meta.paginationVersion === undefined && page.source === "database") return readEvidencePage(request, legacy, deps);
  const accumulated: EvidenceRecord[] = [];
  const ids = new Set<string>();
  const revision = page.meta.dataRevision;
  let offset = 0, bytes = 0;
  const fail = (reason: string): PublicApiEvidence => ({ ...page, rows: [], complete: false, error: reason, meta: { ...page.meta, pagesRead: Math.ceil(offset / PAGE_SIZE), accumulatedRows: accumulated.length } });
  for (let index = 0; index < MAX_PAGES; index++) {
    if (page.error) return fail(page.error);
    if (page.meta.paginationVersion !== 1 || typeof revision !== "string" || !/^public:[1-9]\d{0,19}$/.test(revision)
      || page.meta.dataRevision !== revision || page.meta.offset !== offset || page.meta.limit !== PAGE_SIZE
      || typeof page.meta.hasMore !== "boolean" || page.rows.length > PAGE_SIZE) return fail("invalid_or_changed_pagination_identity");
    bytes += Number(page.meta.responseBytes ?? 0);
    if (bytes > MAX_TOTAL_BYTES) return fail("paginated_response_byte_limit");
    for (const row of page.rows) {
      if (typeof row.id !== "string" || !row.id || ids.has(row.id)) return fail("missing_or_duplicate_paginated_row_identity");
      ids.add(row.id);
    }
    accumulated.push(...page.rows);
    if (!page.meta.hasMore) {
      if (page.meta.nextOffset !== null || page.meta.total !== accumulated.length) return fail("invalid_pagination_total");
      return { ...page, endpoint: legacy, rows: accumulated, complete: true, meta: { ...page.meta, offset: 0, pagesRead: index + 1, responseBytes: bytes, completeRead: "revision_fenced_pagination" } };
    }
    if (page.rows.length !== PAGE_SIZE || page.meta.nextOffset !== offset + PAGE_SIZE) return fail("invalid_pagination_progress");
    offset += page.rows.length;
    if (index + 1 === MAX_PAGES) return fail("paginated_response_page_limit");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("revision", revision);
    page = await readEvidencePage(request, url.toString(), deps, true);
  }
  return fail("paginated_response_page_limit");
}

/** A per-report cache and concurrency bound; it never persists production data. */
export function createEvidenceReader(dependencies: EvidenceDependencies = {}) {
  const cache = new Map<string, Promise<PublicApiEvidence>>();
  const waiting: Array<() => void> = [];
  let active = 0;
  return (request: EvidenceRequest): Promise<PublicApiEvidence> => {
    const key = evidenceUrl(request);
    const existing = cache.get(key);
    if (existing) return existing;
    const pending = (async () => {
      if (active >= 4) await new Promise<void>((resolve) => waiting.push(resolve));
      else active++;
      try { return await readPublicApi(request, dependencies); }
      finally {
        const next = waiting.shift();
        if (next) next();
        else active--;
      }
    })();
    cache.set(key, pending);
    return pending;
  };
}

async function boundedBody(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > BYTE_LIMIT) { await response.body?.cancel(); throw new Error("Oversized API response."); }
  if (!response.body) throw new Error("Missing API body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > BYTE_LIMIT) { await reader.cancel(); throw new Error("Oversized API response."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

function record(value: unknown): value is EvidenceRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
