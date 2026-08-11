import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import JSZip from "jszip";
import shp from "shpjs";
import { reportingUnitCode } from "../src/lib/precinct-geography.ts";

const STATE = "TX";
const ELECTION_ID = "2024-11-05-general";
const REVIEWED_RETRIEVAL = "2026-08-11T02:49:35.000Z";
const MANIFEST_ID = "tx-2024-11-05-tlc-vtd-geometry-candidate-v2";
const BASE = `data/precinct-geometry/${STATE}/${ELECTION_ID}`;
const RAW = `${BASE}/raw/texas-legislative-council`;
const GEOMETRY = `${RAW}/vtds_24pg.zip`;
const GEOMETRY_METADATA = `${RAW}/vtds-package-metadata.json`;
const RESULTS = "data/tx-2024-general-vtds-election-data.zip";
const RESULTS_METADATA = `${RAW}/election-data-package-metadata.json`;
const CERTIFIED_RESULTS = "data/tx-2024-official-results/County.json";
const PRECINCT_CONTEXT = `${RAW}/precincts24g.zip`;
const NORMALIZED = `${BASE}/normalized/tx-2024-11-05-vtds-candidate.geojson.gz`;
const CROSSWALK = `${BASE}/crosswalk/tx-2024-11-05-vtdkey-reviewed-evidence.json`;
const REPORT = `${BASE}/reports/tx-2024-11-05-vtd-geometry-report.json`;
const MANIFEST = `${BASE}/manifest.json`;
const EVIDENCE = `${BASE}/source-evidence.json`;
const GEOMETRY_URL = "https://data.capitol.texas.gov/dataset/4d8298d0-d176-4c19-b174-42837027b73e/resource/906f47e4-4e39-4156-b1bd-4969be0b2780/download/vtds_24pg.zip";
const RESULTS_URL = "https://data.capitol.texas.gov/dataset/35b16aee-0bb0-4866-b1ec-859f1f044241/resource/e1cd6332-6a7a-4c78-ad2a-852268f6c7a2/download/2024-general-vtds-election-data.zip";
const CERTIFIED_RESULTS_URL = "https://results.texas-election.com/static/data/election/49664/1012/County.json";
const PRECINCT_CONTEXT_URL = "https://data.capitol.texas.gov/dataset/d04c72b9-16c4-4ab2-8c6d-c666d41e04b7/resource/4572665a-8de5-461d-84b8-79f704b63530/download/precincts24g.zip";
const SOURCE_CRS = "NAD_1983_Lambert_Conformal_Conic (NAD83; meters)";
const SERVED_CRS = "EPSG:4326";
const APPROVED_INPUTS = new Map([
  [GEOMETRY, { byteCount: 46_578_782, sha256: "4adf61b5d97bdc7b307fc07f8eac4425782f1dbef07ee4de0734375c1d4b8aed" }],
  [RESULTS, { byteCount: 82_066_995, sha256: "ed6956085e80d8153adce0829c279c8915c05f1867b2004b8b0988336469ff56" }],
  [CERTIFIED_RESULTS, { byteCount: 1_818_450, sha256: "fa818d6a89dd0b6ec7dd5f04120dc3073d2a83edba51c8dafbbd0186b1492b9a" }],
  [PRECINCT_CONTEXT, { byteCount: 46_925_672, sha256: "20ef8e477375b42c4635d2009c36e1dd94e4ec63cc0a1518a3daad2636e6dcec" }],
  [GEOMETRY_METADATA, { byteCount: 20_219, sha256: "e434c86a21c537f7012686e650acb5d6d7a583c5d8fbde4c3b99342de492443e" }],
  [RESULTS_METADATA, { byteCount: 8_581, sha256: "1f2aadfc55ec914bacdeb4997c9c43586b12ea9ad672d31200d628f0ef36346f" }],
]);

