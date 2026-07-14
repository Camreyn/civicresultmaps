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
  level: "county" | "state" | "district" | "precinct" | "city" | "town" | "city_town" | "rest_of_county" | "federal_precincts" | "non_geographic";
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionTag?: string | null;
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
  historicalJoinReady: boolean;
  jurisdictionTagCoverage: {
    resultJurisdictions: number;
    taggedResultJurisdictions: number;
    historical2020Jurisdictions: number;
    taggedHistorical2020Jurisdictions: number;
    matchedHistorical2020Jurisdictions: number;
    missingHistorical2020Jurisdictions: number;
  };
  sourceCount: number;
  mapGeometrySourceCount: number;
  sourcesMissingUrls: number;
  indicatorCount: number;
  reviewRowCount: number;
  turnoutRowCount: number;
  historicalRowCount: number;
  equipmentRowCount: number;
  flaggedJurisdictions: number;
  countyIndicatorCount: number;
  flaggedCountyJurisdictions: number;
  flaggedAreas: number;
  importRunCount: number;
  nativeImportCount: number;
  legacyImportCount: number;
  latestParser: string | null;
  latestImportStatus: ImportRunSummary["status"] | null;
  latestImportSummary: Record<string, unknown> | null;
  latestNativeImportSummary: Record<string, unknown> | null;
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
  jurisdictionTag?: string | null;
  level: "county" | "state" | "district" | "precinct" | "city" | "town" | "city_town" | "rest_of_county";
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
  jurisdictionTag?: string | null;
  localUnit: string;
  level: string;
  demCandidate: string | null;
  repCandidate: string | null;
  demVotes: number | null;
  repVotes: number | null;
  demShare: number | null;
  repShare: number | null;
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
  jurisdictionTag?: string | null;
  level: string;
  ballotsCast: number;
  registeredVoters: number | null;
  turnoutPct: number | null;
  denominatorNote: string;
  warningRequired: boolean;
  sourceId: string;
};

export type VoteMethodRowSummary = {
  id: string;
  state: string;
  electionYear: number;
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionTag?: string | null;
  county: string;
  localUnit: string;
  level: string;
  method: string;
  methodLabel: string;
  sourceField: string;
  voters: number | null;
  methodSharePct: number | null;
  totalVoters: number | null;
  valueStatus: string;
  sourceId: string;
  sourceStatus: string;
  sourceUrl: string;
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
  jurisdictionTag?: string | null;
  localUnit: string;
  demVotes: number | null;
  repVotes: number | null;
  otherVotes: number | null;
  totalVotes: number | null;
  metrics: Record<string, unknown>;
  sourceDocumentId: string;
};

export type EquipmentRowSummary = {
  id: string;
  state: string;
  electionYear: number;
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionTag?: string | null;
  level: string;
  vendor: string;
  systemName: string;
  equipmentType: string;
  usage: string;
  paperRecord: string;
  standardSystem: string;
  accessibleSystem: string;
  absenteeSystem: string;
  pollBookSystem: string;
  tabulation: string;
  registeredVoters: number | null;
  precincts: number | null;
  pollingPlaces: number | null;
  sourceGranularity: string;
  uniformityWarningRequired: boolean;
  uniformityNote: string;
  configurationSignals: string[];
  metrics: Record<string, unknown>;
  sourceId: string;
  sourceUrl: string;
};

export type SecurityAffectedLocationUnit =
  | "election_facility"
  | "election_office"
  | "polling_location"
  | "voting_precinct";
export type SecurityIncidentSourceTier = "official" | "supplemental";
export type SecurityIncidentReportingGrain = "county" | "statewide_unspecified";
export type SecurityThreatCountBasis =
  | "official_county_record"
  | "research_tracker_compilation"
  | "supplemental_national_compilation"
  | "not_separately_published";

