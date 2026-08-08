import { getReadSql, hasReadableDatabase, rethrowReadErrorIfStrict } from "@/db/read-sql";
import { readPublicDataRevision } from "@/db/public-data-revision";
import {
  matchesPrecinctGeometryPublicationMetadata,
  precinctGeometryPublicManifestSha256,
  requiresPrecinctGeometryPublicationGate,
  requiresPrecinctResultPublicationGate,
} from "./precinct-result-publication";
import { resolveMinnesotaPrecinctRehearsal } from "./mn-precinct-rehearsal-server";
import type { PrecinctGeometryManifest } from "./precinct-geography";
import {
  getCoverage,
  seedElections,
  seedImportRuns,
  seedResults,
  seedSources,
  seedStates,
} from "./seed-data";
import type {
  CapabilitySummary,
  CoverageSummary,
  AnalysisIndicator,
  CompletenessSummary,
  ElectionSummary,
  EquipmentRowSummary,
  HistoricalResultRowSummary,
  ImportRunSummary,
  ResultRow,
  ReviewRowSummary,
  SourceSummary,
  StateSummary,
  TurnoutRowSummary,
} from "./types";
import { jurisdictionTagForRow } from "./jurisdiction-tags";
import { finalizeResultRowSummary } from "./result-row-summary";

const emptyCapabilities: CapabilitySummary = {
  sourcePlanner: true,
  certifiedResults: false,
  map: false,
  reviewGraphs: false,
  turnout: false,
  historicalBaseline: false,
  notes: "",
};

async function getDatabaseCapabilitySummary(input: { state: string; year: number }): Promise<CapabilitySummary | null> {
  try {
    const sql = getReadSql();
    const [row] = (await sql`
      select
        source_planner as "sourcePlanner",
        certified_results as "certifiedResults",
        map,
        review_graphs as "reviewGraphs",
        turnout,
        historical_baseline as "historicalBaseline",
        notes
      from capability_flags
      where state_code = ${input.state}
        and election_year = ${input.year}
      limit 1
    `) as Array<{
      sourcePlanner: boolean;
      certifiedResults: boolean;
      map: boolean;
      reviewGraphs: boolean;
      turnout: boolean;
      historicalBaseline: boolean;
      notes: string;
    }>;
    return row ?? null;
  } catch (error) {
    rethrowReadErrorIfStrict(error);
    return null;
  }
}