const rootArgument = process.argv.find((value) => value.startsWith("--root="))?.slice(7);
const retrievedAt = process.argv.find((value) => value.startsWith("--retrieved-at="))?.slice(15);
if (retrievedAt !== REVIEWED_RETRIEVAL) {
  throw new Error(`Use --retrieved-at=${REVIEWED_RETRIEVAL} for deterministic replay.`);
}
const root = path.resolve(rootArgument || process.cwd());
const absolute = (file) => path.resolve(root, file);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function read(file) {
  return readFileSync(absolute(file));
}

function write(file, value) {
  const bytes = Buffer.isBuffer(value) ? value : jsonBytes(value);
  mkdirSync(path.dirname(absolute(file)), { recursive: true });
  writeFileSync(absolute(file), bytes);
  return { localArtifactPath: file, byteCount: bytes.length, sha256: sha256(bytes) };
}

function assertApprovedInputs() {
  for (const [file, expected] of APPROVED_INPUTS) {
    const bytes = read(file);
    const actual = { byteCount: bytes.length, sha256: sha256(bytes) };
    if (actual.byteCount !== expected.byteCount || actual.sha256 !== expected.sha256) {
      throw new Error(`Raw artifact tampering or upstream drift detected before derived write: ${file}`);
    }
  }
}

function artifact(file, sourceUrl, format, note, authority = "Texas Legislative Council Capitol Data Portal") {
  const bytes = read(file);
  return {
    localArtifactPath: file,
    sourceUrl,
    authority,
    derivation: "Exact retained official download or portal API response; this diagnostic is regenerated only from hash-pinned local bytes.",
    byteCount: bytes.length,
    sha256: sha256(bytes),
    format,
    note,
  };
}

function parseCsv(text) {
  const cells = [];
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
      cells.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") field += character;
  }
  if (field || row.length) {
    row.push(field);
    cells.push(row);
  }
  const headers = cells.shift()?.map((value) => value.replace(/^\uFEFF/, "")) ?? [];
  return cells
    .filter((values) => values.some((value) => value !== ""))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const integer = (value) => Number.parseInt(String(value ?? "").replaceAll(",", ""), 10) || 0;
const parentGeoid = (fips) => `48${String(fips).padStart(3, "0")}`;
const geometryValid = (feature) => ["Polygon", "MultiPolygon"].includes(feature.geometry?.type) && Number.isFinite(feature.geometry?.bbox?.[0]);

function certifiedPresidentTotals(countyBytes) {
  const countyData = JSON.parse(countyBytes.toString("utf8").replace(/^\uFEFF/, ""));
  const totals = { Trump: 0, Harris: 0, Stein: 0, Oliver: 0, "Declared Write-In": 0, total: 0 };
  let countyCount = 0;
  for (const county of Object.values(countyData)) {
    const candidates = county?.Races?.["1001"]?.C;
    if (!candidates) continue;
    countyCount += 1;
    for (const candidate of Object.values(candidates)) {
      const votes = integer(candidate.V);
      const party = String(candidate.P ?? "").trim().toUpperCase();
      const name = String(candidate.N ?? "").trim().toUpperCase();
      if (party === "REP") totals.Trump += votes;
      else if (party === "DEM") totals.Harris += votes;
      else if (name.includes("JILL STEIN")) totals.Stein += votes;
      else if (name.includes("CHASE OLIVER")) totals.Oliver += votes;
      else if (party === "W") totals["Declared Write-In"] += votes;
      totals.total += votes;
    }
  }
  return { countyCount, totals };
}

