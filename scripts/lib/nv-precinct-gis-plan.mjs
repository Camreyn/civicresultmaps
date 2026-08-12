import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { inspectPrecinctGeometryManifest, reportingUnitCode } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./precinct-geometry-validation.mjs";

const STATE = "NV";
export const PRIVACY_SUPPRESSED_TOTAL_LABEL = "Candidate detail suppressed by official source";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const NEVADA_PRECINCT_GIS_YEAR_SPECS = Object.freeze([
  {
    year: 2012,
    electionId: "2012-11-06-general",
    electionDate: "2012-11-06",
    manifestSha256: "61f67239271f08584954d8f73270c83bf73f92bc5689c929c1866a4f4c0b3cc4",
    manifestByteCount: 3_706,
    geometryByteCount: 3_735_460,
    resultsSha256: "5cf86f3221a10476613dbc00bf2cab294f80f7d3b0eacff5a4700d4e1a07ca48",
    resultsByteCount: 36_900,
    crosswalkByteCount: 1_175_064,
    expectedUnits: 1_760,
    expectedFeatures: 2_002,
    expectedCrosswalkRecords: 1_760,
    expectedNoDataFeatures: 242,
    democratic: { name: "Barack Obama", party: "DEM" },
    republican: { name: "Mitt Romney", party: "REP" },
    resultSource: {
      id: "nv-2012-president-precinct-results",
      slug: "nv-2012-sos-president-precinct-results",
      url: "https://www.nvsos.gov/silverstate2012gen/",
      artifact: "data/precinct-geometry/NV/2012-11-06-general/raw/nevada-secretary-of-state/2012-general-precinct.csv",
      sha256: "1743593fd0462cf273ffdd96b89a923c2e562395f52428e2b5ddc6ceebcae724",
      byteCount: 7_085_925,
      timestampBasis: "Nevada Secretary of State 2012 General precinct export; cells below the statutory privacy threshold are suppressed.",
      authority: "Nevada Secretary of State",
    },
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    electionDate: "2016-11-08",
    manifestSha256: "9cccfd6f2fc006c2f3e98e45b1835178383edf092639f6a5dfc0f016a8316999",
    manifestByteCount: 3_910,
    geometryByteCount: 3_550_859,
    resultsSha256: "49df99e5e70b3e800d80366562874dadc2ecac9d6696c3db00b93efd95368952",
    resultsByteCount: 38_251,
    crosswalkByteCount: 1_435_943,
    expectedUnits: 1_843,
    expectedFeatures: 2_067,
    expectedCrosswalkRecords: 1_843,
    expectedNoDataFeatures: 224,
    democratic: { name: "Hillary Clinton", party: "DEM" },
    republican: { name: "Donald Trump", party: "REP" },
    resultSource: {
      id: "nv-2016-president-precinct-results",
      slug: "nv-2016-sos-president-precinct-results",
      url: "https://www.nvsos.gov/home/showpublisheddocument/4615/636160169602900000",
      artifact: "data/precinct-geometry/NV/2016-11-08-general/raw/nevada-secretary-of-state/2016-general-precinct.csv",
      sha256: "17cf2360147e58211b29556303a2a29d5e2ba0f98d13df78e28a983c0b9dc184",
      byteCount: 7_512_605,
      timestampBasis: "Nevada Secretary of State 2016 General precinct export; low-count cells are suppressed.",
      authority: "Nevada Secretary of State",
    },
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    electionDate: "2020-11-03",
    manifestSha256: "b343123b91646f991406775fc9bb02846455564d08265ecd2240a3db759ea4e4",
    manifestByteCount: 3_801,
    geometryByteCount: 3_572_831,
    resultsSha256: "bd8dfe5b3e84bd3fe610242cdbac898fdccfa5b7f42644f4e7130b0fc1f8224d",
    resultsByteCount: 38_582,
    crosswalkByteCount: 1_453_779,
    expectedUnits: 1_869,
    expectedFeatures: 2_094,
    expectedCrosswalkRecords: 1_869,
    expectedNoDataFeatures: 225,
    democratic: { name: "Joe Biden", party: "DEM" },
    republican: { name: "Donald Trump", party: "REP" },
    resultSource: {
      id: "nv-2020-president-precinct-results",
      slug: "nv-2020-sos-president-precinct-results",
      url: "https://www.nvsos.gov/home/showpublisheddocument/9195/637441629458970000",
      artifact: "data/precinct-geometry/NV/2020-11-03-general/raw/nevada-secretary-of-state/2020-general-precinct.csv",
      sha256: "1b87ec33209a6352270e6a5a3d0438eaae0b7ed9a921f035ef14fb56a166467a",
      byteCount: 15_255_758,
      timestampBasis: "Nevada Secretary of State 2020 General precinct export; low-count cells are suppressed.",
      authority: "Nevada Secretary of State",
    },
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    electionDate: "2024-11-05",
    manifestSha256: "50ab3de628b8a9237d89835e07b56fade81c5ca82db0703a846b14f2ec3de140",
    manifestByteCount: 6_137,
    geometryByteCount: 3_008_438,
    resultsSha256: "fa38681e967ffa5dab73265f534fe13db29ff7101ea40bf7bfac30c1829bbb41",
    resultsByteCount: 31_112,
    crosswalkByteCount: 1_100_149,
    expectedUnits: 1_576,
    expectedFeatures: 1_635,
    expectedCrosswalkRecords: 1_576,
    expectedNoDataFeatures: 59,
    expectedCandidateDetailSuppressedUnits: 58,
    democratic: { name: "Kamala Harris", party: "DEM" },
    republican: { name: "Donald Trump", party: "REP" },
    resultSource: {
      id: "nv-2024-president-precinct-results",
      slug: "nv-2024-sos-president-precinct-results",
      url: "https://www.nvsos.gov/electionresults/RaceResults.aspx",
      artifact: "data/precinct-geometry/NV/2024-11-05-general/raw/nevada-secretary-of-state/2024-general-president.csv",
      sha256: "5a7c94660e3e0f32229cfb4e816b2819360277973b80ac3308c531fd7a08dda7",
      byteCount: 898_445,
      timestampBasis: "Nevada Secretary of State 2024 General presidential precinct export supplemented by the official Clark County Statement of Vote for exact low-count precinct totals; candidate allocation remains suppressed.",
      authority: "Nevada Secretary of State and Clark County Election Department",
      supplementalArtifacts: [
        {
          sourceUrl: "https://elections.clarkcountynv.gov/electionresultsTV/SOV/24G/PRESIDENT.txt",
          authority: "Clark County Election Department",
          artifact: "data/precinct-geometry/NV/2024-11-05-general/raw/clark-county-election-department/2024-general-president-statement-of-vote.txt",
          sha256: "2fedeb8f8457b9a66d05ee9f6141a2bbf6b1074281198858dec1c0cbd0041380",
          byteCount: 197_621,
          purpose: "Exact registration, turnout, and total-vote values for Clark reporting precincts whose candidate allocation is suppressed.",
        },
      ],
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
  const totals = { Democratic: 0, Republican: 0, Other: 0, Suppressed: 0, Total: 0 };
  let zeroVoteUnits = 0;
  let candidateDetailSuppressedUnits = 0;
  for (const row of document.rows) {
    const code = reportingUnitCode({ state: STATE, electionId: spec.electionId, reportingGrain: "precinct", parentGeoid: row.parentGeoid, sourceUnitId: row.sourceUnitId });
    if (code !== row.resultUnitCode || codes.has(code) || !/^32\d{3}$/.test(row.parentGeoid)) throw new Error(`Nevada ${spec.year} normalized result identity drifted`);
    codes.add(code);
    const resultStatus = row.resultStatus ?? "candidate_detail_complete";
    if (!["candidate_detail_complete", "candidate_detail_suppressed"].includes(resultStatus)) {
      throw new Error(`Nevada ${spec.year} normalized result status drifted for ${code}`);
    }
    const total = Number(row.total);
    let democratic = 0;
    let republican = 0;
    let other = 0;
    if (resultStatus === "candidate_detail_suppressed") {
      const registration = Number(row.reportedRegistration);
      const turnout = Number(row.reportedTurnout);
      const reportedTotal = Number(row.reportedTotalVotes);
      if (
        spec.year !== 2024
        || row.parentGeoid !== "32003"
        || ![registration, turnout, reportedTotal, total].every(Number.isSafeInteger)
        || [registration, turnout, reportedTotal, total].some((value) => value < 0)
        || reportedTotal !== total
        || row.democratic !== undefined
        || row.republican !== undefined
        || row.other !== undefined
      ) {
        throw new Error(`Nevada ${spec.year} suppressed result contract drifted for ${code}`);
      }
      candidateDetailSuppressedUnits += 1;
      totals.Suppressed += total;
    } else {
      democratic = Number(row.democratic);
      republican = Number(row.republican);
      other = Number(row.other);
      if (
        ![democratic, republican, other, total].every(Number.isSafeInteger)
        || [democratic, republican, other].some((value) => value < 0)
        || total !== democratic + republican + other
      ) {
        throw new Error(`Nevada ${spec.year} normalized result total drifted for ${code}`);
      }
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
      ...(resultStatus === "candidate_detail_suppressed"
        ? {
          reportedRegistration: Number(row.reportedRegistration),
          reportedTurnout: Number(row.reportedTurnout),
          reportedTotalVotes: total,
        }
        : {}),
    });
    if (resultStatus === "candidate_detail_suppressed") {
      resultRows.push({
        jurisdictionCode: code,
        jurisdictionName: row.sourceDisplayName,
        candidateName: PRIVACY_SUPPRESSED_TOTAL_LABEL,
        party: "SUPPRESSED",
        votes: total,
      });
    } else {
      resultRows.push(
        { jurisdictionCode: code, jurisdictionName: row.sourceDisplayName, candidateName: spec.democratic.name, party: spec.democratic.party, votes: democratic },
        { jurisdictionCode: code, jurisdictionName: row.sourceDisplayName, candidateName: spec.republican.name, party: spec.republican.party, votes: republican },
        { jurisdictionCode: code, jurisdictionName: row.sourceDisplayName, candidateName: "Other", party: "OTHER", votes: other },
      );
    }
    totals.Democratic += democratic;
    totals.Republican += republican;
    totals.Other += other;
    totals.Total += total;
  }
  if (candidateDetailSuppressedUnits !== (spec.expectedCandidateDetailSuppressedUnits ?? 0)) {
    throw new Error(`Nevada ${spec.year} candidate-detail suppression count drifted`);
  }
  return { reportingUnits, resultRows, totals, zeroVoteUnits, candidateDetailSuppressedUnits, source: spec.resultSource };
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
      if (relationship.relationshipType !== "one_to_one" || relationship.reviewStatus !== "reviewed" || !featureByKey.has(relationship.sourceFeatureId)) {
        throw new Error(`Nevada ${spec.year} crosswalk relationship drift at row ${index}`);
      }
      crosswalks.push({ reportingUnitCode: row.resultUnitCode, sourceFeatureId: relationship.sourceFeatureId, relationshipType: relationship.relationshipType, matchMethod: relationship.matchMethod, reviewStatus: relationship.reviewStatus, confidence: relationship.confidence, note: String(relationship.note ?? "") });
    }
  }
  if (seenUnits.size !== spec.expectedUnits || crosswalks.length !== spec.expectedCrosswalkRecords) throw new Error(`Nevada ${spec.year} crosswalk counts drifted`);
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
    candidateDetailSuppressedUnits: results.candidateDetailSuppressedUnits,
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
