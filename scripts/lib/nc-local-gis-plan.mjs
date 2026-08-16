import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  inspectPrecinctGeometryManifest,
  reportingUnitCode,
} from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./precinct-geometry-validation.mjs";

const STATE = "NC";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const NORTH_CAROLINA_LOCAL_GIS_YEAR_SPECS = Object.freeze([
  {
    year: 2012,
    electionId: "2012-11-06-general",
    electionDate: "2012-11-06",
    geographyLevel: "vtd",
    manifestSha256: "31c2e7a8178c2224f27e8f14dbeda4a7e93c512b0e875ea947c63a6fce63c429",
    manifestByteCount: 4_843,
    geometryByteCount: 26_021_871,
    resultsSha256: "af622d482343424698b8c3a26a396bde7f1dda0c5ecb54eb89197f582c1eb47d",
    resultsByteCount: 101_677,
    crosswalkByteCount: 2_105_121,
    expectedUnits: 3_011,
    expectedSourceGeographicUnits: 2_692,
    expectedGeographicUnits: 2_692,
    expectedNonGeographicUnits: 319,
    expectedFeatures: 2_692,
    expectedCrosswalkRecords: 3_011,
    expectedNoDataFeatures: 0,
    expectedZeroVoteUnits: 0,
    expectedGeographicVotes: 4_492_613,
    expectedTotalVotes: 4_505_372,
    democratic: {
      name: "Obama/Biden",
      party: "DEM",
    },
    republican: {
      name: "Romney/Ryan",
      party: "REP",
    },
    resultSourceId: "nc-2012-ncsbe-precinct-sorted-president",
    resultSourceUrl:
      "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2012_11_06/results_sort_20121106.zip",
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    electionDate: "2016-11-08",
    geographyLevel: "precinct",
    manifestSha256: "348d4a54953dadb47de0fbd424e0edcd7407cca091252e3e6ff6a18c209faaa4",
    manifestByteCount: 3_959,
    geometryByteCount: 25_916_331,
    resultsSha256: "1ee871ff48ef90ed562e52e7560a39f9b9c8dea9fa0152fdf2c9b77457773ca3",
    resultsByteCount: 120_291,
    crosswalkByteCount: 2_215_041,
    expectedUnits: 3_209,
    expectedSourceGeographicUnits: 2_704,
    expectedGeographicUnits: 2_704,
    expectedNonGeographicUnits: 505,
    expectedFeatures: 2_704,
    expectedCrosswalkRecords: 3_209,
    expectedNoDataFeatures: 0,
    expectedZeroVoteUnits: 0,
    expectedGeographicVotes: 3_177_511,
    expectedTotalVotes: 4_741_564,
    democratic: {
      name: "Hillary Clinton",
      party: "DEM",
    },
    republican: {
      name: "Donald J. Trump",
      party: "REP",
    },
    resultSourceId: "nc-2016-results-precinct-zip",
    resultSourceUrl:
      "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2016_11_08/results_pct_20161108.zip",
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    electionDate: "2020-11-03",
    geographyLevel: "precinct",
    manifestSha256: "8c13c08cad108a5863f063a88f045726b17e36e0d472e67557a81a240013fd6a",
    manifestByteCount: 4_451,
    geometryByteCount: 17_346_673,
    resultsSha256: "1b02f23a00aedf700d1dc46a86683011f441c2caf5cc1346faa937aef1b13d0d",
    resultsByteCount: 117_763,
    crosswalkByteCount: 2_092_827,
    expectedUnits: 3_065,
    expectedSourceGeographicUnits: 2_662,
    expectedGeographicUnits: 2_662,
    expectedNonGeographicUnits: 403,
    expectedFeatures: 2_662,
    expectedCrosswalkRecords: 3_065,
    expectedNoDataFeatures: 0,
    expectedZeroVoteUnits: 0,
    expectedGeographicVotes: 3_201_711,
    expectedTotalVotes: 5_524_802,
    democratic: {
      name: "Joseph R. Biden",
      party: "DEM",
    },
    republican: {
      name: "Donald J. Trump",
      party: "REP",
    },
    resultSourceId: "nc-2020-results-precinct-zip",
    resultSourceUrl:
      "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2020_11_03/results_pct_20201103.zip",
  },
].map((spec) => Object.freeze({
  ...spec,
  manifestPath:
    `data/precinct-geometry/NC/${spec.electionId}/manifest.json`,
  resultsPath:
    `data/precinct-geometry/NC/${spec.electionId}/normalized/nc-${spec.year}-official-president-${spec.geographyLevel}-results.json.gz`,
  geometrySourceSlug: `nc-${spec.year}-${spec.geographyLevel}-geometry`,
  resultSource: Object.freeze({
    id: spec.resultSourceId,
    slug: spec.resultSourceId,
    url: spec.resultSourceUrl,
    artifact:
      `data/precinct-geometry/NC/${spec.electionId}/normalized/nc-${spec.year}-official-president-${spec.geographyLevel}-results.json.gz`,
    sha256: spec.resultsSha256,
    byteCount: spec.resultsByteCount,
    timestampBasis:
      "Official North Carolina State Board of Elections local result rows; administrative reporting units remain separately identified and are never assigned to polygons.",
    authority: "North Carolina State Board of Elections",
  }),
})));

