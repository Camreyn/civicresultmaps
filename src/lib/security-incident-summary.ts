import type {
  SecurityAffectedLocationUnit,
  SecurityAffectedLocationUnitTotal,
  SecurityIncidentSummary,
  SecurityIncidentTotals,
} from "./types";

export const securityCountExplanation =
  "Official sources may use different units, such as polling locations or voting precincts. This report keeps those counts separate instead of treating them as interchangeable. The sources also do not say how many separate threat messages were received; one message can name multiple places.";

const affectedLocationLabels: Record<SecurityAffectedLocationUnit, { plural: string; singular: string }> = {
  polling_location: { plural: "polling locations", singular: "polling location" },
  voting_precinct: { plural: "voting precincts", singular: "voting precinct" },
};

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return value === 1 ? singular : pluralForm;
}

export function summarizeSecurityIncidents(rows: SecurityIncidentSummary[]): SecurityIncidentTotals {
  const affectedRowsByUnit = new Map<SecurityAffectedLocationUnit, SecurityIncidentSummary[]>();
  for (const row of rows) {
    affectedRowsByUnit.set(
      row.affectedLocationUnit,
      [...(affectedRowsByUnit.get(row.affectedLocationUnit) ?? []), row],
    );
  }

  const affectedLocationUnits: SecurityAffectedLocationUnitTotal[] = Array.from(affectedRowsByUnit.entries())
    .map(([unit, unitRows]) => {
      const countComplete = unitRows.every((row) => row.affectedLocations !== null);
      const knownCount = unitRows.reduce((sum, row) => sum + (row.affectedLocations ?? 0), 0);
      return {
        countComplete,
        documentedCount: countComplete ? knownCount : null,
        knownCount,
        unit,
      };
    })
    .sort((left, right) => left.unit.localeCompare(right.unit));
  const comparableUnit = affectedLocationUnits.length === 1 ? affectedLocationUnits[0] : null;
  const affectedLocationCountComplete = Boolean(comparableUnit?.countComplete);
  const threatCountComplete = rows.length > 0 && rows.every((row) => row.threatCount !== null);
  const knownThreatCount = rows.reduce((sum, row) => sum + (row.threatCount ?? 0), 0);

  return {
    affectedLocationCountComplete,
    affectedLocationUnits,
    affectedLocations: affectedLocationCountComplete ? comparableUnit?.documentedCount ?? null : null,
    countyCount: new Set(rows.map((row) => row.jurisdictionTag)).size,
    documentedThreatCount: threatCountComplete ? knownThreatCount : null,
    knownAffectedLocations: comparableUnit?.knownCount ?? null,
    knownThreatCount,
    rowCount: rows.length,
    stateCount: new Set(rows.map((row) => row.state)).size,
    threatCountComplete,
  };
}

export function affectedLocationUnitLabel(unit: SecurityAffectedLocationUnit, count = 2) {
  const labels = affectedLocationLabels[unit];
  return count === 1 ? labels.singular : labels.plural;
}

function affectedLocationUnitText(total: SecurityAffectedLocationUnitTotal) {
  if (total.countComplete && total.documentedCount !== null) {
    return `${total.documentedCount.toLocaleString()} ${affectedLocationUnitLabel(total.unit, total.documentedCount)} affected`;
  }

  if (total.knownCount > 0) {
    return `At least ${total.knownCount.toLocaleString()} known ${affectedLocationUnitLabel(total.unit, total.knownCount)} affected`;
  }

  return `Number of affected ${affectedLocationUnitLabel(total.unit)} not specified`;
}

export function affectedLocationText(totals: SecurityIncidentTotals) {
  if (totals.affectedLocationUnits.length) {
    return totals.affectedLocationUnits.map(affectedLocationUnitText).join("; ");
  }

  return "Number of affected polling locations or voting precincts not specified";
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
