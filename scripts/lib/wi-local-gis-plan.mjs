import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  inspectPrecinctGeometryManifest,
  reportingUnitCode,
} from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./precinct-geometry-validation.mjs";

const STATE = "WI";
const GEOGRAPHY_LEVEL = "local_reporting_unit";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const WISCONSIN_LOCAL_GIS_YEAR_SPECS = Object.freeze([
  {
    year: 2016,
    electionId: "2016-11-08-general",
    electionDate: "2016-11-08",
    manifestSha256: "c9c505414ef135453a99d7d71554a9fb173c72e61cae8f49094b2934c7730336",
    manifestByteCount: 4_610,
    geometryByteCount: 22_324_555,
    resultsSha256: "2ae9f2c8d3875a007f4947e1126b049ef96c831c54c6afb48f4bcf8d8a7f8787",
    resultsByteCount: 228_635,
    crosswalkByteCount: 2_773_352,
    expectedUnits: 3_636,
    expectedGeographicUnits: 3_626,
    expectedNonGeographicUnits: 10,
    expectedZeroVoteGeographicUnits: 126,
    expectedFeatures: 3_648,
    expectedCrosswalkRecords: 3_636,
    expectedNoDataFeatures: 22,
    expectedTotalVotes: 2_976_150,
    expectedDemocraticVotes: 1_382_536,
    expectedRepublicanVotes: 1_405_284,
    expectedOtherVotes: 188_330,
    democratic: { name: "Hillary Clinton/Tim Kaine", party: "DEM" },
    republican: { name: "Donald J. Trump/Michael R. Pence", party: "REP" },
    resultSource: {
      id: "wi-wec-2016-president-recount-ward-by-ward",
      slug: "wi-2016-wec-president-local-results",
      url: "https://elections.wi.gov/media/7123/download",
      artifact: "data/precinct-geometry/WI/2016-11-08-general/normalized/wi-2016-official-president-results.json.gz",
      sha256: "2ae9f2c8d3875a007f4947e1126b049ef96c831c54c6afb48f4bcf8d8a7f8787",
      byteCount: 228_635,
      timestampBasis: "Official Wisconsin Elections Commission presidential recount reporting units; zero-vote units without reviewed geometry remain non-geographic reconciliation records.",
      authority: "Wisconsin Elections Commission",
    },
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    electionDate: "2020-11-03",
    manifestSha256: "3f2d139f14ec78fa7238a24e172e961f3f6f96188a4c9de53ebaf13c11835bd5",
    manifestByteCount: 4_479,
    geometryByteCount: 23_636_300,
    resultsSha256: "336bf3f7d65ab1b2b5600f73e65a22c2f0dfab98bffc512671a983b14dd7a4bb",
    resultsByteCount: 193_779,
    crosswalkByteCount: 2_821_641,
    expectedUnits: 3_698,
    expectedGeographicUnits: 3_696,
    expectedNonGeographicUnits: 2,
    expectedZeroVoteGeographicUnits: 190,
    expectedFeatures: 3_705,
    expectedCrosswalkRecords: 3_698,
    expectedNoDataFeatures: 9,
    expectedTotalVotes: 3_298_041,
    expectedDemocraticVotes: 1_630_866,
    expectedRepublicanVotes: 1_610_184,
    expectedOtherVotes: 56_991,
    democratic: { name: "Joseph R. Biden / Kamala D. Harris", party: "DEM" },
    republican: { name: "Donald J. Trump / Michael R. Pence", party: "REP" },
    resultSource: {
      id: "wi-wec-2020-president-after-recount-ward-by-ward",
      slug: "wi-2020-wec-president-local-results",
      url: "https://elections.wi.gov/election-result/2020-fall-general-election-results",
      artifact: "data/precinct-geometry/WI/2020-11-03-general/normalized/wi-2020-official-president-results.json.gz",
      sha256: "336bf3f7d65ab1b2b5600f73e65a22c2f0dfab98bffc512671a983b14dd7a4bb",
      byteCount: 193_779,
      timestampBasis: "Official Wisconsin Elections Commission post-recount presidential reporting units; zero-vote units without reviewed geometry remain non-geographic reconciliation records.",
      authority: "Wisconsin Elections Commission",
    },
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    electionDate: "2024-11-05",
    manifestSha256: "7855034c7124727a2545585bdcd9896d1303bd9173c5d9384956521084dda1c3",
    manifestByteCount: 4_252,
    geometryByteCount: 27_082_198,
    resultsSha256: "54486d62a8e7b36870c09afcc83c8cbff9704cace608d651c78c717f87c162f3",
    resultsByteCount: 208_209,
    crosswalkByteCount: 3_012_501,
    expectedUnits: 3_603,
    expectedGeographicUnits: 3_503,
    expectedNonGeographicUnits: 100,
    expectedZeroVoteGeographicUnits: 0,
    expectedFeatures: 3_503,
    expectedCrosswalkRecords: 3_603,
    expectedNoDataFeatures: 0,
    expectedTotalVotes: 3_422_918,
    expectedDemocraticVotes: 1_668_229,
    expectedRepublicanVotes: 1_697_626,
    expectedOtherVotes: 57_063,
    democratic: { name: "Kamala D. Harris Tim Walz", party: "DEM" },
    republican: { name: "Donald J. Trump JD Vance", party: "REP" },
    resultSource: {
      id: "wi-wec-2024-ward-by-ward-federal-state-xlsx",
      slug: "wi-2024-wec-president-local-results",
      url: "https://elections.wi.gov/election-result/2024-fall-general-election-results",
      artifact: "data/precinct-geometry/WI/2024-11-05-general/normalized/wi-2024-official-president-results.json.gz",
      sha256: "54486d62a8e7b36870c09afcc83c8cbff9704cace608d651c78c717f87c162f3",
      byteCount: 208_209,
      timestampBasis: "Official Wisconsin Elections Commission ward-by-ward presidential reporting units; zero-vote units without reviewed geometry remain non-geographic reconciliation records.",
      authority: "Wisconsin Elections Commission",
    },
  },
].map((spec) => Object.freeze({
  ...spec,
  manifestPath: `data/precinct-geometry/WI/${spec.electionId}/manifest.json`,
  resultsPath: `data/precinct-geometry/WI/${spec.electionId}/normalized/wi-${spec.year}-official-president-results.json.gz`,
  geometrySourceSlug: `wi-${spec.year}-local-reporting-geometry`,
})));

