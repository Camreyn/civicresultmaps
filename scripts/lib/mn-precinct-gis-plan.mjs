import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import XLSX from "xlsx";
import {
  inspectPrecinctGeometryManifest,
  reportingUnitCode,
} from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./precinct-geometry-validation.mjs";

const STATE = "MN";
const FORBIDDEN_ELECTION_PROPERTY =
  /^(?:USPRS|USSEN|VOTES?|TOTALVOTES?|TOTVOTING|REG7AM|EDR|CANDIDATE|PARTY)/i;

const COMMON = {
  expectedParents: 87,
  resultAuthority: "Minnesota Secretary of State Elections Division",
};

export const MINNESOTA_PRECINCT_GIS_YEAR_SPECS = Object.freeze([
  {
    ...COMMON,
    year: 2012,
    electionId: "2012-11-06-general",
    electionDate: "2012-11-06",
    manifestPath: "data/precinct-geometry/MN/2012-11-06-general/manifest.json",
    expectedManifestSha256: "0658bae1392349e5256325ac2a358bf80263235a961dd1e37bad2474d2373194",
    manifestByteCount: 6_399,
    expectedNormalizationByteCount: 13_021_594,
    expectedCrosswalkByteCount: 3_264_734,
    expectedUnits: 4_102,
    expectedZeroVoteUnits: 33,
    expectedTotals: { Democratic: 1_546_167, Republican: 1_320_225, Other: 70_169, Total: 2_936_561 },
    democratic: { field: "USPRSDFL", name: "Obama", party: "DEM" },
    republican: { field: "USPRSR", name: "Romney", party: "REP" },
    candidateFields: ["USPRSR", "USPRSDFL", "USPRSLIB", "USPRSSWP", "USPRSCP", "USPRSCG", "USPRSGP", "USPRSGR", "USPRSSL", "USPRSJP", "USPRSWI"],
    resultSource: {
      id: "mn-2012-general-precinct-results",
      slug: "mn-2012-mn-2012-general-precinct-results",
      url: "https://sos.mn.gov/media/1450/2012mngeneralelectionresults_official_postrecounts.xlsx",
      artifact: "data/precinct-geometry/MN/2012-11-06-general/raw/mn-sos/2012-general-federal-state-results-by-precinct-official-post-recounts.xlsx",
      sha256: "9a7530cfef9e44f8663c62bf5786418b4b078d81fd13e2d130fbd8ef305ee376",
      byteCount: 1_705_946,
      sheetName: "Results",
      timestampBasis: "Certified by the State Canvassing Board November 27, 2012, with recount districts certified December 4, 2012.",
    },
    geometrySourceSlug: "mn-2012-mn-2012-precinct-geometry",
    geometryExpected: true,
    expectedGeometryFeatures: 4_102,
  },
  {
    ...COMMON,
    year: 2016,
    electionId: "2016-11-08-general",
    electionDate: "2016-11-08",
    manifestPath: "data/precinct-geometry/MN/2016-11-08-general/manifest.json",
    expectedManifestSha256: "8c6aa9b074375553abc53a07e90af8db976de03bed7dafde8e6c352849c06031",
    manifestByteCount: 7_813,
    expectedNormalizationByteCount: 8_413_494,
    expectedCrosswalkByteCount: 3_938_940,
    expectedUnits: 4_120,
    expectedZeroVoteUnits: 31,
    expectedTotals: { Democratic: 1_367_716, Republican: 1_322_951, Other: 254_146, Total: 2_944_813 },
    democratic: { field: "USPRSDFL", name: "Clinton", party: "DEM" },
    republican: { field: "USPRSR", name: "Trump", party: "REP" },
    candidateFields: ["USPRSR", "USPRSDFL", "USPRSCP", "USPRSLMN", "USPRSSWP", "USPRSGP", "USPRSADP", "USPRSIP", "USPRSLIB", "USPRSWI"],
    resultSource: {
      id: "mn-sos-2016-general-certified-precinct-results",
      slug: "mn-2016-mn-sos-2016-general-certified-precinct-results",
      url: "https://www.sos.mn.gov/media/2806/2016-general-federal-state-results-by-precinct-official.xlsx",
      artifact: "data/precinct-geometry/MN/2016-11-08-general/raw/mn-sos/2016-general-federal-state-results-by-precinct-official.xlsx",
      sha256: "1f2c36c544304de67ea9a0fcf5797a734f54a9ed69ecb15346ddd33be5b9e00a",
      byteCount: 1_195_229,
      sheetName: "Results",
      timestampBasis: "Certified through December 19, 2016, incorporating all recounts.",
    },
    geometrySourceSlug: "mn-2016-mn-2016-precinct-geometry",
    geometryExpected: true,
    expectedGeometryFeatures: 4_120,
  },
  {
    ...COMMON,
    year: 2020,
    electionId: "2020-11-03-general",
    electionDate: "2020-11-03",
    manifestPath: "data/precinct-geometry/MN/2020-11-03-general/manifest.json",
    expectedManifestSha256: "2a4e0e24e831d760b28a7dc605be3ca56c22020e98b2459d08bc3aaf0c7b5a34",
    manifestByteCount: 4_870,
    expectedNormalizationByteCount: 8_153_668,
    expectedCrosswalkByteCount: 3_175_393,
    expectedUnits: 4_110,
    expectedZeroVoteUnits: 33,
    expectedTotals: { Democratic: 1_717_077, Republican: 1_484_065, Other: 76_029, Total: 3_277_171 },
    democratic: { field: "USPRSDFL", name: "Biden", party: "DEM" },
    republican: { field: "USPRSR", name: "Trump", party: "REP" },
    candidateFields: ["USPRSR", "USPRSDFL", "USPRSIA", "USPRSGP", "USPRSINDKW", "USPRSINDBP", "USPRSSLP", "USPRSSWP", "USPRSLIB", "USPRSWI"],
    resultSource: {
      id: "mn-2020-general-precinct-results",
      slug: "mn-2020-mn-2020-general-precinct-results",
      url: "https://sos.mn.gov/media/4373/2020-general-federal-state-results-by-precinct-official.xlsx",
      artifact: "data/precinct-geometry/MN/2020-11-03-general/raw/mn-sos/2020-general-federal-state-results-by-precinct-official.xlsx",
      sha256: "ea2b7a7c9c8203f56f44d94dede6b2df398eb1f590bf35e527431fba6021517a",
      byteCount: 1_396_119,
      sheetName: "Precinct-Results",
      timestampBasis: "Official results as of December 11, 2020, incorporating all recounts.",
    },
    geometrySourceSlug: "mn-2020-mn-2020-precinct-geometry",
    geometryExpected: true,
    expectedGeometryFeatures: 4_110,
  },
  {
    ...COMMON,
    year: 2024,
    electionId: "2024-11-05-general",
    electionDate: "2024-11-05",
    manifestPath: "data/precinct-geometry/MN/2024-11-05-general/manifest.json",
    expectedManifestSha256: "5c1457dcad263610271b3aac3144f2f90773b3648845cec16e74722606d12d0a",
    manifestByteCount: 5_611,
    expectedNormalizationByteCount: 8_873_446,
    expectedCrosswalkByteCount: 3_176_693,
    expectedUnits: 4_103,
    expectedZeroVoteUnits: 28,
    expectedTotals: { Democratic: 1_656_979, Republican: 1_519_032, Other: 77_909, Total: 3_253_920 },
    democratic: { field: "USPRSDFL", name: "Harris", party: "DEM" },
    republican: { field: "USPRSR", name: "Trump", party: "REP" },
    candidateFields: ["USPRSR", "USPRSDFL", "USPRSLIB", "USPRSWTP", "USPRSG", "USPRSSLP", "USPRSSWP", "USPRSJFA", "USPRSIND", "USPRSWI"],
    resultSource: {
      id: "mn-2024-precinct-results",
      slug: "mn-2024-mn-2024-precinct-results",
      url: "https://www.sos.mn.gov/media/yt3llxwd/2024-general-federal-state-results-by-precinct-official.xlsx",
      artifact: "data/mn-2024-general-federal-state-results-by-precinct-official.xlsx",
      sha256: "13adf003bfabf1a19e4c47dc7fe100d8862cd22186b1f6ae0f52a721a5b57459",
      byteCount: 1_296_820,
      sheetName: "Precinct-Results",
      timestampBasis: "Official 2024 general federal/state results by precinct workbook.",
    },
    geometrySourceSlug: "mn-2024-mn-2024-precinct-geometry",
    geometryExpected: true,
    expectedGeometryFeatures: 4_103,
  },
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function absoluteInsideRoot(root, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) || relativePath.includes("\\")) {
    throw new Error("Artifact path must be repository-relative POSIX: " + relativePath);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Artifact path escapes repository root: " + relativePath);
  }
  return resolved;
}

