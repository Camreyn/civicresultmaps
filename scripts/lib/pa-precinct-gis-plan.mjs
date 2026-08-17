import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  inspectPrecinctGeometryManifest,
  reportingUnitCode,
} from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./precinct-geometry-validation.mjs";

const STATE = "PA";
const GEOGRAPHY_LEVEL = "precinct";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const REVIEWED_EXCLUSION_REASONS = new Set([
  "complete_vote_signature_mismatch",
  "no_geometry_vtd_key",
  "zero_or_blank_vtd_code",
  "duplicate_geometry_vtd_code",
]);

export const PENNSYLVANIA_PRECINCT_GIS_YEAR_SPECS = Object.freeze([
  {
    year: 2016,
    electionId: "2016-11-08-general",
    electionDate: "2016-11-08",
    manifestSha256: "1546a80d97e79a5632660dd8f7707bc854c6b4615b42dff6f02c2203ca87ccae",
    manifestByteCount: 4_259,
    geometryByteCount: 14_033_577,
    resultsSha256: "480bc60395784d2f389d11aeaeffd8313255c136308d04c530cd24292387b753",
    resultsByteCount: 262_907,
    crosswalkByteCount: 6_513_290,
    expectedSourceUnits: 9_176,
    expectedMappedSourceComponents: 8_018,
    expectedUnits: 8_014,
    expectedExcludedUnits: 1_158,
    expectedFeatures: 9_167,
    expectedCrosswalkRecords: 8_014,
    expectedNoDataFeatures: 1_153,
    expectedSourceZeroVoteUnits: 14,
    expectedMappedZeroVoteSourceComponents: 4,
    expectedMappedZeroVoteUnits: 0,
    expectedMappedTotals: Object.freeze({
      democratic: 2_522_337,
      republican: 2_618_972,
      other: 190_304,
      total: 5_331_613,
    }),
    expectedOfficialTotals: Object.freeze({
      democratic: 2_925_758,
      republican: 2_970_378,
      other: 218_160,
      total: 6_114_296,
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
      "https://www.pa.gov/agencies/dos/resources/voting-and-elections-resources/voting-and-election-statistics/election-data",
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    electionDate: "2020-11-03",
    manifestSha256: "9c089d28435d7c5b2343551e12185ee11c7ac07ec12195f94d60cea4734a2726",
    manifestByteCount: 4_263,
    geometryByteCount: 14_085_181,
    resultsSha256: "c44b42b11f4d565f897649b047c73be9f80a14356c41bde0c0ff3ef1287843e7",
    resultsByteCount: 266_056,
    crosswalkByteCount: 5_524_866,
    expectedSourceUnits: 9_187,
    expectedMappedSourceComponents: 6_827,
    expectedUnits: 6_805,
    expectedExcludedUnits: 2_360,
    expectedFeatures: 9_150,
    expectedCrosswalkRecords: 6_805,
    expectedNoDataFeatures: 2_345,
    expectedSourceZeroVoteUnits: 27,
    expectedMappedZeroVoteSourceComponents: 18,
    expectedMappedZeroVoteUnits: 0,
    expectedMappedTotals: Object.freeze({
      democratic: 2_503_433,
      republican: 2_802_054,
      other: 64_854,
      total: 5_370_341,
    }),
    expectedOfficialTotals: Object.freeze({
      democratic: 3_457_343,
      republican: 3_379_320,
      other: 79_381,
      total: 6_916_044,
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
      "https://www.pa.gov/agencies/dos/resources/voting-and-elections-resources/voting-and-election-statistics/election-data",
  },
].map((spec) => Object.freeze({
  ...spec,
  manifestPath:
    `data/precinct-geometry/PA/${spec.electionId}/manifest.json`,
  resultsPath:
    `data/precinct-geometry/PA/${spec.electionId}/normalized/pa-${spec.year}-president-results.json.gz`,
  geometrySourceSlug: `pa-${spec.year}-precinct-geometry`,
  resultSource: Object.freeze({
    id: `pa-dos-${spec.year}-general-precinct-results`,
    slug: `pa-dos-${spec.year}-general-precinct-results`,
    url: spec.resultSourceUrl,
    artifact:
      `data/precinct-geometry/PA/${spec.electionId}/normalized/pa-${spec.year}-president-results.json.gz`,
    sha256: spec.resultsSha256,
    byteCount: spec.resultsByteCount,
    timestampBasis:
      "Official Pennsylvania Department of State precinct results; units without reviewed geometry remain in source evidence and are never allocated to polygons.",
    authority: "Pennsylvania Department of State",
  }),
})));

function insideRoot(root, relativePath) {
  if (
    typeof relativePath !== "string"
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
  ) {
    throw new Error(`Unsafe Pennsylvania artifact path: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (
    resolved !== resolvedRoot
    && !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(`Pennsylvania artifact escapes root: ${relativePath}`);
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
    || document.mappedSourceComponentCount
      !== spec.expectedMappedSourceComponents
    || document.excludedUnitCount !== spec.expectedExcludedUnits
    || document.zeroVoteUnitCount !== spec.expectedSourceZeroVoteUnits
    || document.mappedZeroVoteSourceComponentCount
      !== spec.expectedMappedZeroVoteSourceComponents
    || document.mappedZeroVoteUnitCount !== spec.expectedMappedZeroVoteUnits
    || document.rows?.length !== spec.expectedUnits
    || document.exclusions?.length !== spec.expectedExcludedUnits
    || document.collection?.authority !== spec.resultSource.authority
    || document.collection?.sourceUrl !== spec.resultSource.url
  ) {
    throw new Error(
      `Pennsylvania ${spec.year} normalized result contract drifted`,
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
      || !/^42\d{3}$/.test(row.parentGeoid)
      || typeof row.sourceDisplayName !== "string"
      || !row.sourceDisplayName.trim()
      || seenCodes.has(code)
    ) {
      throw new Error(
        `Pennsylvania ${spec.year} geographic result identity drifted`,
      );
    }
    seenCodes.add(code);
    const values = safeResultRow(
      row,
      `Pennsylvania ${spec.year} ${code}`,
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
      || !/^42\d{3}$/.test(row.parentGeoid)
      || typeof row.sourceDisplayName !== "string"
      || !row.sourceDisplayName.trim()
      || seenCodes.has(code)
    ) {
      throw new Error(
        `Pennsylvania ${spec.year} excluded result identity drifted`,
      );
    }
    seenCodes.add(code);
    const values = safeResultRow(row, `Pennsylvania ${spec.year} ${code}`);
    if (!REVIEWED_EXCLUSION_REASONS.has(row.exclusionReason)) {
      throw new Error(`Pennsylvania ${spec.year} exclusion reason drifted`);
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
    || zeroVoteUnits !== spec.expectedMappedZeroVoteUnits
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
    throw new Error(`Pennsylvania ${spec.year} official total drifted`);
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
      `Pennsylvania ${spec.year} artifact validation failed: ${inspection.errors.join("; ")}`,
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
      `Pennsylvania ${spec.year} reviewed local geometry contract drifted`,
    );
  }
  const geometryBytes = verified(
    root,
    manifest.normalization.artifact,
    manifest.normalization.sha256,
    spec.geometryByteCount,
    `Pennsylvania ${spec.year} geometry`,
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
      `Pennsylvania ${spec.year} feature ${sourceFeatureId}`,
    );
    if (
      !/^42\d{3}$/.test(parent)
      || !id
      || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
      || featureByKey.has(sourceFeatureId)
    ) {
      throw new Error(
        `Pennsylvania ${spec.year} normalized feature identity drifted`,
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
      `Pennsylvania ${spec.year} normalized feature count drifted`,
    );
  }
  const crosswalkBytes = verified(
    root,
    manifest.crosswalk.artifact,
    manifest.crosswalk.sha256,
    spec.crosswalkByteCount,
    `Pennsylvania ${spec.year} crosswalk`,
  );
  const crosswalk = JSON.parse(crosswalkBytes.toString("utf8"));
  if (
    crosswalk.state !== STATE
    || crosswalk.electionId !== spec.electionId
    || crosswalk.geographyLevel !== GEOGRAPHY_LEVEL
    || crosswalk.resultSourceId !== manifest.crosswalk.resultSourceId
  ) {
    throw new Error(
      `Pennsylvania ${spec.year} crosswalk envelope drifted`,
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
        `Pennsylvania ${spec.year} crosswalk identity drift at row ${index}`,
      );
    }
    seenUnits.add(row.resultUnitCode);
    const relationship = row.relationships[0];
    forbiddenProperties(
      relationship,
      `Pennsylvania ${spec.year} crosswalk row ${index}`,
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
        `Pennsylvania ${spec.year} crosswalk relationship drift at row ${index}`,
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
    throw new Error(`Pennsylvania ${spec.year} crosswalk counts drifted`);
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
    `Pennsylvania ${spec.year} manifest`,
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
      `Pennsylvania ${spec.year} manifest contract drifted: ${contract.errors.join("; ")}`,
    );
  }
  const resultBytes = verified(
    root,
    spec.resultsPath,
    spec.resultsSha256,
    spec.resultsByteCount,
    `Pennsylvania ${spec.year} normalized results`,
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

export async function buildPennsylvaniaPrecinctGisPlan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const requestedYears = options.years
    ? options.years.map(Number)
    : PENNSYLVANIA_PRECINCT_GIS_YEAR_SPECS.map((spec) => spec.year);
  if (new Set(requestedYears).size !== requestedYears.length) {
    throw new Error("Pennsylvania precinct GIS years must be unique");
  }
  const selected = new Set(requestedYears);
  for (const selectedYear of selected) {
    if (
      !PENNSYLVANIA_PRECINCT_GIS_YEAR_SPECS.some(
        (spec) => spec.year === selectedYear,
      )
    ) {
      throw new Error(
        "Supported Pennsylvania public-release years are 2016 and 2020; 2012 and 2024 remain separately blocked",
      );
    }
  }
  const years = [];
  for (const spec of PENNSYLVANIA_PRECINCT_GIS_YEAR_SPECS.filter(
    (entry) => selected.has(entry.year),
  )) {
    years.push(await loadYear(root, spec));
  }
  if (!years.length) {
    throw new Error("Select at least one Pennsylvania precinct GIS year");
  }
  return {
    schemaVersion: 1,
    state: STATE,
    stateName: "Pennsylvania",
    authority: "Pennsylvania Department of State",
    scope:
      "local-only 2016 and 2020 presidential general-election precinct GIS setup; 2012 and 2024 remain separately blocked",
    geographyLevel: GEOGRAPHY_LEVEL,
    years,
  };
}

export function summarizePennsylvaniaPrecinctGisPlan(plan) {
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
