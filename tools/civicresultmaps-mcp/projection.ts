import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { analysisIndicatorsForNativeRows, nativeSourceDocumentIdentity, partitionReviewRowsForPromotion } from "../../src/db/native-import.ts";
import { calculateAnalysisIndicators, type CandidateNeutralReviewRow } from "../../src/lib/analysis-indicators.ts";
import { resolveReadableInsideRepo, type RuntimeContext } from "./runtime.ts";

type Row = Record<string, unknown>;
export type ProjectionFamily = "results" | "review" | "turnout" | "historical" | "sources" | "indicators";
export type ProjectionScope = { state: string; year: number; sourceSlugs?: Record<string, string> };

export function sourceProjectionContext(artifact: Row, state: string) {
  const sourceSlugs: Record<string, string> = Object.create(null);
  const sourceYearById: Record<string, number> = Object.create(null);
  for (const source of array(artifact.sources)) {
    if (!text(source.id)) throw new Error("Source has no native ID.");
    const { targetSlug, sourceElectionYear } = nativeSourceDocumentIdentity(state, 2024, { id: String(source.id), ...(record(source.metadata) ? { metadata: source.metadata } : {}) });
    if (Object.hasOwn(sourceSlugs, String(source.id))) throw new Error("Duplicate source ID in artifact.");
    sourceSlugs[String(source.id)] = targetSlug;
    sourceYearById[String(source.id)] = sourceElectionYear;
  }
  return { sourceSlugs, sourceYearById, sourceYears: [...new Set(Object.values(sourceYearById))].sort() };
}

/** Public fields only, normalized to the native importer's actual transformations.
 * Generated database IDs/codes are not election values. Canonical tags are checked
 * separately when explicitly declared; no FIPS or geographic relationships are invented.
 */
export function compareFamilyRows(family: ProjectionFamily, staged: Row[], live: Row[], scope: ProjectionScope) {
  const expected = indexRows(family, staged, scope, true);
  const actual = indexRows(family, live, scope, false);
  const added = [...expected.rows.keys()].filter((key) => !actual.rows.has(key));
  const removed = [...actual.rows.keys()].filter((key) => !expected.rows.has(key));
  const changed = [...expected.rows.keys()].filter((key) => actual.rows.has(key) && !equal(expected.rows.get(key), actual.rows.get(key)));
  const duplicateMessages = [...expected.errors.map((issue) => `staging: ${issue}`), ...actual.errors.map((issue) => `api: ${issue}`)];
  const tagConflicts: string[] = [];
  for (const [key, expectedTag] of expected.tags) {
    const actualTag = actual.tags.get(key);
    if (actual.rows.has(key) && actualTag !== expectedTag) tagConflicts.push(`${key}: declared canonical tag differs`);
  }
  return {
    status: duplicateMessages.length || tagConflicts.length ? "fail" : "pass",
    counts: { staged: staged.length, live: live.length, added: added.length, removed: removed.length, changed: changed.length },
    added, removed, changed, duplicates: duplicateMessages, tagConflicts,
    samples: {
      added: added.slice(0, 10), removed: removed.slice(0, 10),
      changed: changed.slice(0, 10).map((key) => ({ key, staged: expected.rows.get(key), api: actual.rows.get(key) })),
    },
    sha256: { staged: digest([...expected.rows].sort(([a], [b]) => a.localeCompare(b))), live: digest([...actual.rows].sort(([a], [b]) => a.localeCompare(b))) },
    comparisonContract: "native-public-fields-v2; integer votes exact; decimal tolerance 1e-8; importer source slugs; no database IDs",
  };
}

export async function calculateStagedIndicators(context: RuntimeContext, artifact: Row, state: string, year: number): Promise<Row[]> {
  if (![2016, 2020, 2024].includes(year)) throw new Error("Advisory indicator calculation is not supported for this year.");
  const native = record(artifact.native) ? artifact.native : {};
  const sources = array(artifact.sources);
  const partition = partitionReviewRowsForPromotion({
    currentRows: array(native.reviewRows) as CandidateNeutralReviewRow[],
    historicalRows: array(native.historicalReviewRows) as CandidateNeutralReviewRow[],
    electionYear: 2024,
    knownSourceIds: sources.map((row) => String(row.id ?? "")),
  });
  const review = partition.reviewRowsByYear.get(year) ?? [];
  let calculated;
  if (year === 2024) {
    const retained = new Map<string, string>();
    if (state === "WI") {
      for (const relative of ["data/wi-2024-audit-summary.json", "data/wi-2024-audit-selections.csv"]) {
        retained.set(relative, await readFile(await resolveReadableInsideRepo(context, relative), "utf8"));
      }
    }
    calculated = await analysisIndicatorsForNativeRows(state, review, async (relative) => {
      const value = retained.get(relative);
      if (value === undefined) throw new Error("Unregistered indicator context path.");
      return value;
    });
  } else calculated = calculateAnalysisIndicators(state, review);
  return calculated.map((row) => ({ ...row, electionYear: year }));
}

function indexRows(family: ProjectionFamily, rows: Row[], scope: ProjectionScope, staging: boolean) {
  const values = new Map<string, Row>();
  const tags = new Map<string, string>();
  const errors: string[] = [];
  rows.forEach((row, index) => {
    if (!record(row)) { errors.push(`row ${index} is not an object`); return; }
    const normalized = project(family, row, scope, staging, index);
    if (normalized.state !== scope.state.toUpperCase()) errors.push(`row ${index} state differs from scope`);
    if (!Number.isInteger(normalized.year)) errors.push(`row ${index} has no valid year`);
    const key = identity(family, normalized);
    if (!key) { errors.push(`row ${index} has no reporting identity`); return; }
    if (values.has(key)) errors.push(`duplicate identity ${key}`);
    else values.set(key, normalized);
    if (typeof row.jurisdictionTag === "string" && row.jurisdictionTag) tags.set(key, row.jurisdictionTag);
  });
  return { rows: values, errors, tags };
}

