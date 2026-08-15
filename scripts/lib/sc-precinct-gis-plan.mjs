import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  inspectPrecinctGeometryManifest,
  reportingUnitCode,
} from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./precinct-geometry-validation.mjs";

const STATE = "SC";
const GEOGRAPHY_LEVEL = "precinct";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const SOUTH_CAROLINA_PRECINCT_GIS_YEAR_SPECS = Object.freeze([
  {
    year: 2016,
    electionId: "2016-11-08-general",
    electionDate: "2016-11-08",
    manifestSha256: "8a66de16908c768930f1d53ac75314b3bf02d163c2bc368fb7df5266b5bd54b0",
    manifestByteCount: 4_386,
    geometryByteCount: 15_662_362,
    resultsSha256: "b0068408c18d50157408886f463d23891e6c35125703382c40d78b6851263b5d",
    resultsByteCount: 124_534,
    crosswalkByteCount: 1_748_197,
    expectedUnits: 2_551,
    expectedSourceGeographicUnits: 2_233,
    expectedGeographicUnits: 2_232,
    expectedNonGeographicUnits: 319,
    expectedFeatures: 2_234,
    expectedCrosswalkRecords: 2_551,
    expectedNoDataFeatures: 2,
    expectedZeroVoteUnits: 0,
    expectedGeographicVotes: 1_589_961,
    expectedTotalVotes: 2_103_027,
    democratic: {
      name: "Hillary Rodham Clinton and Timothy Michael Kaine",
      party: "DEM",
    },
    republican: {
      name: "Donald J. Trump and Michael R. Pence",
      party: "REP",
    },
    resultSourceUrl:
      "https://sc.elstats.civera.com/api/download_contest/5292_table.csv?split_party=false",
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    electionDate: "2020-11-03",
    manifestSha256: "3e250643ba5224b2a5b852f7f741a34b8c42fb0062592ca2781a7e6d0d15fac2",
    manifestByteCount: 4_296,
    geometryByteCount: 17_757_242,
    resultsSha256: "86cfb63c778729da6a5c23e6d30d5575f0dc3a1f503bf7fe91084466ebbd471c",
    resultsByteCount: 108_839,
    crosswalkByteCount: 1_641_445,
    expectedUnits: 2_399,
    expectedSourceGeographicUnits: 2_261,
    expectedGeographicUnits: 2_261,
    expectedNonGeographicUnits: 138,
    expectedFeatures: 2_263,
    expectedCrosswalkRecords: 2_399,
    expectedNoDataFeatures: 2,
    expectedZeroVoteUnits: 2,
    expectedGeographicVotes: 2_504_220,
    expectedTotalVotes: 2_513_329,
    democratic: {
      name: "Joseph R Biden and Kamala D. Harris",
      party: "DEM",
    },
    republican: {
      name: "Donald J. Trump and Michael R. Pence",
      party: "REP",
    },
    resultSourceUrl:
      "https://sc.elstats.civera.com/api/download_contest/1974_table.csv?split_party=false",
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    electionDate: "2024-11-05",
    manifestSha256: "7ea2454b22404feac80de8117879a0aebc28e9178facf60c46347dedbe74c6e8",
    manifestByteCount: 4_249,
    geometryByteCount: 35_604_614,
    resultsSha256: "f41e21a8f92c8f14b5fb530226a2c46104665c4f6a0fdcd6abfe27a70828e3c9",
    resultsByteCount: 120_074,
    crosswalkByteCount: 1_778_403,
    expectedUnits: 2_446,
    expectedSourceGeographicUnits: 2_308,
    expectedGeographicUnits: 2_308,
    expectedNonGeographicUnits: 138,
    expectedFeatures: 2_308,
    expectedCrosswalkRecords: 2_446,
    expectedNoDataFeatures: 0,
    expectedZeroVoteUnits: 0,
    expectedGeographicVotes: 2_541_877,
    expectedTotalVotes: 2_548_140,
    democratic: {
      name: "Kamala D. Harris and Tim Walz",
      party: "DEM",
    },
    republican: {
      name: "Donald J. Trump and JD Vance",
      party: "REP",
    },
    resultSourceUrl:
      "https://sc.elstats.civera.com/api/download_contest/7131_table.csv?split_party=false",
  },
].map((spec) => Object.freeze({
  ...spec,
  manifestPath:
    `data/precinct-geometry/SC/${spec.electionId}/manifest.json`,
  resultsPath:
    `data/precinct-geometry/SC/${spec.electionId}/normalized/sc-${spec.year}-official-president-results.json.gz`,
  geometrySourceSlug: `sc-${spec.year}-precinct-geometry`,
  resultSource: Object.freeze({
    id: `sc-${spec.year}-official-precinct-results`,
    slug: `sc-${spec.year}-official-precinct-results`,
    url: spec.resultSourceUrl,
    artifact:
      `data/precinct-geometry/SC/${spec.electionId}/normalized/sc-${spec.year}-official-president-results.json.gz`,
    sha256: spec.resultsSha256,
    byteCount: spec.resultsByteCount,
    timestampBasis:
      "Official South Carolina Election Commission precinct results; administrative reporting units remain separately identified and are never assigned to polygons.",
    authority: "South Carolina Election Commission",
  }),
})));

