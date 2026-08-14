import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  inspectPrecinctGeometryManifest,
  reportingUnitCode,
} from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./precinct-geometry-validation.mjs";

const STATE = "AK";
const GEOGRAPHY_LEVEL = "precinct";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const ALASKA_PRECINCT_GIS_YEAR_SPECS = Object.freeze([
  {
    year: 2012,
    electionId: "2012-11-06-general",
    electionDate: "2012-11-06",
    manifestSha256: "02507e41cf2e771e85523be0a3941959e7221cf13f5e7029b313e5cc47510165",
    manifestByteCount: 5_632,
    geometryByteCount: 7_376_957,
    resultsSha256: "e54d636ebd5b016831891ef0a888e5cc4aacfada0e1b1bd52c7e6773b29f58ef",
    resultsByteCount: 47_135,
    crosswalkByteCount: 412_857,
    expectedUnits: 558,
    expectedGeographicUnits: 438,
    expectedNonGeographicUnits: 120,
    expectedFeatures: 438,
    expectedCrosswalkRecords: 558,
    expectedNoDataFeatures: 0,
    expectedNormalizedRows: 5_580,
    expectedSourcePresidentRows: 2_790,
    expectedResultRows: 2_190,
    expectedGeographicVotes: 203_048,
    expectedTotalVotes: 300_495,
    resultSourceUrl: "https://www.elections.alaska.gov/Core/Archive/ElectionReturns_2012_GENR.php",
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    electionDate: "2016-11-08",
    manifestSha256: "d0f815d721c8d3930fa059cf6d03e22ec17ddf26a70db5ae667401921ff70240",
    manifestByteCount: 4_234,
    geometryByteCount: 7_294_203,
    resultsSha256: "96ba0f935b8f4b908a32ae5b1bc31974cdecf579f0046bc44d1704b0a83bfb84",
    resultsByteCount: 59_804,
    crosswalkByteCount: 415_249,
    expectedUnits: 562,
    expectedGeographicUnits: 441,
    expectedNonGeographicUnits: 121,
    expectedFeatures: 441,
    expectedCrosswalkRecords: 562,
    expectedNoDataFeatures: 0,
    expectedNormalizedRows: 7_868,
    expectedSourcePresidentRows: 3_934,
    expectedResultRows: 3_087,
    expectedGeographicVotes: 197_924,
    expectedTotalVotes: 318_608,
    resultSourceUrl: "https://www.elections.alaska.gov/results/16GENR/",
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    electionDate: "2020-11-03",
    manifestSha256: "92ed6f15f3c019107238a9c595e5f2a5bdb27e05cc7f3d973e6b8bcab9fce290",
    manifestByteCount: 4_681,
    geometryByteCount: 7_294_220,
    resultsSha256: "2903c49f3ba23fa1464457f78ad763ccb8c5ecc8295e13ae16b92125a82aebbd",
    resultsByteCount: 51_612,
    crosswalkByteCount: 415_261,
    expectedUnits: 562,
    expectedGeographicUnits: 441,
    expectedNonGeographicUnits: 121,
    expectedFeatures: 441,
    expectedCrosswalkRecords: 562,
    expectedNoDataFeatures: 0,
    expectedNormalizedRows: 6_744,
    expectedSourcePresidentRows: 4_496,
    expectedResultRows: 3_528,
    expectedGeographicVotes: 156_462,
    expectedTotalVotes: 359_530,
    resultSourceUrl: "https://www.elections.alaska.gov/results/20GENR/",
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    electionDate: "2024-11-05",
    manifestSha256: "41add77368492e5ec148386109a89eab7a221995be35fd10f9ca8c3ca8261052",
    manifestByteCount: 5_100,
    geometryByteCount: 12_574_615,
    resultsSha256: "f3d53aa8ca674b1bb62dc791b4f647e89a182f16b77bad0107ef1e3bcc9e22d5",
    resultsByteCount: 51_643,
    crosswalkByteCount: 389_622,
    expectedUnits: 523,
    expectedGeographicUnits: 402,
    expectedNonGeographicUnits: 121,
    expectedFeatures: 402,
    expectedCrosswalkRecords: 523,
    expectedNoDataFeatures: 0,
    expectedNormalizedRows: 6_276,
    expectedSourcePresidentRows: 4_184,
    expectedResultRows: 3_216,
    expectedGeographicVotes: 173_953,
    expectedTotalVotes: 338_177,
    resultSourceUrl: "https://www.elections.alaska.gov/results/24GENR/ENRbyPrecinct.csv",
  },
].map((spec) => Object.freeze({
  ...spec,
  manifestPath: `data/precinct-geometry/AK/${spec.electionId}/manifest.json`,
  resultsPath: `data/precinct-geometry/AK/${spec.electionId}/normalized/ak-${spec.year}-official-precinct-results.json.gz`,
  geometrySourceSlug: `ak-${spec.year}-precinct-geometry`,
  resultSource: Object.freeze({
    id: `ak-${spec.year}-official-precinct-results`,
    slug: `ak-${spec.year}-official-precinct-results`,
    url: spec.resultSourceUrl,
    artifact: `data/precinct-geometry/AK/${spec.electionId}/normalized/ak-${spec.year}-official-precinct-results.json.gz`,
    sha256: spec.resultsSha256,
    byteCount: spec.resultsByteCount,
    timestampBasis: "Official Alaska Division of Elections precinct and separately identified administrative reporting-unit results retained with exact contest reconciliation.",
    authority: "Alaska Division of Elections",
  }),
})));

