import rawDataset from "../../data/district-compactness/district-compactness.json";

export type DistrictGeographyType = "congressional" | "state_upper" | "state_lower";
export type DistrictResolutionStability = "stable" | "resolution_sensitive";
export type DistrictCompactnessSort =
  | "polsby_asc"
  | "polsby_desc"
  | "hull_asc"
  | "resolution_difference_desc"
  | "state_asc";

export type DistrictCompactnessRow = {
  advisoryOnly: true;
  areaSquareKilometers: number;
  censusAreaRelativeDifference: number;
  censusAreaSquareKilometers: number;
  chamberLabel: string;
  convexHullRatio: number;
  districtCode: string;
  generalizedConvexHullRatio: number;
  generalizedPolsbyPopper: number;
  generalizedVertexCount: number;
  geoid: string;
  geographyType: DistrictGeographyType;
  holeCount: number;
  name: string;
  partCount: number;
  perimeterKilometers: number;
  planEffectiveDate: string;
  planYear: number;
  polsbyPopper: number;
  relativeCompactnessBand: "lower_decile" | "lower_quartile" | "middle_or_higher";
  relativeCompactnessPercentile: number;
  resolutionConvexHullRelativeDifference: number;
  resolutionPolsbyRelativeDifference: number;
  resolutionStability: DistrictResolutionStability;
  sourceAuthority: string;
  stateCode: string;
  stateFips: string;
  stateName: string;
  vertexCount: number;
};

type DistrictCompactnessDataset = {
  generatedAt: string;
  methodology: Record<string, string>;
  plan: {
    congressionalPlan: string;
    effectiveDate: string;
    electionCycle: number;
    stateLegislativePlan: string;
  };
  resultRelationship: {
    reason: string;
    status: "not_calculated";
  };
  rows: DistrictCompactnessRow[];
  schemaVersion: string;
  sources: Array<{
    authority: string;
    featureCount: number;
    geographyType: DistrictGeographyType;
    resolution: "detailed" | "generalized_500k";
    sourcePageUrl: string;
  }>;
};

export type DistrictCompactnessQuery = {
  geographyType?: DistrictGeographyType;
  limit?: number;
  offset?: number;
  query?: string;
  resolutionStability?: DistrictResolutionStability;
  sort?: DistrictCompactnessSort;
  stateCode?: string;
};

const dataset = rawDataset as unknown as DistrictCompactnessDataset;

function compareRows(sort: DistrictCompactnessSort) {
  return (left: DistrictCompactnessRow, right: DistrictCompactnessRow) => {
    if (sort === "polsby_desc") return right.polsbyPopper - left.polsbyPopper || left.geoid.localeCompare(right.geoid);
    if (sort === "hull_asc") return left.convexHullRatio - right.convexHullRatio || left.geoid.localeCompare(right.geoid);
    if (sort === "resolution_difference_desc") {
      return right.resolutionPolsbyRelativeDifference - left.resolutionPolsbyRelativeDifference
        || left.geoid.localeCompare(right.geoid);
    }
    if (sort === "state_asc") {
      return left.stateCode.localeCompare(right.stateCode)
        || left.geographyType.localeCompare(right.geographyType)
        || left.districtCode.localeCompare(right.districtCode, undefined, { numeric: true });
    }
    return left.polsbyPopper - right.polsbyPopper || left.geoid.localeCompare(right.geoid);
  };
}

export function getDistrictCompactnessDataset() {
  return dataset;
}

export function listDistrictCompactnessStateOptions() {
  return [...new Map(dataset.rows.map((row) => [row.stateCode, row.stateName])).entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function queryDistrictCompactness(options: DistrictCompactnessQuery = {}) {
  const normalizedQuery = options.query?.trim().toLocaleLowerCase() ?? "";
  const stateCode = options.stateCode?.toUpperCase();
  const limit = Math.min(500, Math.max(1, options.limit ?? 100));
  const offset = Math.max(0, options.offset ?? 0);
  const sort = options.sort ?? "polsby_asc";
  const filtered = dataset.rows.filter((row) => {
    if (stateCode && row.stateCode !== stateCode) return false;
    if (options.geographyType && row.geographyType !== options.geographyType) return false;
    if (options.resolutionStability && row.resolutionStability !== options.resolutionStability) return false;
    if (
      normalizedQuery
      && ![row.geoid, row.stateCode, row.stateName, row.districtCode, row.name]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
    ) return false;
    return true;
  }).sort(compareRows(sort));

  return {
    limit,
    offset,
    rows: filtered.slice(offset, offset + limit),
    sort,
    total: filtered.length,
  };
}