function insideRoot(root, relativePath) {
  if (
    typeof relativePath !== "string"
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
  ) {
    throw new Error(`Unsafe Wisconsin artifact path: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (
    resolved !== resolvedRoot
    && !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(`Wisconsin artifact escapes root: ${relativePath}`);
  }
  return resolved;
}

function verified(root, relativePath, expectedSha, expectedBytes, label) {
  const target = insideRoot(root, relativePath);
  if (!existsSync(target)) {
    throw new Error(`${label} is missing: ${relativePath}`);
  }
  const bytes = readFileSync(target);
  if (bytes.length !== expectedBytes || sha256(bytes) !== expectedSha) {
    throw new Error(`${label} bytes or SHA-256 drifted`);
  }
  return bytes;
}

function forbiddenProperties(value, context) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => forbiddenProperties(entry, `${context}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:VOTES?|TOTALVOTES?|CANDIDATE|PARTY|G\d{2}PRE)/i.test(key)) {
      throw new Error(`${context} contains election-value property ${key}`);
    }
    forbiddenProperties(child, `${context}.${key}`);
  }
}

function safeResultRow(row, context) {
  const values = [row.democratic, row.republican, row.other, row.total].map(Number);
  if (
    values.some((value) => !Number.isSafeInteger(value) || value < 0)
    || values[3] !== values[0] + values[1] + values[2]
  ) {
    throw new Error(`${context} result totals drifted`);
  }
  return {
    democratic: values[0],
    republican: values[1],
    other: values[2],
    total: values[3],
  };
}

