import type { EquipmentRowSummary, ResultRow, SecurityIncidentSummary, VoteMethodRowSummary } from "./types";
import type { WorkspaceMapMode } from "./workspace-navigation";

export type GeoFeature = {
  geometry: {
    coordinates: unknown;
    type: "Polygon" | "MultiPolygon";
  };
  properties: {
    BASENAME?: string;
    GEOID?: string;
    NAME?: string;
    equipmentGroupLabel?: string;
    jurisdictionName?: string;
    county_name?: string;
    [key: string]: unknown;
  };
};

export function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bSaint\b/gi, "St")
    .replace(/\bMore\b.*$/i, "")
    .replace(/Â»/g, "")
    .replace(/\s+(County|Parish|Planning Region)$/i, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toUpperCase();
}

export function isDemocraticWinner(winner: string) {
  return ["Harris", "Biden", "Clinton", "Obama"].includes(winner);
}

export function isRepublicanWinner(winner: string) {
  return ["Trump", "Romney"].includes(winner);
}

export function featureName(feature: Pick<GeoFeature, "properties">) {
  return feature.properties.jurisdictionName ?? feature.properties.NAME ?? feature.properties.county_name ?? feature.properties.BASENAME ?? "";
}

export function featureJurisdictionTag(feature: Pick<GeoFeature, "properties">) {
  const p = feature.properties;
  // Alaska legislative districts can have the same five digits as a real borough.
  if (p.SLDL != null || p.SLDU != null || p.SLDLST != null || p.SLDUST != null) return null;
  const geoid = p.GEOID ?? (p.sourceGranularity === "county" && typeof p.STATE === "string" && /^\d{2}$/.test(p.STATE)
    && typeof p.COUNTY === "string" && /^\d{3}$/.test(p.COUNTY) ? p.STATE + p.COUNTY : null);
  return typeof geoid === "string" && /^\d{5}$/.test(geoid) ? `county:${geoid}` : null;
}

export function resultNameForFeature(state: string, name: string) {
  if (state === "MS" && normalizeName(name) === "JEFFERSONDAVIS") {
    return "Jeff Davis County";
  }

  return name;
}

function mixColor(start: [number, number, number], end: [number, number, number], amount: number) {
  const t = clamp(amount, 0, 1);
  const [r1, g1, b1] = start;
  const [r2, g2, b2] = end;
  return `rgb(${Math.round(r1 + (r2 - r1) * t)}, ${Math.round(g1 + (g2 - g1) * t)}, ${Math.round(
    b1 + (b2 - b1) * t,
  )})`;
}

type VoteMethodAggregate = {
  method: string;
  methodLabel: string;
  reportedRows: number;
  totalVoters: number;
  unavailableRows: number;
  voters: number;
};

const equipmentPalette = [
  "#35c7a3",
  "#6fa6ea",
  "#f0c36a",
  "#e7896f",
  "#c58cff",
  "#8fd17f",
  "#d986c8",
  "#9ca3af",
];

export function methodShare(row: VoteMethodAggregate | undefined) {
  return row && row.totalVoters > 0 ? (row.voters / row.totalVoters) * 100 : null;
}

export function equipmentGroupLabel(row: EquipmentRowSummary | undefined) {
  if (!row) {
    return "No equipment row";
  }

  return [row.vendor || "Vendor not recorded", row.systemName || row.equipmentType || "System not recorded"].join(" - ");
}

export function equipmentFeatureGroupLabel(feature: Pick<GeoFeature, "properties"> | undefined) {
  const label = feature?.properties.equipmentGroupLabel;
  return typeof label === "string" && label.trim() ? label : "";
}

function stableHash(value: string) {
  return Array.from(value).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);
}

export function equipmentFill(row: EquipmentRowSummary | undefined, feature: Pick<GeoFeature, "properties"> | undefined) {
  const label = row ? equipmentGroupLabel(row) : equipmentFeatureGroupLabel(feature);
  if (!label) {
    return "#2c302e";
  }

  return equipmentPalette[stableHash(label) % equipmentPalette.length];
}

function securityFill(rows: SecurityIncidentSummary[]) {
  if (rows.some((row) => row.sourceTier === "official")) return "#f97316";
  if (rows.some((row) => row.sourceStatus === "supplemental_earlier_compilation")) return "#c084fc";
  return rows.length ? "#fbbf24" : "#2c302e";
}

export function countyFill(
  row: ResultRow | undefined,
  mode: WorkspaceMapMode,
  maxTotalVotes: number,
  methodRow?: VoteMethodAggregate,
  equipmentRow?: EquipmentRowSummary,
  equipmentFeature?: Pick<GeoFeature, "properties">,
  maxMethodShare = 100,
  securityRows: SecurityIncidentSummary[] = [],
) {
  if (mode === "security") {
    return securityFill(securityRows);
  }

  if (mode === "equipment") {
    return equipmentFill(equipmentRow, equipmentFeature);
  }

  if (mode === "method") {
    const share = methodShare(methodRow);
    if (share === null) {
      return "#2c302e";
    }
    return mixColor([220, 252, 231], [13, 148, 136], share / Math.max(1, maxMethodShare));
  }

  if (!row) {
    return "#2c302e";
  }

  if (mode === "volume") {
    const intensity = Math.min(0.88, Math.max(0.18, row.totalVotes / Math.max(1, maxTotalVotes)));
    return `rgba(240, 195, 106, ${intensity})`;
  }

  const strength = mode === "margin" ? clamp(row.marginPct / 42, 0, 1) : clamp(row.marginPct / 60, 0, 1);

  if (isDemocraticWinner(row.winner)) {
    return mixColor([191, 219, 254], [29, 78, 216], strength);
  }

  if (isRepublicanWinner(row.winner)) {
    return mixColor([254, 202, 202], [220, 38, 38], strength);
  }

  return "#f0c36a";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function aggregateVoteMethod(voteMethodRows: VoteMethodRowSummary[], selectedVoteMethod: string) {
  const aggregates = new Map<string, VoteMethodAggregate>();
  for (const row of voteMethodRows) {
    if (row.method !== selectedVoteMethod) {
      continue;
    }
    const countyName = row.county || row.jurisdictionName;
    const key = normalizeName(countyName);
    const current = aggregates.get(key) ?? {
      method: row.method,
      methodLabel: row.methodLabel,
      reportedRows: 0,
      totalVoters: 0,
      unavailableRows: 0,
      voters: 0,
    };
    if (row.valueStatus === "reported" && row.voters !== null) {
      current.reportedRows += 1;
      current.voters += row.voters;
      current.totalVoters += row.totalVoters ?? 0;
    } else {
      current.unavailableRows += 1;
    }
    aggregates.set(key, current);
  }
  return aggregates;
}