assertApprovedInputs();
const geometryBytes = read(GEOMETRY);
const resultsBytes = read(RESULTS);
const sourceGeojson = await shp(geometryBytes);
if (sourceGeojson.type !== "FeatureCollection" || !Array.isArray(sourceGeojson.features)) {
  throw new Error("The official 2024 VTD source did not parse as a FeatureCollection.");
}
const features = sourceGeojson.features.map((feature) => ({
  type: "Feature",
  geometry: feature.geometry,
  properties: {
    CRM_FEATURE_ID: String(feature.properties.VTDKEY),
    CRM_PARENT_GEOID: parentGeoid(feature.properties.CNTY),
    CNTY: Number(feature.properties.CNTY),
    VTD: String(feature.properties.VTD),
    VTDKEY: Number(feature.properties.VTDKEY),
    CNTYVTD: String(feature.properties.CNTYVTD),
  },
}));
const featureByKey = new Map(features.map((feature) => [String(feature.properties.VTDKEY), feature]));
if (featureByKey.size !== features.length) throw new Error("The official 2024 VTD geometry has duplicate VTDKEY identities.");
if (!features.every(geometryValid)) throw new Error("The official 2024 VTD geometry has an invalid or non-polygon feature.");

const resultZip = await JSZip.loadAsync(resultsBytes);
const returnsFile = resultZip.file("2024_General_Election_Returns.csv");
if (!returnsFile) throw new Error("The official result ZIP lacks 2024_General_Election_Returns.csv.");
const returnRows = parseCsv(await returnsFile.async("string"));
const presidentRows = returnRows.filter((row) => row.Office === "President");
const resultUnits = new Map();
for (const row of presidentRows) {
  const key = String(integer(row.vtdkeyvalue));
  if (!resultUnits.has(key)) {
    resultUnits.set(key, { key, fips: integer(row.FIPS), vtd: row.VTD, cntyvtd: row.cntyvtd, votes: 0, candidateRows: 0 });
  }
  const unit = resultUnits.get(key);
  unit.votes += integer(row.Votes);
  unit.candidateRows += 1;
  if (unit.fips !== integer(row.FIPS) || unit.vtd !== row.VTD || unit.cntyvtd !== row.cntyvtd) {
    throw new Error(`Inconsistent President identity for VTDKEY ${key}.`);
  }
}
const resultKeys = new Set(resultUnits.keys());
const geometryKeys = new Set(featureByKey.keys());
const missingGeometryKeys = [...resultKeys].filter((key) => !geometryKeys.has(key)).sort((left, right) => Number(left) - Number(right));
const extraGeometryKeys = [...geometryKeys].filter((key) => !resultKeys.has(key)).sort((left, right) => Number(left) - Number(right));
const identityMismatches = [...resultUnits.values()].filter((unit) => {
  const feature = featureByKey.get(unit.key);
  return feature && (
    feature.properties.CRM_PARENT_GEOID !== parentGeoid(unit.fips)
    || feature.properties.VTD !== unit.vtd
  );
});
if (missingGeometryKeys.length || extraGeometryKeys.length || identityMismatches.length) {
  throw new Error(`Official 2024 VTD pairing is incomplete: missing=${missingGeometryKeys.length}, extra=${extraGeometryKeys.length}, identityMismatches=${identityMismatches.length}.`);
}

const normalizedBytes = gzipSync(Buffer.from(JSON.stringify({ type: "FeatureCollection", features })));
write(NORMALIZED, normalizedBytes);
const relationships = [...resultUnits.values()]
  .sort((left, right) => Number(left.key) - Number(right.key))
  .map((unit) => ({
    resultUnitCode: reportingUnitCode({ state: STATE, electionId: ELECTION_ID, reportingGrain: "precinct", parentGeoid: parentGeoid(unit.fips), sourceUnitId: unit.key }),
    sourceUnitId: unit.key,
    sourceDisplayName: unit.vtd,
    parentGeoid: parentGeoid(unit.fips),
    reportingGrain: "precinct",
    isGeographic: true,
    relationships: [{
      sourceFeatureId: `${parentGeoid(unit.fips)}|${unit.key}`,
      relationshipType: "one_to_one",
      matchMethod: "official_crosswalk",
      reviewStatus: "reviewed",
      confidence: "high",
      note: "TLC explicitly documents VTDKEY/vtdkeyvalue as the join between the 2024 General VTD returns and the 2024 Primary & General Elections VTD shapefile. This preserves VTD reporting geography and does not relabel VTDs as administrative county precincts.",
    }],
  }));
