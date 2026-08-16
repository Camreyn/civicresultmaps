import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  inspectPrecinctGeometryManifest,
  reportingUnitCode,
} from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./precinct-geometry-validation.mjs";

const STATE = "FL";
const GEOGRAPHY_LEVEL = "precinct";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const FLORIDA_PRECINCT_GIS_YEAR_SPECS = Object.freeze([
  {
    year: 2016,
    electionId: "2016-11-08-general",
    electionDate: "2016-11-08",
    manifestSha256: "ada2193499658f734804169338ade6f0e8031f6844a4ff7e824f11acf57bf836",
    manifestByteCount: 4_085,
    geometryByteCount: 19_447_602,
    resultsSha256: "f7e48267fd225e6f4c0e81c358a4809010b7b728d7e3df9cbc2c9ec26689be03",
    resultsByteCount: 159_648,
    crosswalkByteCount: 4_081_785,
    expectedSourceUnits: 5_870,
    expectedUnits: 5_852,
    expectedExcludedUnits: 18,
    expectedFeatures: 5_962,
    expectedCrosswalkRecords: 5_852,
    expectedNoDataFeatures: 110,
    expectedZeroVoteUnits: 33,
    expectedMappedTotals: Object.freeze({
      democratic: 4_500_899,
      republican: 4_611_546,
      other: 375_904,
      total: 9_488_349,
    }),
    expectedOfficialTotals: Object.freeze({
      democratic: 4_504_403,
      republican: 4_617_476,
      other: 376_214,
      total: 9_498_093,
    }),
    democratic: {
      name: "Hillary Clinton",
      party: "DEM",
    },
    republican: {
      name: "Donald Trump",
      party: "REP",
    },
    resultSourceUrl:
      "https://dos.fl.gov/media/697454/precinctlevelelectionresults2016gen.zip",
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    electionDate: "2020-11-03",
    manifestSha256: "c60f8e4caf66b9981126430638c85fd070880ac214693319299a435c6639c2e3",
    manifestByteCount: 3_956,
    geometryByteCount: 20_548_823,
    resultsSha256: "48c7925e5ecca00e86952210bd31c8bdcccf4a15cb14ab4059561833ae31cebf",
    resultsByteCount: 153_230,
    crosswalkByteCount: 4_173_669,
    expectedSourceUnits: 6_097,
    expectedUnits: 5_989,
    expectedExcludedUnits: 17,
    expectedFeatures: 6_010,
    expectedCrosswalkRecords: 5_989,
    expectedNoDataFeatures: 21,
    expectedZeroVoteUnits: 107,
    expectedMappedTotals: Object.freeze({
      democratic: 5_295_976,
      republican: 5_667_620,
      other: 125_069,
      total: 11_088_665,
    }),
    expectedOfficialTotals: Object.freeze({
      democratic: 5_297_036,
      republican: 5_668_716,
      other: 125_092,
      total: 11_090_844,
    }),
    democratic: {
      name: "Joseph R. Biden",
      party: "DEM",
    },
    republican: {
      name: "Donald Trump",
      party: "REP",
    },
    resultSourceUrl:
      "https://fldoswebumbracoprod.blob.core.windows.net/media/703763/2020-general-election-rev.zip",
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    electionDate: "2024-11-05",
    manifestSha256: "12a7b2ec07016c0fbe7e380143a4eb62a81feecdafc1bda756c43c6de537b45c",
    manifestByteCount: 3_954,
    geometryByteCount: 38_450_848,
    resultsSha256: "a88102c4eda8af69adacf0ccfcb0e10997129305ee89069ebbfdc3de9f0b54a5",
    resultsByteCount: 152_066,
    crosswalkByteCount: 3_911_662,
    expectedSourceUnits: 5_712,
    expectedUnits: 5_583,
    expectedExcludedUnits: 126,
    expectedFeatures: 5_583,
    expectedCrosswalkRecords: 5_583,
    expectedNoDataFeatures: 0,
    expectedZeroVoteUnits: 0,
    expectedMappedTotals: Object.freeze({
      democratic: 4_675_803,
      republican: 6_099_601,
      other: 142_114,
      total: 10_917_518,
    }),
    expectedOfficialTotals: Object.freeze({
      democratic: 4_683_038,
      republican: 6_110_126,
      other: 142_302,
      total: 10_935_466,
    }),
    democratic: {
      name: "Kamala Harris",
      party: "DEM",
    },
    republican: {
      name: "Donald Trump",
      party: "REP",
    },
    resultSourceUrl:
      "https://dos.fl.gov/media/708761/2024-gen-outputofficial1.zip",
  },
].map((spec) => Object.freeze({
  ...spec,
  manifestPath:
    `data/precinct-geometry/FL/${spec.electionId}/manifest.json`,
  resultsPath:
    `data/precinct-geometry/FL/${spec.electionId}/normalized/fl-${spec.year}-president-results.json.gz`,
  geometrySourceSlug: `fl-${spec.year}-precinct-geometry`,
  resultSource: Object.freeze({
    id: `fl-dos-${spec.year}-general-precinct-results`,
    slug: `fl-dos-${spec.year}-general-precinct-results`,
    url: spec.resultSourceUrl,
    artifact:
      `data/precinct-geometry/FL/${spec.electionId}/normalized/fl-${spec.year}-president-results.json.gz`,
    sha256: spec.resultsSha256,
    byteCount: spec.resultsByteCount,
    timestampBasis:
      "Official Florida Department of State precinct results; units without reviewed geometry remain in source evidence and are never allocated to polygons.",
    authority: "Florida Department of State, Division of Elections",
  }),
})));

