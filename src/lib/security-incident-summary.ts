import type {
  SecurityAffectedLocationUnit,
  SecurityAffectedLocationUnitTotal,
  SecurityIncidentSummary,
  SecurityIncidentTotals,
  SecurityThreatCountBasis,
} from "./types";

export const securityCountExplanation =
  "Reported threats are not the same thing as disrupted places: one email can name several locations, and sources may count polling locations, precincts, or election offices differently. This report shows each number with its source unit, keeps unlike units separate, and says when an exact county count was not published.";

const affectedLocationLabels: Record<SecurityAffectedLocationUnit, { plural: string; singular: string }> = {
  election_office: { plural: "election offices", singular: "election office" },
  polling_location: { plural: "polling locations", singular: "polling location" },
  voting_precinct: { plural: "voting precincts", singular: "voting precinct" },
};

const threatCountBasisLabels: Record<SecurityThreatCountBasis, string> = {
  official_county_record: "Threat count source: official county record",
  supplemental_national_compilation: "Threat count source: supplemental nationwide compilation",
  not_separately_published: "Threat count source: exact county count not separately published",
};

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return value === 1 ? singular : pluralForm;
}

export function summarizeSecurityIncidents(rows: SecurityIncidentSummary[]): SecurityIncidentTotals {
  const affectedRowsByUnit = new Map<SecurityAffectedLocationUnit, SecurityIncidentSummary[]>();
  for (const row of rows) {
    const unitRows = affectedRowsByUnit.get(row.affectedLocationUnit);
    if (unitRows) unitRows.push(row);
    else affectedRowsByUnit.set(row.affectedLocationUnit, [row]);
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
  const officialRowCount = rows.filter((row) => row.sourceTier === "official").length;
  const supplementalRowCount = rows.length - officialRowCount;
  const unknownThreatCountRows = rows.filter((row) => row.threatCount === null).length;

  return {
    affectedLocationCountComplete,
    affectedLocationUnits,
    affectedLocations: affectedLocationCountComplete ? comparableUnit?.documentedCount ?? null : null,
    countyCount: new Set(rows.map((row) => row.jurisdictionTag)).size,
    documentedThreatCount: threatCountComplete ? knownThreatCount : null,
    knownAffectedLocations: comparableUnit?.knownCount ?? null,
    knownThreatCount,
    officialRowCount,
    rowCount: rows.length,
    stateCount: new Set(rows.map((row) => row.state)).size,
    supplementalRowCount,
    threatCountComplete,
    unknownThreatCountRows,
  };
}

export function affectedLocationUnitLabel(unit: SecurityAffectedLocationUnit, count = 2) {
  const labels = affectedLocationLabels[unit];
  return count === 1 ? labels.singular : labels.plural;
}

export function threatCountBasisText(basis: SecurityThreatCountBasis) {
  return threatCountBasisLabels[basis];
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

  return "Number of affected polling locations, precincts, or election offices not specified";
}

export function threatCountText(totals: SecurityIncidentTotals) {
  if (totals.threatCountComplete && totals.documentedThreatCount !== null) {
    return `${totals.documentedThreatCount.toLocaleString()} reported ${plural(totals.documentedThreatCount, "threat")} documented`;
  }

  if (totals.knownThreatCount > 0) {
    return `At least ${totals.knownThreatCount.toLocaleString()} reported ${plural(totals.knownThreatCount, "threat")}; exact count not published for ${totals.unknownThreatCountRows.toLocaleString()} mapped county ${plural(totals.unknownThreatCountRows, "row")}`;
  }

  return "Exact threat count not published for this mapped county";
}

export function securityIncidentSummaryText(rows: SecurityIncidentSummary[]) {
  const totals = summarizeSecurityIncidents(rows);
  if (!totals.rowCount) {
    return "No loaded county record";
  }

  const sourceText = totals.supplementalRowCount
    ? `${totals.officialRowCount.toLocaleString()} official and ${totals.supplementalRowCount.toLocaleString()} supplemental ${plural(totals.rowCount, "record")}`
    : `${totals.officialRowCount.toLocaleString()} official ${plural(totals.officialRowCount, "record")}`;
  return `${sourceText}; ${affectedLocationText(totals)}; ${threatCountText(totals).toLowerCase()}`;
}
