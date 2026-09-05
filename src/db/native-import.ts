import { readFile } from "node:fs/promises";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { calculateAnalysisIndicators, type CandidateNeutralReviewRow } from "../lib/analysis-indicators.ts";
import { reviewPolicy } from "../lib/review-policy.ts";
import { jurisdictionTagForRow } from "../lib/jurisdiction-tags.ts";
import { reportingUnitCode } from "../lib/precinct-geography.ts";
import { runNeonTransaction, runPostgresTransaction } from "./neon-transaction.ts";
import { resolveNativeImportDatabaseTarget } from "./database-driver.ts";
import { bumpPublicDataRevision } from "./public-data-revision.ts";

type NativeSource = {
  id: string;
  category: string;
  sourceUrl: string;
  localArtifact?: string;
  parser?: string;
  authority: string;
  timestampBasis: string;
  confidence: string;
  status: string;
  metadata?: Record<string, unknown>;
};
type NativeReportingUnit = {
  sourceUnitId: string;
  sourceDisplayName?: string;
  parentGeoid?: string | null;
  reportingGrain: string;
  isGeographic: boolean;
};


type NativeResultRow = {
  jurisdictionName: string;
  level: string;
  votes: Record<"Harris" | "Trump" | "Other", number>;
  sourceId: string;
  reportingUnit?: NativeReportingUnit;
};

type NativeReviewRow = CandidateNeutralReviewRow & { reportingUnit?: NativeReportingUnit };

type WisconsinAuditSelection = {
  ballotsAudited: number;
  county: string;
  equipment: string;
  municipality: string;
  reportingUnit: string;
};

type WisconsinIndicatorContext = {
  aggregateAuditResults?: Record<string, unknown>;
  auditCaveat: string;
  auditSelections: WisconsinAuditSelection[];
  auditSourceUrl: string;
  statewideAuditFinding: string;
};

type NativeReviewScope = {
  city?: string;
  county: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  level: "county" | "city" | "rest_of_county";
  rows: NativeReviewRow[];
};
type NativeTurnoutRow = {
  county: string;
  localUnit: string;
  level?: string;
  ballotsCast: number;
  registeredVoters?: number;
  turnoutPct?: number | null;
  denominatorType?: string;
  registrationDenominatorTiming?: string;
  warningRequired?: boolean;
  sourceId: string;
  reportingUnit?: NativeReportingUnit;
};

type NativeHistoricalRow = {
  electionYear: number;
  sourceId: string;
  sourceLevel: string;
  rowMethod: string;
  jurisdictionName: string;
  jurisdictionTag?: string;
  jurisdictionGeoid?: string;
  sourceDisplayName?: string;
  localUnit: string;
  demVotes?: number;
  repVotes?: number;
  otherVotes?: number;
  totalVotes?: number;
  sourceUrl?: string;
  sourceDocumentId?: string;
};

type NativeArtifact = {
  state: {
    code: string;
    name: string;
    authority: string;
  };
  election: {
    year: number;
    office: string;
    id?: string;
    date?: string;
    type?: string;
  };
  sources: NativeSource[];
  capabilities: Record<string, boolean>;
  validation: {
    passed: boolean;
    errors: string[];
    warnings: string[];
    metrics: Record<string, unknown>;
  };
  promotion: {
    productionWriteAllowed: boolean;
  };
  native?: {
    parser: string;
    resultRows: NativeResultRow[];
    reviewRows: NativeReviewRow[];
    turnoutRows: NativeTurnoutRow[];
    historicalRows?: NativeHistoricalRow[];
    historicalReviewRows?: NativeReviewRow[];
    metrics: Record<string, unknown>;
  };
};

const candidateParties = {
  Harris: "DEM",
  Trump: "REP",
  Other: "OTHER",
} as const;



function normalizeJurisdictionName(name: string) {
  return name.trim().replace(/\s+County$/i, "");
}

