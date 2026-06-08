import type {
  CoverageSummary,
  ElectionSummary,
  ImportRunSummary,
  ResultRow,
  SourceSummary,
  StateSummary,
} from "./types";

export const seedStates: StateSummary[] = [
  {
    code: "WI",
    name: "Wisconsin",
    authority: "Wisconsin Elections Commission",
    countyLabel: "County",
    capabilities: {
      sourcePlanner: true,
      certifiedResults: true,
      map: true,
      reviewGraphs: true,
      turnout: true,
      historicalBaseline: true,
      notes: "Legacy static project has full Wisconsin coverage and should be migrated first.",
    },
  },
  {
    code: "MN",
    name: "Minnesota",
    authority: "Minnesota Secretary of State",
    countyLabel: "County",
    capabilities: {
      sourcePlanner: true,
      certifiedResults: true,
      map: true,
      reviewGraphs: true,
      turnout: true,
      historicalBaseline: true,
      notes: "Useful second acceptance state because the source shape differs from Wisconsin.",
    },
  },
  {
    code: "WA",
    name: "Washington",
    authority: "Washington Secretary of State",
    countyLabel: "County",
    capabilities: {
      sourcePlanner: true,
      certifiedResults: true,
      map: true,
      reviewGraphs: true,
      turnout: true,
      historicalBaseline: false,
      notes: "Useful acceptance state for HTML and all-state precinct CSV import paths.",
    },
  },
];

export const seedElections: ElectionSummary[] = [
  {
    year: 2024,
    office: "president",
    electionDate: "2024-11-05",
    label: "2024 President",
    statesLoaded: seedStates.length,
  },
];

export const seedResults: ResultRow[] = [
  {
    state: "WI",
    year: 2024,
    office: "president",
    level: "county",
    jurisdictionCode: "WI-DANE",
    jurisdictionName: "Dane",
    votes: { Harris: 268412, Trump: 125283, Other: 7972 },
    totalVotes: 401667,
    marginVotes: 143129,
    marginPct: 35.64,
    winner: "Harris",
    sourceId: "wi-2024-county-president",
  },
  {
    state: "WI",
    year: 2024,
    office: "president",
    level: "county",
    jurisdictionCode: "WI-WAUKESHA",
    jurisdictionName: "Waukesha",
    votes: { Harris: 111251, Trump: 221059, Other: 6621 },
    totalVotes: 338931,
    marginVotes: 109808,
    marginPct: 32.4,
    winner: "Trump",
    sourceId: "wi-2024-county-president",
  },
  {
    state: "MN",
    year: 2024,
    office: "president",
    level: "county",
    jurisdictionCode: "MN-HENNEPIN",
    jurisdictionName: "Hennepin",
    votes: { Harris: 474091, Trump: 243133, Other: 18150 },
    totalVotes: 735374,
    marginVotes: 230958,
    marginPct: 31.41,
    winner: "Harris",
    sourceId: "mn-2024-precinct-results",
  },
  {
    state: "WA",
    year: 2024,
    office: "president",
    level: "county",
    jurisdictionCode: "WA-KING",
    jurisdictionName: "King",
    votes: { Harris: 907310, Trump: 329805, Other: 32240 },
    totalVotes: 1269355,
    marginVotes: 577505,
    marginPct: 45.5,
    winner: "Harris",
    sourceId: "wa-2024-president-county-results",
  },
];

export const seedSources: SourceSummary[] = [
  {
    id: "wi-2024-county-president",
    state: "WI",
    electionYear: 2024,
    category: "Certified presidential county results",
    title: "Wisconsin certified county result report",
    sourceUrl:
      "https://elections.wi.gov/sites/default/files/documents/County%20by%20County%20Report_POTUS.pdf",
    authority: "Wisconsin Elections Commission",
    localArtifact: "data/County by County Report_POTUS.pdf",
    parser: "legacyStaticRegistry",
    timestampBasis: "HTTP Last-Modified metadata captured in the legacy static project.",
    confidence: "Official WEC certified county result report.",
    status: "loaded",
  },
  {
    id: "mn-2024-precinct-results",
    state: "MN",
    electionYear: 2024,
    category: "Official precinct results",
    title: "Minnesota official federal/state precinct workbook",
    sourceUrl:
      "https://www.sos.mn.gov/media/yt3llxwd/2024-general-federal-state-results-by-precinct-official.xlsx",
    authority: "Minnesota Secretary of State",
    localArtifact: "data/mn-app-data.js",
    parser: "xlsxPrecinctComparison",
    timestampBasis: "HTTP Last-Modified timestamp captured by the legacy import pipeline.",
    confidence: "Official Minnesota Secretary of State workbook.",
    status: "loaded",
  },
  {
    id: "wa-2024-president-county-results",
    state: "WA",
    electionYear: 2024,
    category: "Certified presidential county results",
    title: "Washington certified President/Vice President county page",
    sourceUrl: "https://results.vote.wa.gov/results/20241105/president-vice-president_bycounty.html",
    authority: "Washington Secretary of State",
    localArtifact: "data/wa-2024-president-county-results.html",
    parser: "washingtonCountyHtml",
    timestampBasis: "Official page shows last updated date in the legacy source inventory.",
    confidence: "Official Washington Secretary of State county results page.",
    status: "loaded",
  },
];

export const seedImportRuns: ImportRunSummary[] = [
  {
    id: "seed-import-wi-2024",
    state: "WI",
    electionYear: 2024,
    parser: "legacyStaticRegistry",
    status: "validated",
    startedAt: "2026-06-08T00:00:00.000Z",
    finishedAt: "2026-06-08T00:00:02.000Z",
    summary: {
      source: "Camreyn/wisconsin-2024-election-mapper",
      note: "Seed data proves the API contract before Neon import promotion is enabled.",
    },
  },
];

export function getCoverage(state: string, year: number): CoverageSummary | null {
  const stateSummary = seedStates.find((entry) => entry.code === state);

  if (!stateSummary) {
    return null;
  }

  const results = seedResults.filter((row) => row.state === state && row.year === year);
  const sources = seedSources.filter((source) => source.state === state && source.electionYear === year);

  return {
    state,
    year,
    expectedJurisdictions: state === "WI" ? 72 : state === "MN" ? 87 : state === "WA" ? 39 : 0,
    loadedJurisdictions: new Set(results.map((row) => row.jurisdictionCode)).size,
    resultRows: results.length,
    sourceCount: sources.length,
    validation: {
      passed: results.length > 0 && sources.length > 0,
      warnings:
        results.length === 0 ? ["No migrated result rows are loaded for this state yet."] : [],
      errors: [],
    },
    capabilities: stateSummary.capabilities,
  };
}
