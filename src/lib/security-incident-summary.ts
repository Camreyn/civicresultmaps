import type { SecurityIncidentSummary, SecurityIncidentTotals } from "./types";

export const securityCountExplanation =
  "The source identifies how many polling places were affected. It does not say how many separate threat messages were received. One message can name several places, so these numbers are not interchangeable.";

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return value === 1 ? singular : pluralForm;
}

export function summarizeSecurityIncidents(rows: SecurityIncidentSummary[]): SecurityIncidentTotals {
  const affectedLocationCountComplete = rows.length > 0 && rows.every((row) => row.affectedLocations !== null);
  const threatCountComplete = rows.length > 0 && rows.every((row) => row.threatCount !== null);
  const knownAffectedLocations = rows.reduce((sum, row) => sum + (row.affectedLocations ?? 0), 0);
  const knownThreatCount = rows.reduce((sum, row) => sum + (row.threatCount ?? 0), 0);

  return {
    affectedLocationCountComplete,
    affectedLocations: affectedLocationCountComplete ? knownAffectedLocations : null,
    countyCount: new Set(rows.map((row) => row.jurisdictionTag)).size,
    documentedThreatCount: threatCountComplete ? knownThreatCount : null,
    knownAffectedLocations,
    knownThreatCount,
    rowCount: rows.length,
    stateCount: new Set(rows.map((row) => row.state)).size,
    threatCountComplete,
  };
}

export function affectedLocationText(totals: SecurityIncidentTotals) {
  if (totals.affectedLocationCountComplete && totals.affectedLocations !== null) {
    return `${totals.affectedLocations.toLocaleString()} ${plural(totals.affectedLocations, "polling place")} affected`;
  }

  if (totals.knownAffectedLocations > 0) {
    return `At least ${totals.knownAffectedLocations.toLocaleString()} known ${plural(totals.knownAffectedLocations, "polling place")} affected`;
  }

  return "Number of affected polling places not specified";
}

export function threatCountText(totals: SecurityIncidentTotals) {
  if (totals.threatCountComplete && totals.documentedThreatCount !== null) {
    return `${totals.documentedThreatCount.toLocaleString()} separate ${plural(totals.documentedThreatCount, "threat message")} documented`;
  }

  return "Separate threat messages not specified by the official source";
}

export function securityIncidentSummaryText(rows: SecurityIncidentSummary[]) {
  const totals = summarizeSecurityIncidents(rows);
  if (!totals.rowCount) {
    return "No loaded official county record";
  }

  return `${totals.rowCount.toLocaleString()} loaded official county ${plural(totals.rowCount, "record")}; ${affectedLocationText(totals)}; ${threatCountText(totals).toLowerCase()}`;
}