function toIsoTimestamp(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

export async function getPublicDataRevision(): Promise<string | null> {
  if (!hasReadableDatabase()) {
    return "seed-data";
  }

  try {
    return await readPublicDataRevision(getReadSql());
  } catch (error) {
    rethrowReadErrorIfStrict(error);
    return null;
  }
}
function completenessStatus(input: {
  capabilities: CapabilitySummary;
  mapGeometrySourceCount: number;
  resultRows: number;
  reviewRowCount: number;
  sourceCount: number;
  sourcesMissingUrls: number;
}): CompletenessSummary["status"] {
  if (input.resultRows === 0) {
    return "pending";
  }

  if (input.sourceCount === 0 || input.sourcesMissingUrls > 0) {
    return "needs_sources";
  }

  if (
    !input.capabilities.certifiedResults ||
    !input.capabilities.map ||
    input.mapGeometrySourceCount === 0
  ) {
    return "results_only";
  }

  if (input.reviewRowCount === 0 || !input.capabilities.reviewGraphs) {
    return "review_ready";
  }

  return "complete";
}

function completenessGaps(input: {
  capabilities: CapabilitySummary;
  mapGeometrySourceCount: number;
  resultRows: number;
  reviewRowCount: number;
  sourceCount: number;
  sourcesMissingUrls: number;
  jurisdictionTagCoverage?: CompletenessSummary["jurisdictionTagCoverage"];
}) {
  const gaps: string[] = [];

  if (input.resultRows === 0) {
    gaps.push("No result rows loaded");
  }

  if (input.sourceCount === 0) {
    gaps.push("No source records");
  }

  if (input.sourcesMissingUrls > 0) {
    gaps.push(`${input.sourcesMissingUrls} source URL${input.sourcesMissingUrls === 1 ? "" : "s"} missing`);
  }

  if (!input.capabilities.map) {
    gaps.push("Map capability pending");
  } else if (input.mapGeometrySourceCount === 0) {
    gaps.push("Map geometry source missing");
  }

  if (input.reviewRowCount === 0 || !input.capabilities.reviewGraphs) {
    gaps.push("Review rows pending");
  }

  if (!input.capabilities.turnout) {
    gaps.push("Turnout pending");
  }

  if (!input.capabilities.historicalBaseline) {
    gaps.push("Historical baseline pending");
  }

  const tagCoverage = input.jurisdictionTagCoverage;
  if (tagCoverage && tagCoverage.resultJurisdictions > tagCoverage.taggedResultJurisdictions) {
    gaps.push(`${tagCoverage.resultJurisdictions - tagCoverage.taggedResultJurisdictions} result jurisdiction${tagCoverage.resultJurisdictions - tagCoverage.taggedResultJurisdictions === 1 ? "" : "s"} missing canonical tags`);
  }

  if (tagCoverage && tagCoverage.missingHistorical2020Jurisdictions > 0) {
    gaps.push(`${tagCoverage.missingHistorical2020Jurisdictions} tagged jurisdiction${tagCoverage.missingHistorical2020Jurisdictions === 1 ? "" : "s"} missing 2020 historical join rows`);
  }

  return gaps;
}

function sourceTierLabel(input: {
  legacyImportCount: number;
  nativeImportCount: number;
  resultRows: number;
}): CompletenessSummary["sourceTier"] {
  if (input.nativeImportCount > 0 && input.legacyImportCount > 0) {
    return "mixed";
  }

  if (input.nativeImportCount > 0) {
    return "native_official";
  }

  if (input.legacyImportCount > 0) {
    return "legacy_bundle";
  }

  return input.resultRows > 0 ? "seed_fallback" : "pending";
}

function isMapGeometrySource(source: Pick<SourceSummary, "category" | "localArtifact" | "parser" | "status">) {
  if (source.status !== "loaded") {
    return false;
  }

  const category = source.category.toLowerCase();
  const localArtifact = source.localArtifact.toLowerCase();
  const parser = source.parser.toLowerCase();
  return (
    localArtifact.endsWith(".geojson") ||
    parser.includes("geojson") ||
    (category.includes("boundar") && category.includes("count"))
  );
}

function seedCompletenessReport(year: number): CompletenessSummary[] {
  return seedStates.map((state) => {
    const results = seedResults.filter((row) => row.state === state.code && row.year === year);
    const sources = seedSources.filter((source) => source.state === state.code && source.electionYear === year);
    const importRuns = seedImportRuns.filter((run) => run.state === state.code && run.electionYear === year);
    const nativeImportRuns = importRuns.filter((run) => run.parser.toLowerCase().includes("native"));
    const sourcesMissingUrls = sources.filter((source) => !source.sourceUrl.trim()).length;
    const indicatorCount = state.capabilities.reviewGraphs ? 1 : 0;
    const reviewRowCount = state.capabilities.reviewGraphs ? results.length : 0;
    const resultJurisdictions = new Set(results.map((row) => row.jurisdictionCode)).size;
    const jurisdictionTagCoverage: CompletenessSummary["jurisdictionTagCoverage"] = {
      resultJurisdictions,
      taggedResultJurisdictions: 0,
      historical2020Jurisdictions: 0,
      taggedHistorical2020Jurisdictions: 0,
      matchedHistorical2020Jurisdictions: 0,
      missingHistorical2020Jurisdictions: 0,
    };
    const status = completenessStatus({
      capabilities: state.capabilities,
      mapGeometrySourceCount: sources.filter(isMapGeometrySource).length,
      resultRows: results.length,
      reviewRowCount,
      sourceCount: sources.length,
      sourcesMissingUrls,
    });

    return {
      state: state.code,
      name: state.name,
      authority: state.authority,
      resultRows: results.length,
      resultJurisdictions,
      historicalJoinReady: false,
      jurisdictionTagCoverage,
      sourceCount: sources.length,
      mapGeometrySourceCount: sources.filter(isMapGeometrySource).length,
      sourcesMissingUrls,
      indicatorCount,
      countyIndicatorCount: indicatorCount,
      flaggedCountyJurisdictions: indicatorCount,
      flaggedAreas: indicatorCount,
      reviewRowCount,
      turnoutRowCount: 0,
      historicalRowCount: 0,
      equipmentRowCount: 0,
      flaggedJurisdictions: indicatorCount,
      importRunCount: importRuns.length,
      legacyImportCount: importRuns.filter((run) => run.parser.toLowerCase().includes("legacy")).length,
      latestImportAt: importRuns[0]?.startedAt ?? null,
      latestImportStatus: importRuns[0]?.status ?? null,
      latestImportSummary: importRuns[0]?.summary ?? null,
      latestNativeImportSummary: nativeImportRuns[0]?.summary ?? null,
      latestParser: importRuns[0]?.parser ?? null,
      nativeImportCount: nativeImportRuns.length,
      sourceTier: sourceTierLabel({
        legacyImportCount: importRuns.filter((run) => run.parser.toLowerCase().includes("legacy")).length,
        nativeImportCount: nativeImportRuns.length,
        resultRows: results.length,
      }),
      capabilities: state.capabilities,
      status,
      gaps: completenessGaps({
        capabilities: state.capabilities,
        mapGeometrySourceCount: sources.filter(isMapGeometrySource).length,
        resultRows: results.length,
        reviewRowCount,
        sourceCount: sources.length,
        sourcesMissingUrls,
        jurisdictionTagCoverage,
      }),
    };
  });
}

export function currentDataSource() {
  return hasReadableDatabase() ? "database" : "seed-fallback";
}

export async function isPrecinctGeometryManifestPublished(
  manifest: PrecinctGeometryManifest,
) {
  if (!requiresPrecinctGeometryPublicationGate(manifest)) return true;
  if (
    manifest.delivery?.format !== "parent_scoped_geojson"
    || !hasReadableDatabase()
  ) {
    return false;
  }

  const expectedFeatureCount = manifest.delivery.featureCount;
  const publicManifestSha256 = precinctGeometryPublicManifestSha256(manifest);
  let rows: Array<{
    metadata: unknown;
    crosswalkCount: number;
    featureCount: number;
    reportingUnitCount: number;
    authorizedLinkCount: number;
  }>;
  try {
    const sql = getReadSql();
    rows = (await sql`
      select
        geography_versions.metadata,
        count(*)::int as "crosswalkCount",
        count(distinct geography_features.id)::int as "featureCount",
        count(distinct reporting_units.id)::int as "reportingUnitCount",
        count(*) filter (
          where geography_features.id is not null
            and geography_features.is_geographic = true
            and reporting_units.election_id = geography_versions.election_id
            and reporting_units.state_code = geography_versions.state_code
            and reporting_units.reporting_grain = 'precinct'
            and reporting_units.is_geographic = true
            and reporting_units.metadata->>'publicDeliveryAuthorized' = 'true'
            and reporting_units.metadata->'releaseCandidate'->>'publicDeliveryAuthorized' = 'true'
            and reporting_units.metadata->'releaseCandidate'->>'sha256'
              = geography_versions.metadata->'releaseCandidate'->>'sha256'
            and result_sources.metadata->>'publicDeliveryAuthorized' = 'true'
            and result_sources.metadata->'releaseCandidate'->>'publicDeliveryAuthorized' = 'true'
            and result_sources.metadata->'releaseCandidate'->>'sha256'
              = geography_versions.metadata->'releaseCandidate'->>'sha256'
            and reporting_unit_geometry_crosswalks.relationship_type = 'one_to_one'
            and reporting_unit_geometry_crosswalks.match_method = 'exact_official_id'
            and reporting_unit_geometry_crosswalks.review_status = 'reviewed'
            and reporting_unit_geometry_crosswalks.confidence = 'high'
            and reporting_unit_geometry_crosswalks.metadata->>'manifestId'
              = geography_versions.metadata->>'manifestId'
            and reporting_unit_geometry_crosswalks.metadata->>'publicDeliveryAuthorized' = 'true'
            and reporting_unit_geometry_crosswalks.metadata->'releaseCandidate'->>'publicDeliveryAuthorized' = 'true'
            and reporting_unit_geometry_crosswalks.metadata->'releaseCandidate'->>'sha256'
              = geography_versions.metadata->'releaseCandidate'->>'sha256'
        )::int as "authorizedLinkCount"
      from geography_versions
      inner join elections
        on elections.id = geography_versions.election_id
      inner join reporting_unit_geometry_crosswalks
        on reporting_unit_geometry_crosswalks.geometry_version_id = geography_versions.id
      left join geography_features
        on geography_features.id = reporting_unit_geometry_crosswalks.geography_feature_id
        and geography_features.geometry_version_id = geography_versions.id
      inner join reporting_units
        on reporting_units.id = reporting_unit_geometry_crosswalks.reporting_unit_id
      left join source_documents result_sources
        on result_sources.id = reporting_units.source_document_id
      where geography_versions.state_code = ${manifest.state}
        and geography_versions.geography_type = ${manifest.geography.level}
        and geography_versions.boundary_vintage = ${manifest.geography.boundaryVintage}
        and geography_versions.status = 'published'
        and geography_versions.metadata->>'manifestId' = ${manifest.id}
        and geography_versions.metadata->>'publicDeliveryAuthorized' = 'true'
        and geography_versions.metadata->'releaseCandidate'->>'publicDeliveryAuthorized' = 'true'
        and geography_versions.metadata->'publicActivation'->>'publicManifestSha256'
          = ${publicManifestSha256}
        and elections.year = ${manifest.election.year}
        and elections.election_date = ${manifest.election.date}
        and lower(elections.office) = ${manifest.election.office.toLowerCase()}
      group by geography_versions.id
    `) as typeof rows;
  } catch (error) {
    rethrowReadErrorIfStrict(error);
    return false;
  }

  const row = rows.length === 1 ? rows[0] : null;
  return Boolean(
    row
    && Number(row.crosswalkCount) === expectedFeatureCount
    && Number(row.featureCount) === expectedFeatureCount
    && Number(row.reportingUnitCount) === expectedFeatureCount
    && Number(row.authorizedLinkCount) === expectedFeatureCount
    && matchesPrecinctGeometryPublicationMetadata(manifest, row.metadata),
  );
}

export async function listStates(): Promise<StateSummary[]> {
  if (!hasReadableDatabase()) {
    return seedStates;
  }

  let rows: Array<{
    code: string;
    name: string;
    authority: string;
    countyLabel: string;
    sourcePlanner: boolean | null;
    certifiedResults: boolean | null;
    map: boolean | null;
    reviewGraphs: boolean | null;
    turnout: boolean | null;
    historicalBaseline: boolean | null;
    notes: string | null;
  }>;

  try {
    const sql = getReadSql();
    rows = (await sql`
      select
        states.code,
        states.name,
        states.authority,
        states.county_label as "countyLabel",
        capability_flags.source_planner as "sourcePlanner",
        capability_flags.certified_results as "certifiedResults",
        capability_flags.map,
        capability_flags.review_graphs as "reviewGraphs",
        capability_flags.turnout,
        capability_flags.historical_baseline as "historicalBaseline",
        capability_flags.notes
      from states
      left join capability_flags on states.code = capability_flags.state_code
        and capability_flags.election_year = 2024
      order by states.name
    `) as typeof rows;
  } catch (error) {
    rethrowReadErrorIfStrict(error);
    return seedStates;
  }

  if (rows.length === 0) {
    return seedStates;
  }

  const byCode = new Map<string, StateSummary>();

  for (const row of rows) {
    if (byCode.has(row.code)) {
      continue;
    }

    byCode.set(row.code, {
      code: row.code,
      name: row.name,
      authority: row.authority,
      countyLabel: row.countyLabel,
      capabilities: {
        sourcePlanner: row.sourcePlanner ?? emptyCapabilities.sourcePlanner,
        certifiedResults: row.certifiedResults ?? emptyCapabilities.certifiedResults,
        map: row.map ?? emptyCapabilities.map,
        reviewGraphs: row.reviewGraphs ?? emptyCapabilities.reviewGraphs,
        turnout: row.turnout ?? emptyCapabilities.turnout,
        historicalBaseline: row.historicalBaseline ?? emptyCapabilities.historicalBaseline,
        notes: row.notes ?? emptyCapabilities.notes,
      },
    });
  }

  return Array.from(byCode.values());
}

export async function listElections(input: {
  year?: number;
  office?: string;
}): Promise<ElectionSummary[]> {
  if (!hasReadableDatabase()) {
    return seedElections.filter((election) => {
      if (input.year && election.year !== input.year) {
        return false;
      }

      if (input.office && election.office !== input.office.toLowerCase()) {
        return false;
      }

      return true;
    });
  }

  let rows: Array<{
    year: number;
    office: string;
    electionDate: string;
    label: string;
    stateCode: string | null;
  }>;

  try {
    const sql = getReadSql();
    rows = (await sql`
      select
        elections.year,
        elections.office,
        elections.election_date as "electionDate",
        elections.label,
        contests.state_code as "stateCode"
      from elections
      left join contests on contests.election_id = elections.id
    `) as typeof rows;
  } catch (error) {
    rethrowReadErrorIfStrict(error);
    return seedElections;
  }

  const grouped = new Map<string, ElectionSummary>();

  for (const row of rows) {
    if (input.year && row.year !== input.year) {
      continue;
    }

    if (input.office && row.office !== input.office.toLowerCase()) {
      continue;
    }

    const key = `${row.year}:${row.office}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.statesLoaded += row.stateCode ? 1 : 0;
      continue;
    }

    grouped.set(key, {
      year: row.year,
      office: row.office,
      electionDate: row.electionDate,
      label: row.label,
      statesLoaded: row.stateCode ? 1 : 0,
    });
  }

  return Array.from(grouped.values());
}

export async function listResults(input: {
  state: string;
  year: number;
  level: string;
  office?: string;
  parentGeoid?: string;
}): Promise<ResultRow[]> {
  const normalizedOffice = input.office?.trim().toLowerCase() || null;
  const parentGeoid = input.parentGeoid?.trim() || null;
  const requiresPublicationGate = requiresPrecinctResultPublicationGate(input)
    && !resolveMinnesotaPrecinctRehearsal().enabled;
  if (parentGeoid && (input.level !== "precinct" || !/^\d{5}$/.test(parentGeoid))) {
    throw new Error(
      "parentGeoid requires precinct results and a five-digit county GEOID",
    );
  }
  const matchesParent = (row: ResultRow) => !parentGeoid
    || row.jurisdictionCode.startsWith(
      "reporting:" + input.state + ":",
    ) && row.jurisdictionCode.includes(":precinct:" + parentGeoid + ":");
  if (!hasReadableDatabase()) {
    if (requiresPublicationGate) return [];
    return seedResults
      .filter(
        (row) =>
          row.state === input.state
          && row.year === input.year
          && row.level === input.level
          && (
            normalizedOffice === null
            || row.office.toLowerCase() === normalizedOffice
          )
          && matchesParent(row),
      )
      .map((row) => ({
        ...row,
        jurisdictionTag: row.jurisdictionTag ?? jurisdictionTagForRow({
          state: row.state, jurisdictionCode: row.jurisdictionCode, jurisdictionName: row.jurisdictionName, level: row.level,
        }),
      }));
  }

  let rows: Array<{
    stateCode: string;
    office: string;
    level: string;
    jurisdictionCode: string;
    jurisdictionName: string;
    jurisdictionTag: string | null;
    candidateName: string;
    party: string;
    votes: number;
    sourceDocumentId: string | null;
    sourceSlug: string | null;
  }>;

  try {
    const sql = getReadSql();
    rows = parentGeoid
      ? (await sql`
        select
          result_rows.state_code as "stateCode",
          elections.office,
          result_rows.level,
          result_rows.jurisdiction_tag as "jurisdictionTag",
          result_rows.jurisdiction_code as "jurisdictionCode",
          result_rows.jurisdiction_name as "jurisdictionName",
          result_rows.candidate_name as "candidateName",
          result_rows.party,
          result_rows.votes,
          result_rows.source_document_id as "sourceDocumentId",
          source_documents.slug as "sourceSlug"
        from result_rows
        inner join contests on result_rows.contest_id = contests.id
        inner join elections on contests.election_id = elections.id
        inner join reporting_units
          on result_rows.reporting_unit_id = reporting_units.id
          and reporting_units.election_id = elections.id
          and reporting_units.state_code = result_rows.state_code
          and reporting_units.reporting_grain = 'precinct'
        left join source_documents on result_rows.source_document_id = source_documents.id
        where result_rows.state_code = ${input.state}
          and result_rows.level = ${input.level}
          and elections.year = ${input.year}
          and reporting_units.parent_geoid = ${parentGeoid}
          and (
            ${!requiresPublicationGate}
            or (
              reporting_units.metadata->>'publicDeliveryAuthorized' = 'true'
              and reporting_units.metadata->'releaseCandidate'->>'publicDeliveryAuthorized' = 'true'
              and source_documents.metadata->>'publicDeliveryAuthorized' = 'true'
              and source_documents.metadata->'releaseCandidate'->>'publicDeliveryAuthorized' = 'true'
              and exists (
                select 1
                from reporting_unit_geometry_crosswalks gate_crosswalk
                inner join geography_versions gate_version
                  on gate_version.id = gate_crosswalk.geometry_version_id
                inner join geography_features gate_feature
                  on gate_feature.id = gate_crosswalk.geography_feature_id
                  and gate_feature.geometry_version_id = gate_version.id
                where gate_crosswalk.reporting_unit_id = reporting_units.id
                  and gate_version.election_id = elections.id
                  and gate_version.state_code = result_rows.state_code
                  and gate_version.geography_type = 'precinct'
                  and gate_version.status = 'published'
                  and gate_version.metadata->>'publicDeliveryAuthorized' = 'true'
                  and gate_version.metadata->'releaseCandidate'->>'publicDeliveryAuthorized' = 'true'
                  and gate_version.metadata->'releaseCandidate'->>'sha256'
                    = reporting_units.metadata->'releaseCandidate'->>'sha256'
                  and gate_version.metadata->>'manifestId'
                    = gate_crosswalk.metadata->>'manifestId'
                  and gate_crosswalk.relationship_type = 'one_to_one'
                  and gate_crosswalk.match_method = 'exact_official_id'
                  and gate_crosswalk.review_status = 'reviewed'
                  and gate_crosswalk.confidence = 'high'
                  and gate_crosswalk.metadata->>'publicDeliveryAuthorized' = 'true'
                  and gate_crosswalk.metadata->'releaseCandidate'->>'publicDeliveryAuthorized' = 'true'
              )
            )
          )
          and (
            ${normalizedOffice}::text is null
            or lower(elections.office) = ${normalizedOffice}
          )
        order by result_rows.jurisdiction_name, result_rows.candidate_name
      `) as typeof rows
      : (await sql`
      select
        result_rows.state_code as "stateCode",
        elections.office,
        result_rows.level,
        result_rows.jurisdiction_tag as "jurisdictionTag",
        result_rows.jurisdiction_code as "jurisdictionCode",
        result_rows.jurisdiction_name as "jurisdictionName",
        result_rows.candidate_name as "candidateName",
        result_rows.party,
        result_rows.votes,
        result_rows.source_document_id as "sourceDocumentId",
        source_documents.slug as "sourceSlug"
      from result_rows
      inner join contests on result_rows.contest_id = contests.id
      inner join elections on contests.election_id = elections.id
      left join reporting_units
        on result_rows.reporting_unit_id = reporting_units.id
        and reporting_units.election_id = elections.id
        and reporting_units.state_code = result_rows.state_code
        and reporting_units.reporting_grain = 'precinct'
      left join source_documents on result_rows.source_document_id = source_documents.id
      where result_rows.state_code = ${input.state}
        and result_rows.level = ${input.level}
        and elections.year = ${input.year}
        and (
          ${!requiresPublicationGate}
          or (
            reporting_units.metadata->>'publicDeliveryAuthorized' = 'true'
            and reporting_units.metadata->'releaseCandidate'->>'publicDeliveryAuthorized' = 'true'
            and source_documents.metadata->>'publicDeliveryAuthorized' = 'true'
            and source_documents.metadata->'releaseCandidate'->>'publicDeliveryAuthorized' = 'true'
            and exists (
              select 1
              from reporting_unit_geometry_crosswalks gate_crosswalk
              inner join geography_versions gate_version
                on gate_version.id = gate_crosswalk.geometry_version_id
              inner join geography_features gate_feature
                on gate_feature.id = gate_crosswalk.geography_feature_id
                and gate_feature.geometry_version_id = gate_version.id
              where gate_crosswalk.reporting_unit_id = reporting_units.id
                and gate_version.election_id = elections.id
                and gate_version.state_code = result_rows.state_code
                and gate_version.geography_type = 'precinct'
                and gate_version.status = 'published'
                and gate_version.metadata->>'publicDeliveryAuthorized' = 'true'
                and gate_version.metadata->'releaseCandidate'->>'publicDeliveryAuthorized' = 'true'
                and gate_version.metadata->'releaseCandidate'->>'sha256'
                  = reporting_units.metadata->'releaseCandidate'->>'sha256'
                and gate_version.metadata->>'manifestId'
                  = gate_crosswalk.metadata->>'manifestId'
                and gate_crosswalk.relationship_type = 'one_to_one'
                and gate_crosswalk.match_method = 'exact_official_id'
                and gate_crosswalk.review_status = 'reviewed'
                and gate_crosswalk.confidence = 'high'
                and gate_crosswalk.metadata->>'publicDeliveryAuthorized' = 'true'
                and gate_crosswalk.metadata->'releaseCandidate'->>'publicDeliveryAuthorized' = 'true'
            )
          )
        )
        and (
          ${normalizedOffice}::text is null
          or lower(elections.office) = ${normalizedOffice}
        )
      order by result_rows.jurisdiction_name, result_rows.candidate_name
    `) as typeof rows;
  } catch (error) {
    rethrowReadErrorIfStrict(error);
    if (requiresPublicationGate) return [];
    return seedResults.filter((row) =>
      row.state === input.state
      && row.year === input.year
      && row.level === input.level
      && (
        normalizedOffice === null
        || row.office.toLowerCase() === normalizedOffice
      )
      && matchesParent(row)
    );
  }

  const grouped = new Map<string, ResultRow>();

  for (const row of rows) {
    const key = row.office.toLowerCase() + "|" + row.jurisdictionCode;
    const current =
      grouped.get(key) ??
      ({
        state: row.stateCode,
        year: input.year,
        office: row.office,
        level: row.level as ResultRow["level"],
        jurisdictionCode: row.jurisdictionCode,
        jurisdictionName: row.jurisdictionName,
        jurisdictionTag: row.jurisdictionTag ?? jurisdictionTagForRow({ state: row.stateCode, jurisdictionCode: row.jurisdictionCode, jurisdictionName: row.jurisdictionName, level: row.level }),
        votes: {},
        totalVotes: 0,
        marginVotes: 0,
        marginPct: 0,
        winner: "",
        sourceId: row.sourceSlug ?? row.sourceDocumentId ?? "database",
      } satisfies ResultRow);

    current.votes[row.candidateName] = row.votes;
    current.totalVotes += row.votes;
    grouped.set(key, current);
  }

  return Array.from(grouped.values(), finalizeResultRowSummary);
}

export async function listSources(input: { state: string; year: number }): Promise<SourceSummary[]> {
  if (!hasReadableDatabase()) {
    return seedSources.filter(
      (source) => source.state === input.state && source.electionYear === input.year,
    );
  }

  let rows: Array<{
    id: string;
    slug: string;
    state: string;
    electionYear: number;
    category: string;
    title: string;
    sourceUrl: string;
    authority: string;
    localArtifact: string | null;
    parser: string | null;
    timestampBasis: string;
    confidence: string;
    status: SourceSummary["status"];
  }>;

  try {
    const sql = getReadSql();
    rows = (await sql`
      select
        id,
        slug,
        state_code as "state",
        election_year as "electionYear",
        category,
        title,
        source_url as "sourceUrl",
        authority,
        local_artifact as "localArtifact",
        parser,
        timestamp_basis as "timestampBasis",
        confidence,
        status
      from source_documents
      where state_code = ${input.state}
        and election_year = ${input.year}
      order by category, title
    `) as typeof rows;
  } catch (error) {
    rethrowReadErrorIfStrict(error);
    return seedSources.filter(
      (source) => source.state === input.state && source.electionYear === input.year,
    );
  }

  return rows.map((row) => ({
    id: row.slug,
    state: row.state,
    electionYear: row.electionYear,
    category: row.category,
    title: row.title,
    sourceUrl: row.sourceUrl,
    authority: row.authority,
    localArtifact: row.localArtifact ?? "",
    parser: row.parser ?? "",
    timestampBasis: row.timestampBasis,
    confidence: row.confidence,
    status: row.status,
  }));
}

export async function listIndicators(input: {
  state: string;
  year: number;
}): Promise<AnalysisIndicator[]> {
  if (!hasReadableDatabase()) {
    return [];
  }

  let rows: Array<{
    detail: string;
    electionYear: number;
    id: string;
    jurisdictionCode: string;
    jurisdictionName: string;
    jurisdictionTag: string | null;
    label: string;
    level: AnalysisIndicator["level"];
    metrics: unknown;
    severity: string | number;
    state: string;
    summary: string;
    type: string;
  }>;

  try {
    const sql = getReadSql();
    rows = (await sql`
      select
        analysis_indicators.id,
        analysis_indicators.state_code as "state",
        analysis_indicators.election_year as "electionYear",
        analysis_indicators.jurisdiction_code as "jurisdictionCode",
        analysis_indicators.jurisdiction_name as "jurisdictionName",
        analysis_indicators.jurisdiction_tag as "jurisdictionTag",
        analysis_indicators.level,
        analysis_indicators.indicator_type as "type",
        analysis_indicators.severity,
        analysis_indicators.label,
        analysis_indicators.summary,
        analysis_indicators.detail,
        analysis_indicators.metrics
      from analysis_indicators
      inner join capability_flags
        on analysis_indicators.state_code = capability_flags.state_code
        and analysis_indicators.election_year = capability_flags.election_year
        and capability_flags.review_graphs = true
      where analysis_indicators.state_code = ${input.state}
        and analysis_indicators.election_year = ${input.year}
      order by severity desc, jurisdiction_name, label
    `) as typeof rows;
  } catch (error) {
    rethrowReadErrorIfStrict(error);
    return [];
  }

  return rows.map((row) => ({
    detail: row.detail,
    electionYear: row.electionYear,
    id: row.id,
    jurisdictionCode: row.jurisdictionCode,
    jurisdictionName: row.jurisdictionName,
    jurisdictionTag: row.jurisdictionTag ?? jurisdictionTagForRow({ state: row.state, jurisdictionCode: row.jurisdictionCode, jurisdictionName: row.jurisdictionName, level: row.level }),
    label: row.label,
    level: row.level,
    metrics: row.metrics as Record<string, unknown>,
    severity: Number(row.severity),
    state: row.state,
    summary: row.summary,
    type: row.type,
  }));
}

export async function listReviewRows(input: {
  includeMetrics?: boolean;
  limit?: number;
  state: string;
  year: number;
}): Promise<ReviewRowSummary[]> {
  if (!hasReadableDatabase()) {
    return [];
  }

  let rows: Array<{
    demCandidate: string | null;
    demDropoff: string | number | null;
    demShare: string | number | null;
    demVotes: number | null;
    electionYear: number;
    harrisShare: string | number | null;
    harrisVotes: number | null;
    id: string;
    jurisdictionCode: string;
    jurisdictionName: string;
    jurisdictionTag: string | null;
    level: string;
    localUnit: string;
    metrics: unknown;
    repCandidate: string | null;
    repDropoff: string | number | null;
    repShare: string | number | null;
    repVotes: number | null;
    sourceSlug: string | null;
    state: string;
    totalVotes: number | null;
    trumpShare: string | number | null;
    trumpVotes: number | null;
  }>;

  try {
    const sql = getReadSql();
    rows = (await sql`
      select
        review_rows.id,
        review_rows.state_code as "state",
        review_rows.election_year as "electionYear",
        review_rows.jurisdiction_code as "jurisdictionCode",
        review_rows.jurisdiction_name as "jurisdictionName",
        review_rows.jurisdiction_tag as "jurisdictionTag",
        review_rows.local_unit as "localUnit",
        review_rows.level,
        review_rows.dem_candidate as "demCandidate",
        review_rows.rep_candidate as "repCandidate",
        coalesce(review_rows.dem_votes, review_rows.harris_votes) as "demVotes",
        coalesce(review_rows.rep_votes, review_rows.trump_votes) as "repVotes",
        coalesce(review_rows.dem_share, review_rows.harris_share) as "demShare",
        coalesce(review_rows.rep_share, review_rows.trump_share) as "repShare",
        review_rows.harris_votes as "harrisVotes",
        review_rows.trump_votes as "trumpVotes",
        review_rows.total_votes as "totalVotes",
        review_rows.harris_share as "harrisShare",
        review_rows.trump_share as "trumpShare",
        review_rows.dem_dropoff as "demDropoff",
        review_rows.rep_dropoff as "repDropoff",
        case when ${Boolean(input.includeMetrics)} then review_rows.metrics else '{}'::jsonb end as metrics,
        source_documents.slug as "sourceSlug"
      from review_rows
      inner join capability_flags
        on review_rows.state_code = capability_flags.state_code
        and review_rows.election_year = capability_flags.election_year
        and capability_flags.review_graphs = true
      left join source_documents on review_rows.source_document_id = source_documents.id
      where review_rows.state_code = ${input.state}
        and review_rows.election_year = ${input.year}
      order by review_rows.jurisdiction_name, review_rows.local_unit
      limit ${Math.min(Math.max(input.limit ?? 500, 1), 5000)}
    `) as typeof rows;
  } catch (error) {
    rethrowReadErrorIfStrict(error);
    return [];
  }

  return rows.map((row) => ({
    demCandidate: row.demCandidate,
    demDropoff: row.demDropoff === null ? null : Number(row.demDropoff),
    demShare: row.demShare === null ? null : Number(row.demShare),
    demVotes: row.demVotes,
    electionYear: row.electionYear,
    harrisShare: row.harrisShare === null ? null : Number(row.harrisShare),
    harrisVotes: row.harrisVotes,
    id: row.id,
    jurisdictionCode: row.jurisdictionCode,
    jurisdictionName: row.jurisdictionName,
    jurisdictionTag: row.jurisdictionTag ?? jurisdictionTagForRow({ state: row.state, jurisdictionCode: row.jurisdictionCode, jurisdictionName: row.jurisdictionName, level: row.level }),
    level: row.level,
    localUnit: row.localUnit,
    metrics: row.metrics as Record<string, unknown>,
    repCandidate: row.repCandidate,
    repDropoff: row.repDropoff === null ? null : Number(row.repDropoff),
    repShare: row.repShare === null ? null : Number(row.repShare),
    repVotes: row.repVotes,
    sourceId: row.sourceSlug ?? "database",
    state: row.state,
    totalVotes: row.totalVotes,
    trumpShare: row.trumpShare === null ? null : Number(row.trumpShare),
    trumpVotes: row.trumpVotes,
  }));
}

export async function listTurnoutRows(input: {
  limit?: number;
  state: string;
  year: number;
}): Promise<TurnoutRowSummary[]> {
  if (!hasReadableDatabase()) {
    return [];
  }

  let rows: Array<{
    ballotsCast: number;
    denominatorNote: string;
    electionYear: number;
    id: string;
    jurisdictionCode: string;
    jurisdictionName: string;
    jurisdictionTag: string | null;
    level: string;
    registeredVoters: number | null;
    sourceSlug: string | null;
    state: string;
    turnoutPct: string | number | null;
    warningRequired: boolean;
  }>;

  try {
    const sql = getReadSql();
    rows = (await sql`
      select
        turnout_rows.id,
        turnout_rows.state_code as "state",
        turnout_rows.election_year as "electionYear",
        turnout_rows.jurisdiction_code as "jurisdictionCode",
        turnout_rows.jurisdiction_name as "jurisdictionName",
        turnout_rows.jurisdiction_tag as "jurisdictionTag",
        turnout_rows.level,
        turnout_rows.ballots_cast as "ballotsCast",
        turnout_rows.registered_voters as "registeredVoters",
        turnout_rows.turnout_pct as "turnoutPct",
        turnout_rows.denominator_note as "denominatorNote",
        turnout_rows.warning_required as "warningRequired",
        source_documents.slug as "sourceSlug"
      from turnout_rows
      left join source_documents on turnout_rows.source_document_id = source_documents.id
      where turnout_rows.state_code = ${input.state}
        and turnout_rows.election_year = ${input.year}
      order by turnout_rows.jurisdiction_name
      limit ${Math.min(Math.max(input.limit ?? 500, 1), 5000)}
    `) as typeof rows;
  } catch (error) {
    rethrowReadErrorIfStrict(error);
    return [];
  }

  return rows.map((row) => ({
    ballotsCast: row.ballotsCast,
    denominatorNote: row.denominatorNote,
    electionYear: row.electionYear,
    id: row.id,
    jurisdictionCode: row.jurisdictionCode,
    jurisdictionName: row.jurisdictionName,
    jurisdictionTag: row.jurisdictionTag ?? jurisdictionTagForRow({ state: row.state, jurisdictionCode: row.jurisdictionCode, jurisdictionName: row.jurisdictionName, level: row.level }),
    level: row.level,
    registeredVoters: row.registeredVoters,
    sourceId: row.sourceSlug ?? "database",
    state: row.state,
    turnoutPct: row.turnoutPct === null ? null : Number(row.turnoutPct),
    warningRequired: row.warningRequired,
  }));
}

export async function listHistoricalResultRows(input: {
  includeMetrics?: boolean;
  limit?: number;
  state: string;
  year?: number;
}): Promise<HistoricalResultRowSummary[]> {
  if (!hasReadableDatabase()) {
    return [];
  }

  let rows: Array<{
    demVotes: number | null;
    electionYear: number;
    id: string;
    jurisdictionCode: string;
    jurisdictionName: string;
    jurisdictionTag: string | null;
    localUnit: string;
    metrics: unknown;
    otherVotes: number | null;
    repVotes: number | null;
    rowMethod: string;
    sourceDocumentSlug: string | null;
    sourceId: string;
    sourceLevel: string;
    state: string;
    totalVotes: number | null;
  }>;

  try {
    const sql = getReadSql();
    rows = input.year
      ? ((await sql`
          select
            historical_result_rows.id,
            historical_result_rows.state_code as "state",
            historical_result_rows.election_year as "electionYear",
            historical_result_rows.source_id as "sourceId",
            historical_result_rows.source_level as "sourceLevel",
            historical_result_rows.row_method as "rowMethod",
            historical_result_rows.jurisdiction_code as "jurisdictionCode",
            historical_result_rows.jurisdiction_name as "jurisdictionName",
            historical_result_rows.jurisdiction_tag as "jurisdictionTag",
            historical_result_rows.local_unit as "localUnit",
            historical_result_rows.dem_votes as "demVotes",
            historical_result_rows.rep_votes as "repVotes",
            historical_result_rows.other_votes as "otherVotes",
            historical_result_rows.total_votes as "totalVotes",
            case when ${Boolean(input.includeMetrics)} then historical_result_rows.metrics else '{}'::jsonb end as metrics,
            source_documents.slug as "sourceDocumentSlug"
          from historical_result_rows
          left join source_documents on historical_result_rows.source_document_id = source_documents.id
          where historical_result_rows.state_code = ${input.state}
            and historical_result_rows.election_year = ${input.year}
          order by historical_result_rows.election_year desc, historical_result_rows.jurisdiction_name
          limit ${Math.min(Math.max(input.limit ?? 500, 1), 5000)}
        `) as typeof rows)
      : ((await sql`
          select
            historical_result_rows.id,
            historical_result_rows.state_code as "state",
            historical_result_rows.election_year as "electionYear",
            historical_result_rows.source_id as "sourceId",
            historical_result_rows.source_level as "sourceLevel",
            historical_result_rows.row_method as "rowMethod",
            historical_result_rows.jurisdiction_code as "jurisdictionCode",
            historical_result_rows.jurisdiction_name as "jurisdictionName",
            historical_result_rows.jurisdiction_tag as "jurisdictionTag",
            historical_result_rows.local_unit as "localUnit",
            historical_result_rows.dem_votes as "demVotes",
            historical_result_rows.rep_votes as "repVotes",
            historical_result_rows.other_votes as "otherVotes",
            historical_result_rows.total_votes as "totalVotes",
            case when ${Boolean(input.includeMetrics)} then historical_result_rows.metrics else '{}'::jsonb end as metrics,
            source_documents.slug as "sourceDocumentSlug"
          from historical_result_rows
          left join source_documents on historical_result_rows.source_document_id = source_documents.id
          where historical_result_rows.state_code = ${input.state}
          order by historical_result_rows.election_year desc, historical_result_rows.jurisdiction_name
          limit ${Math.min(Math.max(input.limit ?? 500, 1), 5000)}
        `) as typeof rows);
  } catch (error) {
    rethrowReadErrorIfStrict(error);
    return [];
  }

  return rows.map((row) => ({
    demVotes: row.demVotes,
    electionYear: row.electionYear,
    id: row.id,
    jurisdictionCode: row.jurisdictionCode,
    jurisdictionName: row.jurisdictionName,
    jurisdictionTag: row.jurisdictionTag ?? jurisdictionTagForRow({ state: row.state, jurisdictionCode: row.jurisdictionCode, jurisdictionName: row.jurisdictionName, level: row.sourceLevel }),
    localUnit: row.localUnit,
    metrics: row.metrics as Record<string, unknown>,
    otherVotes: row.otherVotes,
    repVotes: row.repVotes,
    rowMethod: row.rowMethod,
    sourceDocumentId: row.sourceDocumentSlug ?? "database",
    sourceId: row.sourceId,
    sourceLevel: row.sourceLevel,
    state: row.state,
    totalVotes: row.totalVotes,
  }));
}

export async function listEquipmentRows(input: {
  limit?: number;
  state: string;
  year: number;
}): Promise<EquipmentRowSummary[]> {
  if (!hasReadableDatabase()) {
    return [];
  }

  let rows: Array<{
    absenteeSystem: string;
    accessibleSystem: string;
    electionYear: number;
    equipmentType: string;
    id: string;
    jurisdictionCode: string;
    jurisdictionName: string;
    jurisdictionTag: string | null;
    level: string;
    metrics: unknown;
    paperRecord: string;
    pollingPlaces: number | null;
    pollBookSystem: string;
    precincts: number | null;
    registeredVoters: number | null;
    sourceSlug: string | null;
    sourceUrl: string | null;
    standardSystem: string;
    state: string;
    systemName: string;
    tabulation: string;
    usage: string;
    vendor: string;
  }>;

  try {
    const sql = getReadSql();
    rows = (await sql`
      select
        equipment_rows.id,
        equipment_rows.state_code as "state",
        equipment_rows.election_year as "electionYear",
        equipment_rows.jurisdiction_code as "jurisdictionCode",
        equipment_rows.jurisdiction_name as "jurisdictionName",
        equipment_rows.jurisdiction_tag as "jurisdictionTag",
        equipment_rows.level,
        equipment_rows.vendor,
        equipment_rows.system_name as "systemName",
        equipment_rows.equipment_type as "equipmentType",
        equipment_rows.usage,
        equipment_rows.paper_record as "paperRecord",
        equipment_rows.standard_system as "standardSystem",
        equipment_rows.accessible_system as "accessibleSystem",
        equipment_rows.absentee_system as "absenteeSystem",
        equipment_rows.poll_book_system as "pollBookSystem",
        equipment_rows.tabulation,
        equipment_rows.registered_voters as "registeredVoters",
        equipment_rows.precincts,
        equipment_rows.polling_places as "pollingPlaces",
        equipment_rows.metrics,
        source_documents.slug as "sourceSlug",
        source_documents.source_url as "sourceUrl"
      from equipment_rows
      left join source_documents on equipment_rows.source_document_id = source_documents.id
      where equipment_rows.state_code = ${input.state}
        and equipment_rows.election_year = ${input.year}
      order by equipment_rows.jurisdiction_name, equipment_rows.usage
      limit ${Math.min(Math.max(input.limit ?? 5000, 1), 20000)}
    `) as typeof rows;
  } catch (error) {
    rethrowReadErrorIfStrict(error);
    return [];
  }

  return rows.map((row) => {
    const metrics = (row.metrics ?? {}) as Record<string, unknown>;
    const configurationSignals = Array.isArray(metrics.configurationSignals)
      ? metrics.configurationSignals.map((signal) => String(signal))
      : [];

    return {
      absenteeSystem: row.absenteeSystem,
      accessibleSystem: row.accessibleSystem,
      configurationSignals,
      electionYear: row.electionYear,
      equipmentType: row.equipmentType,
      id: row.id,
      jurisdictionCode: row.jurisdictionCode,
      jurisdictionName: row.jurisdictionName,
      jurisdictionTag: row.jurisdictionTag ?? jurisdictionTagForRow({ state: row.state, jurisdictionCode: row.jurisdictionCode, jurisdictionName: row.jurisdictionName, level: row.level }),
      level: row.level,
      metrics,
      paperRecord: row.paperRecord,
      pollingPlaces: row.pollingPlaces,
      pollBookSystem: row.pollBookSystem,
      precincts: row.precincts,
      registeredVoters: row.registeredVoters,
      sourceGranularity: typeof metrics.sourceGranularity === "string" ? metrics.sourceGranularity : row.level,
      sourceId: row.sourceSlug ?? "database",
      sourceUrl: row.sourceUrl ?? "",
      standardSystem: row.standardSystem,
      state: row.state,
      systemName: row.systemName,
      tabulation: row.tabulation,
      uniformityNote:
        typeof metrics.uniformityNote === "string"
          ? metrics.uniformityNote
          : "Equipment row is source-linked jurisdiction context, not proof that every precinct or ballot mode used one identical setup.",
      uniformityWarningRequired: Boolean(metrics.uniformityWarningRequired),
      usage: row.usage,
      vendor: row.vendor,
    };
  });
}

export async function listCompletenessReport(input: { year: number }): Promise<CompletenessSummary[]> {
  if (!hasReadableDatabase()) {
    return seedCompletenessReport(input.year);
  }

  type StateAggregate = {
    code: string;
    name: string;
    authority: string;
    sourcePlanner: boolean | null;
    certifiedResults: boolean | null;
    map: boolean | null;
    reviewGraphs: boolean | null;
    turnout: boolean | null;
    historicalBaseline: boolean | null;
    notes: string | null;
    resultRows: string | number | null;
    resultJurisdictions: string | number | null;
    taggedResultJurisdictions: string | number | null;
    historical2020Jurisdictions: string | number | null;
    taggedHistorical2020Jurisdictions: string | number | null;
    matchedHistorical2020Jurisdictions: string | number | null;
    sourceCount: string | number | null;
    mapGeometrySourceCount: string | number | null;
    sourcesMissingUrls: string | number | null;
    indicatorCount: string | number | null;
    reviewRowCount: string | number | null;
    turnoutRowCount: string | number | null;
    historicalRowCount: string | number | null;
    equipmentRowCount: string | number | null;
    flaggedJurisdictions: string | number | null;
    countyIndicatorCount: string | number | null;
    flaggedCountyJurisdictions: string | number | null;
    flaggedAreas: string | number | null;
    importRunCount: string | number | null;
    legacyImportCount: string | number | null;
    latestImportAt: Date | string | null;
    latestImportStatus: ImportRunSummary["status"] | null;
    latestImportSummary: unknown;
    latestNativeImportSummary: unknown;
    latestParser: string | null;
    nativeImportCount: string | number | null;
  };

  let rows: StateAggregate[];

  try {
    const sql = getReadSql();
    rows = (await sql`
      with result_counts as (
        select
          result_rows.state_code,
          count(*) as result_rows,
          count(distinct result_rows.jurisdiction_code) as result_jurisdictions,
          count(distinct result_rows.jurisdiction_tag) filter (where result_rows.jurisdiction_tag is not null and result_rows.level = 'county') as tagged_result_jurisdictions
        from result_rows
        inner join contests on result_rows.contest_id = contests.id
        inner join elections on contests.election_id = elections.id
        where elections.year = ${input.year}
        group by result_rows.state_code
      ),
      source_counts as (
        select
          state_code,
          count(*) as source_count,
          count(*) filter (where trim(source_url) = '') as sources_missing_urls,
          count(*) filter (
            where status = 'loaded'
              and (
                lower(coalesce(local_artifact, '')) like '%.geojson'
                or lower(coalesce(parser, '')) like '%geojson%'
                or (
                  lower(category) like '%boundar%'
                  and lower(category) like '%count%'
                )
              )
          ) as map_geometry_source_count
        from source_documents
        where election_year = ${input.year}
        group by state_code
      ),
      indicator_counts as (
        select
          analysis_indicators.state_code,
          count(*) as indicator_count,
          count(*) filter (where level = 'county') as county_indicator_count,
          count(distinct jurisdiction_code) as flagged_jurisdictions,
          count(distinct jurisdiction_code) filter (where level = 'county') as flagged_county_jurisdictions,
          count(distinct level || ':' || jurisdiction_code) as flagged_areas
        from analysis_indicators
        inner join capability_flags
          on analysis_indicators.state_code = capability_flags.state_code
          and analysis_indicators.election_year = capability_flags.election_year
          and capability_flags.review_graphs = true
        where analysis_indicators.election_year = ${input.year}
        group by analysis_indicators.state_code
      ),
      review_row_counts as (
        select
          review_rows.state_code,
          count(*) as review_row_count
        from review_rows
        inner join capability_flags
          on review_rows.state_code = capability_flags.state_code
          and review_rows.election_year = capability_flags.election_year
          and capability_flags.review_graphs = true
        where review_rows.election_year = ${input.year}
        group by review_rows.state_code
      ),
      turnout_row_counts as (
        select
          state_code,
          count(*) as turnout_row_count
        from turnout_rows
        where election_year = ${input.year}
        group by state_code
      ),
      historical_row_counts as (
        select
          state_code,
          count(*) as historical_row_count
        from historical_result_rows
        group by state_code
      ),
      historical_2020_tag_counts as (
        select
          state_code,
          count(distinct jurisdiction_code) as historical_2020_jurisdictions,
          count(distinct jurisdiction_tag) filter (where jurisdiction_tag is not null and source_level = 'county') as tagged_historical_2020_jurisdictions
        from historical_result_rows
        where election_year = 2020
        group by state_code
      ),
      historical_join_counts as (
        select
          result_rows.state_code,
          count(distinct result_rows.jurisdiction_tag) as matched_historical_2020_jurisdictions
        from result_rows
        inner join contests on result_rows.contest_id = contests.id
        inner join elections on contests.election_id = elections.id
        inner join historical_result_rows
          on historical_result_rows.state_code = result_rows.state_code
          and historical_result_rows.election_year = 2020
          and historical_result_rows.jurisdiction_tag = result_rows.jurisdiction_tag
        where elections.year = ${input.year}
          and result_rows.level = 'county'
          and result_rows.jurisdiction_tag is not null
        group by result_rows.state_code
      ),
      equipment_row_counts as (
        select
          state_code,
          count(*) as equipment_row_count
        from equipment_rows
        where election_year = ${input.year}
        group by state_code
      ),
      import_counts as (
        select distinct on (state_code)
          state_code,
          count(*) over (partition by state_code) as import_run_count,
          count(*) filter (where parser ilike 'native%') over (partition by state_code) as native_import_count,
          count(*) filter (where parser ilike 'legacy%') over (partition by state_code) as legacy_import_count,
          first_value(parser) over (partition by state_code order by started_at desc) as latest_parser,
          first_value(status) over (partition by state_code order by started_at desc) as latest_import_status,
          first_value(summary) over (partition by state_code order by started_at desc) as latest_import_summary,
          max(started_at) over (partition by state_code) as latest_import_at
        from import_runs
        where election_year = ${input.year}
        order by state_code, started_at desc
      ),
      latest_native_imports as (
        select distinct on (state_code)
          state_code,
          summary as latest_native_import_summary
        from import_runs
        where election_year = ${input.year}
          and parser ilike 'native%'
        order by state_code, started_at desc
      )
      select
        states.code,
        states.name,
        states.authority,
        capability_flags.source_planner as "sourcePlanner",
        capability_flags.certified_results as "certifiedResults",
        capability_flags.map,
        capability_flags.review_graphs as "reviewGraphs",
        capability_flags.turnout,
        capability_flags.historical_baseline as "historicalBaseline",
        capability_flags.notes,
        coalesce(result_counts.result_rows, 0) as "resultRows",
        coalesce(result_counts.result_jurisdictions, 0) as "resultJurisdictions",
        coalesce(result_counts.tagged_result_jurisdictions, 0) as "taggedResultJurisdictions",
        coalesce(historical_2020_tag_counts.historical_2020_jurisdictions, 0) as "historical2020Jurisdictions",
        coalesce(historical_2020_tag_counts.tagged_historical_2020_jurisdictions, 0) as "taggedHistorical2020Jurisdictions",
        coalesce(historical_join_counts.matched_historical_2020_jurisdictions, 0) as "matchedHistorical2020Jurisdictions",
        coalesce(source_counts.source_count, 0) as "sourceCount",
        coalesce(source_counts.map_geometry_source_count, 0) as "mapGeometrySourceCount",
        coalesce(source_counts.sources_missing_urls, 0) as "sourcesMissingUrls",
        coalesce(indicator_counts.indicator_count, 0) as "indicatorCount",
        coalesce(indicator_counts.county_indicator_count, 0) as "countyIndicatorCount",
        coalesce(indicator_counts.flagged_county_jurisdictions, 0) as "flaggedCountyJurisdictions",
        coalesce(indicator_counts.flagged_areas, 0) as "flaggedAreas",
        coalesce(review_row_counts.review_row_count, 0) as "reviewRowCount",
        coalesce(turnout_row_counts.turnout_row_count, 0) as "turnoutRowCount",
        coalesce(historical_row_counts.historical_row_count, 0) as "historicalRowCount",
        coalesce(equipment_row_counts.equipment_row_count, 0) as "equipmentRowCount",
        coalesce(indicator_counts.flagged_jurisdictions, 0) as "flaggedJurisdictions",
        coalesce(import_counts.import_run_count, 0) as "importRunCount",
        coalesce(import_counts.native_import_count, 0) as "nativeImportCount",
        coalesce(import_counts.legacy_import_count, 0) as "legacyImportCount",
        import_counts.latest_parser as "latestParser",
        import_counts.latest_import_status as "latestImportStatus",
        import_counts.latest_import_summary as "latestImportSummary",
        latest_native_imports.latest_native_import_summary as "latestNativeImportSummary",
        import_counts.latest_import_at as "latestImportAt"
      from states
      left join capability_flags
        on states.code = capability_flags.state_code
        and capability_flags.election_year = ${input.year}
      left join result_counts on states.code = result_counts.state_code
      left join source_counts on states.code = source_counts.state_code
      left join indicator_counts on states.code = indicator_counts.state_code
      left join review_row_counts on states.code = review_row_counts.state_code
      left join turnout_row_counts on states.code = turnout_row_counts.state_code
      left join historical_row_counts on states.code = historical_row_counts.state_code
      left join historical_2020_tag_counts on states.code = historical_2020_tag_counts.state_code
      left join historical_join_counts on states.code = historical_join_counts.state_code
      left join equipment_row_counts on states.code = equipment_row_counts.state_code
      left join import_counts on states.code = import_counts.state_code
      left join latest_native_imports on states.code = latest_native_imports.state_code
      order by states.name
    `) as StateAggregate[];
  } catch (error) {
    rethrowReadErrorIfStrict(error);
    return seedCompletenessReport(input.year);
  }

  return rows.map((row) => {
    const capabilities: CapabilitySummary = {
      sourcePlanner: row.sourcePlanner ?? emptyCapabilities.sourcePlanner,
      certifiedResults: row.certifiedResults ?? emptyCapabilities.certifiedResults,
      map: row.map ?? emptyCapabilities.map,
      reviewGraphs: row.reviewGraphs ?? emptyCapabilities.reviewGraphs,
      turnout: row.turnout ?? emptyCapabilities.turnout,
      historicalBaseline: row.historicalBaseline ?? emptyCapabilities.historicalBaseline,
      notes: row.notes ?? emptyCapabilities.notes,
    };
    const resultRows = Number(row.resultRows ?? 0);
    const resultJurisdictions = Number(row.resultJurisdictions ?? 0);
    const taggedResultJurisdictions = Number(row.taggedResultJurisdictions ?? 0);
    const historical2020Jurisdictions = Number(row.historical2020Jurisdictions ?? 0);
    const taggedHistorical2020Jurisdictions = Number(row.taggedHistorical2020Jurisdictions ?? 0);
    const matchedHistorical2020Jurisdictions = Number(row.matchedHistorical2020Jurisdictions ?? 0);
    const missingHistorical2020Jurisdictions = Math.max(taggedResultJurisdictions - matchedHistorical2020Jurisdictions, 0);
    const jurisdictionTagCoverage: CompletenessSummary["jurisdictionTagCoverage"] = {
      resultJurisdictions,
      taggedResultJurisdictions,
      historical2020Jurisdictions,
      taggedHistorical2020Jurisdictions,
      matchedHistorical2020Jurisdictions,
      missingHistorical2020Jurisdictions,
    };
    const sourceCount = Number(row.sourceCount ?? 0);
    const mapGeometrySourceCount = Number(row.mapGeometrySourceCount ?? 0);
    const sourcesMissingUrls = Number(row.sourcesMissingUrls ?? 0);
    const indicatorCount = Number(row.indicatorCount ?? 0);
    const reviewRowCount = Number(row.reviewRowCount ?? 0);
    const nativeImportCount = Number(row.nativeImportCount ?? 0);
    const legacyImportCount = Number(row.legacyImportCount ?? 0);
    const status = completenessStatus({
      capabilities,
      mapGeometrySourceCount,
      resultRows,
      reviewRowCount,
      sourceCount,
      sourcesMissingUrls,
    });

    return {
      state: row.code,
      name: row.name,
      authority: row.authority,
      resultRows,
      resultJurisdictions,
      historicalJoinReady: taggedResultJurisdictions > 0 && missingHistorical2020Jurisdictions === 0,
      jurisdictionTagCoverage,
      sourceCount,
      mapGeometrySourceCount,
      sourcesMissingUrls,
      indicatorCount,
      countyIndicatorCount: Number(row.countyIndicatorCount ?? indicatorCount),
      flaggedCountyJurisdictions: Number(row.flaggedCountyJurisdictions ?? row.flaggedJurisdictions ?? 0),
      flaggedAreas: Number(row.flaggedAreas ?? row.flaggedJurisdictions ?? 0),
      reviewRowCount,
      turnoutRowCount: Number(row.turnoutRowCount ?? 0),
      historicalRowCount: Number(row.historicalRowCount ?? 0),
      equipmentRowCount: Number(row.equipmentRowCount ?? 0),
      flaggedJurisdictions: Number(row.flaggedJurisdictions ?? 0),
      importRunCount: Number(row.importRunCount ?? 0),
      legacyImportCount,
      latestImportAt: toIsoTimestamp(row.latestImportAt),
      latestImportStatus: row.latestImportStatus,
      latestImportSummary: (row.latestImportSummary ?? null) as Record<string, unknown> | null,
      latestNativeImportSummary: (row.latestNativeImportSummary ?? null) as Record<string, unknown> | null,
      latestParser: row.latestParser,
      nativeImportCount,
      sourceTier: sourceTierLabel({
        legacyImportCount,
        nativeImportCount,
        resultRows,
      }),
      capabilities,
      status,
      gaps: completenessGaps({
        capabilities,
        mapGeometrySourceCount,
        resultRows,
        reviewRowCount,
        sourceCount,
        sourcesMissingUrls,
        jurisdictionTagCoverage,
      }),
    };
  });
}

export async function getCoverageSummary(input: {
  state: string;
  year: number;
}): Promise<CoverageSummary | null> {
  if (!hasReadableDatabase()) {
    return getCoverage(input.state, input.year);
  }

  const [stateList, countyResults, cityResults, cityTownResults, stateResults, sources, capabilities] = await Promise.all([
    listStates(),
    listResults({ state: input.state, year: input.year, level: "county" }),
    listResults({ state: input.state, year: input.year, level: "city" }),
    listResults({ state: input.state, year: input.year, level: "city_town" }),
    listResults({ state: input.state, year: input.year, level: "state" }),
    listSources(input),
    getDatabaseCapabilitySummary(input),
  ]);
  const results = countyResults.length ? countyResults : cityResults.length ? cityResults : cityTownResults.length ? cityTownResults : stateResults;
  const state = stateList.find((entry) => entry.code === input.state);

  if (!state) {
    return null;
  }

  const loadedJurisdictions = new Set(results.map((row) => row.jurisdictionCode)).size;

  return {
    state: input.state,
    year: input.year,
    expectedJurisdictions: loadedJurisdictions,
    loadedJurisdictions,
    resultRows: results.length,
    sourceCount: sources.length,
    validation: {
      passed: results.length > 0 && sources.length > 0,
      warnings: results.length > 0 ? [] : ["No result rows are loaded for this state yet."],
      errors: [],
    },
    capabilities: capabilities ?? emptyCapabilities,
  };
}

export async function listImportRuns(): Promise<ImportRunSummary[]> {
  if (!hasReadableDatabase()) {
    return seedImportRuns;
  }

  let rows: Array<{
    id: string;
    state: string;
    electionYear: number;
    parser: string;
    status: ImportRunSummary["status"];
    startedAt: Date | string;
    finishedAt: Date | string | null;
    summary: unknown;
  }>;

  try {
    const sql = getReadSql();
    rows = (await sql`
      select
        id,
        state_code as "state",
        election_year as "electionYear",
        parser,
        status,
        started_at as "startedAt",
        finished_at as "finishedAt",
        summary
      from import_runs
      order by started_at desc
      limit 20
    `) as typeof rows;
  } catch (error) {
    rethrowReadErrorIfStrict(error);
    return seedImportRuns;
  }

  return rows.map((row) => ({
    id: row.id,
    state: row.state,
    electionYear: row.electionYear,
    parser: row.parser,
    status: row.status,
    startedAt: toIsoTimestamp(row.startedAt) ?? "",
    finishedAt: toIsoTimestamp(row.finishedAt),
    summary: row.summary as Record<string, unknown>,
  }));
}
