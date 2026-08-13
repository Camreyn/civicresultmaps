import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { inspectPrecinctGeometryManifest, reportingUnitCode } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./precinct-geometry-validation.mjs";

const STATE = "IA";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const IOWA_PRECINCT_GIS_YEAR_SPECS = Object.freeze([
  {
    year: 2012,
    electionId: "2012-11-06-general",
    electionDate: "2012-11-06",
    manifestSha256: "4ad3d46681e14d7853550372b9f066646f5fe902bd08a6c023f7632e96eabfdb",
    manifestByteCount: 3_684,
    geometryByteCount: 1_445,
    resultsSha256: "7559291f093ec820cc116dc92b744657fba56ecfab10f1f9b3eaab3f5bc1b00b",
    resultsByteCount: 54_517,
    crosswalkByteCount: 1_741_775,
    expectedUnits: 1_686,
    expectedFeatures: 0,
    expectedCrosswalkRecords: 0,
    expectedNoDataFeatures: 0,
    democratic: { name: "Barack Obama", party: "DEM" },
    republican: { name: "Mitt Romney", party: "REP" },
    resultSource: {
      id: "ia-2012-sos-county-precinct-workbooks",
      slug: "ia-2012-sos-president-precinct-results",
      url: "https://sos.iowa.gov/elections/pdf/precinctresults/2012general/",
      artifact: "data/precinct-geometry/IA/2012-11-06-general/normalized/ia-2012-president-results.json.gz",
      sha256: "7559291f093ec820cc116dc92b744657fba56ecfab10f1f9b3eaab3f5bc1b00b",
      byteCount: 54_517,
      timestampBasis: "All 99 official Iowa Secretary of State county precinct workbooks, reconciled to the official canvass.",
      authority: "Iowa Secretary of State",
    },
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    electionDate: "2016-11-08",
    manifestSha256: "b9bd40bc2b31258ec9026333ec86bf25de83c856528c9015b53ba50bb29d4c69",
    manifestByteCount: 3_704,
    geometryByteCount: 3_707_853,
    resultsSha256: "4477992188679ba33091afe522f5c7fcf143514a08a8d341974e5389aaff59b3",
    resultsByteCount: 60_225,
    crosswalkByteCount: 1_471_807,
    expectedUnits: 1_680,
    expectedFeatures: 1_680,
    expectedCrosswalkRecords: 1_680,
    expectedNoDataFeatures: 0,
    democratic: { name: "Hillary Clinton", party: "DEM" },
    republican: { name: "Donald Trump", party: "REP" },
    resultSource: {
      id: "ia-sos-2016-general-county-precinct-workbooks",
      slug: "ia-2016-sos-president-precinct-results",
      url: "https://sos.iowa.gov/elections/pdf/precinctresults/2016general/",
      artifact: "data/precinct-geometry/IA/2016-11-08-general/normalized/ia-2016-president-results.json.gz",
      sha256: "4477992188679ba33091afe522f5c7fcf143514a08a8d341974e5389aaff59b3",
      byteCount: 60_225,
      timestampBasis: "All 99 official Iowa Secretary of State county precinct workbooks, reconciled to the official canvass.",
      authority: "Iowa Secretary of State",
    },
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    electionDate: "2020-11-03",
    manifestSha256: "9f1ba59c3fb6f0700df59174937a16bc10aedb39d00c22d0b5ff009a81cfec66",
    manifestByteCount: 3_688,
    geometryByteCount: 6_359_367,
    resultsSha256: "f97cbccced3a5d30686bdbc6fe76b40c22d55e1958e276e896c7cb4d9d6f6ceb",
    resultsByteCount: 57_646,
    crosswalkByteCount: 1_721_164,
    expectedUnits: 1_661,
    expectedFeatures: 1_661,
    expectedCrosswalkRecords: 1_661,
    expectedNoDataFeatures: 0,
    democratic: { name: "Joe Biden", party: "DEM" },
    republican: { name: "Donald Trump", party: "REP" },
    resultSource: {
      id: "ia-sos-2020-general-precinct-results",
      slug: "ia-2020-sos-president-precinct-results",
      url: "https://sos.iowa.gov/elections/pdf/precinctresults/2020general/",
      artifact: "data/precinct-geometry/IA/2020-11-03-general/normalized/ia-2020-president-results.json.gz",
      sha256: "f97cbccced3a5d30686bdbc6fe76b40c22d55e1958e276e896c7cb4d9d6f6ceb",
      byteCount: 57_646,
      timestampBasis: "All 99 official Iowa Secretary of State county precinct workbooks, reconciled to the official canvass.",
      authority: "Iowa Secretary of State",
    },
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    electionDate: "2024-11-05",
    manifestSha256: "e9bda5f95c7b00ffa4e2bd61225fd324ade7ce8da32409da8b0de2112d8f9557",
    manifestByteCount: 3_811,
    geometryByteCount: 8_644_260,
    resultsSha256: "693297ea851aa46a108353b48cd38db6087a55a42d8fe4948a3effe63e7b09a5",
    resultsByteCount: 57_195,
    crosswalkByteCount: 1_745_309,
    expectedUnits: 1_653,
    expectedFeatures: 1_653,
    expectedCrosswalkRecords: 1_653,
    expectedNoDataFeatures: 0,
    democratic: { name: "Kamala Harris", party: "DEM" },
    republican: { name: "Donald Trump", party: "REP" },
    resultSource: {
      id: "ia-sos-2024-general-county-detailxml-reports",
      slug: "ia-2024-sos-president-precinct-results",
      url: "https://electionresults.iowa.gov/",
      artifact: "data/precinct-geometry/IA/2024-11-05-general/normalized/ia-2024-president-results.json.gz",
      sha256: "693297ea851aa46a108353b48cd38db6087a55a42d8fe4948a3effe63e7b09a5",
      byteCount: 57_195,
      timestampBasis: "All 99 official Iowa county detail XML reports, reconciled to the official statewide result.",
      authority: "Iowa Secretary of State",
    },
  },
].map((spec) => Object.freeze({
  ...spec,
  manifestPath: `data/precinct-geometry/IA/${spec.electionId}/manifest.json`,
  resultsPath: `data/precinct-geometry/IA/${spec.electionId}/normalized/ia-${spec.year}-president-results.json.gz`,
  geometrySourceSlug: `ia-${spec.year}-precinct-geometry`,
})));

