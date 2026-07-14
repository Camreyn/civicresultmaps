import type {
  CountyDataConfidence,
  CountyWinner,
  NationalComparisonYear,
  NationalYearDataset,
} from "./national-county-comparison";
import type { SecurityIncidentSummary } from "./types";

export type SecurityElectionOverlayRow = {
  caveat: string | null;
  confidence: CountyDataConfidence;
  demCandidate: string;
  demMarginPct: number | null;
  demMarginVotes: number | null;
  demSharePct: number | null;
  demVotes: number | null;
  fips: string;
  jurisdictionTag: string;
  otherVotes: number | null;
  repCandidate: string;
  repSharePct: number | null;
  repVotes: number | null;
  sourceAuthority: string | null;
  sourceId: string;
  sourceUrl: string | null;
  state: string;
  totalVotes: number | null;
  winner: CountyWinner;
  year: NationalComparisonYear;
};

export type SecurityElectionOverlay = {
  dataSource: NationalYearDataset["source"];
  datasetCoverage: NationalYearDataset["coverage"];
  incidentCountyCount: number;
  matchedCountyCount: number;
  rows: SecurityElectionOverlayRow[];
  year: NationalComparisonYear;
};

export type SecurityElectionWinnerSummary = {
  candidate: string | null;
  marginPct: number | null;
  marginVotes: number | null;
  party: "Democratic" | "Republican" | "Tie" | "Unavailable";
  runnerUpCandidate: string | null;
  runnerUpVotes: number | null;
  winnerVotes: number | null;
};

function incidentCountyFips(row: SecurityIncidentSummary) {
  return row.reportingGrain === "county" && /^county:\d{5}$/.test(row.jurisdictionTag)
    ? row.jurisdictionTag.slice("county:".length)
    : null;
}

export function buildSecurityElectionOverlay(
  incidents: SecurityIncidentSummary[],
  dataset: NationalYearDataset,
): SecurityElectionOverlay {
  const incidentFips = new Set(
    incidents.map(incidentCountyFips).filter((fips): fips is string => Boolean(fips)),
  );
  const rows = dataset.snapshots
    .filter((row) => incidentFips.has(row.fips))
    .map((row) => ({
      caveat: row.snapshot.caveat,
      confidence: row.snapshot.confidence,
      demCandidate: row.snapshot.demCandidate,
      demMarginPct: row.snapshot.demMarginPct,
      demMarginVotes: row.snapshot.demMarginVotes,
      demSharePct: row.snapshot.demSharePct,
      demVotes: row.snapshot.demVotes,
      fips: row.fips,
      jurisdictionTag: row.jurisdictionTag,
      otherVotes: row.snapshot.otherVotes,
      repCandidate: row.snapshot.repCandidate,
      repSharePct: row.snapshot.repSharePct,
      repVotes: row.snapshot.repVotes,
      sourceAuthority: row.snapshot.sourceAuthority,
      sourceId: row.snapshot.sourceId,
      sourceUrl: row.snapshot.sourceUrl,
      state: row.state,
      totalVotes: row.snapshot.totalVotes,
      winner: row.snapshot.winner,
      year: row.snapshot.year,
    }))
    .sort((left, right) => left.state.localeCompare(right.state) || left.fips.localeCompare(right.fips));

  return {
    dataSource: dataset.source,
    datasetCoverage: dataset.coverage,
    incidentCountyCount: incidentFips.size,
    matchedCountyCount: rows.filter((row) => row.winner !== "unavailable").length,
    rows,
    year: dataset.year,
  };
}

export function summarizeSecurityElectionWinner(
  row: SecurityElectionOverlayRow,
): SecurityElectionWinnerSummary {
  const marginVotes = row.demMarginVotes == null ? null : Math.abs(row.demMarginVotes);
  const marginPct = row.demMarginPct == null ? null : Math.abs(row.demMarginPct);

  if (row.winner === "blue") {
    return {
      candidate: row.demCandidate,
      marginPct,
      marginVotes,
      party: "Democratic",
      runnerUpCandidate: row.repCandidate,
      runnerUpVotes: row.repVotes,
      winnerVotes: row.demVotes,
    };
  }
  if (row.winner === "red") {
    return {
      candidate: row.repCandidate,
      marginPct,
      marginVotes,
      party: "Republican",
      runnerUpCandidate: row.demCandidate,
      runnerUpVotes: row.demVotes,
      winnerVotes: row.repVotes,
    };
  }
  if (row.winner === "tie") {
    return {
      candidate: null,
      marginPct,
      marginVotes,
      party: "Tie",
      runnerUpCandidate: null,
      runnerUpVotes: row.repVotes,
      winnerVotes: row.demVotes,
    };
  }
  return {
    candidate: null,
    marginPct: null,
    marginVotes: null,
    party: "Unavailable",
    runnerUpCandidate: null,
    runnerUpVotes: null,
    winnerVotes: null,
  };
}

function formatNumber(value: number | null) {
  return value == null ? "not available" : value.toLocaleString("en-US");
}

export function securityElectionResultText(row: SecurityElectionOverlayRow) {
  const result = summarizeSecurityElectionWinner(row);
  if (result.party === "Unavailable") {
    return "No joined 2024 presidential county result";
  }
  if (result.party === "Tie") {
    return `2024 presidential result tied at ${formatNumber(result.winnerVotes)} votes per major-party candidate`;
  }
  const margin = result.marginPct == null
    ? `${formatNumber(result.marginVotes)} votes`
    : `${formatNumber(result.marginVotes)} votes (${result.marginPct.toFixed(2)} percentage points)`;
  return `${result.candidate} won for the ${result.party} Party with ${formatNumber(result.winnerVotes)} votes; margin ${margin}`;
}