export type SecurityIncidentSummary = {
  id: string;
  state: string;
  stateName: string;
  electionYear: number;
  county: string;
  jurisdictionCode: string | null;
  jurisdictionTag: string;
  reportingGrain: SecurityIncidentReportingGrain;
  eventDate: string;
  eventType: "bomb_threat" | "security_threat";
  eventTypeLabel: string;
  threatCount: number | null;
  threatCountBasis: SecurityThreatCountBasis;
  threatCountSourceUrl: string | null;
  threatCountLocalArtifact: string | null;
  affectedLocations: number | null;
  affectedLocationUnit: SecurityAffectedLocationUnit;
  namedLocations: string[];
  disruptionType: string;
  disruptionLabel: string;
  hoursExtended: number | null;
  sourceAuthority: string;
  sourceTitle: string;
  sourcePublishedAt: string;
  sourceUrl: string;
  supportingSourceUrls: string[];
  localArtifact: string;
  supportingLocalArtifacts: string[];
  normalizationPath: string;
  sourceTier: SecurityIncidentSourceTier;
  sourceStatus:
    | "official_county_record"
    | "research_compilation"
    | "supplemental_earlier_compilation"
    | "supplemental_national_compilation";
  confidence: "high" | "medium" | "low";
  caveat: string;
};

export type SecurityAffectedLocationUnitTotal = {
  countComplete: boolean;
  documentedCount: number | null;
  knownCount: number;
  unit: SecurityAffectedLocationUnit;
};

export type SecurityIncidentTotals = {
  affectedLocationCountComplete: boolean;
  affectedLocationUnits: SecurityAffectedLocationUnitTotal[];
  affectedLocations: number | null;
  countyCount: number;
  countyRowCount: number;
  documentedThreatCount: number | null;
  knownAffectedLocations: number | null;
  knownThreatCount: number;
  officialRowCount: number;
  rowCount: number;
  stateCount: number;
  statewideUnspecifiedRowCount: number;
  statewideUnspecifiedThreatCount: number;
  supplementalRowCount: number;
  threatCountComplete: boolean;
  unknownThreatCountRows: number;
};

export type SecurityIncidentStateSummary = SecurityIncidentTotals & {
  state: string;
  stateName: string;
};

export type SecurityIncidentCoverageState = {
  caveat?: string;
  confidence?: string;
  expectedRowCount?: number;
  mappedCountyCount?: number;
  sourceAuthorities?: string[];
  sourceUrls?: string[];
  state: string;
  stateName: string;
  status: "partial" | "needs_data";
  statewideUnspecifiedThreatCount?: number;
};

export type SecurityIncidentNationalContext = {
  acquiredAt?: string;
  acquisitionStatus?: string;
  caveat: string;
  confidence: string;
  electionYear: number;
  expectedRowCount: number | null;
  localArtifact: string;
  normalizationPath: string;
  reportedCountyCount?: number;
  reportedLocationCount?: number;
  reportedStateCount?: number;
  reportedThreatCount?: number;
  reportingGrain: string;
  reportingWindow?: { end: string; start: string };
  scopeLabel?: string;
  sha256?: string;
  sourceAuthority: string;
  sourceTier?: SecurityIncidentSourceTier;
  sourceTitle: string;
  sourceUrl: string;
  statewideUnspecifiedThreatCount?: number;
};

export type NationalSecurityIncidentReport = {
  caveat: string;
  electionYear: number;
  incidents: SecurityIncidentSummary[];
  nationalContext: SecurityIncidentNationalContext[];
  reportingWindow: { end: string; start: string };
  stateCoverage: SecurityIncidentCoverageState[];
  stateSummaries: SecurityIncidentStateSummary[];
  totals: SecurityIncidentTotals;
};

export type AdminSourceFamilyStatus = {
  status: "loaded" | "partial" | "candidate" | "needs_data" | "blocked" | "documented_exclusion";
  why?: string;
  sourceUrl?: string;
  localArtifact?: string;
  normalizedArtifact?: string;
  caveat?: string;
};

export type AdminSourceStatusSummary = {
  state: string;
  stateName: string;
  electionYear: number;
  status: AdminSourceFamilyStatus["status"];
  priority: string;
  equipment: AdminSourceFamilyStatus & {
    reportingLevel?: string;
    sourceDocumentId?: string;
    sourceUrl?: string;
    localArtifact?: string;
    normalizedArtifact?: string;
    expectedJurisdictions?: number;
    caveat?: string;
  };
  audit: AdminSourceFamilyStatus;
  cvr: AdminSourceFamilyStatus;
  incidents: AdminSourceFamilyStatus;
};

