import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  inspectPrecinctGeometryManifest,
  reportingUnitCode,
} from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./precinct-geometry-validation.mjs";

const STATE = "ME";
const GEOGRAPHY_LEVEL = "local_reporting_unit";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const MAINE_LOCAL_GIS_YEAR_SPECS = Object.freeze([
  {
    year: 2016,
    electionId: "2016-11-08-general",
    electionDate: "2016-11-08",
    manifestSha256: "585320793abfa81b524f6ab440b5f265f7ecdda503e6068688ce9aa05bdae2eb",
    manifestByteCount: 4_122,
    geometryByteCount: 2_465_979,
    resultsSha256: "eee124e13eaa5ddc337a71d8f8ac764107d046bb2b56c0902525ea3ce8d82a50",
    resultsByteCount: 21_370,
    crosswalkByteCount: 446_258,
    expectedUnits: 532,
    expectedFeatures: 532,
    expectedCrosswalkRecords: 532,
    expectedNoDataFeatures: 0,
    expectedTotalVotes: 743_941,
    democratic: { name: "Hillary Clinton", party: "DEM" },
    republican: { name: "Donald Trump", party: "REP" },
    resultSource: {
      id: "me-2016-president-local-results",
      slug: "me-2016-sos-president-local-results",
      url: "https://www.maine.gov/sos/sites/maine.gov.sos/files/content/assets/president.xlsx",
      artifact: "data/precinct-geometry/ME/2016-11-08-general/normalized/me-2016-president-local-results.json.gz",
      sha256: "eee124e13eaa5ddc337a71d8f8ac764107d046bb2b56c0902525ea3ce8d82a50",
      byteCount: 21_370,
      timestampBasis: "Official Maine Secretary of State presidential municipal and local reporting rows, reconciled without allocating town totals across wards.",
      authority: "Maine Secretary of State",
    },
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    electionDate: "2020-11-03",
    manifestSha256: "6469acce5cabbcb69f7acde57686ca1186291add736963428879afb1c790936d",
    manifestByteCount: 4_132,
    geometryByteCount: 2_426_827,
    resultsSha256: "e11aaee805b1bc3abc3dd8d8512cd67e9f114bd953b16b837d62c97355e09212",
    resultsByteCount: 19_412,
    crosswalkByteCount: 433_882,
    expectedUnits: 516,
    expectedFeatures: 516,
    expectedCrosswalkRecords: 516,
    expectedNoDataFeatures: 0,
    expectedTotalVotes: 813_742,
    democratic: { name: "Joe Biden", party: "DEM" },
    republican: { name: "Donald Trump", party: "REP" },
    resultSource: {
      id: "me-2020-president-local-results",
      slug: "me-2020-sos-president-local-results",
      url: "https://www.maine.gov/sos/sites/maine.gov.sos/files/content/assets/presandvisecnty1120.xlsx",
      artifact: "data/precinct-geometry/ME/2020-11-03-general/normalized/me-2020-president-local-results.json.gz",
      sha256: "e11aaee805b1bc3abc3dd8d8512cd67e9f114bd953b16b837d62c97355e09212",
      byteCount: 19_412,
      timestampBasis: "Official Maine Secretary of State presidential municipal and local reporting rows, reconciled without allocating town totals across wards.",
      authority: "Maine Secretary of State",
    },
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    electionDate: "2024-11-05",
    manifestSha256: "065b5bdabb91a72490c7c26788c8d75762e7f14548a3f7ca86b38f79800aa001",
    manifestByteCount: 5_436,
    geometryByteCount: 5_407_353,
    resultsSha256: "d60930ed8f1b44cd906f05b52c3378453fc63dfa5eb4ccdd9827d47606fcb10a",
    resultsByteCount: 19_127,
    crosswalkByteCount: 416_577,
    expectedUnits: 494,
    expectedFeatures: 494,
    expectedCrosswalkRecords: 494,
    expectedNoDataFeatures: 0,
    expectedTotalVotes: 824_806,
    democratic: { name: "Kamala Harris", party: "DEM" },
    republican: { name: "Donald Trump", party: "REP" },
    resultSource: {
      id: "me-2024-president-local-results",
      slug: "me-2024-sos-president-local-results",
      url: "https://www.maine.gov/sos/sites/maine.gov.sos/files/inline-files/President%20and%20Vice%20President%20FINAL-Corrected%2020241205.xlsx",
      artifact: "data/precinct-geometry/ME/2024-11-05-general/normalized/me-2024-president-local-results.json.gz",
      sha256: "d60930ed8f1b44cd906f05b52c3378453fc63dfa5eb4ccdd9827d47606fcb10a",
      byteCount: 19_127,
      timestampBasis: "Official corrected Maine Secretary of State presidential municipal and local reporting rows; reviewed combined units use exact sums of named official rows.",
      authority: "Maine Secretary of State",
    },
  },
].map((spec) => Object.freeze({
  ...spec,
  manifestPath: `data/precinct-geometry/ME/${spec.electionId}/manifest.json`,
  resultsPath: `data/precinct-geometry/ME/${spec.electionId}/normalized/me-${spec.year}-president-local-results.json.gz`,
  geometrySourceSlug: `me-${spec.year}-local-reporting-geometry`,
})));