export function verifyPinnedArtifact(root, artifact, label) {
  const target = absoluteInsideRoot(root, artifact.artifact);
  if (!existsSync(target)) throw new Error(label + " is missing: " + artifact.artifact);
  const bytes = readFileSync(target);
  if (Number.isInteger(artifact.byteCount) && bytes.length !== artifact.byteCount) {
    throw new Error(label + " byte count mismatch");
  }
  const digest = sha256(bytes);
  if (digest !== artifact.sha256) throw new Error(label + " SHA-256 mismatch");
  return { bytes, sha256: digest, byteCount: bytes.length };
}

function readJson(root, artifact, label) {
  const verified = verifyPinnedArtifact(root, artifact, label);
  return { ...verified, value: JSON.parse(verified.bytes.toString("utf8")) };
}

function readGeometry(root, artifact, label) {
  const verified = verifyPinnedArtifact(root, artifact, label);
  const bytes = artifact.artifact.endsWith(".gz")
    ? gunzipSync(verified.bytes)
    : verified.bytes;
  return { ...verified, value: JSON.parse(bytes.toString("utf8")) };
}

function integer(row, field, id) {
  const value = Number(String(row[field] ?? 0).replace(/,/g, "").trim());
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Minnesota " + id + " has invalid " + field);
  }
  return value;
}