function insideRoot(root, relativePath) {
  if (
    typeof relativePath !== "string"
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
  ) {
    throw new Error(`Unsafe Florida artifact path: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (
    resolved !== resolvedRoot
    && !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(`Florida artifact escapes root: ${relativePath}`);
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
  ].map(Number);
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
    || document.sourceUnitCount !== spec.expectedSourceUnits
    || document.colorableUnitCount !== spec.expectedUnits
    || document.excludedUnitCount !== spec.expectedExcludedUnits
    || document.zeroVoteUnitCount !== spec.expectedZeroVoteUnits
    || document.rows?.length !== spec.expectedUnits
    || document.exclusions?.length !== spec.expectedExcludedUnits
    || document.collection?.authority !== spec.resultSource.authority
    || document.collection?.sourceUrl !== spec.resultSource.url
  ) {
    throw new Error(
      `Florida ${spec.year} normalized result contract drifted`,
    );
  }
  const reportingUnits = [];
  const resultRows = [];
  const seenCodes = new Set();
  const totals = { Democratic: 0, Republican: 0, Other: 0, Total: 0 };
  const officialTotals = {
    Democratic: Number(document.totals?.democratic),
    Republican: Number(document.totals?.republican),
    Other: Number(document.totals?.other),
    Total: Number(document.totals?.total),
  };
  const excludedTotals = {
    Democratic: 0,
    Republican: 0,
    Other: 0,
    Total: 0,
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
      || !/^12\d{3}$/.test(row.parentGeoid)
      || typeof row.sourceDisplayName !== "string"
      || !row.sourceDisplayName.trim()
      || seenCodes.has(code)
    ) {
      throw new Error(
        `Florida ${spec.year} geographic result identity drifted`,
      );
    }
    seenCodes.add(code);
    const values = safeResultRow(
      row,
      `Florida ${spec.year} ${code}`,
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
    const code = reportingUnitCode({
      state: STATE,
      electionId: spec.electionId,
      reportingGrain: GEOGRAPHY_LEVEL,
      parentGeoid: row.parentGeoid,
      sourceUnitId: row.sourceUnitId,
    });
    if (
      code !== row.resultUnitCode
      || !/^12\d{3}$/.test(row.parentGeoid)
      || typeof row.sourceDisplayName !== "string"
      || !row.sourceDisplayName.trim()
      || seenCodes.has(code)
    ) {
      throw new Error(
        `Florida ${spec.year} excluded result identity drifted`,
      );
    }
    seenCodes.add(code);
    const values = safeResultRow(row, `Florida ${spec.year} ${code}`);
    if (row.exclusionReason !== "no_reviewed_result_to_geometry_relationship") {
      throw new Error(`Florida ${spec.year} exclusion reason drifted`);
    }
    excludedTotals.Democratic += values.democratic;
    excludedTotals.Republican += values.republican;
    excludedTotals.Other += values.other;
    excludedTotals.Total += values.total;
  }

  if (
    reportingUnits.length !== spec.expectedUnits
    || seenCodes.size !== spec.expectedUnits + spec.expectedExcludedUnits
    || resultRows.length !== spec.expectedUnits * 3
    || zeroVoteUnits !== spec.expectedZeroVoteUnits
    || totals.Democratic !== spec.expectedMappedTotals.democratic
    || totals.Republican !== spec.expectedMappedTotals.republican
    || totals.Other !== spec.expectedMappedTotals.other
    || totals.Total !== spec.expectedMappedTotals.total
    || officialTotals.Democratic !== spec.expectedOfficialTotals.democratic
    || officialTotals.Republican !== spec.expectedOfficialTotals.republican
    || officialTotals.Other !== spec.expectedOfficialTotals.other
    || officialTotals.Total !== spec.expectedOfficialTotals.total
    || excludedTotals.Democratic
      !== officialTotals.Democratic - totals.Democratic
    || excludedTotals.Republican
      !== officialTotals.Republican - totals.Republican
    || excludedTotals.Other !== officialTotals.Other - totals.Other
    || excludedTotals.Total !== officialTotals.Total - totals.Total
    || document.excludedTotals?.democratic !== excludedTotals.Democratic
    || document.excludedTotals?.republican !== excludedTotals.Republican
    || document.excludedTotals?.other !== excludedTotals.Other
    || document.excludedTotals?.total !== excludedTotals.Total
  ) {
    throw new Error(`Florida ${spec.year} official total drifted`);
  }
  return {
    reportingUnits,
    resultRows,
    totals,
    officialTotals,
    excludedTotals,
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
      `Florida ${spec.year} artifact validation failed: ${inspection.errors.join("; ")}`,
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
    || manifest.validation.rowLevelRenderingSafe !== true
    || manifest.delivery !== null
  ) {
    throw new Error(
      `Florida ${spec.year} reviewed local geometry contract drifted`,
    );
  }
  const geometryBytes = verified(
    root,
    manifest.normalization.artifact,
    manifest.normalization.sha256,
    spec.geometryByteCount,
    `Florida ${spec.year} geometry`,
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
      `Florida ${spec.year} feature ${sourceFeatureId}`,
    );
    if (
      !/^12\d{3}$/.test(parent)
      || !id
      || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
      || featureByKey.has(sourceFeatureId)
    ) {
      throw new Error(
        `Florida ${spec.year} normalized feature identity drifted`,
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
      `Florida ${spec.year} normalized feature count drifted`,
    );
  }
  const crosswalkBytes = verified(
    root,
    manifest.crosswalk.artifact,
    manifest.crosswalk.sha256,
    spec.crosswalkByteCount,
    `Florida ${spec.year} crosswalk`,
  );
  const crosswalk = JSON.parse(crosswalkBytes.toString("utf8"));
  if (
    crosswalk.state !== STATE
    || crosswalk.electionId !== spec.electionId
    || crosswalk.geographyLevel !== GEOGRAPHY_LEVEL
    || crosswalk.resultSourceId !== manifest.crosswalk.resultSourceId
  ) {
    throw new Error(
      `Florida ${spec.year} crosswalk envelope drifted`,
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
        `Florida ${spec.year} crosswalk identity drift at row ${index}`,
      );
    }
    seenUnits.add(row.resultUnitCode);
    const relationship = row.relationships[0];
    forbiddenProperties(
      relationship,
      `Florida ${spec.year} crosswalk row ${index}`,
    );
    const commonRelationshipValid = relationship.reviewStatus === "reviewed"
      && relationship.confidence === "high"
      && ["official_crosswalk", "exact_official_id"].includes(
        relationship.matchMethod,
      );
    const geographicRelationshipValid = unit.isGeographic
      && relationship.relationshipType === "one_to_one"
      && ["official_crosswalk", "exact_official_id"].includes(
        relationship.matchMethod,
      )
      && featureByKey.has(relationship.sourceFeatureId);
    if (
      !commonRelationshipValid
      || !geographicRelationshipValid
    ) {
      throw new Error(
        `Florida ${spec.year} crosswalk relationship drift at row ${index}`,
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
      !== spec.expectedUnits
  ) {
    throw new Error(`Florida ${spec.year} crosswalk counts drifted`);
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
    `Florida ${spec.year} manifest`,
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
      `Florida ${spec.year} manifest contract drifted: ${contract.errors.join("; ")}`,
    );
  }
  const resultBytes = verified(
    root,
    spec.resultsPath,
    spec.resultsSha256,
    spec.resultsByteCount,
    `Florida ${spec.year} normalized results`,
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
    excludedTotals: results.excludedTotals,
    zeroVoteUnits: results.zeroVoteUnits,
    candidateDetailSuppressedUnits: 0,
    sourceRows: spec.expectedSourceUnits,
    geometry: buildGeometryPlan(root, spec, manifest, results),
    geometrySourceSlug: spec.geometrySourceSlug,
  };
}

export async function buildFloridaPrecinctGisPlan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const selected = options.years
    ? new Set(options.years.map(Number))
    : new Set(
      FLORIDA_PRECINCT_GIS_YEAR_SPECS.map((spec) => spec.year),
    );
  for (const selectedYear of selected) {
    if (
      !FLORIDA_PRECINCT_GIS_YEAR_SPECS.some(
        (spec) => spec.year === selectedYear,
      )
    ) {
      throw new Error(
        "Supported Florida public-release years are 2016, 2020, and 2024; 2012 remains separately blocked",
      );
    }
  }
  const years = [];
  for (const spec of FLORIDA_PRECINCT_GIS_YEAR_SPECS.filter(
    (entry) => selected.has(entry.year),
  )) {
    years.push(await loadYear(root, spec));
  }
  if (!years.length) {
    throw new Error("Select at least one Florida precinct GIS year");
  }
  return {
    schemaVersion: 1,
    state: STATE,
    stateName: "Florida",
    authority: "Florida Department of State, Division of Elections",
    scope:
      "local-only 2016, 2020, and 2024 presidential general-election precinct GIS setup; 2012 remains separately blocked",
    geographyLevel: GEOGRAPHY_LEVEL,
    years,
  };
}

export function summarizeFloridaPrecinctGisPlan(plan) {
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
