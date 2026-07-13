import incidentRegistry from "../../data/election-security-incidents-2024.json";
import type { SecurityIncidentSummary } from "./types";

type SecurityIncidentQuery = {
  limit?: number;
  state: string;
  year: number;
};

export async function listSecurityIncidents({ limit = 5000, state, year }: SecurityIncidentQuery) {
  const requestedState = state.toUpperCase();
  const boundedLimit = Math.min(Math.max(limit, 1), 5000);

  return (incidentRegistry.incidentRows as SecurityIncidentSummary[])
    .filter((row) => row.state === requestedState && row.electionYear === year)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.county.localeCompare(b.county))
    .slice(0, boundedLimit);
}