function buildResultPlan(spec, document) {
  if (
    document.schemaVersion !== 1
    || document.state !== STATE
    || document.electionId !== spec.electionId
    || document.reportingGrain !== GEOGRAPHY_LEVEL
    || document.sourceUnitCount !== spec.expectedUnits
    || document.colorableUnitCount !== spec.expectedGeographicUnits
    || document.excludedUnitCount !== spec.expectedNonGeographicUnits
    || document.rows?.length !== spec.expectedGeographicUnits
    || document.exclusions?.length !== spec.expectedNonGeographicUnits
  ) {
    throw new Error(`Wisconsin ${spec.year} normalized result contract drifted`);
  }
  const reportingUnits = [];
  const resultRows = [];
  const seenCodes = new Set();
  const totals = { Democratic: 0, Republican: 0, Other: 0, Total: 0 };
  let zeroVoteUnits = 0;

  for (const row of document.rows) {
    const code = reportingUnitCode({
      state: STATE,
      electionId: spec.electionId,
      reportingGrain: GEOGRAPHY_LEVEL,
      parentGeoid: row.parentGeoid,
      sourceUnitId: row.sourceUnitId,
    });
    if (
      code !== row.resultUnitCode
      || !/^55\d{3}$/.test(row.parentGeoid)
      || typeof row.sourceDisplayName !== "string"
      || !row.sourceDisplayName.trim()
      || seenCodes.has(code)
    ) {
      throw new Error(`Wisconsin ${spec.year} geographic result identity drifted`);
    }
    seenCodes.add(code);
    const values = safeResultRow(row, `Wisconsin ${spec.year} ${code}`);
    reportingUnits.push({
      code,
      sourceUnitId: row.sourceUnitId,
      sourceDisplayName: row.sourceDisplayName,
      parentGeoid: row.parentGeoid,
      reportingGrain: GEOGRAPHY_LEVEL,
      isGeographic: true,
      resultStatus: "candidate_detail_complete",
    });
    resultRows.push(
      {
        jurisdictionCode: code,
        jurisdictionName: row.sourceDisplayName,
        candidateName: spec.democratic.name,
        party: spec.democratic.party,
        votes: values.democratic,
      },
      {
        jurisdictionCode: code,
        jurisdictionName: row.sourceDisplayName,
        candidateName: spec.republican.name,
        party: spec.republican.party,
        votes: values.republican,
      },
      {
        jurisdictionCode: code,
        jurisdictionName: row.sourceDisplayName,
        candidateName: "Other",
        party: "OTHER",
        votes: values.other,
      },
    );
    totals.Democratic += values.democratic;
    totals.Republican += values.republican;
    totals.Other += values.other;
    totals.Total += values.total;
    if (values.total === 0) zeroVoteUnits += 1;
  }

  for (const row of document.exclusions) {
    const reportingGrain = "administrative_reporting_unit";
    const code = reportingUnitCode({
      state: STATE,
      electionId: spec.electionId,
      reportingGrain,
      parentGeoid: row.parentGeoid,
      sourceUnitId: row.sourceUnitId,
    });
    const values = safeResultRow(row, `Wisconsin ${spec.year} ${code}`);
    if (
      code !== row.resultUnitCode
      || !/^55\d{3}$/.test(row.parentGeoid)
      || typeof row.sourceDisplayName !== "string"
      || !row.sourceDisplayName.trim()
      || seenCodes.has(code)
      || values.total !== 0
      || row.reason !== "official zero-vote unit without reviewed geometry"
    ) {
      throw new Error(`Wisconsin ${spec.year} non-geographic result identity drifted`);
    }
    seenCodes.add(code);
    reportingUnits.push({
      code,
      sourceUnitId: row.sourceUnitId,
      sourceDisplayName: row.sourceDisplayName,
      parentGeoid: row.parentGeoid,
      reportingGrain,
      isGeographic: false,
      resultStatus: "non_geographic_reconciliation_only",
    });
  }

  const official = document.officialTotals ?? {};
  const mapped = document.mappedTotals ?? {};
  if (
    reportingUnits.length !== spec.expectedUnits
    || resultRows.length !== spec.expectedGeographicUnits * 3
    || totals.Democratic !== spec.expectedDemocraticVotes
    || totals.Republican !== spec.expectedRepublicanVotes
    || totals.Other !== spec.expectedOtherVotes
    || totals.Total !== spec.expectedTotalVotes
    || zeroVoteUnits !== spec.expectedZeroVoteGeographicUnits
    || official.democraticVotes !== totals.Democratic
    || official.republicanVotes !== totals.Republican
    || official.otherVotes !== totals.Other
    || official.totalVotes !== totals.Total
    || JSON.stringify(mapped) !== JSON.stringify(official)
  ) {
    throw new Error(`Wisconsin ${spec.year} official total drifted`);
  }
  return {
    reportingUnits,
    resultRows,
    totals,
    zeroVoteUnits,
    candidateDetailSuppressedUnits: 0,
    source: spec.resultSource,
  };
}

