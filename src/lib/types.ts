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
