import incidentRegistry from "../../data/election-security-incidents-2024.json";
import sourceInventory from "../../data/election-security-incident-source-inventory-2024.json";
import { summarizeSecurityIncidents } from "./security-incident-summary";
import type {
  NationalSecurityIncidentReport,
  SecurityIncidentCoverageState,
  SecurityIncidentNationalContext,
  SecurityIncidentStateSummary,
  SecurityIncidentSummary,
} from "./types";

type SecurityIncidentQuery = {
  limit?: number;
  state?: string;
  year: number;
};

const registryRows = incidentRegistry.incidentRows as SecurityIncidentSummary[];

function sortedRows(rows: SecurityIncidentSummary[]) {
  return [...rows].sort(
    (a, b) =>
      a.state.localeCompare(b.state)
      || a.eventDate.localeCompare(b.eventDate)
      || a.county.localeCompare(b.county),
  );
}

export async function listSecurityIncidents({ limit = 5000, state, year }: SecurityIncidentQuery) {
  const requestedState = state?.toUpperCase();
  const boundedLimit = Math.min(Math.max(limit, 1), 5000);

  return sortedRows(
    registryRows.filter(
      (row) => row.electionYear === year && (!requestedState || row.state === requestedState),
    ),
  ).slice(0, boundedLimit);
}

export function listSecurityIncidentStateSummaries(year = 2024): SecurityIncidentStateSummary[] {
  const grouped = new Map<string, SecurityIncidentSummary[]>();
  for (const row of registryRows) {
    if (row.electionYear !== year) continue;
    const stateRows = grouped.get(row.state);
    if (stateRows) stateRows.push(row);
    else grouped.set(row.state, [row]);
  }

  return Array.from(grouped.entries())
    .map(([state, rows]) => ({
      ...summarizeSecurityIncidents(rows),
      state,
      stateName: rows[0]?.stateName ?? state,
    }))
    .sort((a, b) => a.state.localeCompare(b.state));
}

export function getNationalSecurityIncidentReport(year = 2024): NationalSecurityIncidentReport {
  const incidents = sortedRows(registryRows.filter((row) => row.electionYear === year));
  const inventory = sourceInventory as unknown as {
    caveat: string;
    electionYear: number;
    nationalContext: SecurityIncidentNationalContext[];
    stateCoverage: SecurityIncidentCoverageState[];
  };

  return {
    caveat: inventory.caveat,
    electionYear: year,
    incidents,
    nationalContext: inventory.electionYear === year ? inventory.nationalContext : [],
    stateCoverage: inventory.electionYear === year ? inventory.stateCoverage : [],
    stateSummaries: listSecurityIncidentStateSummaries(year),
    totals: summarizeSecurityIncidents(incidents),
  };
}