function insideRoot(root, relativePath) {
  if (
    typeof relativePath !== "string"
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
  ) {
    throw new Error(`Unsafe South Carolina artifact path: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (
    resolved !== resolvedRoot
    && !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(`South Carolina artifact escapes root: ${relativePath}`);
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
    value.forEach((entry, index) =>
      forbiddenProperties(entry, `${context}[${index}]`));
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
  const values = [
    row.democratic,
    row.republican,
    row.other,
    row.total,
    row.ballotsCast,
  ].map(Number);
  if (
    values.some((value) => !Number.isSafeInteger(value) || value < 0)
    || values[3] !== values[0] + values[1] + values[2]
    || values[4] < values[3]
  ) {
    throw new Error(`${context} result totals drifted`);
  }
  return {
    democratic: values[0],
    republican: values[1],
    other: values[2],
    total: values[3],
    ballotsCast: values[4],
  };
}

function buildResultPlan(spec, document) {
  if (
    document.schemaVersion !== 1
    || document.state !== STATE
    || document.electionId !== spec.electionId
    || document.reportingGrain !== GEOGRAPHY_LEVEL
    || document.sourceUnitCount !== spec.expectedUnits
    || document.geographicSourceUnitCount
      !== spec.expectedSourceGeographicUnits
    || document.colorableUnitCount !== spec.expectedGeographicUnits
    || document.excludedUnitCount !== spec.expectedNonGeographicUnits
    || document.rows?.length !== spec.expectedGeographicUnits
    || document.exclusions?.length !== spec.expectedNonGeographicUnits
  ) {
    throw new Error(
      `South Carolina ${spec.year} normalized result contract drifted`,
    );
  }
  const reportingUnits = [];
  const resultRows = [];
  const seenCodes = new Set();
  const totals = { Democratic: 0, Republican: 0, Other: 0, Total: 0 };
  const officialTotals = {
    Democratic: Number(document.officialTotals?.democraticVotes),
    Republican: Number(document.officialTotals?.republicanVotes),
    Other: Number(document.officialTotals?.otherVotes),
    Total: Number(document.officialTotals?.totalVotes),
  };
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
      || !/^45\d{3}$/.test(row.parentGeoid)
      || typeof row.sourceDisplayName !== "string"
      || !row.sourceDisplayName.trim()
      || seenCodes.has(code)
    ) {
      throw new Error(
        `South Carolina ${spec.year} geographic result identity drifted`,
      );
    }
    seenCodes.add(code);
    const values = safeResultRow(
      row,
      `South Carolina ${spec.year} ${code}`,
    );
    if (values.total === 0) zeroVoteUnits += 1;
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
    if (
      code !== row.resultUnitCode
      || !/^45\d{3}$/.test(row.parentGeoid)
      || typeof row.sourceDisplayName !== "string"
      || !row.sourceDisplayName.trim()
      || seenCodes.has(code)
    ) {
      throw new Error(
        `South Carolina ${spec.year} administrative result identity drifted`,
      );
    }
    seenCodes.add(code);
    safeResultRow(row, `South Carolina ${spec.year} ${code}`);
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

  if (
    reportingUnits.length !== spec.expectedUnits
    || resultRows.length !== spec.expectedGeographicUnits * 3
    || zeroVoteUnits !== spec.expectedZeroVoteUnits
    || totals.Total !== spec.expectedGeographicVotes
    || officialTotals.Total !== spec.expectedTotalVotes
    || totals.Democratic !== document.geographicTotals?.democraticVotes
    || totals.Republican !== document.geographicTotals?.republicanVotes
    || totals.Other !== document.geographicTotals?.otherVotes
    || totals.Total !== document.geographicTotals?.totalVotes
    || officialTotals.Democratic !== document.officialTotals?.democraticVotes
    || officialTotals.Republican !== document.officialTotals?.republicanVotes
    || officialTotals.Other !== document.officialTotals?.otherVotes
  ) {
    throw new Error(`South Carolina ${spec.year} official total drifted`);
  }
  return {
    reportingUnits,
    resultRows,
    totals,
    officialTotals,
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
      `South Carolina ${spec.year} artifact validation failed: ${inspection.errors.join("; ")}`,
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
    throw new Error(
      `South Carolina ${spec.year} reviewed local geometry contract drifted`,
    );
  }
  const geometryBytes = verified(
    root,
    manifest.normalization.artifact,
    manifest.normalization.sha256,
    spec.geometryByteCount,
    `South Carolina ${spec.year} geometry`,
  );
  const normalized = JSON.parse(gunzipSync(geometryBytes).toString("utf8"));
  const features = [];
  const featureByKey = new Map();
  for (const feature of normalized.features ?? []) {
    const parent = String(feature.properties?.CRM_PARENT_GEOID ?? "");
    const id = String(feature.properties?.CRM_FEATURE_ID ?? "");
    const sourceFeatureId = `${parent}|${id}`;
    forbiddenProperties(
      feature.properties,
      `South Carolina ${spec.year} feature ${sourceFeatureId}`,
    );
    if (
      !/^45\d{3}$/.test(parent)
      || !id
      || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
      || featureByKey.has(sourceFeatureId)
    ) {
      throw new Error(
        `South Carolina ${spec.year} normalized feature identity drifted`,
      );
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
    throw new Error(
      `South Carolina ${spec.year} normalized feature count drifted`,
    );
  }
  const crosswalkBytes = verified(
    root,
    manifest.crosswalk.artifact,
    manifest.crosswalk.sha256,
    spec.crosswalkByteCount,
    `South Carolina ${spec.year} crosswalk`,
  );
  const crosswalk = JSON.parse(crosswalkBytes.toString("utf8"));
  if (
    crosswalk.state !== STATE
    || crosswalk.electionId !== spec.electionId
    || crosswalk.geographyLevel !== GEOGRAPHY_LEVEL
    || crosswalk.resultSourceId !== manifest.crosswalk.resultSourceId
  ) {
    throw new Error(
      `South Carolina ${spec.year} crosswalk envelope drifted`,
    );
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
      throw new Error(
        `South Carolina ${spec.year} crosswalk identity drift at row ${index}`,
      );
    }
    seenUnits.add(row.resultUnitCode);
    const relationship = row.relationships[0];
    forbiddenProperties(
      relationship,
      `South Carolina ${spec.year} crosswalk row ${index}`,
    );
    const commonRelationshipValid = relationship.reviewStatus === "reviewed"
      && relationship.confidence === "high"
      && ["reviewed_name", "exact_official_id"].includes(
        relationship.matchMethod,
      );
    const geographicRelationshipValid = unit.isGeographic
      && relationship.relationshipType === "one_to_one"
      && relationship.matchMethod === "reviewed_name"
      && featureByKey.has(relationship.sourceFeatureId);
    const nonGeographicRelationshipValid = !unit.isGeographic
      && relationship.relationshipType === "non_geographic"
      && relationship.matchMethod === "exact_official_id"
      && relationship.sourceFeatureId === null;
    if (
      !commonRelationshipValid
      || (!geographicRelationshipValid && !nonGeographicRelationshipValid)
    ) {
      throw new Error(
        `South Carolina ${spec.year} crosswalk relationship drift at row ${index}`,
      );
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
  ) {
    throw new Error(`South Carolina ${spec.year} crosswalk counts drifted`);
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
    `South Carolina ${spec.year} manifest`,
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
      `South Carolina ${spec.year} manifest contract drifted: ${contract.errors.join("; ")}`,
    );
  }
  const resultBytes = verified(
    root,
    spec.resultsPath,
    spec.resultsSha256,
    spec.resultsByteCount,
    `South Carolina ${spec.year} normalized results`,
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
    officialTotals: results.officialTotals,
    zeroVoteUnits: results.zeroVoteUnits,
    candidateDetailSuppressedUnits: 0,
    sourceRows: results.reportingUnits.length,
    geometry: buildGeometryPlan(root, spec, manifest, results),
    geometrySourceSlug: spec.geometrySourceSlug,
  };
}

export async function buildSouthCarolinaPrecinctGisPlan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const selected = options.years
    ? new Set(options.years.map(Number))
    : new Set(
      SOUTH_CAROLINA_PRECINCT_GIS_YEAR_SPECS.map((spec) => spec.year),
    );
  for (const selectedYear of selected) {
    if (
      !SOUTH_CAROLINA_PRECINCT_GIS_YEAR_SPECS.some(
        (spec) => spec.year === selectedYear,
      )
    ) {
      throw new Error(
        "Supported South Carolina public-release years are 2016, 2020, and 2024; 2012 remains separately blocked",
      );
    }
  }
  const years = [];
  for (const spec of SOUTH_CAROLINA_PRECINCT_GIS_YEAR_SPECS.filter(
    (entry) => selected.has(entry.year),
  )) {
    years.push(await loadYear(root, spec));
  }
  if (!years.length) {
    throw new Error("Select at least one South Carolina precinct GIS year");
  }
  return {
    schemaVersion: 1,
    state: STATE,
    stateName: "South Carolina",
    authority: "South Carolina Election Commission",
    scope:
      "local-only 2016, 2020, and 2024 presidential general-election precinct GIS setup; 2012 remains separately blocked",
    geographyLevel: GEOGRAPHY_LEVEL,
    years,
  };
}

export function summarizeSouthCarolinaPrecinctGisPlan(plan) {
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
      geographicReportingUnits: year.reportingUnits.filter(
        (unit) => unit.isGeographic,
      ).length,
      nonGeographicReportingUnits: year.reportingUnits.filter(
        (unit) => !unit.isGeographic,
      ).length,
      resultRows: year.resultRows.length,
      zeroVoteUnits: year.zeroVoteUnits,
      totals: year.totals,
      officialTotals: year.officialTotals,
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