const SOURCE_GATE_BLOCK_CODES = Object.freeze({
  2012: "missing-complete-election-effective-2012-geometry",
});

function insideRoot(root, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.split("/").includes("..")) {
    throw new Error(`Unsafe Iowa artifact path: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) throw new Error(`Iowa artifact escapes root: ${relativePath}`);
  return resolved;
}

function verified(root, relativePath, expectedSha, expectedBytes, label) {
  const target = insideRoot(root, relativePath);
  if (!existsSync(target)) throw new Error(`${label} is missing: ${relativePath}`);
  const bytes = readFileSync(target);
  if (bytes.length !== expectedBytes || sha256(bytes) !== expectedSha) throw new Error(`${label} bytes or SHA-256 drifted`);
  return bytes;
}

function forbiddenProperties(value, context) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((entry, index) => forbiddenProperties(entry, `${context}[${index}]`));
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:VOTES?|TOTALVOTES?|CANDIDATE|PARTY|G\d{2}PRE)/i.test(key)) throw new Error(`${context} contains election-value property ${key}`);
    forbiddenProperties(child, `${context}.${key}`);
  }
}

function buildResultPlan(spec, document) {
  if (document.schemaVersion !== 1 || document.state !== STATE || document.electionId !== spec.electionId || document.rows?.length !== spec.expectedUnits) {
    throw new Error(`Iowa ${spec.year} normalized result contract drifted`);
  }
  const reportingUnits = [];
  const resultRows = [];
  const codes = new Set();
  const totals = { Democratic: 0, Republican: 0, Other: 0, Total: 0 };
  let zeroVoteUnits = 0;
  for (const row of document.rows) {
    const code = reportingUnitCode({ state: STATE, electionId: spec.electionId, reportingGrain: "precinct", parentGeoid: row.parentGeoid, sourceUnitId: row.sourceUnitId });
    if (code !== row.resultUnitCode || codes.has(code) || !/^19\d{3}$/.test(row.parentGeoid)) throw new Error(`Iowa ${spec.year} normalized result identity drifted`);
    codes.add(code);
    const resultStatus = "candidate_detail_complete";
    const total = Number(row.total);
    const democratic = Number(row.democratic);
    const republican = Number(row.republican);
    const other = Number(row.other);
    if (
      ![democratic, republican, other, total].every(Number.isSafeInteger)
      || [democratic, republican, other].some((value) => value < 0)
      || total !== democratic + republican + other
    ) {
      throw new Error(`Iowa ${spec.year} normalized result total drifted for ${code}`);
    }
    if (total === 0) zeroVoteUnits += 1;
    reportingUnits.push({
      code,
      sourceUnitId: row.sourceUnitId,
      sourceDisplayName: row.sourceDisplayName,
      parentGeoid: row.parentGeoid,
      reportingGrain: "precinct",
      isGeographic: true,
      resultStatus,
    });
    resultRows.push(
      { jurisdictionCode: code, jurisdictionName: row.sourceDisplayName, candidateName: spec.democratic.name, party: spec.democratic.party, votes: democratic },
      { jurisdictionCode: code, jurisdictionName: row.sourceDisplayName, candidateName: spec.republican.name, party: spec.republican.party, votes: republican },
      { jurisdictionCode: code, jurisdictionName: row.sourceDisplayName, candidateName: "Other", party: "OTHER", votes: other },
    );
    totals.Democratic += democratic;
    totals.Republican += republican;
    totals.Other += other;
    totals.Total += total;
  }
  return { reportingUnits, resultRows, totals, zeroVoteUnits, candidateDetailSuppressedUnits: 0, source: spec.resultSource };
}

function buildGeometryPlan(root, spec, manifest, results) {
  const inspection = validateManifestArtifacts(manifest, { root, skipDelivery: true });
  if (inspection.errors.length) throw new Error(`Iowa ${spec.year} artifact validation failed: ${inspection.errors.join("; ")}`);
  if (spec.year === 2012) {
    if (
      manifest.crosswalk.status !== "blocked"
      || manifest.normalization.featureCount !== 0
      || manifest.crosswalk.matchedResultUnits !== 0
      || manifest.delivery !== null
    ) {
      throw new Error("Iowa 2012 blocked geometry contract drifted");
    }
    return {
      disposition: "blocked",
      sourceGatePassed: false,
      publicReleaseEligible: false,
      blockCode: SOURCE_GATE_BLOCK_CODES[2012],
      reasons: [...manifest.validation.errors, ...manifest.caveats],
      features: [],
      crosswalks: [],
      artifactWarnings: inspection.warnings,
    };
  }
  if (
    manifest.crosswalk.status !== "reviewed"
    || manifest.crosswalk.resultUnits !== spec.expectedUnits
    || manifest.crosswalk.matchedResultUnits !== spec.expectedUnits
    || manifest.crosswalk.unmatchedResultUnits !== 0
    || manifest.crosswalk.reviewedRelationshipRecords
      !== spec.expectedCrosswalkRecords
    || manifest.crosswalk.reviewedNoDataFeatures
      !== spec.expectedNoDataFeatures
    || manifest.delivery !== null
  ) {
    throw new Error(`Iowa ${spec.year} reviewed local geometry contract drifted`);
  }
  const geometryBytes = verified(root, manifest.normalization.artifact, manifest.normalization.sha256, spec.geometryByteCount, `Iowa ${spec.year} geometry`);
  const normalized = JSON.parse(gunzipSync(geometryBytes).toString("utf8"));
  const features = [];
  const featureByKey = new Map();
  for (const feature of normalized.features ?? []) {
    const parent = String(feature.properties?.CRM_PARENT_GEOID ?? "");
    const id = String(feature.properties?.CRM_FEATURE_ID ?? "");
    const sourceFeatureId = `${parent}|${id}`;
    forbiddenProperties(feature.properties, `Iowa ${spec.year} feature ${sourceFeatureId}`);
    if (!/^19\d{3}$/.test(parent) || !id || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type) || featureByKey.has(sourceFeatureId)) {
      throw new Error(`Iowa ${spec.year} normalized feature identity drifted`);
    }
    const record = { sourceFeatureId, parentGeoid: parent, name: String(feature.properties.SOURCE_PRECINCT ?? id), geometryKey: sourceFeatureId, isGeographic: true, properties: feature.properties };
    features.push(record);
    featureByKey.set(sourceFeatureId, record);
  }
  if (features.length !== spec.expectedFeatures) throw new Error(`Iowa ${spec.year} normalized feature count drifted`);
  const crosswalkBytes = verified(root, manifest.crosswalk.artifact, manifest.crosswalk.sha256, spec.crosswalkByteCount, `Iowa ${spec.year} crosswalk`);
  const crosswalk = JSON.parse(crosswalkBytes.toString("utf8"));
  const unitsByCode = new Map(results.reportingUnits.map((unit) => [unit.code, unit]));
  const seenUnits = new Set();
  const crosswalks = [];
  for (const [index, row] of (crosswalk.rows ?? []).entries()) {
    const unit = unitsByCode.get(row.resultUnitCode);
    if (!unit || row.sourceUnitId !== unit.sourceUnitId || row.parentGeoid !== unit.parentGeoid || seenUnits.has(row.resultUnitCode) || !Array.isArray(row.relationships) || row.relationships.length === 0) {
      throw new Error(`Iowa ${spec.year} crosswalk identity drift at row ${index}`);
    }
    seenUnits.add(row.resultUnitCode);
    for (const relationship of row.relationships) {
      forbiddenProperties(relationship, `Iowa ${spec.year} crosswalk row ${index}`);
      if (relationship.relationshipType !== "one_to_one" || relationship.reviewStatus !== "reviewed" || !featureByKey.has(relationship.sourceFeatureId)) {
        throw new Error(`Iowa ${spec.year} crosswalk relationship drift at row ${index}`);
      }
      crosswalks.push({ reportingUnitCode: row.resultUnitCode, sourceFeatureId: relationship.sourceFeatureId, relationshipType: relationship.relationshipType, matchMethod: relationship.matchMethod, reviewStatus: relationship.reviewStatus, confidence: relationship.confidence, note: String(relationship.note ?? "") });
    }
  }
  if (seenUnits.size !== spec.expectedUnits || crosswalks.length !== spec.expectedCrosswalkRecords) throw new Error(`Iowa ${spec.year} crosswalk counts drifted`);
  return {
    disposition: "loadable_reviewed",
    sourceGatePassed: !SOURCE_GATE_BLOCK_CODES[spec.year],
    publicReleaseEligible: false,
    blockCode: SOURCE_GATE_BLOCK_CODES[spec.year] ?? null,
    reasons: [...manifest.validation.errors],
    features,
    crosswalks,
    artifactWarnings: inspection.warnings,
  };
}

async function loadYear(root, spec) {
  const manifestBytes = verified(root, spec.manifestPath, spec.manifestSha256, spec.manifestByteCount, `Iowa ${spec.year} manifest`);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const contract = inspectPrecinctGeometryManifest(manifest);
  if (contract.errors.length || manifest.state !== STATE || manifest.election.id !== spec.electionId || manifest.election.date !== spec.electionDate) {
    throw new Error(`Iowa ${spec.year} manifest contract drifted: ${contract.errors.join("; ")}`);
  }
  const resultBytes = verified(root, spec.resultsPath, spec.resultsSha256, spec.resultsByteCount, `Iowa ${spec.year} normalized results`);
  const results = buildResultPlan(spec, JSON.parse(gunzipSync(resultBytes).toString("utf8")));
  return {
    year: spec.year,
    electionId: spec.electionId,
    electionDate: spec.electionDate,
    manifestPath: spec.manifestPath,
    manifestSha256: spec.manifestSha256,
    manifestByteCount: spec.manifestByteCount,
    artifactByteCounts: { source: manifest.source.byteCount, normalization: spec.geometryByteCount, crosswalk: spec.crosswalkByteCount },
    manifest,
    resultSource: results.source,
    reportingUnits: results.reportingUnits,
    resultRows: results.resultRows,
    totals: results.totals,
    zeroVoteUnits: results.zeroVoteUnits,
    candidateDetailSuppressedUnits: results.candidateDetailSuppressedUnits,
    sourceRows: results.reportingUnits.length,
    geometry: buildGeometryPlan(root, spec, manifest, results),
    geometrySourceSlug: spec.geometrySourceSlug,
  };
}

export async function buildIowaPrecinctGisPlan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const selected = options.years ? new Set(options.years.map(Number)) : new Set(IOWA_PRECINCT_GIS_YEAR_SPECS.map((spec) => spec.year));
  for (const selectedYear of selected) if (!IOWA_PRECINCT_GIS_YEAR_SPECS.some((spec) => spec.year === selectedYear)) throw new Error("Supported Iowa precinct GIS years are 2012, 2016, 2020, and 2024");
  const years = [];
  for (const spec of IOWA_PRECINCT_GIS_YEAR_SPECS.filter((entry) => selected.has(entry.year))) years.push(await loadYear(root, spec));
  if (!years.length) throw new Error("Select at least one Iowa precinct GIS year");
  return { schemaVersion: 1, state: STATE, stateName: "Iowa", authority: "Iowa Secretary of State and retained reviewed geometry sources", scope: "local-only presidential general-election precinct GIS setup", years };
}

export function summarizeIowaPrecinctGisPlan(plan) {
  return {
    schemaVersion: plan.schemaVersion,
    state: plan.state,
    scope: plan.scope,
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