export type EquipmentClusterDiagnostic = {
  caveat: string;
  controls: string[];
  flaggedJurisdictions: number;
  flaggedRate: number;
  groupKey: string;
  jurisdictionCount: number;
  lift: number | null;
  minimumUsefulJurisdictions: number;
  statewideFlagRate: number;
  status: "ready" | "limited" | "missing";
  summary: string;
  vendor: string;
  systemName: string;
  equipmentType: string;
  usage: string;
};

export type ElectronicIntegrityArtifactSummary = {
  type: string;
  status: string;
  granularity: string;
  sourceUrl?: string;
  localArtifact?: string;
  parser?: string;
  reconciliationStatus: string;
  requestRequired: boolean;
  tamperDetectionUse: string;
};

export type ElectronicIntegrityStateSummary = {
  state: string;
  stateName: string;
  electionYear: number;
  priority: string;
  overallStatus: string;
  summary: string;
  riskPosture: string;
  nextAction: string;
  artifacts: ElectronicIntegrityArtifactSummary[];
};

export type ElectronicIntegrityRequestSummary = {
  requestId: string;
  electionYear: number;
  state: string;
  stateName: string;
  artifactType: string;
  artifactLabel: string;
  artifactStatus: string;
  requestRequired: boolean;
  status: string;
  primaryCustodian: string;
  recipientEmail: string;
  recipientPortalUrl: string;
  recipientLookupUrl: string;
  countyCustodianLikely: boolean;
  requestPath: string;
  requestedRecords: string;
  sentAt: string;
  acknowledgedAt: string;
  closedAt: string;
  feeStatus: string;
  responseSummary: string;
  receivedFiles: string[];
  sourceUrl: string;
  localArtifact: string;
  notes: string;
};

export type ElectronicIntegrityRequestContactSummary = {
  state: string;
  primaryCustodian: string;
  recipientEmail: string;
  recipientPortalUrl: string;
  recipientLookupUrl: string;
  countyCustodianLikely: boolean;
  notes: string;
};

export type ElectronicIntegrityRequestStateDraft = {
  state: string;
  emailFile: string;
  markdownFile: string;
  subject: string;
  requestIds: string[];
  emailBody: string;
  mailtoHref: string;
  recipientHint: string;
  routingHint: string;
};

export type ElectronicIntegrityRequestOperationSummary = {
  caveat: string;
  generatedAt: string;
  contacts: ElectronicIntegrityRequestContactSummary[];
  requests: ElectronicIntegrityRequestSummary[];
  summary: {
    draftFiles: ElectronicIntegrityRequestStateDraft[];
    requestRows: number;
    rowsByStatus: Record<string, number>;
    rowsByState: Record<string, number>;
    states: number;
  };
};
export type SourceRecordsRequestSummary = {
  requestId: string;
  electionYear: number;
  state: string;
  stateName: string;
  requestFamily: string;
  requestLabel: string;
  status: string;
  priority: string;
  preparedByProject: boolean;
  manualActionRequired: boolean;
  localPacket: string;
  sourceUrl: string;
  requestedRecords: string;
  evidenceSummary: string;
  preparedAction: string;
  manualUserAction: string;
  responseAction: string;
};

export type SourceRecordsRequestContactSummary = {
  state: string;
  primaryCustodian: string;
  recipientEmail: string;
  recipientPortalUrl: string;
  recipientLookupUrl: string;
  countyCustodianLikely: boolean;
  notes: string;
};

export type SourceRecordsRequestStateDraft = {
  state: string;
  emailFile: string;
  markdownFile: string;
  subject: string;
  requestIds: string[];
  emailBody: string;
  mailtoHref: string;
  recipientHint: string;
  routingHint: string;
};

export type SourceRecordsReceivedFileSummary = {
  requestId: string;
  state: string;
  requestFamily: string;
  status: string;
  receivedAt: string;
  files: string[];
  accessionNotes: string;
  normalizedArtifactPath: string;
  ingestScript: string;
};

export type SourceRecordsRequestOperationSummary = {
  caveat: string;
  generatedAt: string;
  contacts: SourceRecordsRequestContactSummary[];
  receivedFiles: SourceRecordsReceivedFileSummary[];
  requests: SourceRecordsRequestSummary[];
  summary: {
    draftFiles: SourceRecordsRequestStateDraft[];
    manualActionRequiredRows: number;
    requestRows: number;
    rowsByStatus: Record<string, number>;
    rowsByState: Record<string, number>;
    states: number;
  };
};