function sourceDisplayName(row, year) {
  const code = String(row.PCTCODE ?? "").trim().padStart(4, "0");
  if (year === 2012 || year === 2016) {
    return [row.COUNTYNAME, row.MCDNAME, String(row.PCTNAME ?? "") + " (" + code + ")"]
      .map((value) => String(value ?? "").trim())
      .join(" / ");
  }
  return String(row.MCDNAME ?? "").trim() + " - "
    + String(row.PCTNAME ?? "").trim() + " (" + code + ")";
}

function parseCertifiedResults(root, spec) {
  const verified = verifyPinnedArtifact(
    root,
    spec.resultSource,
    "Minnesota " + spec.year + " certified workbook",
  );
  const workbook = XLSX.read(verified.bytes, { type: "buffer" });
  const sheet = workbook.Sheets[spec.resultSource.sheetName];
  if (!sheet) throw new Error("Minnesota " + spec.year + " workbook sheet is missing");
  const sourceRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  const rows = sourceRows.filter((row) => /^27\d{7}$/.test(String(row.VTDID ?? "").trim()));
  if (rows.length !== spec.expectedUnits) {
    throw new Error("Minnesota " + spec.year + " VTDID count drifted");
  }

  const units = [];
  const resultRows = [];
  const codes = new Set();
  const parents = new Set();
  const totals = { Democratic: 0, Republican: 0, Other: 0, Total: 0 };
  let zeroVoteUnits = 0;

  for (const row of rows) {
    const sourceUnitId = String(row.VTDID).trim();
    const parentGeoid = sourceUnitId.slice(0, 5);
    const candidateSum = spec.candidateFields.reduce(
      (sum, field) => sum + integer(row, field, sourceUnitId),
      0,
    );
    const total = integer(row, "USPRSTOTAL", sourceUnitId);
    if (candidateSum !== total) {
      throw new Error("Minnesota " + spec.year + " candidate sum drifted for " + sourceUnitId);
    }
    const democratic = integer(row, spec.democratic.field, sourceUnitId);
    const republican = integer(row, spec.republican.field, sourceUnitId);
    const other = total - democratic - republican;
    if (other < 0 || !/^27\d{3}$/.test(parentGeoid)) {
      throw new Error("Minnesota " + spec.year + " identity or vote grouping is invalid");
    }
    if (total === 0) zeroVoteUnits += 1;
    const code = reportingUnitCode({
      state: STATE,
      electionId: spec.electionId,
      reportingGrain: "precinct",
      parentGeoid,
      sourceUnitId,
    });
    if (codes.has(code)) throw new Error("Duplicate Minnesota reporting unit " + code);
    codes.add(code);
    parents.add(parentGeoid);
    const displayName = sourceDisplayName(row, spec.year);
    units.push({
      code,
      sourceUnitId,
      sourceDisplayName: displayName,
      parentGeoid,
      reportingGrain: "precinct",
      isGeographic: true,
    });
    resultRows.push(
      { jurisdictionCode: code, jurisdictionName: displayName, candidateName: spec.democratic.name, party: spec.democratic.party, votes: democratic },
      { jurisdictionCode: code, jurisdictionName: displayName, candidateName: spec.republican.name, party: spec.republican.party, votes: republican },
      { jurisdictionCode: code, jurisdictionName: displayName, candidateName: "Other", party: "OTHER", votes: other },
    );
    totals.Democratic += democratic;
    totals.Republican += republican;
    totals.Other += other;
    totals.Total += total;
  }

  if (parents.size !== spec.expectedParents || zeroVoteUnits !== spec.expectedZeroVoteUnits) {
    throw new Error("Minnesota " + spec.year + " parent or zero-vote count drifted");
  }
  for (const [key, expected] of Object.entries(spec.expectedTotals)) {
    if (totals[key] !== expected) {
      throw new Error("Minnesota " + spec.year + " " + key + " total drifted");
    }
  }
  return {
    units,
    resultRows,
    totals,
    zeroVoteUnits,
    sourceRows: sourceRows.length,
    source: { ...spec.resultSource, authority: spec.resultAuthority },
  };
}

