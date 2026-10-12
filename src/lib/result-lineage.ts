export type CandidateLineageRow = {
  candidate: string; votes: number; sourceId: string; sourceUrl: string; authority: string;
  importRunId: string | null; importStatus: string | null; importSummary: Record<string, unknown> | null;
  sourceMetadata: Record<string, unknown> | null; locator: Record<string, unknown> | null;
  jurisdictionTag?: string | null;
};
function object(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function importedSourceDigest(row: CandidateLineageRow) {
  const artifacts = object(object(row.importSummary?.lineageManifest)?.sourceArtifacts)?.["tx-2024-official-county-results"];
  return Array.isArray(artifacts) ? artifacts.map(object).find((item) => hash(item?.sha256))?.sha256 : undefined;
}
/** Inspect the exact imported revision, not the last item in an unordered revision catalog. */
export function retainedRevisionForLineage<T extends { sha256: string; url: string; contentType: string; completeness: string }>(rows: CandidateLineageRow[], revisions: T[]): T | undefined {
  const digests = new Set(rows.map(importedSourceDigest));
  if (digests.size !== 1) return undefined;
  const digest = [...digests][0];
  return revisions.find((revision) => revision.sha256 === digest && revision.url === "https://results.texas-election.com/static/data/election/49664/1012/County.json" && revision.contentType === "application/json" && revision.completeness === "complete");
}
export function jsonPointer(document: unknown, pointer: string): unknown {
  if (!pointer.startsWith("/")) return undefined;
  return pointer.slice(1).split("/").reduce<unknown>((value, key) => object(value)?.[key.replaceAll("~1", "/").replaceAll("~0", "~")], document);
}
export function evaluateResultLineage(rows: CandidateLineageRow[], reviewedSourceDigests: string[], rawSource?: unknown) {
  return rows.map((row) => {
    const manifest = object(row.importSummary?.lineageManifest);
    const artifacts = object(manifest?.sourceArtifacts);
    const sourceArtifacts = artifacts?.["tx-2024-official-county-results"];
    const captured = Array.isArray(sourceArtifacts) ? sourceArtifacts.map(object).find((item) => hash(item?.sha256)) : null;
    const observedArtifacts = row.sourceMetadata?.artifacts;
    const stored = Array.isArray(observedArtifacts) ? observedArtifacts.map(object).find((item) => item?.sha256 === captured?.sha256) : null;
    const groups = object(row.locator?.candidateContributions);
    const contributions = groups?.[row.candidate];
    const parts = Array.isArray(contributions) ? contributions.map(object).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
    const aggregationMatches = Array.isArray(contributions) && parts.every((item) => typeof item.votes === "number" && Number.isInteger(item.votes) && item.votes >= 0 && typeof item.pointer === "string" && item.pointer.startsWith("/"))
      && parts.reduce((sum, item) => sum + Number(item.votes), 0) === row.votes;
    const sameDigest = Boolean(captured && stored && captured.sha256 === stored.sha256);
    const sourceReviewed = hash(captured?.sha256) && reviewedSourceDigests.includes(captured.sha256);
    const canonical = row.jurisdictionTag?.match(/^county:(48\d{3})$/)?.[1];
    const officialSource = ["tx-2024-official-county-results", "tx-2024-tx-2024-official-county-results"].includes(row.sourceId)
      && row.sourceUrl === "https://results.texas-election.com/static/data/election/49664/1012/County.json";
    const prefix = canonical ? `/${canonical}/Races/1001` : "";
    const sourceCandidates = object(jsonPointer(rawSource, `${prefix}/C`));
    const expectedPointers = sourceCandidates ? Object.entries(sourceCandidates).filter(([_id, value]) => {
      const party = String(object(value)?.P ?? "").trim().toUpperCase();
      return (party === "DEM" ? "Harris" : party === "REP" ? "Trump" : "Other") === row.candidate;
    }).map(([id]) => `${prefix}/C/${id}/V`).sort() : [];
    const rawSourceMatches = Boolean(officialSource && ["Harris", "Trump", "Other"].includes(row.candidate) && canonical
      && row.locator?.format === "texasCountyJson" && row.locator?.bucket === row.candidate
      && row.locator?.countyFips === canonical && row.locator?.raceId === "1001"
      && row.locator?.totalPointer === `${prefix}/T` && sourceCandidates
      && JSON.stringify(parts.map((item) => item.pointer).sort()) === JSON.stringify(expectedPointers)
      && parts.every((item) => Number(jsonPointer(rawSource, String(item.pointer))) === item.votes)
      && Number(jsonPointer(rawSource, `${prefix}/T`)) === Object.values(sourceCandidates).reduce<number>((sum, value) => sum + Number(object(value)?.V ?? 0), 0));
    const recorded = Boolean(row.importRunId && row.importStatus === "promoted" && manifest?.schemaVersion === 1 && manifest.parser === "nativeTexasCountyJsonVtdReview" && hash(manifest.stagingSha256) && hash(manifest.parserCodeSha256) && hash(manifest.configCanonicalSha256));
    return {
      candidate: row.candidate, votes: row.votes,
      source: { id: row.sourceId, url: row.sourceUrl, authority: row.authority, sha256: hash(captured?.sha256) ? captured.sha256 : null, reviewStatus: sourceReviewed ? "reviewed_revision" : "review_not_established" },
      import: { id: row.importRunId, status: row.importStatus, stagingSha256: hash(manifest?.stagingSha256) ? manifest.stagingSha256 : null, parser: typeof manifest?.parser === "string" ? manifest.parser : null, parserCodeSha256: hash(manifest?.parserCodeSha256) ? manifest.parserCodeSha256 : null, configCanonicalSha256: hash(manifest?.configCanonicalSha256) ? manifest.configCanonicalSha256 : null },
      locator: row.locator ? { format: row.locator.format, countyFips: row.locator.countyFips, raceId: row.locator.raceId, totalPointer: row.locator.totalPointer, contributions: parts.map((item) => ({ pointer: item.pointer, sourceName: item.sourceName, party: item.party, votes: item.votes })) } : null,
      checks: { officialSource, sourceDigestMatches: sameDigest, sourceReviewed, aggregationMatches, rawSourceMatches, importManifestRecorded: recorded, display: "not_checked" },
      status: sourceReviewed && sameDigest && recorded && aggregationMatches && rawSourceMatches ? "source_and_import_matched" : "incomplete",
    };
  });
}