const stateVotes = [...resultUnits.values()].reduce((sum, unit) => sum + unit.votes, 0);
const countyTotals = new Map();
for (const unit of resultUnits.values()) {
  const geoid = parentGeoid(unit.fips);
  countyTotals.set(geoid, (countyTotals.get(geoid) ?? 0) + unit.votes);
}
const reconciliationScopes = [
  { scopeType: "state", scopeId: STATE, resultTotals: { presidentVotes: stateVotes }, mappedTotals: { presidentVotes: stateVotes }, deltas: { presidentVotes: 0 } },
  ...[...countyTotals].sort(([left], [right]) => left.localeCompare(right)).map(([geoid, presidentVotes]) => ({
    scopeType: "parent",
    scopeId: geoid,
    resultTotals: { presidentVotes },
    mappedTotals: { presidentVotes },
    deltas: { presidentVotes: 0 },
  })),
];
const crosswalk = {
  schemaVersion: 1,
  manifestId: MANIFEST_ID,
  state: STATE,
  electionId: ELECTION_ID,
  geographyLevel: "precinct",
  resultSourceId: "tx-2024-capitol-vtd-results-zip",
  generatedAt: retrievedAt,
  rows: relationships,
  reconciliation: {
    status: "passed",
    scopes: reconciliationScopes,
    caveat: "This proves complete allocation within TLC's paired VTD product. It does not claim equality with the separately certified SOS county canvass.",
  },
};
const crosswalkArtifact = write(CROSSWALK, crosswalk);
const candidateTotals = Object.fromEntries(
  [...new Set(presidentRows.map((row) => row.Name))]
    .sort()
    .map((name) => [name, presidentRows.filter((row) => row.Name === name).reduce((sum, row) => sum + integer(row.Votes), 0)]),
);
const certified = certifiedPresidentTotals(read(CERTIFIED_RESULTS));
const certifiedDeltas = {
  Trump: candidateTotals.Trump - certified.totals.Trump,
  Harris: candidateTotals.Harris - certified.totals.Harris,
  Stein: candidateTotals.Stein - certified.totals.Stein,
  Oliver: candidateTotals.Oliver - certified.totals.Oliver,
  "Write-In": candidateTotals["Write-In"] - certified.totals["Declared Write-In"],
  total: stateVotes - certified.totals.total,
};
const sourceArtifacts = [
  artifact(GEOMETRY, GEOMETRY_URL, "ESRI Shapefile ZIP", "Election-specific 2024 Primary & General Elections VTD geometry; exact source layer for the official result join."),
  artifact(RESULTS, RESULTS_URL, "CSV ZIP", "2024 General VTD election package; President rows remain at the TLC VTD reporting grain."),
  artifact(GEOMETRY_METADATA, "https://data.capitol.texas.gov/api/3/action/package_show?id=4d8298d0-d176-4c19-b174-42837027b73e", "CKAN package metadata JSON", "Hash-pinned official documentation for the 9,712-feature VTDKEY join."),
  artifact(RESULTS_METADATA, "https://data.capitol.texas.gov/api/3/action/package_show?id=35b16aee-0bb0-4866-b1ec-859f1f044241", "CKAN package metadata JSON", "Hash-pinned official metadata for the paired VTD election-data ZIP."),
  artifact(CERTIFIED_RESULTS, CERTIFIED_RESULTS_URL, "Texas SOS county result JSON", "Retained certified county results used only for a source-scope comparison.", "Texas Secretary of State"),
  artifact(PRECINCT_CONTEXT, PRECINCT_CONTEXT_URL, "ESRI Shapefile ZIP", "Separate administrative voting-precinct geometry retained as context only; it is not substituted for the officially paired VTD layer."),
];
const evidence = {
  schemaVersion: 1,
  id: "tx-2024-tlc-vtd-geometry-source-evidence-diagnostic",
  state: STATE,
  election: { id: ELECTION_ID, date: "2024-11-05", year: 2024, type: "general", office: "president" },
  authority: "Texas Legislative Council Capitol Data Portal",
  retrievedAt,
  sourceCrs: SOURCE_CRS,
  servedCrs: SERVED_CRS,
  artifacts: sourceArtifacts,
  officialJoinDocumentation: {
    geometryResourceId: "906f47e4-4e39-4156-b1bd-4969be0b2780",
    resultsResourceId: "e1cd6332-6a7a-4c78-ad2a-852268f6c7a2",
    documentedJoin: "Use vtdkey or vtdkeyvalue in election data with VTDKEY in the VTD shapefile.",
    evidenceArtifact: GEOMETRY_METADATA,
    status: "explicit_official_pairing",
  },
  resultIdentity: {
    sourceId: crosswalk.resultSourceId,
    reportingGrain: "VTD",
    targetCandidateResultUnits: relationships.length,
    candidateRows: presidentRows.length,
    presidentVotes: stateVotes,
    candidateTotals,
    zeroVoteResultUnits: [...resultUnits.values()].filter((unit) => unit.votes === 0).length,
    certifiedComparison: {
      authority: "Texas Secretary of State",
      scope: "official certified county presidential results",
      countyCount: certified.countyCount,
      totals: certified.totals,
      deltas: certifiedDeltas,
      status: "source_scope_caveat",
      explanation: "TLC states that its redistricting VTD datasets are derived from county and SOS returns and may differ from official results. The VTD product has a generic Write-In row, whereas the SOS county JSON identifies declared write-in candidates; the net VTD-minus-SOS difference is 15,854 votes.",
    },
  },
  boundaryContext: {
    geometry: "VTDs are census-geographic approximations of county voting precincts. TLC notes that suffixes can represent noncontiguous pieces and that some precincts are consolidated when they do not match census geography.",
    electionVintage: "The source is explicitly labeled 2024 Primary & General Elections VTDs and contains exactly the 9,712 VTDKEY values used by the 2024 General VTD return package.",
    separatePrecinctLayer: "Precincts24G is retained as administrative-boundary context only. It has 9,657 features and is not the layer TLC documents for joining the VTD returns.",
    identityNote: "The authoritative cross-source key is VTDKEY/vtdkeyvalue. Geometry CNTYVTD uses TLC's sequential CNTYKEY, while the return file's cntyvtd uses county FIPS; those similarly named fields are intentionally not joined.",
    licenseOrTerms: "Creative Commons Attribution as stated by the Capitol Data Portal resources.",
  },
  caveats: [
    "No vote field appears in the crosswalk or normalized geometry; vote values remain in the result-source pipeline.",
    "This layer must be labeled VTD or precinct approximation, not an exact administrative county voting-precinct boundary layer.",
    "The TLC local VTD totals are source-specific and do not replace the certified SOS county or statewide canvass totals.",
    "No conclusion about vote tabulation or election conduct follows from the documented source-scope difference.",
  ],
};
const evidenceArtifact = write(EVIDENCE, evidence);
const report = {
  schemaVersion: 1,
  state: STATE,
  electionId: ELECTION_ID,
  generatedAt: retrievedAt,
  disposition: "reviewed_exact_vtd_pairing_delivery_pending",
  source: {
    geometryFeatureCount: features.length,
    geometryKeyCount: geometryKeys.size,
    polygonCount: features.filter((feature) => feature.geometry.type === "Polygon").length,
    multiPolygonCount: features.filter((feature) => feature.geometry.type === "MultiPolygon").length,
    geometryValid: true,
    sourceCrs: SOURCE_CRS,
    servedCrs: SERVED_CRS,
    countyCount: new Set(features.map((feature) => feature.properties.CRM_PARENT_GEOID)).size,
  },
  crosswalk: {
    resultUnits: relationships.length,
    colorableResultUnits: relationships.length,
    matchedResultUnits: relationships.length,
    unmatchedResultUnits: 0,
    nonGeographicResultUnits: 0,
    sourceAliasResultUnits: 0,
    relationships: { oneToOne: relationships.length, oneToMany: 0, manyToOne: 0, unmatched: 0, nonGeographic: 0, sourceAlias: 0, pendingReview: 0 },
    missingGeometryKeys,
    extraGeometryKeys,
    identityMismatches: identityMismatches.length,
  },
  reconciliation: { pairedVtd: crosswalk.reconciliation, sosCertified: evidence.resultIdentity.certifiedComparison },
  caveats: evidence.caveats,
};
const reportArtifact = write(REPORT, report);
const manifest = {
  schemaVersion: 1,
  id: MANIFEST_ID,
  state: STATE,
  election: evidence.election,
  geography: { level: "precinct", parentLevel: "county", boundaryVintage: "2024 Primary & General Elections VTDs", vintageStatus: "election_date_confirmed", derivationMethod: "official_export" },
  source: { authority: evidence.authority, url: GEOMETRY_URL, retrievedAt, artifact: evidenceArtifact.localArtifactPath, sha256: evidenceArtifact.sha256, byteCount: evidenceArtifact.byteCount, format: "VTD-source-evidence+json", licenseOrTerms: evidence.boundaryContext.licenseOrTerms },
  normalization: { script: "scripts/collect-tx-2024-precinct-geometry.mjs", sourceCrs: SOURCE_CRS, servedCrs: SERVED_CRS, artifact: NORMALIZED, sha256: sha256(normalizedBytes), byteCount: normalizedBytes.length, featureCount: features.length, sourceFeatureIdFields: ["CRM_FEATURE_ID"], parentIdFields: ["CRM_PARENT_GEOID"] },
  crosswalk: { status: "reviewed", resultSourceId: crosswalk.resultSourceId, artifact: crosswalkArtifact.localArtifactPath, sha256: crosswalkArtifact.sha256, byteCount: crosswalkArtifact.byteCount, resultUnits: relationships.length, colorableResultUnits: relationships.length, matchedResultUnits: relationships.length, unmatchedResultUnits: 0, nonGeographicResultUnits: 0, sourceAliasResultUnits: 0, relationships: { oneToOne: relationships.length, oneToMany: 0, manyToOne: 0, unmatched: 0, nonGeographic: 0, sourceAlias: 0, pendingReview: 0 }, methods: ["official_crosswalk"] },
  validation: {
    status: "blocked",
    geometryValid: true,
    rowLevelRenderingSafe: false,
    parentTotalsReconciled: true,
    errors: ["An immutable parent-scoped public delivery package and production release review have not been completed."],
    warnings: [
      "TLC VTDs are precinct approximations and must remain labeled as VTD geography.",
      "The paired TLC VTD President total is 15,854 votes above the certified SOS county total, principally because the VTD product uses a generic Write-In row; the VTD source cannot replace certified county/state totals.",
      "The separate Precincts24G administrative boundary layer is retained only as context and is not used for result coloring.",
    ],
  },
  delivery: null,
  caveats: evidence.caveats,
};
const manifestArtifact = write(MANIFEST, manifest);

console.log(JSON.stringify({
  manifest: manifestArtifact.localArtifactPath,
  report: reportArtifact.localArtifactPath,
  evidence: evidenceArtifact.localArtifactPath,
  geometryFeatures: features.length,
  resultUnits: relationships.length,
  counties: countyTotals.size,
  presidentVotes: stateVotes,
  certifiedDelta: certifiedDeltas.total,
  delivery: null,
}, null, 2));