function insideRoot(root, relativePath) {
  if (
    typeof relativePath !== "string"
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
  ) {
    throw new Error(`Unsafe Maine artifact path: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (
    resolved !== resolvedRoot
    && !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(`Maine artifact escapes root: ${relativePath}`);
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

function buildResultPlan(spec, document) {
  if (
    document.schemaVersion !== 1
    || document.state !== STATE
    || document.electionId !== spec.electionId
    || document.reportingGrain !== GEOGRAPHY_LEVEL
    || document.rows?.length !== spec.expectedUnits
    || document.colorableUnitCount !== spec.expectedUnits
  ) {
    throw new Error(`Maine ${spec.year} normalized result contract drifted`);
  }
  const reportingUnits = [];
  const resultRows = [];
  const codes = new Set();
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
      || codes.has(code)
      || !/^23\d{3}$/.test(row.parentGeoid)
    ) {
      throw new Error(`Maine ${spec.year} normalized result identity drifted`);
    }
    codes.add(code);
    const total = Number(row.total);
    const democratic = Number(row.democratic);
    const republican = Number(row.republican);
    const other = Number(row.other);
    if (
      ![democratic, republican, other, total].every(Number.isSafeInteger)
      || [democratic, republican, other].some((value) => value < 0)
      || total !== democratic + republican + other
    ) {
      throw new Error(`Maine ${spec.year} normalized result total drifted for ${code}`);
    }
    if (total === 0) zeroVoteUnits += 1;
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
        votes: democratic,
      },
      {
        jurisdictionCode: code,
        jurisdictionName: row.sourceDisplayName,
        candidateName: spec.republican.name,
        party: spec.republican.party,
        votes: republican,
      },
      {
        jurisdictionCode: code,
        jurisdictionName: row.sourceDisplayName,
        candidateName: "Other",
        party: "OTHER",
        votes: other,
      },
    );
    totals.Democratic += democratic;
    totals.Republican += republican;
    totals.Other += other;
    totals.Total += total;
  }
  if (totals.Total !== spec.expectedTotalVotes) {
    throw new Error(`Maine ${spec.year} official total drifted`);
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
      `Maine ${spec.year} artifact validation failed: ${inspection.errors.join("; ")}`,
    );
  }
  if (
    manifest.geography.level !== GEOGRAPHY_LEVEL
    || manifest.crosswalk.status !== "reviewed"
    || manifest.crosswalk.resultUnits !== spec.expectedUnits
    || manifest.crosswalk.matchedResultUnits !== spec.expectedUnits
    || manifest.crosswalk.unmatchedResultUnits !== 0
    || manifest.crosswalk.nonGeographicResultUnits !== 0
    || manifest.crosswalk.reviewedRelationshipRecords
      !== spec.expectedCrosswalkRecords
    || manifest.crosswalk.reviewedNoDataFeatures
      !== spec.expectedNoDataFeatures
    || manifest.delivery !== null
  ) {
    throw new Error(`Maine ${spec.year} reviewed local geometry contract drifted`);
  }
  const geometryBytes = verified(
    root,
    manifest.normalization.artifact,
    manifest.normalization.sha256,
    spec.geometryByteCount,
    `Maine ${spec.year} geometry`,
  );
  const normalized = JSON.parse(gunzipSync(geometryBytes).toString("utf8"));
  const features = [];
  const featureByKey = new Map();
  for (const feature of normalized.features ?? []) {
    const parent = String(feature.properties?.CRM_PARENT_GEOID ?? "");
    const id = String(feature.properties?.CRM_FEATURE_ID ?? "");
    const sourceFeatureId = `${parent}|${id}`;
    forbiddenProperties(feature.properties, `Maine ${spec.year} feature ${sourceFeatureId}`);
    if (
      !/^23\d{3}$/.test(parent)
      || !id
      || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
      || featureByKey.has(sourceFeatureId)
    ) {
      throw new Error(`Maine ${spec.year} normalized feature identity drifted`);
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
    throw new Error(`Maine ${spec.year} normalized feature count drifted`);
  }
  const crosswalkBytes = verified(
    root,
    manifest.crosswalk.artifact,
    manifest.crosswalk.sha256,
    spec.crosswalkByteCount,
    `Maine ${spec.year} crosswalk`,
  );
  const crosswalk = JSON.parse(crosswalkBytes.toString("utf8"));
  if (
    crosswalk.state !== STATE
    || crosswalk.electionId !== spec.electionId
    || crosswalk.geographyLevel !== GEOGRAPHY_LEVEL
  ) {
    throw new Error(`Maine ${spec.year} crosswalk envelope drifted`);
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
      || row.reportingGrain !== GEOGRAPHY_LEVEL
      || seenUnits.has(row.resultUnitCode)
      || !Array.isArray(row.relationships)
      || row.relationships.length !== 1
    ) {
      throw new Error(`Maine ${spec.year} crosswalk identity drift at row ${index}`);
    }
    seenUnits.add(row.resultUnitCode);
    const relationship = row.relationships[0];
    forbiddenProperties(relationship, `Maine ${spec.year} crosswalk row ${index}`);
    if (
      relationship.relationshipType !== "one_to_one"
      || relationship.reviewStatus !== "reviewed"
      || relationship.confidence !== "high"
      || !["exact_official_id", "official_crosswalk"].includes(
        relationship.matchMethod,
      )
      || !featureByKey.has(relationship.sourceFeatureId)
    ) {
      throw new Error(`Maine ${spec.year} crosswalk relationship drift at row ${index}`);
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
  ) {
    throw new Error(`Maine ${spec.year} crosswalk counts drifted`);
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
    `Maine ${spec.year} manifest`,
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
      `Maine ${spec.year} manifest contract drifted: ${contract.errors.join("; ")}`,
    );
  }
  const resultBytes = verified(
    root,
    spec.resultsPath,
    spec.resultsSha256,
    spec.resultsByteCount,
    `Maine ${spec.year} normalized results`,
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

export async function buildMaineLocalGisPlan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const selected = options.years
    ? new Set(options.years.map(Number))
    : new Set(MAINE_LOCAL_GIS_YEAR_SPECS.map((spec) => spec.year));
  for (const selectedYear of selected) {
    if (!MAINE_LOCAL_GIS_YEAR_SPECS.some((spec) => spec.year === selectedYear)) {
      throw new Error(
        "Supported Maine local GIS years are 2016, 2020, and 2024; 2012 remains blocked and cannot be loaded",
      );
    }
  }
  const years = [];
  for (const spec of MAINE_LOCAL_GIS_YEAR_SPECS.filter(
    (entry) => selected.has(entry.year),
  )) {
    years.push(await loadYear(root, spec));
  }
  if (!years.length) {
    throw new Error("Select at least one Maine local GIS year");
  }
  return {
    schemaVersion: 1,
    state: STATE,
    stateName: "Maine",
    authority: "Maine Secretary of State and retained reviewed geometry sources",
    scope: "local-only presidential general-election local reporting unit GIS setup",
    geographyLevel: GEOGRAPHY_LEVEL,
    years,
  };
}

export function summarizeMaineLocalGisPlan(plan) {
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