function insideRoot(root, relativePath) {
  if (
    typeof relativePath !== "string"
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
  ) {
    throw new Error(`Unsafe North Carolina artifact path: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (
    resolved !== resolvedRoot
    && !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(`North Carolina artifact escapes root: ${relativePath}`);
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
    row.ballotsCast ?? row.total,
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
    || document.reportingGrain !== spec.geographyLevel
    || document.sourceUnitCount !== spec.expectedUnits
    || document.geographicSourceUnitCount
      !== spec.expectedSourceGeographicUnits
    || document.colorableUnitCount !== spec.expectedGeographicUnits
    || document.excludedUnitCount !== spec.expectedNonGeographicUnits
    || document.rows?.length !== spec.expectedGeographicUnits
    || document.exclusions?.length !== spec.expectedNonGeographicUnits
  ) {
    throw new Error(
      `North Carolina ${spec.year} normalized result contract drifted`,
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
      reportingGrain: spec.geographyLevel,
      parentGeoid: row.parentGeoid,
      sourceUnitId: row.sourceUnitId,
    });
    if (
      code !== row.resultUnitCode
      || !/^37\d{3}$/.test(row.parentGeoid)
      || typeof row.sourceDisplayName !== "string"
      || !row.sourceDisplayName.trim()
      || seenCodes.has(code)
    ) {
      throw new Error(
        `North Carolina ${spec.year} geographic result identity drifted`,
      );
    }
    seenCodes.add(code);
    const values = safeResultRow(
      row,
      `North Carolina ${spec.year} ${code}`,
    );
    if (values.total === 0) zeroVoteUnits += 1;
    reportingUnits.push({
      code,
      sourceUnitId: row.sourceUnitId,
      sourceDisplayName: row.sourceDisplayName,
      parentGeoid: row.parentGeoid,
      reportingGrain: spec.geographyLevel,
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
      || !/^37\d{3}$/.test(row.parentGeoid)
      || typeof row.sourceDisplayName !== "string"
      || !row.sourceDisplayName.trim()
      || seenCodes.has(code)
    ) {
      throw new Error(
        `North Carolina ${spec.year} administrative result identity drifted`,
      );
    }
    seenCodes.add(code);
    safeResultRow(row, `North Carolina ${spec.year} ${code}`);
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
    throw new Error(`North Carolina ${spec.year} official total drifted`);
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
      `North Carolina ${spec.year} artifact validation failed: ${inspection.errors.join("; ")}`,
    );
  }
  if (
    manifest.geography.level !== spec.geographyLevel
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
      `North Carolina ${spec.year} reviewed local geometry contract drifted`,
    );
  }
  const geometryBytes = verified(
    root,
    manifest.normalization.artifact,
    manifest.normalization.sha256,
    spec.geometryByteCount,
    `North Carolina ${spec.year} geometry`,
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
      `North Carolina ${spec.year} feature ${sourceFeatureId}`,
    );
    if (
      !/^37\d{3}$/.test(parent)
      || !id
      || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
      || featureByKey.has(sourceFeatureId)
    ) {
      throw new Error(
        `North Carolina ${spec.year} normalized feature identity drifted`,
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
      `North Carolina ${spec.year} normalized feature count drifted`,
    );
  }
  const crosswalkBytes = verified(
    root,
    manifest.crosswalk.artifact,
    manifest.crosswalk.sha256,
    spec.crosswalkByteCount,
    `North Carolina ${spec.year} crosswalk`,
  );
  const crosswalk = JSON.parse(crosswalkBytes.toString("utf8"));
  if (
    crosswalk.state !== STATE
    || crosswalk.electionId !== spec.electionId
    || crosswalk.geographyLevel !== spec.geographyLevel
    || crosswalk.resultSourceId !== manifest.crosswalk.resultSourceId
  ) {
    throw new Error(
      `North Carolina ${spec.year} crosswalk envelope drifted`,
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
        `North Carolina ${spec.year} crosswalk identity drift at row ${index}`,
      );
    }
    seenUnits.add(row.resultUnitCode);
    const relationship = row.relationships[0];
    forbiddenProperties(
      relationship,
      `North Carolina ${spec.year} crosswalk row ${index}`,
    );
    const commonRelationshipValid = relationship.reviewStatus === "reviewed"
      && relationship.confidence === "high"
      && ["exact_official_id", "official_crosswalk"].includes(
        relationship.matchMethod,
      );
    const geographicRelationshipValid = unit.isGeographic
      && relationship.relationshipType === "one_to_one"
      && ["exact_official_id", "official_crosswalk"].includes(
        relationship.matchMethod,
      )
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
        `North Carolina ${spec.year} crosswalk relationship drift at row ${index}`,
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
    throw new Error(`North Carolina ${spec.year} crosswalk counts drifted`);
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
    `North Carolina ${spec.year} manifest`,
  );
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const contract = inspectPrecinctGeometryManifest(manifest);
  if (
    contract.errors.length
    || manifest.state !== STATE
    || manifest.election.id !== spec.electionId
    || manifest.election.date !== spec.electionDate
    || manifest.geography.level !== spec.geographyLevel
  ) {
    throw new Error(
      `North Carolina ${spec.year} manifest contract drifted: ${contract.errors.join("; ")}`,
    );
  }
  const resultBytes = verified(
    root,
    spec.resultsPath,
    spec.resultsSha256,
    spec.resultsByteCount,
    `North Carolina ${spec.year} normalized results`,
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

export async function buildNorthCarolinaLocalGisPlan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const selected = options.years
    ? new Set(options.years.map(Number))
    : new Set(
      NORTH_CAROLINA_LOCAL_GIS_YEAR_SPECS.map((spec) => spec.year),
    );
  for (const selectedYear of selected) {
    if (
      !NORTH_CAROLINA_LOCAL_GIS_YEAR_SPECS.some(
        (spec) => spec.year === selectedYear,
      )
    ) {
      throw new Error(
        "Supported North Carolina public-release years are 2012, 2016, and 2020; 2024 remains separately blocked",
      );
    }
  }
  const years = [];
  for (const spec of NORTH_CAROLINA_LOCAL_GIS_YEAR_SPECS.filter(
    (entry) => selected.has(entry.year),
  )) {
    years.push(await loadYear(root, spec));
  }
  if (!years.length) {
    throw new Error("Select at least one North Carolina local geography GIS year");
  }
  return {
    schemaVersion: 1,
    state: STATE,
    stateName: "North Carolina",
    authority: "North Carolina State Board of Elections",
    scope:
      "local-only 2012 VTD plus 2016 and 2020 precinct presidential general-election GIS setup; 2024 remains separately blocked",
    geographyLevels: Object.fromEntries(
      years.map((year) => [year.year, year.manifest.geography.level]),
    ),
    years,
  };
}

export function summarizeNorthCarolinaLocalGisPlan(plan) {
  return {
    schemaVersion: plan.schemaVersion,
    state: plan.state,
    scope: plan.scope,
    geographyLevels: plan.geographyLevels,
    years: plan.years.map((year) => ({
      year: year.year,
      electionId: year.electionId,
      manifestId: year.manifest.id,
      geographyLevel: year.manifest.geography.level,
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