function insideRoot(root, relativePath) {
  if (
    typeof relativePath !== "string"
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
  ) {
    throw new Error(`Unsafe Alaska artifact path: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (
    resolved !== resolvedRoot
    && !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(`Alaska artifact escapes root: ${relativePath}`);
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
    || document.parentLevel !== "house_district"
    || document.sourceUnitCount !== spec.expectedUnits
    || document.geographicResultUnitCount !== spec.expectedGeographicUnits
    || document.nonGeographicResultUnitCount
      !== spec.expectedNonGeographicUnits
    || document.rows?.length !== spec.expectedNormalizedRows
  ) {
    throw new Error(`Alaska ${spec.year} normalized result contract drifted`);
  }
  const presidentRows = document.rows.filter(
    (row) => row.office === "president",
  );
  if (presidentRows.length !== spec.expectedSourcePresidentRows) {
    throw new Error(`Alaska ${spec.year} presidential result-row count drifted`);
  }
  const units = new Map();
  const resultRows = [];
  const totals = { Democratic: 0, Republican: 0, Other: 0, Total: 0 };
  const officialTotals = {
    Democratic: 0,
    Republican: 0,
    Other: 0,
    Total: 0,
  };
  for (const row of presidentRows) {
    const code = reportingUnitCode({
      state: STATE,
      electionId: spec.electionId,
      reportingGrain: row.reportingGrain,
      parentGeoid: row.parentGeoid,
      sourceUnitId: row.sourceUnitId,
    });
    if (
      code !== row.resultUnitCode
      || typeof row.reportingGrain !== "string"
      || typeof row.sourceDisplayName !== "string"
      || !row.sourceDisplayName.trim()
      || (
        row.isGeographic === true
          ? row.reportingGrain !== GEOGRAPHY_LEVEL
            || !/^HD(?:0[1-9]|[1-3][0-9]|40)$/.test(row.parentGeoid)
          : row.isGeographic === false
            ? row.reportingGrain !== "administrative_reporting_unit"
              || !/^HD(?:0[1-9]|[1-3][0-9]|40|99)$/.test(row.parentGeoid)
            : true
      )
    ) {
      throw new Error(`Alaska ${spec.year} normalized result identity drifted`);
    }
    const votes = Number(row.votes);
    if (
      !Number.isSafeInteger(votes)
      || votes < 0
      || typeof row.candidate !== "string"
      || !row.candidate.trim()
      || typeof row.partyCode !== "string"
      || !row.partyCode.trim()
    ) {
      throw new Error(`Alaska ${spec.year} normalized result total drifted for ${code}`);
    }
    const prior = units.get(code);
    const identity = {
      code,
      sourceUnitId: row.sourceUnitId,
      sourceDisplayName: row.sourceDisplayName,
      parentGeoid: row.parentGeoid,
      reportingGrain: row.reportingGrain,
      isGeographic: row.isGeographic === true,
      resultStatus: row.isGeographic === true
        ? "candidate_detail_complete"
        : "non_geographic_reconciliation_only",
      totalVotes: 0,
      candidates: new Set(),
    };
    if (prior) {
      if (
        prior.sourceUnitId !== identity.sourceUnitId
        || prior.sourceDisplayName !== identity.sourceDisplayName
        || prior.parentGeoid !== identity.parentGeoid
        || prior.isGeographic !== identity.isGeographic
        || prior.candidates.has(row.candidate)
      ) {
        throw new Error(`Alaska ${spec.year} repeated result identity drifted for ${code}`);
      }
    } else {
      units.set(code, identity);
    }
    const unit = units.get(code);
    unit.candidates.add(row.candidate);
    unit.totalVotes += votes;
    if (row.partyCode === "DEM") officialTotals.Democratic += votes;
    else if (row.partyCode === "REP") officialTotals.Republican += votes;
    else officialTotals.Other += votes;
    officialTotals.Total += votes;
    if (row.isGeographic === true) {
      resultRows.push({
        jurisdictionCode: code,
        jurisdictionName: row.sourceDisplayName,
        candidateName: row.candidate,
        party: row.partyCode,
        votes,
      });
      if (row.partyCode === "DEM") totals.Democratic += votes;
      else if (row.partyCode === "REP") totals.Republican += votes;
      else totals.Other += votes;
      totals.Total += votes;
    }
  }
  const reportingUnits = [...units.values()]
    .sort((left, right) => left.code.localeCompare(right.code))
    .map(({ totalVotes: _totalVotes, candidates: _candidates, ...unit }) => unit);
  const geographicUnitCount = reportingUnits.filter(
    (unit) => unit.isGeographic,
  ).length;
  const nonGeographicUnitCount = reportingUnits.length - geographicUnitCount;
  const zeroVoteUnits = [...units.values()].filter(
    (unit) => unit.isGeographic && unit.totalVotes === 0,
  ).length;
  if (
    reportingUnits.length !== spec.expectedUnits
    || geographicUnitCount !== spec.expectedGeographicUnits
    || nonGeographicUnitCount !== spec.expectedNonGeographicUnits
    || resultRows.length !== spec.expectedResultRows
    || totals.Total !== spec.expectedGeographicVotes
    || officialTotals.Total !== spec.expectedTotalVotes
    || document.contestTotals?.president?.totalVotes !== officialTotals.Total
  ) {
    throw new Error(`Alaska ${spec.year} official total drifted`);
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
      `Alaska ${spec.year} artifact validation failed: ${inspection.errors.join("; ")}`,
    );
  }
  if (
    manifest.geography.level !== GEOGRAPHY_LEVEL
    || manifest.crosswalk.status !== "reviewed"
    || manifest.crosswalk.resultUnits !== spec.expectedUnits
    || manifest.crosswalk.matchedResultUnits
      !== spec.expectedGeographicUnits
    || manifest.crosswalk.unmatchedResultUnits !== 0
    || manifest.crosswalk.nonGeographicResultUnits
      !== spec.expectedNonGeographicUnits
    || manifest.crosswalk.reviewedRelationshipRecords
      !== spec.expectedCrosswalkRecords
    || manifest.crosswalk.reviewedNoDataFeatures
      !== spec.expectedNoDataFeatures
    || manifest.delivery !== null
  ) {
    throw new Error(`Alaska ${spec.year} reviewed local geometry contract drifted`);
  }
  const geometryBytes = verified(
    root,
    manifest.normalization.artifact,
    manifest.normalization.sha256,
    spec.geometryByteCount,
    `Alaska ${spec.year} geometry`,
  );
  const normalized = JSON.parse(gunzipSync(geometryBytes).toString("utf8"));
  const features = [];
  const featureByKey = new Map();
  for (const feature of normalized.features ?? []) {
    const parent = String(feature.properties?.CRM_PARENT_GEOID ?? "");
    const id = String(feature.properties?.CRM_FEATURE_ID ?? "");
    const sourceFeatureId = `${parent}|${id}`;
    forbiddenProperties(feature.properties, `Alaska ${spec.year} feature ${sourceFeatureId}`);
    if (
      !/^HD(?:0[1-9]|[1-3][0-9]|40)$/.test(parent)
      || !id
      || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
      || featureByKey.has(sourceFeatureId)
    ) {
      throw new Error(`Alaska ${spec.year} normalized feature identity drifted`);
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
    throw new Error(`Alaska ${spec.year} normalized feature count drifted`);
  }
  const crosswalkBytes = verified(
    root,
    manifest.crosswalk.artifact,
    manifest.crosswalk.sha256,
    spec.crosswalkByteCount,
    `Alaska ${spec.year} crosswalk`,
  );
  const crosswalk = JSON.parse(crosswalkBytes.toString("utf8"));
  if (
    crosswalk.state !== STATE
    || crosswalk.electionId !== spec.electionId
    || crosswalk.geographyLevel !== GEOGRAPHY_LEVEL
  ) {
    throw new Error(`Alaska ${spec.year} crosswalk envelope drifted`);
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
      throw new Error(`Alaska ${spec.year} crosswalk identity drift at row ${index}`);
    }
    seenUnits.add(row.resultUnitCode);
    const relationship = row.relationships[0];
    forbiddenProperties(relationship, `Alaska ${spec.year} crosswalk row ${index}`);
    const commonRelationshipValid = relationship.reviewStatus === "reviewed"
      && relationship.confidence === "high"
      && ["exact_official_id", "official_crosswalk"].includes(
        relationship.matchMethod,
      );
    const geographicRelationshipValid = unit.isGeographic
      && relationship.relationshipType === "one_to_one"
      && featureByKey.has(relationship.sourceFeatureId);
    const nonGeographicRelationshipValid = !unit.isGeographic
      && relationship.relationshipType === "non_geographic"
      && relationship.sourceFeatureId === null;
    if (
      !commonRelationshipValid
      || (!geographicRelationshipValid && !nonGeographicRelationshipValid)
    ) {
      throw new Error(`Alaska ${spec.year} crosswalk relationship drift at row ${index}`);
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
    throw new Error(`Alaska ${spec.year} crosswalk counts drifted`);
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
    `Alaska ${spec.year} manifest`,
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
      `Alaska ${spec.year} manifest contract drifted: ${contract.errors.join("; ")}`,
    );
  }
  const resultBytes = verified(
    root,
    spec.resultsPath,
    spec.resultsSha256,
    spec.resultsByteCount,
    `Alaska ${spec.year} normalized results`,
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
    candidateDetailSuppressedUnits:
      results.candidateDetailSuppressedUnits,
    sourceRows: results.reportingUnits.length,
    geometry: buildGeometryPlan(root, spec, manifest, results),
    geometrySourceSlug: spec.geometrySourceSlug,
  };
}

export async function buildAlaskaPrecinctGisPlan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const selected = options.years
    ? new Set(options.years.map(Number))
    : new Set(ALASKA_PRECINCT_GIS_YEAR_SPECS.map((spec) => spec.year));
  for (const selectedYear of selected) {
    if (!ALASKA_PRECINCT_GIS_YEAR_SPECS.some((spec) => spec.year === selectedYear)) {
      throw new Error(
        "Supported Alaska precinct GIS years are 2012, 2016, 2020, and 2024",
      );
    }
  }
  const years = [];
  for (const spec of ALASKA_PRECINCT_GIS_YEAR_SPECS.filter(
    (entry) => selected.has(entry.year),
  )) {
    years.push(await loadYear(root, spec));
  }
  if (!years.length) {
    throw new Error("Select at least one Alaska precinct GIS year");
  }
  return {
    schemaVersion: 1,
    state: STATE,
    stateName: "Alaska",
    authority: "Alaska Division of Elections",
    scope: "local-only presidential general-election precinct GIS setup",
    geographyLevel: GEOGRAPHY_LEVEL,
    years,
  };
}

export function summarizeAlaskaPrecinctGisPlan(plan) {
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