function inspectForbiddenKeys(value, context) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectForbiddenKeys(item, context + "[" + index + "]"));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_ELECTION_PROPERTY.test(key)) {
      throw new Error(context + " contains election-value property " + key);
    }
    inspectForbiddenKeys(child, context + "." + key);
  }
}

function buildGeometryPlan(root, spec, manifest, certified) {
  const normalized = readGeometry(root, {
    artifact: manifest.normalization.artifact,
    sha256: manifest.normalization.sha256,
    byteCount: spec.expectedNormalizationByteCount,
  }, "Minnesota " + spec.year + " normalized geometry");
  const crosswalk = readJson(root, {
    artifact: manifest.crosswalk.artifact,
    sha256: manifest.crosswalk.sha256,
    byteCount: spec.expectedCrosswalkByteCount,
  }, "Minnesota " + spec.year + " crosswalk");

  if (!spec.geometryExpected) {
    if (
      manifest.normalization.featureCount !== 0
      || normalized.value?.type !== "FeatureCollection"
      || normalized.value.features?.length !== 0
      || manifest.crosswalk.status !== "blocked"
      || crosswalk.value?.rows?.length !== 0
      || manifest.delivery !== null
    ) {
      throw new Error("Blocked Minnesota " + spec.year + " package became loadable without review");
    }
    return {
      disposition: "blocked",
      blockCode: spec.geometryBlockCode,
      reasons: [...manifest.validation.errors],
      features: [],
      crosswalks: [],
      artifactWarnings: [],
    };
  }

  const artifactInspection = validateManifestArtifacts(manifest, { root, skipDelivery: true });
  if (artifactInspection.errors.length) {
    throw new Error(
      "Minnesota " + spec.year + " artifact validation failed: "
      + artifactInspection.errors.join("; "),
    );
  }
  if (
    manifest.geography.vintageStatus !== "election_date_confirmed"
    || manifest.geography.derivationMethod !== "official_export"
    || manifest.crosswalk.status !== "reviewed"
    || manifest.normalization.featureCount !== spec.expectedGeometryFeatures
    || manifest.crosswalk.resultUnits !== spec.expectedUnits
    || manifest.crosswalk.matchedResultUnits !== spec.expectedUnits
    || manifest.crosswalk.unmatchedResultUnits !== 0
    || manifest.crosswalk.relationships.oneToOne !== spec.expectedUnits
    || manifest.crosswalk.relationships.pendingReview !== 0
    || !manifest.validation.geometryValid
    || !manifest.validation.parentTotalsReconciled
    || manifest.delivery !== null
  ) {
    throw new Error("Minnesota " + spec.year + " reviewed local geometry contract drifted");
  }

  const features = [];
  const featureByKey = new Map();
  for (const [index, feature] of normalized.value.features.entries()) {
    if (
      feature?.type !== "Feature"
      || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
      || !feature.properties
    ) {
      throw new Error("Minnesota " + spec.year + " normalized feature is invalid");
    }
    inspectForbiddenKeys(feature.properties, "features[" + index + "].properties");
    const parents = manifest.normalization.parentIdFields
      .map((field) => String(feature.properties[field] ?? "").trim());
    const sources = manifest.normalization.sourceFeatureIdFields
      .map((field) => String(feature.properties[field] ?? "").trim());
    if (parents.some((value) => !/^27\d{3}$/.test(value)) || sources.some((value) => !value)) {
      throw new Error("Minnesota " + spec.year + " normalized feature identity is invalid");
    }
    const featureKey = [...parents, ...sources].join("|");
    if (featureByKey.has(featureKey)) throw new Error("Duplicate feature key " + featureKey);
    const record = {
      sourceFeatureId: featureKey,
      parentGeoid: parents.join("|"),
      name: String(feature.properties.CRM_DISPLAY_NAME ?? ""),
      geometryKey: featureKey,
      isGeographic: true,
      properties: feature.properties,
    };
    features.push(record);
    featureByKey.set(featureKey, record);
  }
  if (features.length !== spec.expectedGeometryFeatures) {
    throw new Error("Minnesota " + spec.year + " normalized feature count drifted");
  }

  const document = crosswalk.value;
  if (
    document?.manifestId !== manifest.id
    || document.state !== STATE
    || document.electionId !== spec.electionId
    || document.resultSourceId !== spec.resultSource.id
    || document.rows?.length !== spec.expectedUnits
    || document.reconciliation?.status !== "passed"
    || document.reconciliation.scopes?.length !== spec.expectedParents + 1
    || !document.reconciliation.scopes.every((scope) =>
      Object.values(scope.deltas ?? {}).every((value) => Number(value) === 0))
  ) {
    throw new Error("Minnesota " + spec.year + " crosswalk reconciliation drifted");
  }

  const certifiedByCode = new Map(certified.units.map((unit) => [unit.code, unit]));
  const seen = new Set();
  const crosswalks = document.rows.map((row, index) => {
    const unit = certifiedByCode.get(row.resultUnitCode);
    const relationship = row.relationships?.[0];
    if (
      !unit
      || row.sourceUnitId !== unit.sourceUnitId
      || row.sourceDisplayName !== unit.sourceDisplayName
      || row.parentGeoid !== unit.parentGeoid
      || row.reportingGrain !== "precinct"
      || row.isGeographic !== true
      || row.relationships?.length !== 1
      || seen.has(row.resultUnitCode)
      || relationship?.relationshipType !== "one_to_one"
      || relationship.matchMethod !== "exact_official_id"
      || relationship.reviewStatus !== "reviewed"
      || relationship.confidence !== "high"
      || !featureByKey.has(relationship.sourceFeatureId)
    ) {
      throw new Error("Minnesota " + spec.year + " crosswalk drift at row " + index);
    }
    inspectForbiddenKeys(relationship, "crosswalk.rows[" + index + "]");
    seen.add(row.resultUnitCode);
    return {
      reportingUnitCode: row.resultUnitCode,
      sourceFeatureId: relationship.sourceFeatureId,
      relationshipType: relationship.relationshipType,
      matchMethod: relationship.matchMethod,
      reviewStatus: relationship.reviewStatus,
      confidence: relationship.confidence,
      note: String(relationship.note ?? ""),
    };
  });

  return {
    disposition: "loadable_reviewed",
    blockCode: null,
    reasons: [...manifest.validation.errors],
    features,
    crosswalks,
    artifactWarnings: artifactInspection.warnings,
  };
}