function buildGeometryPlan(root, spec, manifest, results) {
  const inspection = validateManifestArtifacts(manifest, {
    root,
    skipDelivery: true,
  });
  if (inspection.errors.length) {
    throw new Error(
      `Wisconsin ${spec.year} artifact validation failed: ${inspection.errors.join("; ")}`,
    );
  }
  if (
    manifest.geography.level !== GEOGRAPHY_LEVEL
    || manifest.crosswalk.status !== "reviewed"
    || manifest.crosswalk.resultUnits !== spec.expectedUnits
    || manifest.crosswalk.matchedResultUnits !== spec.expectedGeographicUnits
    || manifest.crosswalk.unmatchedResultUnits !== 0
    || manifest.crosswalk.nonGeographicResultUnits
      !== spec.expectedNonGeographicUnits
    || manifest.crosswalk.reviewedRelationshipRecords
      !== spec.expectedCrosswalkRecords
    || manifest.crosswalk.reviewedNoDataFeatures
      !== spec.expectedNoDataFeatures
    || manifest.validation.rowLevelRenderingSafe !== true
    || manifest.delivery !== null
  ) {
    throw new Error(`Wisconsin ${spec.year} reviewed local geometry contract drifted`);
  }
  const geometryBytes = verified(
    root,
    manifest.normalization.artifact,
    manifest.normalization.sha256,
    spec.geometryByteCount,
    `Wisconsin ${spec.year} geometry`,
  );
  const normalized = JSON.parse(gunzipSync(geometryBytes).toString("utf8"));
  const features = [];
  const featureByKey = new Map();
  for (const feature of normalized.features ?? []) {
    const parent = String(feature.properties?.CRM_PARENT_GEOID ?? "");
    const id = String(feature.properties?.CRM_FEATURE_ID ?? "");
    const sourceFeatureId = `${parent}|${id}`;
    forbiddenProperties(feature.properties, `Wisconsin ${spec.year} feature ${sourceFeatureId}`);
    if (
      !/^55\d{3}$/.test(parent)
      || !id
      || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
      || featureByKey.has(sourceFeatureId)
    ) {
      throw new Error(`Wisconsin ${spec.year} normalized feature identity drifted`);
    }
    const record = {
      sourceFeatureId,
      parentGeoid: parent,
      name: String(feature.properties.SOURCE_NAME ?? id),
      geometryKey: sourceFeatureId,
      isGeographic: true,
      properties: feature.properties,
    };
    features.push(record);
    featureByKey.set(sourceFeatureId, record);
  }
  if (features.length !== spec.expectedFeatures) {
    throw new Error(`Wisconsin ${spec.year} normalized feature count drifted`);
  }
  const crosswalkBytes = verified(
    root,
    manifest.crosswalk.artifact,
    manifest.crosswalk.sha256,
    spec.crosswalkByteCount,
    `Wisconsin ${spec.year} crosswalk`,
  );
  const crosswalk = JSON.parse(crosswalkBytes.toString("utf8"));
  if (
    crosswalk.state !== STATE
    || crosswalk.electionId !== spec.electionId
    || crosswalk.geographyLevel !== GEOGRAPHY_LEVEL
    || crosswalk.resultSourceId !== manifest.crosswalk.resultSourceId
  ) {
    throw new Error(`Wisconsin ${spec.year} crosswalk envelope drifted`);
  }
  const unitsByCode = new Map(
    results.reportingUnits.map((unit) => [unit.code, unit]),
  );
  const seenUnits = new Set();
  const crosswalks = [];
  for (const [index, row] of (crosswalk.rows ?? []).entries()) {
    const unit = unitsByCode.get(row.resultUnitCode);
    if (
      !unit
      || row.sourceUnitId !== unit.sourceUnitId
      || row.parentGeoid !== unit.parentGeoid
      || row.reportingGrain !== unit.reportingGrain
      || row.isGeographic !== unit.isGeographic
      || seenUnits.has(row.resultUnitCode)
      || !Array.isArray(row.relationships)
      || row.relationships.length !== 1
    ) {
      throw new Error(`Wisconsin ${spec.year} crosswalk identity drift at row ${index}`);
    }
    seenUnits.add(row.resultUnitCode);
    const relationship = row.relationships[0];
    forbiddenProperties(relationship, `Wisconsin ${spec.year} crosswalk row ${index}`);
    const commonRelationshipValid = relationship.reviewStatus === "reviewed"
      && relationship.confidence === "high";
    const geographicRelationshipValid = unit.isGeographic
      && relationship.relationshipType === "one_to_one"
      && ["reviewed_name", "spatial_review"].includes(relationship.matchMethod)
      && featureByKey.has(relationship.sourceFeatureId);
    const nonGeographicRelationshipValid = !unit.isGeographic
      && relationship.relationshipType === "non_geographic"
      && relationship.matchMethod === "exact_official_id"
      && relationship.sourceFeatureId === null;
    if (
      !commonRelationshipValid
      || (!geographicRelationshipValid && !nonGeographicRelationshipValid)
    ) {
      throw new Error(`Wisconsin ${spec.year} crosswalk relationship drift at row ${index}`);
    }
    crosswalks.push({
      reportingUnitCode: row.resultUnitCode,
      sourceFeatureId: relationship.sourceFeatureId,
      relationshipType: relationship.relationshipType,
      matchMethod: relationship.matchMethod,
      reviewStatus: relationship.reviewStatus,
      confidence: relationship.confidence,
      note: String(relationship.note ?? ""),
    });
  }
  if (
    seenUnits.size !== spec.expectedUnits
    || crosswalks.length !== spec.expectedCrosswalkRecords
    || crosswalks.filter((row) => row.sourceFeatureId !== null).length
      !== spec.expectedGeographicUnits
    || features.length - spec.expectedGeographicUnits
      !== spec.expectedNoDataFeatures
  ) {
    throw new Error(`Wisconsin ${spec.year} crosswalk counts drifted`);
  }
  return {
    disposition: "loadable_reviewed",
    sourceGatePassed: true,
    publicReleaseEligible: false,
    blockCode: null,
    reasons: [...manifest.validation.errors],
    features,
    crosswalks,
    artifactWarnings: inspection.warnings,
  };
}

