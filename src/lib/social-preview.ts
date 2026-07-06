import { listCompletenessReport, listResults, listStates } from "./api";

export const socialPreviewYear = 2024;
export const socialPreviewSiteUrl = "https://www.civicresultmaps.org";
export const socialPreviewCaveat =
  "Advisory indicators are review prompts for source reconciliation, not findings of fraud or misconduct.";

type PreviewMetric = {
  label: string;
  value: string;
};

export type StateSocialPreview = {
  advisoryCaveat: string;
  description: string;
  imageAlt: string;
  imagePath: string;
  metrics: PreviewMetric[];
  stateCode: string;
  stateName: string;
  title: string;
  urlPath: string;
  year: number;
};

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function metric(label: string, value: number): PreviewMetric {
  return { label, value: formatNumber(value) };
}

function selectedResultRows(rowsByLevel: Awaited<ReturnType<typeof listResults>>[]) {
  return rowsByLevel.find((rows) => rows.length > 0) ?? [];
}

export async function buildStateSocialPreview(input: {
  state?: string;
  year?: number;
}): Promise<StateSocialPreview> {
  const stateCode = (input.state ?? "").slice(0, 2).toUpperCase();
  const year = input.year ?? socialPreviewYear;
  const [states, completenessReport, countyResults, cityResults, cityTownResults, townResults, stateResults] = await Promise.all([
    listStates(),
    listCompletenessReport({ year }),
    listResults({ state: stateCode, year, level: "county" }),
    listResults({ state: stateCode, year, level: "city" }),
    listResults({ state: stateCode, year, level: "city_town" }),
    listResults({ state: stateCode, year, level: "town" }),
    listResults({ state: stateCode, year, level: "state" }),
  ]);
  const selectedState = states.find((state) => state.code === stateCode);
  const completeness = completenessReport.find((state) => state.state === stateCode);

  if (!selectedState) {
    return {
      advisoryCaveat: socialPreviewCaveat,
      description:
        "Explore official election result maps, source provenance, turnout context, historical baselines, and advisory review prompts.",
      imageAlt: "Civic Result Maps public election data preview",
      imagePath: `/api/social-card?year=${year}`,
      metrics: [
        metric("Loaded states", completenessReport.length),
        metric("Source records", completenessReport.reduce((sum, state) => sum + state.sourceCount, 0)),
        metric("Advisory flags", completenessReport.reduce((sum, state) => sum + state.indicatorCount, 0)),
      ],
      stateCode: "US",
      stateName: "Civic Result Maps",
      title: "Civic Result Maps Data Preview",
      urlPath: "/",
      year,
    };
  }

  const rows = selectedResultRows([countyResults, cityResults, cityTownResults, townResults, stateResults]);
  const totalVotes = rows.reduce((sum, row) => sum + row.totalVotes, 0);
  const resultRows = completeness?.resultRows ?? rows.length;
  const resultJurisdictions = completeness?.resultJurisdictions ?? new Set(rows.map((row) => row.jurisdictionCode)).size;
  const sourceCount = completeness?.sourceCount ?? 0;
  const reviewRowCount = completeness?.reviewRowCount ?? 0;
  const turnoutRowCount = completeness?.turnoutRowCount ?? 0;
  const historicalRowCount = completeness?.historicalRowCount ?? 0;
  const indicatorCount = completeness?.indicatorCount ?? 0;
  const flaggedAreas = completeness?.flaggedAreas ?? completeness?.flaggedJurisdictions ?? 0;

  const descriptionParts = [
    `${formatNumber(resultRows)} result rows`,
    `${formatNumber(resultJurisdictions)} jurisdictions`,
    `${formatNumber(sourceCount)} source records`,
    `${formatNumber(indicatorCount)} advisory indicators`,
  ];

  return {
    advisoryCaveat: socialPreviewCaveat,
    description: `${selectedState.name} ${year} president data preview: ${descriptionParts.join(", ")}. ${socialPreviewCaveat}`,
    imageAlt: `${selectedState.name} ${year} election data preview from Civic Result Maps`,
    imagePath: `/api/social-card?state=${stateCode}&year=${year}`,
    metrics: [
      metric("Total votes", totalVotes),
      metric("Result rows", resultRows),
      metric("Sources", sourceCount),
      metric("Review rows", reviewRowCount),
      metric("Turnout rows", turnoutRowCount),
      metric("Historical rows", historicalRowCount),
      metric("Advisory flags", indicatorCount),
      metric("Flagged areas", flaggedAreas),
    ],
    stateCode,
    stateName: selectedState.name,
    title: `${selectedState.name} ${year} President Data Preview`,
    urlPath: `/?state=${stateCode}`,
    year,
  };
}
