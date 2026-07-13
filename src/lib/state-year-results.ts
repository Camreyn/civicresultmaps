import type { HistoricalResultRowSummary, ResultRow } from "./types";
import type { SupportedPresidentialYear } from "./api-version";

const candidateNames: Record<SupportedPresidentialYear, { dem: string; rep: string }> = {
  2016: { dem: "Clinton", rep: "Trump" },
  2020: { dem: "Biden", rep: "Trump" },
  2024: { dem: "Harris", rep: "Trump" },
};

export function candidateNamesForYear(year: SupportedPresidentialYear) {
  return candidateNames[year];
}

export function historicalCountyRowsToResults(
  rows: HistoricalResultRowSummary[],
  year: Exclude<SupportedPresidentialYear, 2024>,
): ResultRow[] {
  const candidates = candidateNamesForYear(year);
  return rows
    .filter((row) => row.electionYear === year && /^county:\d{5}$/.test(row.jurisdictionTag ?? ""))
    .map((row) => {
      const demVotes = Number(row.demVotes ?? 0);
      const repVotes = Number(row.repVotes ?? 0);
      const otherVotes = Number(row.otherVotes ?? Math.max(Number(row.totalVotes ?? 0) - demVotes - repVotes, 0));
      const totalVotes = Number(row.totalVotes ?? demVotes + repVotes + otherVotes);
      const winner = demVotes > repVotes ? candidates.dem : repVotes > demVotes ? candidates.rep : "Tie";
      const marginVotes = Math.abs(demVotes - repVotes);
      return {
        state: row.state,
        year,
        office: "president",
        level: "county",
        jurisdictionCode: row.jurisdictionCode,
        jurisdictionName: row.jurisdictionName,
        jurisdictionTag: row.jurisdictionTag,
        votes: {
          [candidates.dem]: demVotes,
          [candidates.rep]: repVotes,
          Other: otherVotes,
        },
        totalVotes,
        marginVotes,
        marginPct: totalVotes > 0 ? Number(((marginVotes / totalVotes) * 100).toFixed(2)) : 0,
        winner,
        sourceId: row.sourceDocumentId || row.sourceId,
      } satisfies ResultRow;
    })
    .sort((left, right) => left.jurisdictionName.localeCompare(right.jurisdictionName));
}