async function loadYear(root, spec) {
  const manifestBytes = verified(
    root,
    spec.manifestPath,
    spec.manifestSha256,
    spec.manifestByteCount,
    `Wisconsin ${spec.year} manifest`,
  );
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const contract = inspectPrecinctGeometryManifest(manifest);
  if (
    contract.errors.length
    || manifest.state !== STATE
    || manifest.election.id !== spec.electionId
    || manifest.election.date !== spec.electionDate
    || manifest.geography.level !== GEOGRAPHY_LEVEL
  ) {
    throw new Error(
      `Wisconsin ${spec.year} manifest contract drifted: ${contract.errors.join("; ")}`,
    );
  }
  const resultBytes = verified(
    root,
    spec.resultsPath,
    spec.resultsSha256,
    spec.resultsByteCount,
    `Wisconsin ${spec.year} normalized results`,
  );
  const results = buildResultPlan(
    spec,
    JSON.parse(gunzipSync(resultBytes).toString("utf8")),
  );
  return {
    year: spec.year,
    electionId: spec.electionId,
    electionDate: spec.electionDate,
    manifestPath: spec.manifestPath,
    manifestSha256: spec.manifestSha256,
    manifestByteCount: spec.manifestByteCount,
    artifactByteCounts: {
      source: manifest.source.byteCount,
      normalization: spec.geometryByteCount,
      crosswalk: spec.crosswalkByteCount,
    },
    manifest,
    resultSource: results.source,
    reportingUnits: results.reportingUnits,
    resultRows: results.resultRows,
    totals: results.totals,
    zeroVoteUnits: results.zeroVoteUnits,
    candidateDetailSuppressedUnits:
      results.candidateDetailSuppressedUnits,
    sourceRows: results.reportingUnits.length,
    geometry: buildGeometryPlan(root, spec, manifest, results),
    geometrySourceSlug: spec.geometrySourceSlug,
  };
}

