import releaseCatalog from "../../data/national-data-releases.json" with { type: "json" };
import { currentNationalReleaseId, publicApiSchemaVersion } from "./api-version";

export type ReleaseProduct =
  | "national_county_results"
  | "historical_presidential_results"
  | "election_equipment"
  | "election_security_incidents";

export type ReleaseCoverageHighlight = {
  label: string;
  value: string;
};

type ReleaseBase<TProduct extends ReleaseProduct, TCoverage> = {
  id: string;
  title: string;
  summary: string;
  product: TProduct;
  publishedAt: string;
  status: "available" | "current" | "superseded";
  electionYears: number[];
  dataSha256: string;
  archivePath: string;
  archiveSha256: string;
  coverage: TCoverage;
  coverageHighlights: ReleaseCoverageHighlight[];
  changes: string[];
  knownLimitations: string[];
  requiredEntries: string[];
  sourceArtifacts: string[];
  primaryDataEntry?: string;
  buildRecipe?: string;
};

export type NationalCountyDataRelease = ReleaseBase<
  "national_county_results",
  {
    registryCountyEquivalents: number;
    matchedCountyRowsByYear: Record<string, number>;
    unavailableCountyEquivalents: number;
    unavailableStates: string[];
    intentionalNonGeographicRows: Record<string, number>;
  }
> & {
  geographyContract: string;
  geographyVintage: string;
  geographyVintageYear: number;
  historicalGeographyPolicy: string;
  comparisonSummary: Record<
    string,
    { blueToRed: number; matched: number; noFlip: number; redToBlue: number }
  >;
};

export type HistoricalPresidentialDataRelease = ReleaseBase<
  "historical_presidential_results",
  {
    electionYear: number;
    rowCount: number;
    statesRepresented: number;
    canonicalCountyTaggedRows: number;
    untaggedOrNoncanonicalRows: number;
    sourceFiles: number;
    coverageStatus: string;
  }
>;

export type EquipmentDataRelease = ReleaseBase<
  "election_equipment",
  {
    electionYear: number;
    rowCount: number;
    statesRepresented: number;
    sourceFiles: number;
    detailedDossierCatalogIncluded: boolean;
  }
>;

export type SecurityIncidentDataRelease = ReleaseBase<
  "election_security_incidents",
  {
    electionYear: number;
    rowCount: number;
    statesRepresented: number;
    countyRows: number;
    statewideUnspecifiedRows: number;
    statewideUnspecifiedThreatCount: number;
    knownThreatCountMinimum: number;
    nonBombThreatRows: number;
  }
>;

export type NationalDataRelease =
  | EquipmentDataRelease
  | HistoricalPresidentialDataRelease
  | NationalCountyDataRelease
  | SecurityIncidentDataRelease;

const typedReleaseCatalog = releaseCatalog as unknown as {
  currentReleaseId: string;
  releases: NationalDataRelease[];
  schemaVersion: string;
};

export function listNationalDataReleases(): NationalDataRelease[] {
  return [...typedReleaseCatalog.releases].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt)
    || left.title.localeCompare(right.title)
  );
}

export function getNationalDataRelease(releaseId: string) {
  return listNationalDataReleases().find((release) => release.id === releaseId) ?? null;
}

export function getCurrentNationalDataRelease(): NationalCountyDataRelease | null {
  const release = getNationalDataRelease(currentNationalReleaseId);
  return release?.product === "national_county_results" ? release : null;
}

export function nationalReleaseMeta(releaseId = currentNationalReleaseId) {
  return {
    apiSchemaVersion: publicApiSchemaVersion,
    releaseId,
    releaseCatalog: "/api/releases",
    openApi: "/api/openapi",
  };
}
