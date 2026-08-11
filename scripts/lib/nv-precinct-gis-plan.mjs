import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { inspectPrecinctGeometryManifest, reportingUnitCode } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./precinct-geometry-validation.mjs";

const STATE = "NV";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const NEVADA_PRECINCT_GIS_YEAR_SPECS = Object.freeze([
  {
    year: 2012,
    electionId: "2012-11-06-general",
    electionDate: "2012-11-06",
    manifestSha256: "650343bbf67c4b356de1060f8c134550c26ab68d44b30fe7cfe90be46d0a119d",
    manifestByteCount: 3_706,
    geometryByteCount: 3_735_292,
    resultsSha256: "7499c911720914cccbc513ada60e12853ca6ebcd72e947b864561d2c4061e6ee",
    resultsByteCount: 36_912,
    crosswalkByteCount: 1_180_593,
    expectedUnits: 1_760,
    expectedFeatures: 2_020,
    expectedCrosswalkRecords: 1_778,
    expectedNoDataFeatures: 242,
    democratic: { name: "Barack Obama", party: "DEM" },
    republican: { name: "Mitt Romney", party: "REP" },
    resultSource: {
      id: "nv-2012-president-precinct-results",
      slug: "nv-2012-sos-president-precinct-results",
      url: "https://www.nvsos.gov/silverstate2012gen/",
      artifact: "data/precinct-geometry/NV/2012-11-06-general/raw/nevada-secretary-of-state/2012-general-precinct.csv",
      sha256: "1611ea13fd2f67b4d23fcc26b01ab84d3a23d7b18beaae1cd994e9d1b87a6948",
      byteCount: 7_177_507,
      timestampBasis: "Nevada Secretary of State 2012 General precinct export; cells below the statutory privacy threshold are suppressed.",
      authority: "Nevada Secretary of State",
    },
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    electionDate: "2016-11-08",
    manifestSha256: "c5b95a7c50d81666cd0594aba06b6246fcbb4b38dcfa8c694c1b32aa398dba56",
    manifestByteCount: 4_139,
    geometryByteCount: 3_545_018,
    resultsSha256: "d3aeb7ccc54f2e6d0546c250f9ea8f581cb82cde6a51556829e7a45e99c45da8",
    resultsByteCount: 41_489,
    crosswalkByteCount: 1_527_266,
    expectedUnits: 2_067,
    expectedFeatures: 2_067,
    expectedCrosswalkRecords: 2_067,
    expectedNoDataFeatures: 0,
    democratic: { name: "Hillary Clinton", party: "DEM" },
    republican: { name: "Donald Trump", party: "REP" },
    resultSource: {
      id: "nv-2016-president-precinct-results",
      slug: "nv-2016-vest-president-precinct-results",
      url: "https://election.lab.ufl.edu/dataset/nv-2016-precinct-level-election-results/",
      artifact: "data/precinct-geometry/NV/2016-11-08-general/raw/vest/nv_2016.zip",
      sha256: "4e3ddd59f31d61f55ff2d94bd03eb9d3ba0771c910b9509889b76eea209e476d",
      byteCount: 6_798_273,
      timestampBasis: "VEST Nevada 2016 election-specific database, V1.2.",
      authority: "Voting and Election Science Team",
    },
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    electionDate: "2020-11-03",
    manifestSha256: "9f97535f61548ae458d27059061a522c9bcb8a506a76c7dea4d9dedd2bb95822",
    manifestByteCount: 3_545,
    geometryByteCount: 3_571_130,
    resultsSha256: "efc5b08c5e5e4d865810b5335d60da39356b378dad4c32b371726a9567b7f48d",
    resultsByteCount: 41_576,
    crosswalkByteCount: 1_543_728,
    expectedUnits: 2_094,
    expectedFeatures: 2_094,
    expectedCrosswalkRecords: 2_094,
    expectedNoDataFeatures: 0,
    democratic: { name: "Joe Biden", party: "DEM" },
    republican: { name: "Donald Trump", party: "REP" },
    resultSource: {
      id: "nv-2020-president-precinct-results",
      slug: "nv-2020-vest-president-precinct-results",
      url: "https://dataverse.harvard.edu/file.xhtml?fileId=4863168&version=21.0",
      artifact: "data/precinct-geometry/NV/2020-11-03-general/raw/vest/nv_2020.zip",
      sha256: "bc6befa8917bb309540ff3414c036a577730bd301ecef119797b919c0abb2d90",
      byteCount: 6_840_584,
      timestampBasis: "VEST Nevada 2020 election-specific database, Harvard Dataverse file 4863168 version 21.0.",
      authority: "Voting and Election Science Team",
    },
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    electionDate: "2024-11-05",
    manifestSha256: "2bba184188bf8af10b6fb22dcd594eb5744e33080534928264723018541571dc",
    manifestByteCount: 4_231,
    geometryByteCount: 3_066_961,
    resultsSha256: "1a685414d699f40eb2ad8da8b4a9c83e1614107072ab567004942eaf634912fa",
    resultsByteCount: 30_391,
    crosswalkByteCount: 1_056_649,
    expectedUnits: 1_518,
    expectedFeatures: 1_726,
    expectedCrosswalkRecords: 1_518,
    expectedNoDataFeatures: 208,
    democratic: { name: "Kamala Harris", party: "DEM" },
    republican: { name: "Donald Trump", party: "REP" },
    resultSource: {
      id: "nv-2024-president-precinct-results",
      slug: "nv-2024-sos-president-precinct-results",
      url: "https://www.nvsos.gov/electionresults/RaceResults.aspx",
      artifact: "data/precinct-geometry/NV/2024-11-05-general/raw/nevada-secretary-of-state/2024-general-president.csv",
      sha256: "487bc06f2b5d0d6d12b6236a285d95f42b584149d631a8ad06e22d9428581fbc",
      byteCount: 906_801,
      timestampBasis: "Nevada Secretary of State 2024 General presidential precinct export; low-count cells are suppressed.",
      authority: "Nevada Secretary of State",
    },
  },
].map((spec) => Object.freeze({
  ...spec,
  manifestPath: `data/precinct-geometry/NV/${spec.electionId}/manifest.json`,
  resultsPath: `data/precinct-geometry/NV/${spec.electionId}/normalized/nv-${spec.year}-president-results.json.gz`,
  geometrySourceSlug: `nv-${spec.year}-precinct-geometry`,
})));

