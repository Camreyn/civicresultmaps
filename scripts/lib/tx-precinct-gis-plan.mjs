import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import JSZip from "jszip";
import { inspectPrecinctGeometryManifest, reportingUnitCode } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./precinct-geometry-validation.mjs";

const STATE = "TX";
const EXPECTED_PARENTS = 254;
const FORBIDDEN_ELECTION_PROPERTY = /^(?:VOTES?|TOTALVOTES?|CANDIDATE|PARTY|PRESIDENT)/i;

export const TEXAS_PRECINCT_GIS_YEAR_SPECS = Object.freeze([
  {
    year: 2012,
    electionId: "2012-11-06-general",
    electionDate: "2012-11-06",
    manifestPath: "data/precinct-geometry/TX/2012-11-06-general/manifest.json",
    manifestSha256: "cd486158192ad7546eab5292e4eb8d3940fa9b60e9cf8802aaf638a3a88eba49",
    manifestByteCount: 3_348,
    normalizationByteCount: 58_082_085,
    crosswalkByteCount: 5_822_583,
    expectedUnits: 8_952,
    expectedZeroVoteUnits: 278,
    expectedCandidateRows: 44_760,
    expectedCandidateTotals: { Romney: 4_568_788, Obama: 3_307_609, Johnson: 88_539, Stein: 24_645, "Write-In": 7_722 },
    democratic: { name: "Obama", party: "DEM" },
    republican: { name: "Romney", party: "REP" },
    resultMember: "2012_General_Election_Returns.csv",
    resultKeyField: "cntyvtd",
    resultSource: {
      id: "tx-2012-capitol-vtd-results-zip",
      slug: "tx-2012-tlc-general-vtd-results",
      url: "https://data.capitol.texas.gov/dataset/aab5e1e5-d585-4542-9ae8-1108f45fce5b/resource/b909f2cf-d7d4-433b-813f-b2c4cb5b584d/download/ftp_election_data_12g.zip",
      artifact: "data/precinct-geometry/TX/2012-11-06-general/raw/texas-legislative-council/ftp_election_data_12g.zip",
      sha256: "0da867b98b5bf7eb72e6dce8853a3e95d9975ac5521f7900d9cc1a060b1adb2f",
      byteCount: 40_870_638,
      timestampBasis: "Texas Legislative Council 2012 General Election VTD archive, readme last modified March 1, 2013.",
    },
    geometrySourceSlug: "tx-2012-tlc-general-vtd-geometry",
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    electionDate: "2016-11-08",
    manifestPath: "data/precinct-geometry/TX/2016-11-08-general/manifest.json",
    manifestSha256: "932b4aae3361421175ac4b7104a3ba11defc8dbfc8048552e5734ced5c2bf638",
    manifestByteCount: 4_075,
    normalizationByteCount: 58_262_673,
    crosswalkByteCount: 7_004_395,
    expectedUnits: 8_941,
    expectedZeroVoteUnits: 285,
    expectedCandidateRows: 44_705,
    expectedCandidateTotals: { Clinton: 3_877_626, Trump: 4_684_288, Johnson: 283_462, Stein: 71_546, "Write-In": 64_938 },
    democratic: { name: "Clinton", party: "DEM" },
    republican: { name: "Trump", party: "REP" },
    resultMember: "2016_General_Election_Returns.csv",
    resultKeyField: "cntyvtd",
    resultSource: {
      id: "tx-2016-capitol-vtd-results-zip",
      slug: "tx-2016-tlc-general-vtd-results",
      url: "https://data.capitol.texas.gov/dataset/aab5e1e5-d585-4542-9ae8-1108f45fce5b/resource/7b4f545e-38a7-43c6-b486-59b84ce92e40/download/ftp_election_data_16g.zip",
      artifact: "data/precinct-geometry/TX/2016-11-08-general/raw/texas-legislative-council/ftp_election_data_16g.zip",
      sha256: "ef8b3d88dda085e2f7e713ccb21ae3c405545297ae0a73bb4d1a8ffee170823e",
      byteCount: 43_176_070,
      timestampBasis: "Corrected Texas Legislative Council 2016 General Election VTD allocation posted February 9, 2017.",
    },
    geometrySourceSlug: "tx-2016-tlc-general-vtd-geometry",
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    electionDate: "2020-11-03",
    manifestPath: "data/precinct-geometry/TX/2020-11-03-general/manifest.json",
    manifestSha256: "f46f8895f5b733d88481ada6c3394cb4407f3c9e8e9b5581f622e0a9e0adb7c2",
    manifestByteCount: 3_685,
    normalizationByteCount: 58_973_880,
    crosswalkByteCount: 7_402_837,
    expectedUnits: 9_157,
    expectedZeroVoteUnits: 353,
    expectedCandidateRows: 45_785,
    expectedCandidateTotals: { Biden: 5_257_513, Hawkins: 33_378, Jorgensen: 126_212, Trump: 5_889_022, "Write-In": 10_927 },
    democratic: { name: "Biden", party: "DEM" },
    republican: { name: "Trump", party: "REP" },
    resultMember: "2020_General_Election_Returns.csv",
    resultKeyField: "vtdkeyvalue",
    resultSource: {
      id: "tx-2020-capitol-vtd-results-zip",
      slug: "tx-2020-tlc-general-vtd-results",
      url: "https://data.capitol.texas.gov/dataset/35b16aee-0bb0-4866-b1ec-859f1f044241/resource/5af9f5e2-ca14-4e5d-880e-3c3cd891d3ed/download/2020-general-vtd-election-data-2020.zip",
      artifact: "data/precinct-geometry/TX/2020-11-03-general/raw/texas-legislative-council/2020-general-vtd-election-data-2020.zip",
      sha256: "4ad668baa6ac0e05ffc0893201279ef5a0656411693bd751c96d8b06deba3d1f",
      byteCount: 54_629_265,
      timestampBasis: "Texas Legislative Council 2020 General Election VTD data reported on the 2020 General VTD layer.",
    },
    geometrySourceSlug: "tx-2020-tlc-general-vtd-geometry",
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    electionDate: "2024-11-05",
    manifestPath: "data/precinct-geometry/TX/2024-11-05-general/manifest.json",
    manifestSha256: "f5e0b019eeccc0c4424e41ca7b4208cdba7fe0808e2a537854cb1909971fc8c6",
    manifestByteCount: 3_698,
    normalizationByteCount: 59_059_795,
    crosswalkByteCount: 7_623_952,
    expectedUnits: 9_712,
    expectedZeroVoteUnits: 364,
    expectedCandidateRows: 48_560,
    expectedCandidateTotals: { Harris: 4_835_134, Oliver: 68_563, Stein: 82_698, Trump: 6_393_403, "Write-In": 24_730 },
    democratic: { name: "Harris", party: "DEM" },
    republican: { name: "Trump", party: "REP" },
    resultMember: "2024_General_Election_Returns.csv",
    resultKeyField: "vtdkeyvalue",
    resultSource: {
      id: "tx-2024-capitol-vtd-results-zip",
      slug: "tx-2024-tlc-general-vtd-results",
      url: "https://data.capitol.texas.gov/dataset/35b16aee-0bb0-4866-b1ec-859f1f044241/resource/e1cd6332-6a7a-4c78-ad2a-852268f6c7a2/download/2024-general-vtds-election-data.zip",
      artifact: "data/tx-2024-general-vtds-election-data.zip",
      sha256: "ed6956085e80d8153adce0829c279c8915c05f1867b2004b8b0988336469ff56",
      byteCount: 82_066_995,
      timestampBasis: "Texas Legislative Council 2024 General Election VTD data, resource last updated February 25, 2025.",
    },
    geometrySourceSlug: "tx-2024-tlc-general-vtd-geometry",
  },
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const integer = (value) => Number.parseInt(String(value ?? "").replaceAll(",", "").trim(), 10) || 0;
const parentGeoid = (fips) => `48${String(integer(fips)).padStart(3, "0")}`;

function absoluteInsideRoot(root, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) || relativePath.includes("\\")) {
    throw new Error(`Artifact path must be repository-relative POSIX: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Artifact path escapes repository root: ${relativePath}`);
  }
  return resolved;
}

