import type { HistoricalResultRowSummary, ResultRow, ReviewRowSummary } from "./types";
import { candidateNamesForYear } from "./state-year-results.ts";
import type { SupportedPresidentialYear } from "./api-version";

export type VoteColor = "dem" | "rep" | "neutral";
export type CountyVote = { total: number; color: VoteColor; leadShare?: number; outcome: string; sourceId: string };
export type CountyVoteRace = {
  id: string;
  label: string;
  basis: "Result" | "County comparison";
  counties: Record<string, CountyVote | null>;
};

function count(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
}

function countyId(tag?: string | null) {
  return tag?.match(/^county:(\d{5})$/)?.[1];
}

// Other votes are a bucket, not a candidate. Don't declare a winner if that
// bucket could contain the leader or if candidate counts aren't available.
function partyOutcome(dem: number | null, rep: number | null, other: number, names: { dem: string; rep: string }) {
  if (!count(dem) || !count(rep) || other >= Math.max(dem, rep)) {
    return { color: "neutral" as const, outcome: "Winner unavailable" };
  }
  if (dem === rep) return { color: "neutral" as const, outcome: "Tie" };
  const leadShare = Math.max(dem, rep) / (dem + rep + other);
  return dem > rep ? { color: "dem" as const, leadShare, outcome: names.dem } : { color: "rep" as const, leadShare, outcome: names.rep };
}

export function buildCountyVoteRaces(
  state: string, year: SupportedPresidentialYear, results: ResultRow[],
  baselines: HistoricalResultRowSummary[], reviews: ReviewRowSummary[],
): CountyVoteRace[] {
  const races = new Map<string, CountyVoteRace>();
  function race(id: string, label: string, basis: CountyVoteRace["basis"]) {
    let item = races.get(id);
    if (!item) {
      item = { id, label, basis, counties: {} };
      races.set(id, item);
    }
    return item;
  }
  function put(item: CountyVoteRace, fips: string, vote: CountyVote | null) {
    // Competing observations aren't additive. Ambiguous counties stay flat.
    item.counties[fips] = fips in item.counties ? null : vote;
  }
  const names = candidateNamesForYear(year);
  const president = race("president", "President", "Result");
  for (const row of results) {
    const fips = countyId(row.jurisdictionTag);
    if (row.state !== state || row.year !== year || row.level !== "county" || row.resultStatus === "candidate_detail_suppressed" || !fips) continue;
    const office = row.office.trim().toLowerCase();
    if (!office) continue;
    const item = race(office, row.office.trim().replace(/[_-]+/g, " ").replace(/^./, c => c.toUpperCase()), "Result");
    const color = row.winnerParty === "dem" || (office === "president" && row.winner === names.dem) ? "dem"
      : row.winnerParty === "rep" || (office === "president" && row.winner === names.rep) ? "rep" : "neutral";
    put(item, fips, count(row.totalVotes) ? {
      total: row.totalVotes, color: row.totalVotes ? color : "neutral",
      leadShare: row.totalVotes > 0 && count(row.votes[row.winner]) ? row.votes[row.winner] / row.totalVotes : undefined,
      outcome: !row.totalVotes ? "No votes reported" : row.winner === "Other" ? "Winner unavailable" : row.winner || "Winner unavailable",
      sourceId: row.sourceId,
    } : null);
  }
  const nativePresidentCounties = new Set(Object.keys(president.counties));
  for (const row of baselines) {
    const fips = countyId(row.jurisdictionTag);
    if (row.state !== state || row.electionYear !== year || !fips || nativePresidentCounties.has(fips)) continue;
    if (!(["county", "county_equivalent"].includes(row.sourceLevel) || (state === "VA" && row.sourceLevel === "locality"))) continue;
    const { demVotes: d, repVotes: r, otherVotes: o, totalVotes: reported } = row;
    const total = reported ?? (count(d) && count(r) && count(o) ? d + r + o : null);
    const valid = count(total) && [d, r, o].every(n => n === null || count(n))
      && (d ?? 0) + (r ?? 0) + (o ?? 0) <= total;
    put(president, fips, valid ? {
      total, ...(total === 0 ? { color: "neutral" as const, outcome: "No votes reported" }
        : partyOutcome(d, r, total - (d ?? 0) - (r ?? 0), names)),
      sourceId: row.sourceDocumentId && row.sourceDocumentId !== "database" ? row.sourceDocumentId : row.sourceId,
    } : null);
  }
  for (const row of reviews) {
    const fips = countyId(row.jurisdictionTag);
    if (row.state !== state || row.electionYear !== year || !fips) continue;
    // Native county summaries may have legacy level "local"; a county tag
    // alone just identifies the parent of a precinct and is not enough.
    if (row.level !== "county" && !(row.level === "local" &&
      (row.localUnit === row.jurisdictionName || row.localUnit === "County total"))) continue;
    const m = row.metrics;
    const label = typeof m.comparisonContest === "string" ? m.comparisonContest.trim() : "";
    // District/different-seat comparisons aren't one statewide contest.
    if (!label || !/^presidentVs(?:US)?(?:Senate|Governor|AttorneyGeneral)(?:County)?$/i.test(String(m.coverageMode))) continue;
    const d = m.comparisonDemVotes, r = m.comparisonRepVotes, o = m.comparisonOtherVotes;
    if (!count(d) || !count(r) || !count(o) || d + r + o === 0) continue;
    const item = race("comparison:" + label, label, "County comparison");
    put(item, fips, {
      total: d + r + o, ...partyOutcome(d, r, o, {
        dem: String(m.comparisonDemCandidate || "Democratic lead"),
        rep: String(m.comparisonRepCandidate || "Republican lead"),
      }), sourceId: typeof m.comparisonSourceId === "string" && m.comparisonSourceId || row.sourceId,
    });
  }
  return Array.from(races.values()).sort((a, b) =>
    Number(b.id === "president") - Number(a.id === "president") || a.label.localeCompare(b.label));
}