function project(family: ProjectionFamily, row: Row, scope: ProjectionScope, staging: boolean, index: number): Row {
  const base: Row = { state: text(row.state ?? row.stateCode) ?? scope.state.toUpperCase(), year: num(row.electionYear ?? row.year) ?? scope.year };
  const rawSourceId = text(row.sourceId ?? row.sourceSlug);
  const publicSource = (id: string | null) => staging && id && scope.sourceSlugs ? scope.sourceSlugs[id] ?? id : id;
  const sourceId = family === "historical" ? rawSourceId : publicSource(rawSourceId);
  if (family === "sources") {
    const year = staging ? nativeSourceDocumentIdentity(scope.state, 2024, { id: String(row.id ?? ""), ...(record(row.metadata) ? { metadata: row.metadata } : {}) }).sourceElectionYear : base.year;
    return { ...base, year, id: publicSource(text(row.id)), sourceUrl: text(row.sourceUrl), authority: text(row.authority), category: text(row.category), localArtifact: text(row.localArtifact), parser: text(row.parser), timestampBasis: text(row.timestampBasis), confidence: text(row.confidence), status: text(row.status) };
  }
  if (family === "results") {
    const votes = record(row.votes) ? Object.fromEntries(Object.entries(row.votes).sort(([a], [b]) => a.localeCompare(b)).map(([candidate, value]) => [candidate, num(value)])) : {};
    return { ...base, level: text(row.level) ?? "county", name: text(row.jurisdictionName), votes, totalVotes: num(row.totalVotes) ?? Object.values(votes).reduce<number>((sum, value) => sum + (value ?? 0), 0), sourceId };
  }
  if (family === "review") {
    return { ...base, level: text(row.level) ?? "local", name: text(row.county ?? row.jurisdictionName), localUnit: text(row.localUnit) ?? `review-row-${index + 1}`,
      demVotes: num(row.demVotes ?? row.harris ?? row.harrisVotes), repVotes: num(row.repVotes ?? row.trump ?? row.trumpVotes), totalVotes: num(row.totalVotes),
      demShare: num(row.demShare ?? row.harrisShare), repShare: num(row.repShare ?? row.trumpShare), demDropoff: num(row.demDropoff), repDropoff: num(row.repDropoff), sourceId,
      comparison: reviewComparison(row),
    };
  }
  if (family === "turnout") {
    const localUnit = text(row.localUnit) ?? `turnout-row-${index + 1}`;
    const name = staging ? [text(row.county), localUnit].filter(Boolean).join(" / ") : text(row.jurisdictionName);
    return { ...base, level: text(row.level) ?? "local", name, ballotsCast: num(row.ballotsCast), registeredVoters: num(row.registeredVoters), turnoutPct: num(row.turnoutPct),
      denominatorNote: staging ? text(row.registrationDenominatorTiming ?? row.denominatorType) ?? "Not recorded" : text(row.denominatorNote) ?? "Not recorded", warningRequired: Boolean(row.warningRequired), sourceId };
  }
  if (family === "historical") return { ...base, level: text(row.sourceLevel ?? row.level), name: text(row.jurisdictionName), localUnit: text(row.localUnit) ?? `historical-row-${index + 1}`,
    demVotes: num(row.demVotes), repVotes: num(row.repVotes), otherVotes: num(row.otherVotes), totalVotes: num(row.totalVotes), sourceId, rowMethod: text(row.rowMethod),
    sourceDocumentId: publicSource(text(row.sourceDocumentId) ?? sourceId) };
  return { ...base, level: text(row.level), name: text(row.jurisdictionName), type: text(row.type), label: text(row.label), severity: num(row.severity), summary: text(row.summary), detail: text(row.detail), metrics: record(row.metrics) ? row.metrics : {} };
}

function reviewComparison(row: Row): Row {
  const metrics = record(row.metrics) ? row.metrics : row;
  return Object.fromEntries(["comparisonContest", "comparisonDemCandidate", "comparisonRepCandidate", "comparisonDemVotes", "comparisonRepVotes", "comparisonOtherVotes", "comparisonSourceId", "coverageMode"].map((key) => [key, metrics[key] ?? null]));
}
function identity(family: ProjectionFamily, row: Row): string | null {
  if (family === "sources") return row.id ? `${row.state}|${row.id}` : null;
  if (!row.name) return null;
  return JSON.stringify([row.state, row.year, row.level, row.name, row.localUnit ?? null, family === "historical" ? row.sourceId : null, row.type ?? null, row.label ?? null]);
}
function equal(left: unknown, right: unknown): boolean {
  if (typeof left === "number" && typeof right === "number") return Number.isInteger(left) && Number.isInteger(right) ? left === right : Math.abs(left - right) <= 1e-8;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, i) => equal(item, right[i]));
  if (record(left) && record(right)) { const keys = Object.keys(left).sort(); return keys.join("\0") === Object.keys(right).sort().join("\0") && keys.every((key) => equal(left[key], right[key])); }
  return left === right;
}
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function record(value: unknown): value is Row { return value !== null && typeof value === "object" && !Array.isArray(value); }
function array(value: unknown): Row[] { return Array.isArray(value) ? value.filter(record) : []; }
function text(value: unknown): string | null { return typeof value === "string" && value.length ? value : null; }
function num(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