export async function buildWisconsinLocalGisPlan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const selected = options.years
    ? new Set(options.years.map(Number))
    : new Set(WISCONSIN_LOCAL_GIS_YEAR_SPECS.map((spec) => spec.year));
  for (const selectedYear of selected) {
    if (!WISCONSIN_LOCAL_GIS_YEAR_SPECS.some((spec) => spec.year === selectedYear)) {
      throw new Error(
        "Supported Wisconsin local GIS years are 2016, 2020, and 2024; 2012 remains blocked and cannot be loaded",
      );
    }
  }
  const years = [];
  for (const spec of WISCONSIN_LOCAL_GIS_YEAR_SPECS.filter(
    (entry) => selected.has(entry.year),
  )) {
    years.push(await loadYear(root, spec));
  }
  if (!years.length) {
    throw new Error("Select at least one Wisconsin local GIS year");
  }
  return {
    schemaVersion: 1,
    state: STATE,
    stateName: "Wisconsin",
    authority: "Wisconsin Elections Commission and retained reviewed geometry sources",
    scope: "local-only presidential general-election local reporting unit GIS setup",
    geographyLevel: GEOGRAPHY_LEVEL,
    years,
  };
}

export function summarizeWisconsinLocalGisPlan(plan) {
  return {
    schemaVersion: plan.schemaVersion,
    state: plan.state,
    scope: plan.scope,
    geographyLevel: plan.geographyLevel,
    years: plan.years.map((year) => ({
      year: year.year,
      electionId: year.electionId,
      manifestId: year.manifest.id,
      manifestSha256: year.manifestSha256,
      reportingUnits: year.reportingUnits.length,
      resultRows: year.resultRows.length,
      zeroVoteUnits: year.zeroVoteUnits,
      candidateDetailSuppressedUnits: year.candidateDetailSuppressedUnits,
      totals: year.totals,
      geometryDisposition: year.geometry.disposition,
      geometryFeatures: year.geometry.features.length,
      reviewedCrosswalks: year.geometry.crosswalks.length,
      reviewedNoDataFeatures: year.manifest.crosswalk.reviewedNoDataFeatures,
      sourceGatePassed: year.geometry.sourceGatePassed,
      publicReleaseEligible: year.geometry.publicReleaseEligible,
      publicDeliveryAuthorized: false,
      blockers: year.geometry.reasons,
      caveats: year.manifest.caveats,
    })),
  };
}