function loadYear(root, spec) {
  const manifestBytes = readFileSync(absoluteInsideRoot(root, spec.manifestPath));
  const manifestDigest = sha256(manifestBytes);
  if (manifestBytes.length !== spec.manifestByteCount
    || manifestDigest !== spec.expectedManifestSha256) {
    throw new Error("Minnesota " + spec.year + " manifest bytes drifted");
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const contract = inspectPrecinctGeometryManifest(manifest);
  if (contract.errors.length) {
    throw new Error("Minnesota " + spec.year + " manifest contract failed: " + contract.errors.join("; "));
  }
  if (
    (Number.isInteger(manifest.normalization.byteCount)
      && manifest.normalization.byteCount !== spec.expectedNormalizationByteCount)
    || (Number.isInteger(manifest.crosswalk.byteCount)
      && manifest.crosswalk.byteCount !== spec.expectedCrosswalkByteCount)
  ) {
    throw new Error("Minnesota " + spec.year + " manifest artifact byte counts drifted");
  }
  if (
    manifest.state !== STATE
    || manifest.election.id !== spec.electionId
    || manifest.election.date !== spec.electionDate
    || manifest.election.year !== spec.year
    || manifest.election.type !== "general"
    || manifest.election.office !== "president"
  ) {
    throw new Error("Minnesota " + spec.year + " election identity drifted");
  }
  verifyPinnedArtifact(root, {
    artifact: manifest.source.artifact,
    sha256: manifest.source.sha256,
    byteCount: manifest.source.byteCount,
  }, "Minnesota " + spec.year + " source package/evidence");
  const certified = parseCertifiedResults(root, spec);
  return {
    year: spec.year,
    electionId: spec.electionId,
    electionDate: spec.electionDate,
    manifestPath: spec.manifestPath,
    manifestSha256: manifestDigest,
    manifestByteCount: manifestBytes.length,
    artifactByteCounts: {
      source: manifest.source.byteCount,
      normalization: spec.expectedNormalizationByteCount,
      crosswalk: spec.expectedCrosswalkByteCount,
    },
    manifest,
    resultSource: certified.source,
    reportingUnits: certified.units,
    resultRows: certified.resultRows,
    totals: certified.totals,
    zeroVoteUnits: certified.zeroVoteUnits,
    sourceRows: certified.sourceRows,
    geometry: buildGeometryPlan(root, spec, manifest, certified),
    geometrySourceSlug: spec.geometrySourceSlug,
  };
}

export function buildMinnesotaPrecinctGisPlan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const selected = options.years
    ? new Set(options.years.map(Number))
    : new Set(MINNESOTA_PRECINCT_GIS_YEAR_SPECS.map((spec) => spec.year));
  const known = new Set(MINNESOTA_PRECINCT_GIS_YEAR_SPECS.map((spec) => spec.year));
  for (const year of selected) {
    if (!known.has(year)) {
      throw new Error("Supported Minnesota precinct GIS years are 2012, 2016, 2020, and 2024");
    }
  }
  const years = MINNESOTA_PRECINCT_GIS_YEAR_SPECS
    .filter((spec) => selected.has(spec.year))
    .map((spec) => loadYear(root, spec));
  if (!years.length) throw new Error("Select at least one Minnesota precinct GIS year");
  return {
    schemaVersion: 1,
    state: STATE,
    stateName: "Minnesota",
    authority: "Minnesota Secretary of State",
    scope: "local-only presidential general election precinct GIS setup",
    years,
  };
}

export function summarizeMinnesotaPrecinctGisPlan(plan) {
  return {
    schemaVersion: plan.schemaVersion,
    state: plan.state,
    scope: plan.scope,
    years: plan.years.map((year) => ({
      year: year.year,
      electionId: year.electionId,
      manifestId: year.manifest.id,
      manifestSha256: year.manifestSha256,
      manifestByteCount: year.manifestByteCount,
      artifactByteCounts: year.artifactByteCounts,
      reportingUnits: year.reportingUnits.length,
      resultRows: year.resultRows.length,
      zeroVoteUnits: year.zeroVoteUnits,
      totals: year.totals,
      geometryDisposition: year.geometry.disposition,
      geometryFeatures: year.geometry.features.length,
      reviewedCrosswalks: year.geometry.crosswalks.length,
      publicDeliveryAuthorized: false,
      blockers: year.geometry.reasons,
    })),
  };
}