export function verifyTexasPinnedArtifact(root, artifact, label) {
  const target = absoluteInsideRoot(root, artifact.artifact);
  if (!existsSync(target)) throw new Error(`${label} is missing: ${artifact.artifact}`);
  const bytes = readFileSync(target);
  if (bytes.length !== artifact.byteCount) throw new Error(`${label} byte count mismatch`);
  const digest = sha256(bytes);
  if (digest !== artifact.sha256) throw new Error(`${label} SHA-256 mismatch`);
  return { bytes, byteCount: bytes.length, sha256: digest };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") field += character;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows.shift()?.map((value) => value.replace(/^\uFEFF/, "")) ?? [];
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function inspectForbiddenKeys(value, context) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectForbiddenKeys(entry, `${context}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_ELECTION_PROPERTY.test(key)) throw new Error(`${context} contains election-value property ${key}`);
    inspectForbiddenKeys(child, `${context}.${key}`);
  }
}

async function parseResults(root, spec) {
  const verified = verifyTexasPinnedArtifact(root, spec.resultSource, `Texas ${spec.year} TLC VTD result ZIP`);
  const archive = await JSZip.loadAsync(verified.bytes);
  const member = archive.file(spec.resultMember)
    ?? Object.values(archive.files).find((entry) => !entry.dir && entry.name.endsWith(`/${spec.resultMember}`));
  if (!member) throw new Error(`Texas ${spec.year} result ZIP lacks ${spec.resultMember}`);
  const sourceRows = parseCsv(await member.async("string"));
  const presidentRows = sourceRows.filter((row) => row.Office === "President");
  if (presidentRows.length !== spec.expectedCandidateRows) throw new Error(`Texas ${spec.year} President row count drifted`);
  const units = new Map();
  const candidateTotals = {};
  for (const row of presidentRows) {
    const sourceUnitId = spec.resultKeyField === "vtdkeyvalue"
      ? String(integer(row[spec.resultKeyField]))
      : String(row[spec.resultKeyField] ?? "").trim();
    if (!sourceUnitId) throw new Error(`Texas ${spec.year} has a blank VTD key`);
    const record = units.get(sourceUnitId) ?? {
      sourceUnitId,
      sourceDisplayName: String(row.VTD ?? "").trim(),
      parentGeoid: parentGeoid(row.FIPS),
      votes: 0,
      candidateRows: 0,
      candidateVotes: {},
    };
    if (record.parentGeoid !== parentGeoid(row.FIPS) || record.sourceDisplayName !== String(row.VTD ?? "").trim()) {
      throw new Error(`Texas ${spec.year} VTD identity drifted for ${sourceUnitId}`);
    }
    const votes = integer(row.Votes);
    const candidate = String(row.Name ?? "").trim();
    record.votes += votes;
    record.candidateRows += 1;
    record.candidateVotes[candidate] = (record.candidateVotes[candidate] ?? 0) + votes;
    candidateTotals[candidate] = (candidateTotals[candidate] ?? 0) + votes;
    units.set(sourceUnitId, record);
  }
  if (units.size !== spec.expectedUnits || new Set([...units.values()].map((unit) => unit.parentGeoid)).size !== EXPECTED_PARENTS) {
    throw new Error(`Texas ${spec.year} VTD or county count drifted`);
  }
  if ([...units.values()].some((unit) => unit.candidateRows !== 5)) throw new Error(`Texas ${spec.year} candidate cardinality drifted`);
  const zeroVoteUnits = [...units.values()].filter((unit) => unit.votes === 0).length;
  if (zeroVoteUnits !== spec.expectedZeroVoteUnits) throw new Error(`Texas ${spec.year} zero-vote VTD count drifted`);
  const actualCandidateNames = Object.keys(candidateTotals).sort();
  const expectedCandidateNames = Object.keys(spec.expectedCandidateTotals).sort();
  if (
    JSON.stringify(actualCandidateNames) !== JSON.stringify(expectedCandidateNames)
    || expectedCandidateNames.some((name) => candidateTotals[name] !== spec.expectedCandidateTotals[name])
  ) throw new Error(`Texas ${spec.year} candidate totals drifted`);
  const reportingUnits = [];
  const resultRows = [];
  const codes = new Set();
  const totals = { Democratic: 0, Republican: 0, Other: 0, Total: 0 };
  for (const unit of [...units.values()].sort((left, right) => left.sourceUnitId.localeCompare(right.sourceUnitId, "en-US", { numeric: true }))) {
    const code = reportingUnitCode({ state: STATE, electionId: spec.electionId, reportingGrain: "precinct", parentGeoid: unit.parentGeoid, sourceUnitId: unit.sourceUnitId });
    if (codes.has(code)) throw new Error(`Duplicate Texas reporting unit ${code}`);
    codes.add(code);
    const democratic = unit.candidateVotes[spec.democratic.name] ?? 0;
    const republican = unit.candidateVotes[spec.republican.name] ?? 0;
    const other = unit.votes - democratic - republican;
    if (other < 0) throw new Error(`Texas ${spec.year} candidate grouping is invalid for ${unit.sourceUnitId}`);
    reportingUnits.push({ code, sourceUnitId: unit.sourceUnitId, sourceDisplayName: unit.sourceDisplayName, parentGeoid: unit.parentGeoid, reportingGrain: "precinct", isGeographic: true });
    resultRows.push(
      { jurisdictionCode: code, jurisdictionName: unit.sourceDisplayName, candidateName: spec.democratic.name, party: spec.democratic.party, votes: democratic },
      { jurisdictionCode: code, jurisdictionName: unit.sourceDisplayName, candidateName: spec.republican.name, party: spec.republican.party, votes: republican },
      { jurisdictionCode: code, jurisdictionName: unit.sourceDisplayName, candidateName: "Other", party: "OTHER", votes: other },
    );
    totals.Democratic += democratic;
    totals.Republican += republican;
    totals.Other += other;
    totals.Total += unit.votes;
  }
  const expectedTotal = Object.values(spec.expectedCandidateTotals).reduce((sum, value) => sum + value, 0);
  if (totals.Total !== expectedTotal || totals.Democratic !== spec.expectedCandidateTotals[spec.democratic.name] || totals.Republican !== spec.expectedCandidateTotals[spec.republican.name]) {
    throw new Error(`Texas ${spec.year} grouped result totals drifted`);
  }
  return {
    reportingUnits,
    resultRows,
    totals,
    zeroVoteUnits,
    sourceRows: sourceRows.length,
    source: { ...spec.resultSource, authority: "Texas Legislative Council Capitol Data Portal" },
  };
}

function buildGeometryPlan(root, spec, manifest, results) {
  const inspection = validateManifestArtifacts(manifest, { root, skipDelivery: true });
  if (inspection.errors.length) throw new Error(`Texas ${spec.year} artifact validation failed: ${inspection.errors.join("; ")}`);
  if (
    manifest.geography.level !== "precinct"
    || manifest.geography.vintageStatus !== "election_date_confirmed"
    || manifest.geography.derivationMethod !== "official_export"
    || manifest.crosswalk.status !== "reviewed"
    || manifest.crosswalk.resultUnits !== spec.expectedUnits
    || manifest.crosswalk.matchedResultUnits !== spec.expectedUnits
    || manifest.crosswalk.unmatchedResultUnits !== 0
    || manifest.crosswalk.relationships.oneToOne !== spec.expectedUnits
    || manifest.crosswalk.relationships.pendingReview !== 0
    || manifest.validation.geometryValid !== true
    || manifest.validation.parentTotalsReconciled !== true
    || manifest.delivery !== null
  ) {
    throw new Error(`Texas ${spec.year} reviewed local geometry contract drifted`);
  }
  const normalizedArtifact = verifyTexasPinnedArtifact(root, { artifact: manifest.normalization.artifact, sha256: manifest.normalization.sha256, byteCount: spec.normalizationByteCount }, `Texas ${spec.year} normalized geometry`);
  const normalized = JSON.parse(gunzipSync(normalizedArtifact.bytes).toString("utf8"));
  const crosswalkArtifact = verifyTexasPinnedArtifact(root, { artifact: manifest.crosswalk.artifact, sha256: manifest.crosswalk.sha256, byteCount: spec.crosswalkByteCount }, `Texas ${spec.year} crosswalk`);
  const crosswalk = JSON.parse(crosswalkArtifact.bytes.toString("utf8"));
  const features = [];
  const featureByKey = new Map();
  for (const [index, feature] of normalized.features.entries()) {
    if (feature?.type !== "Feature" || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type) || !feature.properties) {
      throw new Error(`Texas ${spec.year} normalized feature is invalid`);
    }
    inspectForbiddenKeys(feature.properties, `features[${index}].properties`);
    const parents = manifest.normalization.parentIdFields.map((field) => String(feature.properties[field] ?? "").trim());
    const sources = manifest.normalization.sourceFeatureIdFields.map((field) => String(feature.properties[field] ?? "").trim());
    if (parents.some((value) => !/^48\d{3}$/.test(value)) || sources.some((value) => !value)) throw new Error(`Texas ${spec.year} normalized feature identity is invalid`);
    const sourceFeatureId = [...parents, ...sources].join("|");
    if (featureByKey.has(sourceFeatureId)) throw new Error(`Texas ${spec.year} duplicate feature ${sourceFeatureId}`);
    const record = { sourceFeatureId, parentGeoid: parents.join("|"), name: String(feature.properties.VTD ?? ""), geometryKey: sourceFeatureId, isGeographic: true, properties: feature.properties };
    features.push(record);
    featureByKey.set(sourceFeatureId, record);
  }
  if (features.length !== spec.expectedUnits) throw new Error(`Texas ${spec.year} geometry feature count drifted`);
  if (
    crosswalk.manifestId !== manifest.id
    || crosswalk.state !== STATE
    || crosswalk.electionId !== spec.electionId
    || crosswalk.resultSourceId !== spec.resultSource.id
    || crosswalk.rows?.length !== spec.expectedUnits
    || crosswalk.reconciliation?.status !== "passed"
    || crosswalk.reconciliation.scopes?.length !== EXPECTED_PARENTS + 1
    || !crosswalk.reconciliation.scopes.every((scope) => Object.values(scope.deltas ?? {}).every((value) => Number(value) === 0))
  ) {
    throw new Error(`Texas ${spec.year} crosswalk reconciliation drifted`);
  }
  const unitsByCode = new Map(results.reportingUnits.map((unit) => [unit.code, unit]));
  const seen = new Set();
  const crosswalks = crosswalk.rows.map((row, index) => {
    const unit = unitsByCode.get(row.resultUnitCode);
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
      || relationship.matchMethod !== "official_crosswalk"
      || relationship.reviewStatus !== "reviewed"
      || relationship.confidence !== "high"
      || !featureByKey.has(relationship.sourceFeatureId)
    ) {
      throw new Error(`Texas ${spec.year} crosswalk drift at row ${index}`);
    }
    inspectForbiddenKeys(relationship, `crosswalk.rows[${index}]`);
    seen.add(row.resultUnitCode);
    return { reportingUnitCode: row.resultUnitCode, sourceFeatureId: relationship.sourceFeatureId, relationshipType: relationship.relationshipType, matchMethod: relationship.matchMethod, reviewStatus: relationship.reviewStatus, confidence: relationship.confidence, note: String(relationship.note ?? "") };
  });
  return { disposition: "loadable_reviewed", blockCode: null, reasons: [...manifest.validation.errors], features, crosswalks, artifactWarnings: inspection.warnings };
}

async function loadYear(root, spec) {
  const manifestBytes = readFileSync(absoluteInsideRoot(root, spec.manifestPath));
  if (manifestBytes.length !== spec.manifestByteCount || sha256(manifestBytes) !== spec.manifestSha256) throw new Error(`Texas ${spec.year} manifest bytes drifted`);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const contract = inspectPrecinctGeometryManifest(manifest);
  if (contract.errors.length) throw new Error(`Texas ${spec.year} manifest contract failed: ${contract.errors.join("; ")}`);
  if (manifest.state !== STATE || manifest.election.id !== spec.electionId || manifest.election.date !== spec.electionDate || manifest.election.year !== spec.year) throw new Error(`Texas ${spec.year} election identity drifted`);
  verifyTexasPinnedArtifact(root, { artifact: manifest.source.artifact, sha256: manifest.source.sha256, byteCount: manifest.source.byteCount }, `Texas ${spec.year} source evidence`);
  const results = await parseResults(root, spec);
  return {
    year: spec.year,
    electionId: spec.electionId,
    electionDate: spec.electionDate,
    manifestPath: spec.manifestPath,
    manifestSha256: spec.manifestSha256,
    manifestByteCount: spec.manifestByteCount,
    artifactByteCounts: { source: manifest.source.byteCount, normalization: spec.normalizationByteCount, crosswalk: spec.crosswalkByteCount },
    manifest,
    resultSource: results.source,
    reportingUnits: results.reportingUnits,
    resultRows: results.resultRows,
    totals: results.totals,
    zeroVoteUnits: results.zeroVoteUnits,
    sourceRows: results.sourceRows,
    geometry: buildGeometryPlan(root, spec, manifest, results),
    geometrySourceSlug: spec.geometrySourceSlug,
  };
}

export async function buildTexasPrecinctGisPlan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const selected = options.years ? new Set(options.years.map(Number)) : new Set(TEXAS_PRECINCT_GIS_YEAR_SPECS.map((spec) => spec.year));
  const known = new Set(TEXAS_PRECINCT_GIS_YEAR_SPECS.map((spec) => spec.year));
  for (const year of selected) if (!known.has(year)) throw new Error("Supported Texas precinct GIS years are 2012, 2016, 2020, and 2024");
  const years = [];
  for (const spec of TEXAS_PRECINCT_GIS_YEAR_SPECS.filter((entry) => selected.has(entry.year))) years.push(await loadYear(root, spec));
  if (!years.length) throw new Error("Select at least one Texas precinct GIS year");
  return { schemaVersion: 1, state: STATE, stateName: "Texas", authority: "Texas Legislative Council Capitol Data Portal", scope: "local-only presidential general election VTD GIS setup", years };
}

export function summarizeTexasPrecinctGisPlan(plan) {
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
      caveats: year.manifest.caveats,
    })),
  };
}