const SOURCE_GATE_BLOCK_CODES = Object.freeze({
  2012: "missing-election-date-washoe-archive",
  2016: "secondary-reconstruction-needs-official-row-level-provenance-review",
  2020: "unverified-v21-redistribution-terms",
  2024: "missing-affirmative-lcb-derivative-redistribution-review",
});

function insideRoot(root, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.split("/").includes("..")) {
    throw new Error(`Unsafe Nevada artifact path: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) throw new Error(`Nevada artifact escapes root: ${relativePath}`);
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
    throw new Error(`Nevada ${spec.year} normalized result contract drifted`);
  }
  const reportingUnits = [];
  const resultRows = [];
  const codes = new Set();
  const totals = { Democratic: 0, Republican: 0, Other: 0, Total: 0 };
  let zeroVoteUnits = 0;
  for (const row of document.rows) {
    const code = reportingUnitCode({ state: STATE, electionId: spec.electionId, reportingGrain: "precinct", parentGeoid: row.parentGeoid, sourceUnitId: row.sourceUnitId });
    if (code !== row.resultUnitCode || codes.has(code) || !/^32\d{3}$/.test(row.parentGeoid)) throw new Error(`Nevada ${spec.year} normalized result identity drifted`);
    codes.add(code);
    const democratic = Number(row.democratic);
    const republican = Number(row.republican);
    const other = Number(row.other);
    const total = Number(row.total);
    if (![democratic, republican, other, total].every(Number.isInteger) || [democratic, republican, other].some((value) => value < 0) || total !== democratic + republican + other) {
      throw new Error(`Nevada ${spec.year} normalized result total drifted for ${code}`);
    }
    if (total === 0) zeroVoteUnits += 1;
    reportingUnits.push({ code, sourceUnitId: row.sourceUnitId, sourceDisplayName: row.sourceDisplayName, parentGeoid: row.parentGeoid, reportingGrain: "precinct", isGeographic: true });
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
  return { reportingUnits, resultRows, totals, zeroVoteUnits, source: spec.resultSource };
}

function buildGeometryPlan(root, spec, manifest, results) {
  const inspection = validateManifestArtifacts(manifest, { root, skipDelivery: true });
  if (inspection.errors.length) throw new Error(`Nevada ${spec.year} artifact validation failed: ${inspection.errors.join("; ")}`);
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
    throw new Error(`Nevada ${spec.year} reviewed local geometry contract drifted`);
  }
  const geometryBytes = verified(root, manifest.normalization.artifact, manifest.normalization.sha256, spec.geometryByteCount, `Nevada ${spec.year} geometry`);
  const normalized = JSON.parse(gunzipSync(geometryBytes).toString("utf8"));
  const features = [];
  const featureByKey = new Map();
  for (const feature of normalized.features ?? []) {
    const parent = String(feature.properties?.CRM_PARENT_GEOID ?? "");
    const id = String(feature.properties?.CRM_FEATURE_ID ?? "");
    const sourceFeatureId = `${parent}|${id}`;
    forbiddenProperties(feature.properties, `Nevada ${spec.year} feature ${sourceFeatureId}`);
    if (!/^32\d{3}$/.test(parent) || !id || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type) || featureByKey.has(sourceFeatureId)) {
      throw new Error(`Nevada ${spec.year} normalized feature identity drifted`);
    }
    const record = { sourceFeatureId, parentGeoid: parent, name: String(feature.properties.SOURCE_PRECINCT ?? id), geometryKey: sourceFeatureId, isGeographic: true, properties: feature.properties };
    features.push(record);
    featureByKey.set(sourceFeatureId, record);
  }
  if (features.length !== spec.expectedFeatures) throw new Error(`Nevada ${spec.year} normalized feature count drifted`);
  const crosswalkBytes = verified(root, manifest.crosswalk.artifact, manifest.crosswalk.sha256, spec.crosswalkByteCount, `Nevada ${spec.year} crosswalk`);
  const crosswalk = JSON.parse(crosswalkBytes.toString("utf8"));
  const unitsByCode = new Map(results.reportingUnits.map((unit) => [unit.code, unit]));
  const seenUnits = new Set();
  const crosswalks = [];
  for (const [index, row] of (crosswalk.rows ?? []).entries()) {
    const unit = unitsByCode.get(row.resultUnitCode);
    if (!unit || row.sourceUnitId !== unit.sourceUnitId || row.parentGeoid !== unit.parentGeoid || seenUnits.has(row.resultUnitCode) || !Array.isArray(row.relationships) || row.relationships.length === 0) {
      throw new Error(`Nevada ${spec.year} crosswalk identity drift at row ${index}`);
    }
    seenUnits.add(row.resultUnitCode);
    for (const relationship of row.relationships) {
      forbiddenProperties(relationship, `Nevada ${spec.year} crosswalk row ${index}`);
      if (!["one_to_one", "one_to_many"].includes(relationship.relationshipType) || relationship.reviewStatus !== "reviewed" || !featureByKey.has(relationship.sourceFeatureId)) {
        throw new Error(`Nevada ${spec.year} crosswalk relationship drift at row ${index}`);
      }
      crosswalks.push({ reportingUnitCode: row.resultUnitCode, sourceFeatureId: relationship.sourceFeatureId, relationshipType: relationship.relationshipType, matchMethod: relationship.matchMethod, reviewStatus: relationship.reviewStatus, confidence: relationship.confidence, note: String(relationship.note ?? "") });
    }
  }
  if (seenUnits.size !== spec.expectedUnits || crosswalks.length !== spec.expectedCrosswalkRecords) throw new Error(`Nevada ${spec.year} crosswalk counts drifted`);
  return {
    disposition: "loadable_reviewed",
    publicReleaseEligible: false,
    blockCode: SOURCE_GATE_BLOCK_CODES[spec.year],
    reasons: [...manifest.validation.errors],
    features,
    crosswalks,
    artifactWarnings: inspection.warnings,
  };
}

async function loadYear(root, spec) {
  const manifestBytes = verified(root, spec.manifestPath, spec.manifestSha256, spec.manifestByteCount, `Nevada ${spec.year} manifest`);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const contract = inspectPrecinctGeometryManifest(manifest);
  if (contract.errors.length || manifest.state !== STATE || manifest.election.id !== spec.electionId || manifest.election.date !== spec.electionDate) {
    throw new Error(`Nevada ${spec.year} manifest contract drifted: ${contract.errors.join("; ")}`);
  }
  const resultBytes = verified(root, spec.resultsPath, spec.resultsSha256, spec.resultsByteCount, `Nevada ${spec.year} normalized results`);
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
    sourceRows: results.reportingUnits.length,
    geometry: buildGeometryPlan(root, spec, manifest, results),
    geometrySourceSlug: spec.geometrySourceSlug,
  };
}

export async function buildNevadaPrecinctGisPlan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const selected = options.years ? new Set(options.years.map(Number)) : new Set(NEVADA_PRECINCT_GIS_YEAR_SPECS.map((spec) => spec.year));
  for (const selectedYear of selected) if (!NEVADA_PRECINCT_GIS_YEAR_SPECS.some((spec) => spec.year === selectedYear)) throw new Error("Supported Nevada precinct GIS years are 2012, 2016, 2020, and 2024");
  const years = [];
  for (const spec of NEVADA_PRECINCT_GIS_YEAR_SPECS.filter((entry) => selected.has(entry.year))) years.push(await loadYear(root, spec));
  if (!years.length) throw new Error("Select at least one Nevada precinct GIS year");
  return { schemaVersion: 1, state: STATE, stateName: "Nevada", authority: "Nevada Secretary of State and retained reviewed geometry sources", scope: "local-only presidential general-election precinct GIS setup", years };
}

export function summarizeNevadaPrecinctGisPlan(plan) {
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
      totals: year.totals,
      geometryDisposition: year.geometry.disposition,
      geometryFeatures: year.geometry.features.length,
      reviewedCrosswalks: year.geometry.crosswalks.length,
      reviewedNoDataFeatures: year.manifest.crosswalk.reviewedNoDataFeatures,
      publicReleaseEligible: year.geometry.publicReleaseEligible,
      publicDeliveryAuthorized: false,
      blockers: year.geometry.reasons,
      caveats: year.manifest.caveats,
    })),
  };
}
