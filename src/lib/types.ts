export type StateSummary = {
  code: string;
  name: string;
  authority: string;
  countyLabel: string;
  capabilities: CapabilitySummary;
};

export type CapabilitySummary = {
  sourcePlanner: boolean;
  certifiedResults: boolean;
  map: boolean;
  reviewGraphs: boolean;
  turnout: boolean;
  historicalBaseline: boolean;
  notes: string;
};

export type ElectionSummary = {
  year: number;
  office: string;
  electionDate: string;
  label: string;
  statesLoaded: number;
};

export type ResultRow = {
  state: string;
  year: number;
  office: string;
  level: "county" | "state" | "district" | "precinct";
  jurisdictionCode: string;
  jurisdictionName: string;
  votes: Record<string, number>;
  totalVotes: number;
  marginVotes: number;
  marginPct: number;
  winner: string;
  sourceId: string;
};

export type SourceSummary = {
  id: string;
  state: string;
  electionYear: number;
  category: string;
  title: string;
  sourceUrl: string;
  authority: string;
  localArtifact: string;
  parser: string;
  timestampBasis: string;
  confidence: string;
  status: "loaded" | "candidate" | "needs_data" | "superseded" | "documented_exclusion";
};

export type CoverageSummary = {
  state: string;
  year: number;
  expectedJurisdictions: number;
  loadedJurisdictions: number;
  resultRows: number;
  sourceCount: number;
  validation: {
    passed: boolean;
    warnings: string[];
    errors: string[];
  };
  capabilities: CapabilitySummary;
};

export type CompletenessSummary = {
  state: string;
  name: string;
  authority: string;
  resultRows: number;
  resultJurisdictions: number;
  sourceCount: number;
  sourcesMissingUrls: number;
  indicatorCount: number;
  reviewRowCount: number;
  turnoutRowCount: number;
  historicalRowCount: number;
  flaggedJurisdictions: number;
  importRunCount: number;
  nativeImportCount: number;
  legacyImportCount: number;
  latestParser: string | null;
  sourceTier: "native_official" | "legacy_bundle" | "mixed" | "seed_fallback" | "pending";
  latestImportAt: string | null;
  capabilities: CapabilitySummary;
  status: "complete" | "review_ready" | "results_only" | "needs_sources" | "pending";
  gaps: string[];
};

export type ImportRunSummary = {
  id: string;
  state: string;
  electionYear: number;
  parser: string;
  status: "staged" | "validated" | "promoted" | "failed";
  startedAt: string;
  finishedAt: string | null;
  summary: Record<string, unknown>;
};

export type AnalysisIndicator = {
  id: string;
  state: string;
  electionYear: number;
  jurisdictionCode: string;
  jurisdictionName: string;
  level: "county" | "state" | "district" | "precinct";
  type: string;
  severity: number;
  label: string;
  summary: string;
  detail: string;
  metrics: Record<string, unknown>;
};

export type ReviewRowSummary = {
  id: string;
  state: string;
  electionYear: number;
  jurisdictionCode: string;
  jurisdictionName: string;
  localUnit: string;
  level: string;
  harrisVotes: number | null;
  trumpVotes: number | null;
  totalVotes: number | null;
  harrisShare: number | null;
  trumpShare: number | null;
  demDropoff: number | null;
  repDropoff: number | null;
  metrics: Record<string, unknown>;
  sourceId: string;
};

export type TurnoutRowSummary = {
  id: string;
  state: string;
  electionYear: number;
  jurisdictionCode: string;
  jurisdictionName: string;
  level: string;
  ballotsCast: number;
  registeredVoters: number | null;
  turnoutPct: number | null;
  denominatorNote: string;
  warningRequired: boolean;
  sourceId: string;
};

export type HistoricalResultRowSummary = {
  id: string;
  state: string;
  electionYear: number;
  sourceId: string;
  sourceLevel: string;
  rowMethod: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  localUnit: string;
  demVotes: number | null;
  repVotes: number | null;
  otherVotes: number | null;
  totalVotes: number | null;
  metrics: Record<string, unknown>;
  sourceDocumentId: string;
};