function jurisdictionCode(stateCode: string, name: string) {
  return `${stateCode}-${normalizeJurisdictionName(name).toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
}
const parentScopedReportingGrains = new Set([
  "precinct",
  "ward",
  "vtd",
  "election_district",
  "split_precinct",
]);

export function buildNativeReportingUnitRecord(input: {
  stateCode: string;
  electionEventId: string;
  reportingUnit?: NativeReportingUnit;
  fallbackDisplayName: string;
  sourceDocumentId: string;
}) {
  const reportingUnit = input.reportingUnit;
  if (!reportingUnit) {
    return null;
  }

  const sourceUnitId = String(reportingUnit.sourceUnitId ?? "").trim();
  const reportingGrain = String(reportingUnit.reportingGrain ?? "")
    .trim()
    .toLowerCase();
  const parentGeoid = String(reportingUnit.parentGeoid ?? "").trim() || null;
  const sourceDisplayName = String(
    reportingUnit.sourceDisplayName ?? input.fallbackDisplayName,
  ).trim();
  if (typeof reportingUnit.isGeographic !== "boolean") {
    throw new Error("Native reporting unit isGeographic must be a boolean.");
  }
  if (
    reportingUnit.isGeographic
    && parentScopedReportingGrains.has(reportingGrain)
    && !parentGeoid
  ) {
    throw new Error(
      "Native " + reportingGrain + " reporting unit requires a parentGeoid.",
    );
  }
  if (!sourceDisplayName) {
    throw new Error("Native reporting unit sourceDisplayName is required.");
  }

  const code = reportingUnitCode({
    state: input.stateCode,
    electionId: input.electionEventId,
    reportingGrain,
    parentGeoid,
    sourceUnitId,
  });

  return {
    code,
    reporting_grain: reportingGrain,
    parent_geoid: parentGeoid,
    source_unit_id: sourceUnitId,
    source_display_name: sourceDisplayName,
    is_geographic: reportingUnit.isGeographic,
    source_document_id: input.sourceDocumentId,
  };
}

function electionEventDetails(election: NativeArtifact["election"]) {
  const type = String(election.type ?? "general").trim().toLowerCase();
  const date = String(election.date ?? election.year + "-11-05").trim();
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || Number.isNaN(Date.parse(date + "T00:00:00Z"))
    || Number(date.slice(0, 4)) !== election.year
  ) {
    throw new Error("Native election date must be a valid ISO date in its election year.");
  }
  const id = String(election.id ?? date + "-" + type).trim();
  if (!id) {
    throw new Error("Native election event id is required.");
  }
  return { date, id, type };
}


function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function chunkRows<T>(rows: T[], size = 1000) {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error("Native import chunk size must be a positive integer.");
  }

  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

export function dedupeRowsLastWins<T>(
  rows: T[],
  keyForRow: (row: T) => string,
) {
  const rowsByKey = new Map<string, T>();
  for (const row of rows) {
    rowsByKey.set(keyForRow(row), row);
  }
  return Array.from(rowsByKey.values());
}
function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((part) => (part.length <= 2 ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function auditMunicipalityName(value: string) {
  return titleCase(String(value || "").replace(/^[CTV]\.\s*/i, "").trim());
}

async function loadWisconsinIndicatorContext(stateCode: string): Promise<WisconsinIndicatorContext | null> {
  if (stateCode !== "WI") {
    return null;
  }

  try {
    const [summaryText, csvText] = await Promise.all([
      readFile("data/wi-2024-audit-summary.json", "utf8"),
      readFile("data/wi-2024-audit-selections.csv", "utf8"),
    ]);
    const summary = JSON.parse(summaryText) as {
      aggregateAuditResults?: Record<string, unknown>;
      caveat?: string;
      sourcePdfUrl?: string;
      statewideFinding?: string;
    };
    const lines = csvText.trim().split(/\r?\n/).slice(1);
    const auditSelections = lines.map((line) => {
      const cells = splitCsvLine(line);
      return {
        ballotsAudited: Number(cells[7] || 0),
        county: normalizeJurisdictionName(cells[3] ?? ""),
        equipment: cells[6] ?? "",
        municipality: cells[4] ?? "",
        reportingUnit: cells[5] ?? "",
      };
    });
    return {
      aggregateAuditResults: summary.aggregateAuditResults,
      auditCaveat:
        summary.caveat ??
        "The WEC final audit report provides statewide findings and selected reporting units, not per-unit discrepancy outcomes.",
      auditSelections,
      auditSourceUrl: summary.sourcePdfUrl ?? "",
      statewideAuditFinding: summary.statewideFinding ?? "",
    };
  } catch {
    return null;
  }
}

function auditContextForScope(scope: NativeReviewScope, context: WisconsinIndicatorContext | null) {
  if (!context) {
    return null;
  }

  let matched = context.auditSelections.filter((row) => row.county.toLowerCase() === scope.county.toLowerCase());
  if (scope.level === "city" && scope.city) {
    matched = matched.filter((row) => auditMunicipalityName(row.municipality).toLowerCase() === scope.city?.toLowerCase());
  } else if (scope.level === "rest_of_county" && scope.city) {
    matched = matched.filter((row) => auditMunicipalityName(row.municipality).toLowerCase() !== scope.city?.toLowerCase());
  }

  return {
    aggregateAuditResults: context.aggregateAuditResults ?? null,
    auditedBallots: matched.reduce((sum, row) => sum + row.ballotsAudited, 0),
    caveat: context.auditCaveat,
    matchedSelectionRows: matched.length,
    sourceUrl: context.auditSourceUrl,
    statewideFinding: context.statewideAuditFinding,
    topEquipment: Array.from(new Set(matched.map((row) => row.equipment).filter(Boolean))).slice(0, 6),
  };
}

function denominatorContextForScope(stateCode: string, scope: NativeReviewScope) {
  if (stateCode !== "WI") {
    return null;
  }

  return {
    ballotModeContext: "EAC local-jurisdiction vote-method rows are loaded as context only and are not used as advisory flag inputs.",
    defaultTurnoutDenominator: "EAC 2024 local-jurisdiction turnout fallback",
    localVoteRows: "WEC ward-level federal/state workbook",
    missingDenominator: "WEC ward result rows do not include ward-level registered-voter denominators.",
    scopeType: scope.level,
  };
}

function comparisonContextForScope(scope: NativeReviewScope) {
  const coverageModes = Array.from(
    new Set(
      scope.rows
        .map((row) => row.coverageMode)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  ).sort();
  const comparisonCoverageMode =
    coverageModes.length === 1 ? coverageModes[0] : coverageModes.length > 1 ? "mixed" : "unknown";
  const lowConfidenceReasons: Record<string, string> = {
    mixed: "mixed comparison modes are loaded in this scope",
    multiDistrictHouseComparison: "the comparison race aggregates multiple U.S. House districts under one local key",
    oneSidedHouseComparison: "the comparison race is one-sided or not fully comparable",
    presidentVsGovernor:
      "Governor is a statewide executive race with candidate-specific ticket splitting; corroborate with additional contests or historical baselines before inferring candidate benefit",
    presidentVsHouse: "U.S. House races are district- and candidate-specific controls",
    presidentVsUSHouse: "U.S. House races are district- and candidate-specific controls",
    unknown: "the comparison mode is not recorded",
    voteShareOnly: "no same-row down-ballot comparison is loaded",
  };
  const directionalScreenReason =
    lowConfidenceReasons[comparisonCoverageMode] ??
    (/house/i.test(comparisonCoverageMode) ? "U.S. House races are district- and candidate-specific controls" : "");

  return {
    comparisonCoverageMode,
    directionalScreenConfidence: directionalScreenReason ? "low" : "standard",
    directionalScreenReason,
  };
}

async function analysisIndicatorsForNativeRows(stateCode: string, rows: NativeReviewRow[]) {
  const wisconsinContext = await loadWisconsinIndicatorContext(stateCode);
  return calculateAnalysisIndicators(stateCode, rows, {
    enrichMetrics: (scope) => ({
      auditContext: auditContextForScope(scope, wisconsinContext),
      ...comparisonContextForScope(scope),
      denominatorContext: denominatorContextForScope(stateCode, scope),
    }),
  });
}

function reviewRowForYear(row: NativeReviewRow, fallbackYear: number): NativeReviewRow {
  const electionYear = Number(row.electionYear ?? fallbackYear);
  const candidateDefaults = electionYear === 2016
    ? { dem: "Hillary Clinton", rep: "Donald Trump" }
    : electionYear === 2020
      ? { dem: "Joe Biden", rep: "Donald Trump" }
      : electionYear === 2024
        ? { dem: "Kamala Harris", rep: "Donald Trump" }
        : { dem: "Democratic candidate", rep: "Republican candidate" };

  return {
    ...row,
    demCandidate: row.demCandidate ?? candidateDefaults.dem,
    demShare: row.demShare ?? row.harrisShare,
    demVotes: row.demVotes ?? row.harris,
    electionYear,
    level: row.level ?? "local",
    repCandidate: row.repCandidate ?? candidateDefaults.rep,
    repShare: row.repShare ?? row.trumpShare,
    repVotes: row.repVotes ?? row.trump,
  };
}

async function retargetLegacySourceDocument(
  sql: NeonQueryFunction<false, false>,
  input: { legacySlug: string; sourceElectionYear: number; targetSlug: string },
) {
  if (input.legacySlug === input.targetSlug) {
    return;
  }

  const [legacyDocument] = await sql`
    select id from source_documents where slug = ${input.legacySlug} limit 1
  `;
  if (!legacyDocument) {
    return;
  }

  const [targetDocument] = await sql`
    select id from source_documents where slug = ${input.targetSlug} limit 1
  `;
  if (!targetDocument) {
    await sql`
      update source_documents
      set slug = ${input.targetSlug}, election_year = ${input.sourceElectionYear}
      where id = ${legacyDocument.id}
    `;
    return;
  }

  await sql`update import_runs set source_document_id = ${targetDocument.id} where source_document_id = ${legacyDocument.id}`;
  await sql`update result_rows set source_document_id = ${targetDocument.id} where source_document_id = ${legacyDocument.id}`;
  await sql`update turnout_rows set source_document_id = ${targetDocument.id} where source_document_id = ${legacyDocument.id}`;
  await sql`update review_rows set source_document_id = ${targetDocument.id} where source_document_id = ${legacyDocument.id}`;
  await sql`update historical_result_rows set source_document_id = ${targetDocument.id} where source_document_id = ${legacyDocument.id}`;
  await sql`update equipment_rows set source_document_id = ${targetDocument.id} where source_document_id = ${legacyDocument.id}`;
  await sql`update analysis_indicators set source_document_id = ${targetDocument.id} where source_document_id = ${legacyDocument.id}`;
  await sql`delete from source_documents where id = ${legacyDocument.id}`;
}

function requiredSourceDocumentId(
  sourceIds: Map<string, string>,
  sourceId: string | undefined,
  context: string,
) {
  const documentId = sourceId ? sourceIds.get(sourceId) : undefined;
  if (!documentId) {
    throw new Error(`${context} references unknown source ${sourceId || "(missing)"}.`);
  }
  return documentId;
}

export function validateNativeSourceReferences(input: {
  historicalRows?: Array<{ sourceDocumentId?: string; sourceId?: string }>;
  knownSourceIds: Iterable<string>;
  resultRows?: Array<{ sourceId?: string }>;
  turnoutRows?: Array<{ sourceId?: string }>;
}) {
  const sourceIdList = Array.from(input.knownSourceIds);
  const knownSourceIds = new Set(sourceIdList);
  if (knownSourceIds.size !== sourceIdList.length) {
    throw new Error("Native staging artifact contains duplicate source ids.");
  }

  const assertKnown = (sourceId: string | undefined, context: string) => {
    if (!sourceId || !knownSourceIds.has(sourceId)) {
      throw new Error(`${context} references unknown source ${sourceId || "(missing)"}.`);
    }
  };

  for (const row of input.resultRows ?? []) {
    assertKnown(row.sourceId, "Result row");
  }
  for (const row of input.turnoutRows ?? []) {
    assertKnown(row.sourceId, "Turnout row");
  }
  for (const row of input.historicalRows ?? []) {
    assertKnown(row.sourceDocumentId ?? row.sourceId, "Historical result row");
  }
}

export function partitionReviewRowsForPromotion(input: {
  currentRows: NativeReviewRow[];
  electionYear: number;
  historicalRows?: NativeReviewRow[];
  knownSourceIds: Iterable<string>;
}): {
  historicalReviewYears: number[];
  reviewRowsByYear: Map<number, NativeReviewRow[]>;
} {
  const knownSourceIds = new Set(input.knownSourceIds);
  const reviewRowsByYear = new Map<number, NativeReviewRow[]>();

  const addReviewRow = (row: NativeReviewRow, fallbackYear: number, kind: "current" | "historical") => {
    const normalized = reviewRowForYear(row, fallbackYear);
    const rowYear = Number(normalized.electionYear);
    if (!Number.isInteger(rowYear) || rowYear <= 0) {
      throw new Error(`${kind} review row ${row.county}/${row.localUnit} has an invalid election year.`);
    }
    if (kind === "current" && rowYear !== input.electionYear) {
      throw new Error(
        `Current review row ${row.county}/${row.localUnit} targets ${rowYear}; expected ${input.electionYear}.`,
      );
    }
    if (kind === "historical" && rowYear === input.electionYear) {
      throw new Error(
        `Historical review row ${row.county}/${row.localUnit} targets the current election year ${input.electionYear}.`,
      );
    }
    if (kind === "historical" && rowYear > input.electionYear) {
      throw new Error(
        `Historical review row ${row.county}/${row.localUnit} targets future year ${rowYear}; expected a year before ${input.electionYear}.`,
      );
    }

    if (!normalized.sourceId?.trim()) {
      throw new Error(`${kind} review row ${row.county}/${row.localUnit} is missing its primary source id.`);
    }

    for (const sourceId of [
      normalized.sourceId,
      normalized.comparisonSourceId,
      normalized.presidentialParticipationProxy?.sourceId,
    ].filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    )) {
      if (!knownSourceIds.has(sourceId)) {
        throw new Error(
          `${kind} review row ${row.county}/${row.localUnit} references unknown source ${sourceId}.`,
        );
      }
    }

    reviewRowsByYear.set(rowYear, [...(reviewRowsByYear.get(rowYear) ?? []), normalized]);
  };

  for (const row of input.currentRows) {
    addReviewRow(row, input.electionYear, "current");
  }
  for (const row of input.historicalRows ?? []) {
    addReviewRow(row, Number(row.electionYear), "historical");
  }

  const historicalReviewYears = Array.from(reviewRowsByYear.keys())
    .filter((year) => year !== input.electionYear)
    .sort((left, right) => left - right);

  return { historicalReviewYears, reviewRowsByYear };
}

function assertPromotable(artifact: NativeArtifact) {
  if (!artifact.validation?.passed) {
    throw new Error("Native staging artifact validation did not pass.");
  }
  if (artifact.promotion?.productionWriteAllowed) {
    throw new Error("Native staging artifacts must not self-authorize production writes.");
  }
  if (!artifact.native) {
    throw new Error("Native staging artifact does not contain parsed native rows.");
  }
}

export async function promoteNativeStagingArtifact(path: string) {
  const database = resolveNativeImportDatabaseTarget();

  const artifact = JSON.parse(await readFile(path, "utf8")) as NativeArtifact;
  assertPromotable(artifact);

  const stateCode = artifact.state.code.toUpperCase();
  const electionYear = artifact.election.year;
  const office = artifact.election.office.toLowerCase();
  const electionEvent = electionEventDetails(artifact.election);
  const native = artifact.native!;
  const supportsReportingUnits = database.driver === "postgres";
  const artifactSourceIds = artifact.sources.map((source) => source.id);
  validateNativeSourceReferences({
    historicalRows: native.historicalRows,
    knownSourceIds: artifactSourceIds,
    resultRows: native.resultRows,
    turnoutRows: native.turnoutRows,
  });
  const { historicalReviewYears, reviewRowsByYear } = partitionReviewRowsForPromotion({
    currentRows: native.reviewRows,
    electionYear,
    historicalRows: native.historicalReviewRows,
    knownSourceIds: artifactSourceIds,
  });
  const shouldReplaceResultRows = native.resultRows.length > 0;
  const shouldReplaceReviewRows =
    native.reviewRows.length > 0 ||
    (native.resultRows.length > 0 && "nativeReviewRows" in native.metrics);
  const shouldReplaceTurnoutRows = native.turnoutRows.length > 0;
  const historicalRows = native.historicalRows ?? [];
  const shouldReplaceHistoricalRows = historicalRows.length > 0;
  const shouldRefreshReportingUnitSource =
    shouldReplaceResultRows || shouldReplaceReviewRows;
  const shouldRefreshStateMetadata =
    shouldReplaceResultRows || shouldReplaceReviewRows || shouldReplaceHistoricalRows;
  const runTransaction = database.driver === "postgres" ? runPostgresTransaction : runNeonTransaction;
  return runTransaction(database.databaseUrl, async (sql) => {
    await sql`select set_config('lock_timeout', '30s', true)`;
    await sql`select pg_advisory_xact_lock(hashtextextended(${`crm-native-promotion:${stateCode}`}, 0))`;
  await sql`
    insert into states (code, name, authority)
    values (${stateCode}, ${artifact.state.name}, ${artifact.state.authority})
    on conflict (code) do update set
      name = case
        when ${shouldRefreshStateMetadata} then excluded.name
        else states.name
      end,
      authority = case
        when ${shouldRefreshStateMetadata} then excluded.authority
        else states.authority
      end
  `;

  const [election] = await sql`
    insert into elections (year, office, election_date, label)
    values (${electionYear}, ${office}, ${electionEvent.date}, ${`${electionYear} ${office}`})
    on conflict (year, office) do update set
      election_date = case
        when ${shouldReplaceResultRows} then excluded.election_date
        else elections.election_date
      end,
      label = case
        when ${shouldReplaceResultRows} then excluded.label
        else elections.label
      end
    returning id
  `;

  const [contest] = await sql`
    insert into contests (election_id, state_code, office, title)
    values (${election.id}, ${stateCode}, ${office}, ${`${artifact.state.name} ${electionYear} ${office}`})
    on conflict (election_id, state_code, office) do update set
      title = case
        when ${shouldReplaceResultRows} then excluded.title
        else contests.title
      end
    returning id
  `;

  if (shouldReplaceResultRows) {
    for (const [index, candidate] of (["Harris", "Trump", "Other"] as const).entries()) {
      await sql`
        insert into candidates (contest_id, name, party, ballot_order)
        values (${contest.id}, ${candidate}, ${candidateParties[candidate]}, ${index + 1})
        on conflict (contest_id, name, party) do update set ballot_order = excluded.ballot_order
      `;
    }
  }

  const sourceIds = new Map<string, string>();
  for (const source of artifact.sources) {
    const metadataElectionYear = Number(source.metadata?.electionYear);
    const metadataElectionYears = Array.isArray(source.metadata?.electionYears)
      ? source.metadata.electionYears.map(Number).filter(Number.isInteger)
      : [];
    const sourceElectionYear = Number.isInteger(metadataElectionYear)
      ? metadataElectionYear
      : metadataElectionYears.length
        ? Math.max(...metadataElectionYears)
        : electionYear;
    const targetSlug = `${stateCode.toLowerCase()}-${sourceElectionYear}-${source.id}`;
    const legacySlug = `${stateCode.toLowerCase()}-${electionYear}-${source.id}`;
    if (sourceElectionYear !== electionYear) {
      await retargetLegacySourceDocument(sql, {
        legacySlug,
        sourceElectionYear,
        targetSlug,
      });
    }
    const [document] = await sql`
      insert into source_documents (
        slug,
        state_code,
        election_year,
        category,
        title,
        source_url,
        authority,
        local_artifact,
        parser,
        timestamp_basis,
        confidence,
        status,
        metadata
      )
      values (
        ${targetSlug},
        ${stateCode},
        ${sourceElectionYear},
        ${source.category},
        ${source.category},
        ${source.sourceUrl},
        ${source.authority},
        ${source.localArtifact ?? ""},
        ${source.parser ?? native.parser},
        ${source.timestampBasis},
        ${source.confidence},
        ${source.status},
        ${JSON.stringify({ nativeSourceId: source.id, ...(source.metadata ?? {}) })}::text::jsonb
      )
      on conflict (slug) do update set
        category = excluded.category,
        title = excluded.title,
        source_url = excluded.source_url,
        authority = excluded.authority,
        local_artifact = excluded.local_artifact,
        parser = excluded.parser,
        timestamp_basis = excluded.timestamp_basis,
        confidence = excluded.confidence,
        status = excluded.status,
        metadata = excluded.metadata
      returning id
    `;
    sourceIds.set(source.id, document.id);
  }

  const primarySourceId = sourceIds.get(native.resultRows[0]?.sourceId ?? artifact.sources[0]?.id);
  const [importRun] = await sql`
    insert into import_runs (
      state_code,
      election_year,
      parser,
      source_document_id,
      status,
      summary
    )
    values (
      ${stateCode},
      ${electionYear},
      ${native.parser},
      ${primarySourceId ?? null},
      'staged',
      ${JSON.stringify(native.metrics)}::text::jsonb
    )
    returning id
  `;

  if (shouldReplaceResultRows) {
    await sql`
      delete from result_rows
      where state_code = ${stateCode}
        and contest_id = ${contest.id}
    `;
  }
  const reviewYearsToReplace = [
    ...(shouldReplaceReviewRows ? [electionYear] : []),
    ...historicalReviewYears,
  ];
  for (const reviewYear of reviewYearsToReplace) {
    await sql`
      delete from review_rows
      where state_code = ${stateCode}
        and election_year = ${reviewYear}
    `;
    await sql`
      delete from analysis_indicators
      where state_code = ${stateCode}
        and election_year = ${reviewYear}
    `;
  }
  if (shouldReplaceTurnoutRows) {
    await sql`
      delete from turnout_rows
      where state_code = ${stateCode}
        and election_year = ${electionYear}
    `;
  }
  if (shouldReplaceHistoricalRows) {
    await sql`
      delete from historical_result_rows
      where state_code = ${stateCode}
    `;
  }

  const reportingUnitRecordCandidates = supportsReportingUnits ? [
    ...native.resultRows.map((row) => ({
      fallbackDisplayName: row.jurisdictionName,
      reportingUnit: row.reportingUnit,
      sourceId: row.sourceId,
    })),
    ...(reviewRowsByYear.get(electionYear) ?? []).map((row) => ({
      fallbackDisplayName: row.localUnit || row.county,
      reportingUnit: row.reportingUnit,
      sourceId: row.sourceId,
    })),
    ...native.turnoutRows.map((row) => ({
      fallbackDisplayName: row.localUnit || row.county,
      reportingUnit: row.reportingUnit,
      sourceId: row.sourceId,
    })),
  ] : [];
  const reportingUnitRecordsByCode = new Map<
    string,
    NonNullable<ReturnType<typeof buildNativeReportingUnitRecord>>
  >();
  for (const candidate of reportingUnitRecordCandidates) {
    const record = buildNativeReportingUnitRecord({
      stateCode,
      electionEventId: electionEvent.id,
      reportingUnit: candidate.reportingUnit,
      fallbackDisplayName: candidate.fallbackDisplayName,
      sourceDocumentId: requiredSourceDocumentId(
        sourceIds,
        candidate.sourceId,
        "Native reporting unit",
      ),
    });
    if (!record) {
      continue;
    }
    const existing = reportingUnitRecordsByCode.get(record.code);
    if (existing && existing.is_geographic !== record.is_geographic) {
      throw new Error(
        "Native reporting unit " + record.code + " has conflicting geographic status.",
      );
    }
    reportingUnitRecordsByCode.set(record.code, record);
  }

  const reportingUnitIdByCode = new Map<string, string>();
  for (const records of chunkRows(Array.from(reportingUnitRecordsByCode.values()))) {
    const inserted = await sql`
      insert into reporting_units (
        state_code,
        election_id,
        reporting_grain,
        parent_geoid,
        source_unit_id,
        source_display_name,
        is_geographic,
        source_document_id
      )
      select
        ${stateCode},
        ${election.id}::uuid,
        incoming.reporting_grain,
        incoming.parent_geoid,
        incoming.source_unit_id,
        incoming.source_display_name,
        incoming.is_geographic,
        incoming.source_document_id
      from jsonb_to_recordset(${JSON.stringify(records)}::text::jsonb) as incoming (
        code text,
        reporting_grain text,
        parent_geoid text,
        source_unit_id text,
        source_display_name text,
        is_geographic boolean,
        source_document_id uuid
      )
      on conflict on constraint reporting_units_state_election_grain_parent_source_unique
      do update set
        source_display_name = case
          when ${shouldRefreshReportingUnitSource} then excluded.source_display_name
          else reporting_units.source_display_name
        end,
        is_geographic = case
          when ${shouldRefreshReportingUnitSource} then excluded.is_geographic
          else reporting_units.is_geographic
        end,
        source_document_id = case
          when ${shouldRefreshReportingUnitSource} then excluded.source_document_id
          else reporting_units.source_document_id
        end,
        updated_at = case
          when ${shouldRefreshReportingUnitSource} then now()
          else reporting_units.updated_at
        end
      returning id, reporting_grain, parent_geoid, source_unit_id
    `;
    for (const row of inserted) {
      const code = reportingUnitCode({
        state: stateCode,
        electionId: electionEvent.id,
        reportingGrain: String(row.reporting_grain),
        parentGeoid: row.parent_geoid ? String(row.parent_geoid) : null,
        sourceUnitId: String(row.source_unit_id),
      });
      reportingUnitIdByCode.set(code, String(row.id));
    }
  }

  function reportingUnitReference(input: {
    reportingUnit?: NativeReportingUnit;
    fallbackDisplayName: string;
    sourceId: string;
  }) {
    if (!supportsReportingUnits) {
      return null;
    }
    const record = buildNativeReportingUnitRecord({
      stateCode,
      electionEventId: electionEvent.id,
      reportingUnit: input.reportingUnit,
      fallbackDisplayName: input.fallbackDisplayName,
      sourceDocumentId: requiredSourceDocumentId(
        sourceIds,
        input.sourceId,
        "Native reporting unit",
      ),
    });
    if (!record) {
      return null;
    }
    const id = reportingUnitIdByCode.get(record.code);
    if (!id) {
      throw new Error("Native reporting unit was not persisted: " + record.code);
    }
    return { code: record.code, id };
  }

  const resultJurisdictions = native.resultRows.map((row) => {
    const reportingUnit = reportingUnitReference({
      reportingUnit: row.reportingUnit,
      fallbackDisplayName: row.jurisdictionName,
      sourceId: row.sourceId,
    });
    return {
      code: reportingUnit?.code ?? jurisdictionCode(stateCode, row.jurisdictionName),
      name: row.jurisdictionName,
      level: row.level,
    };
  });
  const resultJurisdictionWrites = dedupeRowsLastWins(
    resultJurisdictions,
    (row) => [row.level, row.code].join("\u0000"),
  );
  for (const jurisdictionBatch of chunkRows(resultJurisdictionWrites)) {
    await sql`
      insert into jurisdictions (state_code, code, name, level)
      select
        ${stateCode},
        incoming.code,
        incoming.name,
        incoming.level
      from jsonb_to_recordset(${JSON.stringify(jurisdictionBatch)}::text::jsonb) as incoming (
        code text,
        name text,
        level text
      )
      on conflict (state_code, level, code) do update set
        name = excluded.name
    `;
  }

  const resultRecords = native.resultRows.flatMap((row) => {
    const reportingUnit = reportingUnitReference({
      reportingUnit: row.reportingUnit,
      fallbackDisplayName: row.jurisdictionName,
      sourceId: row.sourceId,
    });
    const code = reportingUnit?.code ?? jurisdictionCode(stateCode, row.jurisdictionName);
    const tag = reportingUnit ? null : jurisdictionTagForRow({
      state: stateCode,
      jurisdictionCode: code,
      jurisdictionName: row.jurisdictionName,
      level: row.level,
    });
    return (Object.entries(row.votes) as [keyof typeof candidateParties, number][]).map(
      ([candidate, votes]) => ({
        jurisdiction_code: code,
        jurisdiction_name: row.jurisdictionName,
        jurisdiction_tag: tag,
        level: row.level,
        candidate_name: candidate,
        party: candidateParties[candidate],
        votes,
        reporting_unit_id: reportingUnit?.id ?? null,
        source_document_id: requiredSourceDocumentId(sourceIds, row.sourceId, "Native row"),
      }),
    );
  });
  const resultWriteRecords = dedupeRowsLastWins(
    resultRecords,
    (row) => [row.level, row.jurisdiction_code, row.candidate_name, row.party].join("\u0000"),
  );
  for (const records of chunkRows(resultWriteRecords)) {
    await sql`
      insert into result_rows (
        import_run_id,
        contest_id,
        state_code,
        jurisdiction_code,
        jurisdiction_name,
        jurisdiction_tag,
        level,
        candidate_name,
        party,
        votes,
        source_document_id
      )
      select
        ${importRun.id}::uuid,
        ${contest.id}::uuid,
        ${stateCode},
        incoming.jurisdiction_code,
        incoming.jurisdiction_name,
        incoming.jurisdiction_tag,
        incoming.level,
        incoming.candidate_name,
        incoming.party,
        incoming.votes,
        incoming.source_document_id
      from jsonb_to_recordset(${JSON.stringify(records)}::text::jsonb) as incoming (
        jurisdiction_code text,
        jurisdiction_name text,
        jurisdiction_tag text,
        level text,
        candidate_name text,
        party text,
        votes integer,
        source_document_id uuid
      )
      on conflict (contest_id, level, jurisdiction_code, candidate_name, party)
      do update set
        import_run_id = excluded.import_run_id,
        jurisdiction_name = excluded.jurisdiction_name,
        jurisdiction_tag = excluded.jurisdiction_tag,
        votes = excluded.votes,
        source_document_id = excluded.source_document_id
    `;
    if (supportsReportingUnits) {
      await sql`
        update result_rows as target
        set reporting_unit_id = incoming.reporting_unit_id
        from jsonb_to_recordset(${JSON.stringify(records)}::text::jsonb) as incoming (
          jurisdiction_code text,
          level text,
          candidate_name text,
          party text,
          reporting_unit_id uuid
        )
        where target.contest_id = ${contest.id}::uuid
          and target.state_code = ${stateCode}
          and target.level = incoming.level
          and target.jurisdiction_code = incoming.jurisdiction_code
          and target.candidate_name = incoming.candidate_name
          and target.party = incoming.party
          and incoming.reporting_unit_id is not null
      `;
    }
  }
  const storedResultRows = resultRecords.length;
  const reviewTagsByYearAndJurisdictionCode = new Map<string, string>();
  const storedReviewRowsByYear: Record<string, number> = {};
  const reviewRecords: Array<Record<string, unknown>> = [];
  let storedReviewRows = 0;
  let storedHistoricalReviewRows = 0;
  for (const [reviewYear, yearRows] of Array.from(reviewRowsByYear.entries()).sort(([left], [right]) => left - right)) {
    for (const [index, row] of yearRows.entries()) {
      const localUnit = row.localUnit || `review-row-${index + 1}`;
      const reportingUnit = reviewYear === electionYear ? reportingUnitReference({
        reportingUnit: row.reportingUnit,
        fallbackDisplayName: localUnit,
        sourceId: row.sourceId,
      }) : null;
      const code = jurisdictionCode(stateCode, row.county);
      const resolvedTag = jurisdictionTagForRow({
        state: stateCode,
        jurisdictionCode: code,
        jurisdictionName: row.county,
        level: "county",
      });
      if (row.jurisdictionTag && resolvedTag && row.jurisdictionTag !== resolvedTag) {
        throw new Error(`Review row ${reviewYear} ${row.county} has conflicting county tags.`);
      }
      const tag = row.jurisdictionTag ?? resolvedTag;
      const tagKey = `${reviewYear}:${code}`;
      const existingTag = reviewTagsByYearAndJurisdictionCode.get(tagKey);
      if (tag && existingTag && existingTag !== tag) {
        throw new Error(`Review rows resolve ${tagKey} to multiple county tags.`);
      }
      if (tag) {
        reviewTagsByYearAndJurisdictionCode.set(tagKey, tag);
      }
      reviewRecords.push({
        election_year: reviewYear,
        jurisdiction_code: code,
        jurisdiction_name: row.county,
        jurisdiction_tag: tag,
        local_unit: localUnit,
        level: row.level ?? "local",
        dem_candidate: row.demCandidate ?? null,
        rep_candidate: row.repCandidate ?? null,
        dem_votes: numberOrNull(row.demVotes),
        rep_votes: numberOrNull(row.repVotes),
        total_votes: numberOrNull(row.totalVotes),
        dem_share: numberOrNull(row.demShare),
        rep_share: numberOrNull(row.repShare),
        harris_votes: reviewYear === 2024 ? numberOrNull(row.harris ?? row.demVotes) : null,
        trump_votes: reviewYear === 2024 ? numberOrNull(row.trump ?? row.repVotes) : null,
        harris_share: reviewYear === 2024 ? numberOrNull(row.harrisShare ?? row.demShare) : null,
        trump_share: reviewYear === 2024 ? numberOrNull(row.trumpShare ?? row.repShare) : null,
        dem_dropoff: numberOrNull(row.demDropoff),
        rep_dropoff: numberOrNull(row.repDropoff),
        metrics: row,
        reporting_unit_id: reportingUnit?.id ?? null,
        source_document_id: requiredSourceDocumentId(sourceIds, row.sourceId, "Native row"),
      });
      storedReviewRowsByYear[String(reviewYear)] = (storedReviewRowsByYear[String(reviewYear)] ?? 0) + 1;
      if (reviewYear === electionYear) {
        storedReviewRows += 1;
      } else {
        storedHistoricalReviewRows += 1;
      }
    }
  }

  const reviewWriteRecords = dedupeRowsLastWins(
    reviewRecords,
    (row) => [
      row.election_year,
      row.jurisdiction_code,
      row.local_unit,
    ].join("\u0000"),
  );
  for (const records of chunkRows(reviewWriteRecords)) {
    await sql`
      insert into review_rows (
        import_run_id,
        state_code,
        election_year,
        jurisdiction_code,
        jurisdiction_name,
        jurisdiction_tag,
        local_unit,
        level,
        dem_candidate,
        rep_candidate,
        dem_votes,
        rep_votes,
        total_votes,
        dem_share,
        rep_share,
        harris_votes,
        trump_votes,
        harris_share,
        trump_share,
        dem_dropoff,
        rep_dropoff,
        metrics,
        source_document_id
      )
      select
        ${importRun.id}::uuid,
        ${stateCode},
        incoming.election_year,
        incoming.jurisdiction_code,
        incoming.jurisdiction_name,
        incoming.jurisdiction_tag,
        incoming.local_unit,
        incoming.level,
        incoming.dem_candidate,
        incoming.rep_candidate,
        incoming.dem_votes,
        incoming.rep_votes,
        incoming.total_votes,
        incoming.dem_share,
        incoming.rep_share,
        incoming.harris_votes,
        incoming.trump_votes,
        incoming.harris_share,
        incoming.trump_share,
        incoming.dem_dropoff,
        incoming.rep_dropoff,
        incoming.metrics,
        incoming.source_document_id
      from jsonb_to_recordset(${JSON.stringify(records)}::text::jsonb) as incoming (
        election_year integer,
        jurisdiction_code text,
        jurisdiction_name text,
        jurisdiction_tag text,
        local_unit text,
        level text,
        dem_candidate text,
        rep_candidate text,
        dem_votes integer,
        rep_votes integer,
        total_votes integer,
        dem_share numeric,
        rep_share numeric,
        harris_votes integer,
        trump_votes integer,
        harris_share numeric,
        trump_share numeric,
        dem_dropoff numeric,
        rep_dropoff numeric,
        metrics jsonb,
        source_document_id uuid
      )
      on conflict (state_code, election_year, jurisdiction_code, local_unit)
      do update set
        import_run_id = excluded.import_run_id,
        jurisdiction_name = excluded.jurisdiction_name,
        jurisdiction_tag = excluded.jurisdiction_tag,
        level = excluded.level,
        dem_candidate = excluded.dem_candidate,
        rep_candidate = excluded.rep_candidate,
        dem_votes = excluded.dem_votes,
        rep_votes = excluded.rep_votes,
        total_votes = excluded.total_votes,
        dem_share = excluded.dem_share,
        rep_share = excluded.rep_share,
        harris_votes = excluded.harris_votes,
        trump_votes = excluded.trump_votes,
        harris_share = excluded.harris_share,
        trump_share = excluded.trump_share,
        dem_dropoff = excluded.dem_dropoff,
        rep_dropoff = excluded.rep_dropoff,
        metrics = excluded.metrics,
        source_document_id = excluded.source_document_id
    `;
    if (supportsReportingUnits) {
      await sql`
        update review_rows as target
        set reporting_unit_id = incoming.reporting_unit_id
        from jsonb_to_recordset(${JSON.stringify(records)}::text::jsonb) as incoming (
          election_year integer,
          jurisdiction_code text,
          local_unit text,
          reporting_unit_id uuid
        )
        where target.state_code = ${stateCode}
          and target.election_year = incoming.election_year
          and target.jurisdiction_code = incoming.jurisdiction_code
          and target.local_unit = incoming.local_unit
          and incoming.reporting_unit_id is not null
      `;
    }
  }
  const storedIndicatorRowsByYear: Record<string, number> = {};
  const indicatorRecords: Array<Record<string, unknown>> = [];
  let storedIndicatorRows = 0;
  let storedHistoricalIndicatorRows = 0;
  for (const [reviewYear, yearRows] of Array.from(reviewRowsByYear.entries()).sort(([left], [right]) => left - right)) {
    const calculatedIndicators = reviewYear === electionYear
      ? await analysisIndicatorsForNativeRows(stateCode, yearRows)
      : calculateAnalysisIndicators(stateCode, yearRows);
    for (const indicator of calculatedIndicators) {
      const calculatedTag = "jurisdictionTag" in indicator ? indicator.jurisdictionTag : null;
      const tag = calculatedTag
        ?? reviewTagsByYearAndJurisdictionCode.get(`${reviewYear}:${indicator.jurisdictionCode}`)
        ?? jurisdictionTagForRow({
          state: stateCode,
          jurisdictionCode: indicator.jurisdictionCode,
          jurisdictionName: indicator.county || indicator.jurisdictionName,
          level: indicator.level,
        });
      indicatorRecords.push({
        election_year: reviewYear,
        jurisdiction_code: indicator.jurisdictionCode,
        jurisdiction_name: indicator.jurisdictionName,
        jurisdiction_tag: tag,
        level: indicator.level,
        indicator_type: indicator.type,
        severity: indicator.severity,
        label: indicator.label,
        summary: indicator.summary,
        detail: indicator.detail,
        metrics: indicator.metrics,
        source_document_id: requiredSourceDocumentId(sourceIds, indicator.sourceId, "Calculated indicator"),
      });
      storedIndicatorRowsByYear[String(reviewYear)] = (storedIndicatorRowsByYear[String(reviewYear)] ?? 0) + 1;
      if (reviewYear === electionYear) {
        storedIndicatorRows += 1;
      } else {
        storedHistoricalIndicatorRows += 1;
      }
    }
  }

  const indicatorWriteRecords = dedupeRowsLastWins(
    indicatorRecords,
    (row) => [
      row.election_year,
      row.level,
      row.jurisdiction_code,
      row.indicator_type,
      row.label,
    ].join("\u0000"),
  );
  for (const records of chunkRows(indicatorWriteRecords)) {
    await sql`
      insert into analysis_indicators (
        state_code,
        election_year,
        jurisdiction_code,
        jurisdiction_name,
        jurisdiction_tag,
        level,
        indicator_type,
        severity,
        label,
        summary,
        detail,
        metrics,
        source_document_id
      )
      select
        ${stateCode},
        incoming.election_year,
        incoming.jurisdiction_code,
        incoming.jurisdiction_name,
        incoming.jurisdiction_tag,
        incoming.level,
        incoming.indicator_type,
        incoming.severity,
        incoming.label,
        incoming.summary,
        incoming.detail,
        incoming.metrics,
        incoming.source_document_id
      from jsonb_to_recordset(${JSON.stringify(records)}::text::jsonb) as incoming (
        election_year integer,
        jurisdiction_code text,
        jurisdiction_name text,
        jurisdiction_tag text,
        level text,
        indicator_type text,
        severity numeric,
        label text,
        summary text,
        detail text,
        metrics jsonb,
        source_document_id uuid
      )
      on conflict (state_code, election_year, level, jurisdiction_code, indicator_type, label)
      do update set
        jurisdiction_name = excluded.jurisdiction_name,
        jurisdiction_tag = excluded.jurisdiction_tag,
        severity = excluded.severity,
        summary = excluded.summary,
        detail = excluded.detail,
        metrics = excluded.metrics,
        source_document_id = excluded.source_document_id
    `;
  }
  const turnoutRecords = native.turnoutRows.map((row, index) => {
    const localUnit = row.localUnit || `turnout-row-${index + 1}`;
    const reportingUnit = reportingUnitReference({
      reportingUnit: row.reportingUnit,
      fallbackDisplayName: localUnit,
      sourceId: row.sourceId,
    });
    return {
      jurisdiction_code: reportingUnit?.code ?? jurisdictionCode(stateCode, `${row.county}-${localUnit}`),
      jurisdiction_name: [row.county, localUnit].filter(Boolean).join(" / "),
      jurisdiction_tag: jurisdictionTagForRow({
        state: stateCode,
        jurisdictionName: row.county,
        level: "county",
      }),
      level: row.level ?? "local",
      ballots_cast: row.ballotsCast,
      registered_voters: numberOrNull(row.registeredVoters),
      turnout_pct: numberOrNull(row.turnoutPct),
      denominator_note: row.registrationDenominatorTiming ?? row.denominatorType ?? "Not recorded",
      warning_required: Boolean(row.warningRequired),
      reporting_unit_id: reportingUnit?.id ?? null,
      source_document_id: requiredSourceDocumentId(sourceIds, row.sourceId, "Native row"),
    };
  });
  const turnoutWriteRecords = dedupeRowsLastWins(
    turnoutRecords,
    (row) => [row.level, row.jurisdiction_code].join("\u0000"),
  );
  for (const records of chunkRows(turnoutWriteRecords)) {
    await sql`
      insert into turnout_rows (
        import_run_id,
        state_code,
        election_year,
        jurisdiction_code,
        jurisdiction_name,
        jurisdiction_tag,
        level,
        ballots_cast,
        registered_voters,
        turnout_pct,
        denominator_note,
        warning_required,
        source_document_id
      )
      select
        ${importRun.id}::uuid,
        ${stateCode},
        ${electionYear},
        incoming.jurisdiction_code,
        incoming.jurisdiction_name,
        incoming.jurisdiction_tag,
        incoming.level,
        incoming.ballots_cast,
        incoming.registered_voters,
        incoming.turnout_pct,
        incoming.denominator_note,
        incoming.warning_required,
        incoming.source_document_id
      from jsonb_to_recordset(${JSON.stringify(records)}::text::jsonb) as incoming (
        jurisdiction_code text,
        jurisdiction_name text,
        jurisdiction_tag text,
        level text,
        ballots_cast integer,
        registered_voters integer,
        turnout_pct numeric,
        denominator_note text,
        warning_required boolean,
        source_document_id uuid
      )
      on conflict (state_code, election_year, level, jurisdiction_code)
      do update set
        import_run_id = excluded.import_run_id,
        jurisdiction_name = excluded.jurisdiction_name,
        jurisdiction_tag = excluded.jurisdiction_tag,
        ballots_cast = excluded.ballots_cast,
        registered_voters = excluded.registered_voters,
        turnout_pct = excluded.turnout_pct,
        denominator_note = excluded.denominator_note,
        warning_required = excluded.warning_required,
        source_document_id = excluded.source_document_id
    `;
    if (supportsReportingUnits) {
      await sql`
        update turnout_rows as target
        set reporting_unit_id = incoming.reporting_unit_id
        from jsonb_to_recordset(${JSON.stringify(records)}::text::jsonb) as incoming (
          jurisdiction_code text,
          level text,
          reporting_unit_id uuid
        )
        where target.state_code = ${stateCode}
          and target.election_year = ${electionYear}
          and target.level = incoming.level
          and target.jurisdiction_code = incoming.jurisdiction_code
          and incoming.reporting_unit_id is not null
      `;
    }
  }
  const storedTurnoutRows = turnoutRecords.length;
  const historicalRecords = historicalRows.map((row, index) => {
    const localUnit = row.localUnit || `historical-row-${index + 1}`;
    const code = jurisdictionCode(stateCode, row.jurisdictionName);
    return {
      election_year: row.electionYear,
      source_id: row.sourceId,
      source_level: row.sourceLevel,
      row_method: row.rowMethod,
      jurisdiction_code: code,
      jurisdiction_name: row.jurisdictionName,
      jurisdiction_tag: row.jurisdictionTag ?? jurisdictionTagForRow({
        state: stateCode,
        jurisdictionCode: code,
        jurisdictionName: row.jurisdictionName,
        level: row.sourceLevel,
      }),
      local_unit: localUnit,
      dem_votes: numberOrNull(row.demVotes),
      rep_votes: numberOrNull(row.repVotes),
      other_votes: numberOrNull(row.otherVotes),
      total_votes: numberOrNull(row.totalVotes),
      metrics: row,
      source_document_id: requiredSourceDocumentId(
        sourceIds,
        row.sourceDocumentId ?? row.sourceId,
        "Historical result row",
      ),
    };
  });
  const historicalWriteRecords = dedupeRowsLastWins(
    historicalRecords,
    (row) => [
      row.election_year,
      row.source_id,
      row.jurisdiction_code,
      row.local_unit,
    ].join("\u0000"),
  );
  for (const records of chunkRows(historicalWriteRecords)) {
    await sql`
      insert into historical_result_rows (
        import_run_id,
        state_code,
        election_year,
        source_id,
        source_level,
        row_method,
        jurisdiction_code,
        jurisdiction_name,
        jurisdiction_tag,
        local_unit,
        dem_votes,
        rep_votes,
        other_votes,
        total_votes,
        metrics,
        source_document_id
      )
      select
        ${importRun.id}::uuid,
        ${stateCode},
        incoming.election_year,
        incoming.source_id,
        incoming.source_level,
        incoming.row_method,
        incoming.jurisdiction_code,
        incoming.jurisdiction_name,
        incoming.jurisdiction_tag,
        incoming.local_unit,
        incoming.dem_votes,
        incoming.rep_votes,
        incoming.other_votes,
        incoming.total_votes,
        incoming.metrics,
        incoming.source_document_id
      from jsonb_to_recordset(${JSON.stringify(records)}::text::jsonb) as incoming (
        election_year integer,
        source_id text,
        source_level text,
        row_method text,
        jurisdiction_code text,
        jurisdiction_name text,
        jurisdiction_tag text,
        local_unit text,
        dem_votes integer,
        rep_votes integer,
        other_votes integer,
        total_votes integer,
        metrics jsonb,
        source_document_id uuid
      )
      on conflict (state_code, election_year, source_id, jurisdiction_code, local_unit)
      do update set
        import_run_id = excluded.import_run_id,
        source_level = excluded.source_level,
        row_method = excluded.row_method,
        jurisdiction_name = excluded.jurisdiction_name,
        jurisdiction_tag = excluded.jurisdiction_tag,
        dem_votes = excluded.dem_votes,
        rep_votes = excluded.rep_votes,
        other_votes = excluded.other_votes,
        total_votes = excluded.total_votes,
        metrics = excluded.metrics,
        source_document_id = excluded.source_document_id
    `;
  }
  const storedHistoricalRows = historicalRecords.length;
  const summary = {
    ...native.metrics,
    storedResultRows,
    storedReviewRows,
    storedIndicatorRows,
    storedHistoricalReviewRows,
    storedHistoricalIndicatorRows,
    storedReviewRowsByYear,
    storedIndicatorRowsByYear,
    historicalReviewYears,
    storedTurnoutRows,
    storedHistoricalRows,
  };

  await sql`
    insert into capability_flags (
      state_code,
      election_year,
      certified_results,
      map,
      review_graphs,
      turnout,
      historical_baseline,
      source_planner,
      notes
    )
    values (
      ${stateCode},
      ${electionYear},
      ${Boolean(artifact.capabilities.certifiedResults)},
      ${Boolean(artifact.capabilities.map)},
      ${Boolean(artifact.capabilities.reviewGraphs)},
      ${Boolean(artifact.capabilities.turnout)},
      ${Boolean(artifact.capabilities.historicalBaseline)},
      ${Boolean(artifact.capabilities.sourcePlanner)},
      'Native official-source ETL promotion.'
    )
    on conflict (state_code, election_year) do update set
      certified_results = case
        when ${shouldReplaceResultRows} then excluded.certified_results
        else capability_flags.certified_results
      end,
      map = case
        when ${shouldReplaceResultRows} then excluded.map
        else capability_flags.map
      end,
      review_graphs = case
        when ${shouldReplaceReviewRows} then excluded.review_graphs
        else capability_flags.review_graphs
      end,
      turnout = case
        when ${shouldReplaceTurnoutRows} then excluded.turnout
        else capability_flags.turnout
      end,
      historical_baseline = case
        when ${shouldReplaceHistoricalRows} then excluded.historical_baseline
        else capability_flags.historical_baseline
      end,
      source_planner = excluded.source_planner,
      notes = case
        when ${shouldReplaceResultRows || shouldReplaceReviewRows || shouldReplaceHistoricalRows} then excluded.notes
        when capability_flags.notes is null or capability_flags.notes = '' then excluded.notes
        else capability_flags.notes
      end
  `;

  for (const historicalReviewYear of historicalReviewYears) {
    const historicalBaselineLoaded = historicalRows.some((row) => row.electionYear === historicalReviewYear);
    await sql`
      insert into capability_flags (
        state_code,
        election_year,
        certified_results,
        map,
        review_graphs,
        turnout,
        historical_baseline,
        source_planner,
        notes
      )
      values (
        ${stateCode},
        ${historicalReviewYear},
        ${historicalBaselineLoaded},
        ${historicalBaselineLoaded},
        true,
        false,
        ${historicalBaselineLoaded},
        true,
        'Same-grain historical presidential and comparison-contest rows loaded. Advisory indicators identify review signals only and are not findings of misconduct.'
      )
      on conflict (state_code, election_year) do update set
        certified_results = case
          when ${historicalBaselineLoaded} then true
          else capability_flags.certified_results
        end,
        map = case
          when ${historicalBaselineLoaded} then true
          else capability_flags.map
        end,
        review_graphs = true,
        historical_baseline = case
          when ${historicalBaselineLoaded} then true
          else capability_flags.historical_baseline
        end,
        notes = case
          when capability_flags.notes is null or capability_flags.notes = '' then excluded.notes
          when position(excluded.notes in capability_flags.notes) > 0 then capability_flags.notes
          else capability_flags.notes || ' ' || excluded.notes
        end
    `;
  }
  await sql`
    insert into validation_reports (
      import_run_id,
      state_code,
      election_year,
      passed,
      errors,
      warnings,
      metrics
    )
    values (
      ${importRun.id},
      ${stateCode},
      ${electionYear},
      ${artifact.validation.passed},
      ${JSON.stringify(artifact.validation.errors)}::text::jsonb,
      ${JSON.stringify(artifact.validation.warnings)}::text::jsonb,
      ${JSON.stringify(artifact.validation.metrics)}::text::jsonb
    )
  `;

  await sql`
    update import_runs
    set
      status = 'promoted',
      finished_at = now(),
      summary = ${JSON.stringify(summary)}::text::jsonb
    where id = ${importRun.id}
  `;

    await bumpPublicDataRevision(sql, `native-promotion:${stateCode}:${electionYear}`);

    return {
      state: stateCode,
      electionYear,
      ...summary,
    };
  });
}

