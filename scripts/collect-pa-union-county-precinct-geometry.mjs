import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { unzipSync } from "fflate";
import shp from "shpjs";
import { reportingUnitCode } from "../src/lib/precinct-geography.ts";
import {
  PENNSYLVANIA_PRECINCT_YEAR_SPECS,
  PENNSYLVANIA_RAW_SOURCE_PINS,
  parsePennsylvaniaOfficialResults,
} from "./lib/pa-precinct-geometry.mjs";

const STATE = "PA";
const PARENT_GEOID = "42119";
const PARENT_NAME = "Union County";
const REVIEWED_AT = "2026-08-18T00:00:00.000Z";
const AUTHORITY =
  "Union County, Pennsylvania, distributed by Pennsylvania Spatial Data Access (PASDA)";
const DATASET_URL =
  "https://www.pasda.psu.edu/uci/DataSummary.aspx?dataset=1994";
const ARCHIVE_ROOT_URL =
  "https://www.pasda.psu.edu/download/unioncounty/historic/UnionCounty_VotingPrecincts";
const SCRIPT_PATH =
  "scripts/collect-pa-union-county-precinct-geometry.mjs";
const LICENSE_OR_TERMS =
  "The retained PASDA metadata provides an as-is warranty and indemnity disclaimer but no explicit open-data license; preserve Union County/PASDA attribution and complete a terms review before public delivery.";

const YEAR_SPECS = Object.freeze({
  2020: Object.freeze({
    year: 2020,
    filename: "UnionCounty_VotingPrecincts202010.zip",
    byteCount: 193_925,
    sha256:
      "4dfac59077195d7eefdf29dc137d820caac14888f3290a242553efc8637df36b",
    snapshotMonth: "2020-10",
    sourceSnapshotDate: "2020-09-24",
    featureMetadataDate: "2020-09-24",
    vintageStatus: "election_date_confirmed",
    metadataEvidence: Object.freeze([
      "<origin>Union County, Pennsylvania</origin>",
      "<pubdate>202010</pubdate>",
      "<caldate>202010</caldate>",
    ]),
    shapefileMetadataEvidence: Object.freeze([
      "<SyncDate>20200924</SyncDate>",
      "<ModDate>20200924</ModDate>",
    ]),
    expectedTotals: Object.freeze({
      democratic: 7_475,
      republican: 12_356,
      other: 284,
      total: 20_115,
    }),
    expectedCurrentMappedUnits: 25,
    expectedCurrentMappedVotes: 19_077,
    expectedCandidateAdditionalUnits: 2,
    expectedCandidateAdditionalVotes: 1_038,
  }),
  2024: Object.freeze({
    year: 2024,
    filename: "UnionCounty_VotingPrecincts202409.zip",
    byteCount: 196_170,
    sha256:
      "54a9e631a5b8b6af4cfdc747081414e0a9a9d40d331966476d2e006718604c24",
    snapshotMonth: "2024-09",
    sourceSnapshotDate: "2024-09-05",
    featureMetadataDate: "2021-10-12",
    vintageStatus: "unknown",
    metadataEvidence: Object.freeze([
      "<origin>Union County, Pennsylvania</origin>",
      "<pubdate>202409</pubdate>",
      "<caldate>202409</caldate>",
    ]),
    shapefileMetadataEvidence: Object.freeze([
      "<SyncDate>20211012</SyncDate>",
      "<ModDate>20211012</ModDate>",
      'Date="20240905"',
      "UnionCo.gdb\\VotingPrecinct",
    ]),
    expectedTotals: Object.freeze({
      democratic: 8_015,
      republican: 12_969,
      other: 204,
      total: 21_188,
    }),
    expectedCurrentMappedUnits: 0,
    expectedCurrentMappedVotes: 0,
    expectedCandidateAdditionalUnits: 27,
    expectedCandidateAdditionalVotes: 21_188,
  }),
});

function parseArguments(argv) {
  const values = new Map();
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const [key, ...rest] = argument.split("=");
    values.set(key, rest.length ? rest.join("=") : true);
  }
  return values;
}

const args = parseArguments(process.argv.slice(2));
if (args.get("--retrieved-at") !== REVIEWED_AT) {
  throw new Error(
    `Use --retrieved-at=${REVIEWED_AT}; unreviewed timestamps are rejected before writes.`,
  );
}
const root = path.resolve(String(args.get("--root") || process.cwd()));
const requestedYear = args.get("--year");
const years = requestedYear === undefined
  ? [2020, 2024]
  : [Number(requestedYear)];
if (years.some((year) => !YEAR_SPECS[year])) {
  throw new Error("Pennsylvania Union County collection supports 2020 and 2024 only.");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function absolute(relativePath) {
  if (
    typeof relativePath !== "string"
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
  ) {
    throw new Error(`Unsafe Pennsylvania Union County artifact path: ${relativePath}`);
  }
  const resolved = path.resolve(root, ...relativePath.split("/"));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Pennsylvania Union County artifact escapes root: ${relativePath}`);
  }
  return resolved;
}

function serialize(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeBytes(relativePath, bytes) {
  const target = absolute(relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return {
    artifact: relativePath,
    byteCount: bytes.length,
    sha256: sha256(bytes),
  };
}

function writeJson(relativePath, value) {
  return writeBytes(relativePath, serialize(value));
}

function writeGzipJson(relativePath, value) {
  const uncompressed = Buffer.from(JSON.stringify(value), "utf8");
  const output = writeBytes(
    relativePath,
    gzipSync(uncompressed, { level: 9 }),
  );
  return {
    ...output,
    uncompressedByteCount: uncompressed.length,
    uncompressedSha256: sha256(uncompressed),
  };
}

function verifyPin(relativePath, expectedBytes, expectedSha256, context) {
  const target = absolute(relativePath);
  if (!existsSync(target)) {
    throw new Error(`${context} is missing: ${relativePath}`);
  }
  const bytes = readFileSync(target);
  if (bytes.length !== expectedBytes || sha256(bytes) !== expectedSha256) {
    throw new Error(`${context} bytes or SHA-256 drifted: ${relativePath}`);
  }
  return bytes;
}

function baseForYear(year) {
  return `${PENNSYLVANIA_PRECINCT_YEAR_SPECS[year].base}/official-county-followups/union-county`;
}

function pathsForYear(year) {
  const spec = YEAR_SPECS[year];
  const base = baseForYear(year);
  return {
    base,
    raw: `${base}/raw/pasda/${spec.filename}`,
    evidence: `${base}/source-evidence.json`,
    geometry:
      `${base}/normalized/pa-${year}-union-county-precincts-candidate.geojson.gz`,
    crosswalk:
      `${base}/crosswalk/pa-${year}-union-county-result-to-geometry-review.json`,
    report:
      `${base}/reports/pa-${year}-union-county-precinct-geometry-report.json`,
    manifest: `${base}/manifest.json`,
    canonicalResults:
      `${PENNSYLVANIA_PRECINCT_YEAR_SPECS[year].base}/normalized/pa-${year}-president-results.json.gz`,
  };
}

function sourceUrl(spec) {
  return `${ARCHIVE_ROOT_URL}/${spec.filename}`;
}

async function acquireRawArchive(year) {
  const spec = YEAR_SPECS[year];
  const paths = pathsForYear(year);
  if (existsSync(absolute(paths.raw))) return;
  if (args.has("--offline")) {
    throw new Error(`Missing retained artifact for offline replay: ${paths.raw}`);
  }
  const response = await fetch(sourceUrl(spec), {
    headers: {
      "user-agent": "CivicResultMaps Pennsylvania Union County precinct GIS/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Official Union County/PASDA retrieval failed (${response.status}) for ${sourceUrl(spec)}`,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== spec.byteCount || sha256(bytes) !== spec.sha256) {
    throw new Error(
      `Official Union County/PASDA archive drifted before retention: ${spec.filename}`,
    );
  }
  writeBytes(paths.raw, bytes);
}

function verifyInputs(year) {
  const spec = YEAR_SPECS[year];
  const stateSpec = PENNSYLVANIA_PRECINCT_YEAR_SPECS[year];
  const paths = pathsForYear(year);
  const resultPin = PENNSYLVANIA_RAW_SOURCE_PINS[stateSpec.resultPath];
  const readmePin = PENNSYLVANIA_RAW_SOURCE_PINS[stateSpec.readmePath];
  if (!resultPin || !readmePin) {
    throw new Error(`Pennsylvania ${year} official result pins are unavailable.`);
  }
  verifyPin(
    stateSpec.resultPath,
    resultPin[0],
    resultPin[1],
    `Pennsylvania ${year} official result source`,
  );
  verifyPin(
    stateSpec.readmePath,
    readmePin[0],
    readmePin[1],
    `Pennsylvania ${year} official result readme`,
  );
  return verifyPin(
    paths.raw,
    spec.byteCount,
    spec.sha256,
    `Pennsylvania ${year} Union County geometry source`,
  );
}

function archiveMember(entries, filename, context) {
  const matches = Object.entries(entries).filter(([name]) =>
    name.split(/[\\/]/).at(-1).toLowerCase() === filename.toLowerCase()
  );
  if (matches.length !== 1) {
    throw new Error(
      `${context} expected one ${filename} member, got ${matches.length}.`,
    );
  }
  return {
    name: matches[0][0],
    bytes: Buffer.from(matches[0][1]),
  };
}

function inspectArchive(spec, bytes) {
  const entries = unzipSync(bytes);
  const memberNames = Object.keys(entries).sort((left, right) =>
    left.localeCompare(right)
  );
  const stem = spec.filename.replace(/\.zip$/i, "");
  const requiredMembers = [
    `${stem}.CPG`,
    `${stem}.dbf`,
    `${stem}.prj`,
    `${stem}.sbn`,
    `${stem}.sbx`,
    `${stem}.shp`,
    `${stem}.shp.xml`,
    `${stem}.shx`,
    `${stem}.xml`,
  ];
  for (const member of requiredMembers) {
    archiveMember(entries, member, spec.filename);
  }
  if (memberNames.length !== requiredMembers.length) {
    throw new Error(
      `${spec.filename} expected ${requiredMembers.length} archive members, got ${memberNames.length}.`,
    );
  }

  const metadata = archiveMember(entries, `${stem}.xml`, spec.filename);
  const shapefileMetadata = archiveMember(
    entries,
    `${stem}.shp.xml`,
    spec.filename,
  );
  const projection = archiveMember(entries, `${stem}.prj`, spec.filename);
  const metadataText = metadata.bytes.toString("utf8");
  const shapefileMetadataText = shapefileMetadata.bytes.toString("utf8");
  const projectionText = projection.bytes.toString("utf8");
  for (const expected of [
    "<title>Union County - Voting Precincts</title>",
    "<attrlabl>PRECINCTID</attrlabl>",
    "<attrlabl>NAME</attrlabl>",
    "<attrlabl>COUNTY</attrlabl>",
    ...spec.metadataEvidence,
  ]) {
    if (!metadataText.includes(expected)) {
      throw new Error(`${spec.filename} metadata no longer contains ${expected}.`);
    }
  }
  for (const expected of spec.shapefileMetadataEvidence) {
    if (!shapefileMetadataText.includes(expected)) {
      throw new Error(
        `${spec.filename} shapefile metadata no longer contains ${expected}.`,
      );
    }
  }
  if (
    !metadataText.includes("The FILES and documentation are provided \"as is\"")
    || !metadataText.includes("The USER shall indemnify")
  ) {
    throw new Error(`${spec.filename} PASDA distribution disclaimer drifted.`);
  }
  if (
    !projectionText.includes(
      "NAD_1983_StatePlane_Pennsylvania_North_FIPS_3701_Feet",
    )
  ) {
    throw new Error(`${spec.filename} source CRS drifted.`);
  }
  return {
    memberNames,
    metadataMember: metadata.name,
    shapefileMetadataMember: shapefileMetadata.name,
    projectionMember: projection.name,
  };
}

function parsedCollection(value, context) {
  const collection = Array.isArray(value) ? value[0] : value;
  if (
    collection?.type !== "FeatureCollection"
    || !Array.isArray(collection.features)
  ) {
    throw new Error(`${context} did not parse as a GeoJSON FeatureCollection.`);
  }
  return collection;
}

function clean(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function nameKey(value) {
  const tokens = clean(value)
    .toUpperCase()
    .replaceAll("INDEPENDANT", "INDEPENDENT")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !["X", "W"].includes(token));
  return tokens
    .filter((token, index) => index === 0 || token !== tokens[index - 1])
    .join(" ");
}

function summedTotals(rows) {
  return rows.reduce(
    (totals, row) => ({
      democratic: totals.democratic + Number(row.democratic),
      republican: totals.republican + Number(row.republican),
      other: totals.other + Number(row.other),
      total: totals.total + Number(row.total),
    }),
    { democratic: 0, republican: 0, other: 0, total: 0 },
  );
}

function assertExactObject(actual, expected, context) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${context} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`,
    );
  }
}

function uniqueByName(rows, field, context) {
  const values = new Map();
  for (const row of rows) {
    const key = nameKey(row[field]);
    if (!key || values.has(key)) {
      throw new Error(`${context} has a blank or duplicate normalized name: ${key}.`);
    }
    values.set(key, row);
  }
  return values;
}

function featureId(year, precinctId) {
  return `pa:${year}:${PARENT_GEOID}:union:${String(precinctId).padStart(3, "0")}`;
}

function resultUnitCode(stateSpec, result) {
  return reportingUnitCode({
    state: STATE,
    electionId: stateSpec.electionId,
    reportingGrain: "precinct",
    parentGeoid: PARENT_GEOID,
    sourceUnitId: result.sourceUnitId,
  });
}

function assertVoteFree(value, context) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertVoteFree(entry, `${context}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:VOTES?|TOTALVOTES?|CANDIDATE|PARTY|G\d{2}PRE)/i.test(key)) {
      throw new Error(`${context} contains election-value property ${key}.`);
    }
    assertVoteFree(child, `${context}.${key}`);
  }
}

function canonicalBaseline(year, paths, officialRows) {
  const bytes = readFileSync(absolute(paths.canonicalResults));
  const document = JSON.parse(gunzipSync(bytes).toString("utf8"));
  const mappedRows = document.rows.filter(
    (row) => row.parentGeoid === PARENT_GEOID,
  );
  const excludedRows = document.exclusions.filter(
    (row) => row.parentGeoid === PARENT_GEOID,
  );
  const mappedTotals = summedTotals(mappedRows);
  const excludedTotals = summedTotals(excludedRows);
  const officialTotals = summedTotals(officialRows);
  if (
    mappedRows.length + excludedRows.length !== officialRows.length
    || mappedTotals.total + excludedTotals.total !== officialTotals.total
  ) {
    throw new Error(
      `Pennsylvania ${year} canonical Union County result partition drifted.`,
    );
  }
  const mappedIds = new Set(
    mappedRows.flatMap((row) => row.sourceComponentUnitIds ?? [row.sourceUnitId]),
  );
  const candidateAdditionalRows = officialRows.filter(
    (row) => !mappedIds.has(row.sourceUnitId),
  );
  return {
    manifestId: PENNSYLVANIA_PRECINCT_YEAR_SPECS[year].manifestId,
    resultArtifact: paths.canonicalResults,
    resultArtifactSha256: sha256(bytes),
    resultArtifactByteCount: bytes.length,
    mappedResultUnits: mappedRows.length,
    mappedTotals,
    excludedResultUnits: excludedRows.length,
    excludedTotals,
    candidateAdditionalResultUnits: candidateAdditionalRows.length,
    candidateAdditionalTotals: summedTotals(candidateAdditionalRows),
    candidateAdditionalRows: candidateAdditionalRows.map((row) => ({
      sourceUnitId: row.sourceUnitId,
      sourceDisplayName: row.sourceDisplayName,
      democratic: row.democratic,
      republican: row.republican,
      other: row.other,
      total: row.total,
    })),
  };
}

function artifactRecord(relativePath, extra) {
  const bytes = readFileSync(absolute(relativePath));
  return {
    localArtifactPath: relativePath,
    byteCount: bytes.length,
    sha256: sha256(bytes),
    electionYear: extra.electionYear,
    reportingGrain: extra.reportingGrain,
    sourceUrl: extra.sourceUrl,
    authority: extra.authority,
    derivation: extra.derivation,
    format: extra.format,
    note: extra.note,
  };
}

async function buildYear(year, rawBytes) {
  const spec = YEAR_SPECS[year];
  const stateSpec = PENNSYLVANIA_PRECINCT_YEAR_SPECS[year];
  const paths = pathsForYear(year);
  const archive = inspectArchive(spec, rawBytes);
  const sourceCollection = parsedCollection(
    await shp(rawBytes),
    `${spec.filename} shapefile archive`,
  );
  if (sourceCollection.features.length !== 27) {
    throw new Error(
      `${spec.filename} expected 27 source features, got ${sourceCollection.features.length}.`,
    );
  }

  const sourceFeatures = sourceCollection.features.map((feature, index) => {
    const precinctId = clean(feature.properties?.PRECINCTID);
    const sourceName = clean(feature.properties?.NAME);
    const county = clean(feature.properties?.COUNTY);
    if (
      !/^\d+$/.test(precinctId)
      || !sourceName
      || !["Union", "Union County"].includes(county)
      || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
    ) {
      throw new Error(`${spec.filename} feature ${index} has invalid identity or geometry.`);
    }
    return {
      precinctId,
      sourceName,
      county,
      geometry: feature.geometry,
    };
  });
  const expectedIds = Array.from({ length: 27 }, (_, index) =>
    String((index + 1) * 10)
  );
  const actualIds = sourceFeatures
    .map((feature) => feature.precinctId)
    .sort((left, right) => Number(left) - Number(right));
  assertExactObject(actualIds, expectedIds, `${spec.filename} PRECINCTID universe`);

  const official = parsePennsylvaniaOfficialResults(root, stateSpec);
  const officialRows = official.rows.filter(
    (row) => row.parentGeoid === PARENT_GEOID,
  );
  if (officialRows.length !== 27) {
    throw new Error(
      `Pennsylvania ${year} official results expected 27 Union County units, got ${officialRows.length}.`,
    );
  }
  const officialTotals = summedTotals(officialRows);
  assertExactObject(
    officialTotals,
    spec.expectedTotals,
    `Pennsylvania ${year} official Union County presidential totals`,
  );

  const sourceByName = uniqueByName(
    sourceFeatures,
    "sourceName",
    `${spec.filename} geometry`,
  );
  const resultByName = uniqueByName(
    officialRows,
    "sourceDisplayName",
    `Pennsylvania ${year} official Union County results`,
  );
  const sourceNames = [...sourceByName.keys()].sort();
  const resultNames = [...resultByName.keys()].sort();
  assertExactObject(
    sourceNames,
    resultNames,
    `Pennsylvania ${year} Union County normalized-name universe`,
  );

  const pairs = sourceNames.map((normalizedName) => {
    const source = sourceByName.get(normalizedName);
    const result = resultByName.get(normalizedName);
    const crmFeatureId = featureId(year, source.precinctId);
    const crmResultUnitCode = resultUnitCode(stateSpec, result);
    return {
      normalizedName,
      source,
      result,
      crmFeatureId,
      crmResultUnitCode,
      validatorFeatureId: `${PARENT_GEOID}|${crmFeatureId}`,
    };
  }).sort((left, right) =>
    left.result.sourceUnitId.localeCompare(right.result.sourceUnitId)
  );
  const directIdMatches = pairs.filter(
    (pair) => pair.result.sourceUnitId === pair.source.precinctId.padStart(7, "0"),
  ).length;
  if (directIdMatches === pairs.length) {
    throw new Error(
      `Pennsylvania ${year} Union County review unexpectedly implies direct source-ID equality.`,
    );
  }

  const geometry = {
    type: "FeatureCollection",
    metadata: {
      state: STATE,
      electionId: stateSpec.electionId,
      parentGeoid: PARENT_GEOID,
      parentName: PARENT_NAME,
      sourceAuthority: AUTHORITY,
      sourceArtifact: paths.raw,
      sourceSnapshotDate: spec.sourceSnapshotDate,
      featureMetadataDate: spec.featureMetadataDate,
      vintageStatus: spec.vintageStatus,
      servedCrs: "EPSG:4326",
      sourceFeatureCount: pairs.length,
      matchedResultUnitCount: pairs.length,
      reviewMethod:
        "complete county-scoped normalized-name bijection between the official Union County voting-precinct archive and Pennsylvania Department of State presidential result units",
      sourceIdCaveat:
        "Union County PRECINCTID is retained as geometry identity but is not treated as the Pennsylvania Department of State Precinct Code.",
    },
    features: pairs.map((pair) => ({
      type: "Feature",
      geometry: pair.source.geometry,
      properties: {
        CRM_FEATURE_ID: pair.crmFeatureId,
        CRM_PARENT_GEOID: PARENT_GEOID,
        CRM_RESULT_UNIT_CODE: pair.crmResultUnitCode,
        SOURCE_PRECINCT_ID: pair.source.precinctId,
        SOURCE_NAME: pair.source.sourceName,
        SOURCE_NORMALIZED_NAME: pair.normalizedName,
        SOURCE_GEOMETRY_AUTHORITY: "Union County, Pennsylvania",
        SOURCE_GEOMETRY_METHOD: "reviewed_county_scoped_normalized_name",
      },
    })),
  };
  assertVoteFree(geometry, `Pennsylvania ${year} Union County normalized geometry`);
  const geometryArtifact = writeGzipJson(paths.geometry, geometry);

  const zeroTotals = Object.fromEntries(
    Object.keys(officialTotals).map((key) => [key, 0]),
  );
  const crosswalk = {
    schemaVersion: 1,
    manifestId:
      `pa-${year}-union-county-official-precinct-geometry-candidate-v1`,
    state: STATE,
    electionId: stateSpec.electionId,
    geographyLevel: "precinct",
    resultSourceId: stateSpec.resultSourceId,
    generatedAt: REVIEWED_AT,
    rows: pairs.map((pair) => ({
      resultUnitCode: pair.crmResultUnitCode,
      sourceUnitId: pair.result.sourceUnitId,
      sourceDisplayName: pair.result.sourceDisplayName,
      parentGeoid: PARENT_GEOID,
      reportingGrain: "precinct",
      isGeographic: true,
      relationships: [{
        sourceFeatureId: pair.validatorFeatureId,
        relationshipType: "one_to_one",
        matchMethod: "reviewed_name",
        reviewStatus: "reviewed",
        confidence: "high",
        note:
          `The unique county-scoped normalized name ${pair.normalizedName} pairs official DOS unit ${pair.result.sourceUnitId} with Union County PRECINCTID ${pair.source.precinctId}. The complete 27-name universes are identical; PRECINCTID is not treated as the DOS Precinct Code, and no geometry-source vote value is used.`,
      }],
    })),
    reconciliation: {
      status: "passed",
      scopes: [{
        scopeType: "parent",
        scopeId: PARENT_GEOID,
        resultTotals: officialTotals,
        mappedTotals: officialTotals,
        deltas: zeroTotals,
      }],
      caveat:
        "This reconciliation proves the reviewed Union County package only. It does not imply statewide Pennsylvania geometry coverage.",
    },
  };
  const crosswalkArtifact = writeJson(paths.crosswalk, crosswalk);

  const baseline = canonicalBaseline(year, paths, officialRows);
  if (
    baseline.mappedResultUnits !== spec.expectedCurrentMappedUnits
    || baseline.mappedTotals.total !== spec.expectedCurrentMappedVotes
    || baseline.candidateAdditionalResultUnits
      !== spec.expectedCandidateAdditionalUnits
    || baseline.candidateAdditionalTotals.total
      !== spec.expectedCandidateAdditionalVotes
  ) {
    throw new Error(
      `Pennsylvania ${year} canonical Union County baseline drifted: `
      + JSON.stringify({
        mappedResultUnits: baseline.mappedResultUnits,
        mappedVotes: baseline.mappedTotals.total,
        candidateAdditionalResultUnits: baseline.candidateAdditionalResultUnits,
        candidateAdditionalVotes: baseline.candidateAdditionalTotals.total,
      }),
    );
  }

  const rawGeometryArtifact = artifactRecord(paths.raw, {
    electionYear: year,
    reportingGrain: "precinct",
    sourceUrl: sourceUrl(spec),
    authority: AUTHORITY,
    derivation: "Exact retained ZIP downloaded from the PASDA Union County historical voting-precinct archive.",
    format: "ESRI Shapefile ZIP with embedded FGDC and ArcGIS metadata",
    note:
      `Official Union County voting-precinct snapshot for ${spec.snapshotMonth}; expected 27 polygon features and the PRECINCTID, NAME, and COUNTY fields.`,
  });
  const resultArtifact = artifactRecord(stateSpec.resultPath, {
    electionYear: year,
    reportingGrain: "precinct",
    sourceUrl: stateSpec.resultSourceUrl,
    authority: "Pennsylvania Department of State",
    derivation: "Exact retained official election-return text parsed by the Pennsylvania precinct geometry collector.",
    format: "pipe-delimited TXT",
    note:
      `Official ${year} presidential result identity and vote source; all 27 Union County source units are included.`,
  });
  const readmeArtifact = artifactRecord(stateSpec.readmePath, {
    electionYear: year,
    reportingGrain: "precinct",
    sourceUrl: stateSpec.readmeSourceUrl,
    authority: "Pennsylvania Department of State",
    derivation: "Exact retained official readme used to decode county and precinct result fields.",
    format: "TXT",
    note: "Official field and county-code documentation for the election-return artifact.",
  });

  const nameComparison = pairs.map((pair) => ({
    normalizedName: pair.normalizedName,
    resultSourceUnitId: pair.result.sourceUnitId,
    resultSourceDisplayName: pair.result.sourceDisplayName,
    resultVtdCode: pair.result.vtdCode,
    geometryPrecinctId: pair.source.precinctId,
    geometrySourceName: pair.source.sourceName,
    geometryFeatureId: pair.crmFeatureId,
  }));
  const caveats = [
    "This is a complete reviewed Union County package, not a complete statewide Pennsylvania package.",
    "The crosswalk uses a unique complete county-scoped normalized-name bijection. Union County PRECINCTID and Pennsylvania Department of State Precinct Code are different identity systems and are never equated.",
    "Geometry-source attributes that could be mistaken for election values are stripped; displayed vote values must continue to come only from the official Pennsylvania Department of State result artifact.",
    ...(spec.vintageStatus === "election_date_confirmed"
      ? []
      : [
        "The 2024 archive was exported before Election Day and its complete name universe matches the official results, but embedded feature SyncDate/ModDate values remain 2021-10-12; Election Day boundary effectiveness is not independently established.",
      ]),
    "The PASDA metadata provides an as-is warranty and indemnity disclaimer but no explicit open-data license; public delivery remains blocked pending terms review and a separate guarded release.",
  ];
  const evidence = {
    schemaVersion: 1,
    id: `pa-${year}-union-county-official-precinct-geometry-source-evidence-v1`,
    state: STATE,
    election: {
      id: stateSpec.electionId,
      date: stateSpec.date,
      year,
      type: "general",
      office: "president",
    },
    authority: AUTHORITY,
    retrievedAt: REVIEWED_AT,
    sourceIndexUrl: DATASET_URL,
    historicalArchiveUrl: `${ARCHIVE_ROOT_URL}/`,
    sourceCrs:
      "NAD 1983 StatePlane Pennsylvania North FIPS 3701 Feet (EPSG:2271)",
    servedCrs: "EPSG:4326",
    artifacts: [rawGeometryArtifact, resultArtifact, readmeArtifact],
    archiveInspection: {
      archiveMembers: archive.memberNames,
      metadataMember: archive.metadataMember,
      shapefileMetadataMember: archive.shapefileMetadataMember,
      projectionMember: archive.projectionMember,
      sourceFeatureCount: sourceFeatures.length,
      uniquePrecinctIdCount: new Set(
        sourceFeatures.map((feature) => feature.precinctId),
      ).size,
    },
    boundaryContext: {
      parentGeoid: PARENT_GEOID,
      parentName: PARENT_NAME,
      boundarySnapshotMonth: spec.snapshotMonth,
      sourceSnapshotDate: spec.sourceSnapshotDate,
      featureMetadataDate: spec.featureMetadataDate,
      vintageStatus: spec.vintageStatus,
      electionDateApplicabilityEstablished:
        spec.vintageStatus === "election_date_confirmed",
      electionDateApplicabilityBasis:
        spec.vintageStatus === "election_date_confirmed"
          ? "The official county voting-precinct snapshot has feature SyncDate/ModDate metadata shortly before the election, and its complete unique 27-name universe is identical, after documented token normalization and one source spelling correction, to the 27 official DOS presidential result units for the county."
          : "The official archive has a pre-election 2024-09-05 export lineage and a complete unique 27-name universe identical to the official DOS county result units, but embedded feature SyncDate/ModDate values remain 2021-10-12; those facts do not independently prove Election Day boundary effectiveness.",
      metadataOrigin: "Union County, Pennsylvania",
      distributor: "Pennsylvania Spatial Data Access (PASDA)",
      licenseOrTerms: LICENSE_OR_TERMS,
    },
    resultIdentity: {
      sourceId: stateSpec.resultSourceId,
      canonicalIdentity: "DOS County Code plus DOS Precinct Code",
      parentGeoid: PARENT_GEOID,
      sourceResultUnits: officialRows.length,
      candidateRows: officialRows.reduce(
        (count, row) => count + row.candidates.length,
        0,
      ),
      officialCountyTotals: officialTotals,
      officialStatewideResultUnits: official.sourceUnitCount,
      officialStatewideTotals: official.totals,
    },
    exactNameComparison: {
      status: "reviewed_complete_county_bijection",
      geometryFeatures: sourceFeatures.length,
      resultUnits: officialRows.length,
      matchedResultUnits: pairs.length,
      geometryOnly: [],
      resultOnly: [],
      directIdMatches,
      directIdEqualityUsed: false,
      documentedNormalization:
        "Uppercase and punctuation normalization; remove DOS structural X/W tokens; collapse consecutive duplicate DOS breakdown tokens; correct the geometry-source spelling INDEPENDANT to INDEPENDENT.",
      rows: nameComparison,
    },
    canonicalPackageComparison: baseline,
    expectedOutput: {
      normalizedFeatures: 27,
      reviewedRelationships: 27,
      parentScopes: 1,
      officialCountyTotals: spec.expectedTotals,
      delivery: null,
    },
    caveats,
  };
  const evidenceArtifact = writeJson(paths.evidence, evidence);

  const report = {
    schemaVersion: 1,
    state: STATE,
    electionId: stateSpec.electionId,
    generatedAt: REVIEWED_AT,
    disposition: "reviewed_union_county_candidate_delivery_blocked",
    parentGeoid: PARENT_GEOID,
    sourceFeatureCount: sourceFeatures.length,
    resultUnitCount: officialRows.length,
    colorableResultUnits: pairs.length,
    matchedResultUnits: pairs.length,
    unmatchedResultUnits: 0,
    reviewedRelationshipRecords: pairs.length,
    directIdEqualityUsed: false,
    officialCountyTotals: officialTotals,
    canonicalPackageComparison: baseline,
    statewideScope: {
      officialSourceUnits: official.sourceUnitCount,
      candidatePackageSourceUnits: officialRows.length,
      remainingSourceUnits: official.sourceUnitCount - officialRows.length,
      officialStatewideVotes: official.totals.total,
      candidatePackageVotes: officialTotals.total,
      remainingVotes: official.totals.total - officialTotals.total,
    },
    reconciliation: crosswalk.reconciliation,
    votesAssignedFromGeometry: 0,
    delivery: null,
    caveats,
  };
  const reportArtifact = writeJson(paths.report, report);

  const manifest = {
    schemaVersion: 1,
    id: crosswalk.manifestId,
    state: STATE,
    election: evidence.election,
    geography: {
      level: "precinct",
      parentLevel: "county",
      boundaryVintage:
        `Union County official Voting Precincts ${spec.snapshotMonth} archive (${spec.sourceSnapshotDate} archive evidence; ${spec.featureMetadataDate} feature metadata)`,
      vintageStatus: spec.vintageStatus,
      derivationMethod: "official_export",
    },
    source: {
      authority: AUTHORITY,
      url: DATASET_URL,
      retrievedAt: REVIEWED_AT,
      artifact: evidenceArtifact.artifact,
      sha256: evidenceArtifact.sha256,
      byteCount: evidenceArtifact.byteCount,
      format: "precinct-source-evidence+json",
      licenseOrTerms: LICENSE_OR_TERMS,
    },
    normalization: {
      script: SCRIPT_PATH,
      sourceCrs:
        "NAD 1983 StatePlane Pennsylvania North FIPS 3701 Feet (EPSG:2271)",
      servedCrs: "EPSG:4326",
      artifact: geometryArtifact.artifact,
      sha256: geometryArtifact.sha256,
      byteCount: geometryArtifact.byteCount,
      featureCount: geometry.features.length,
      sourceFeatureIdFields: ["CRM_FEATURE_ID"],
      parentIdFields: ["CRM_PARENT_GEOID"],
    },
    crosswalk: {
      status: "reviewed",
      resultSourceId: stateSpec.resultSourceId,
      artifact: crosswalkArtifact.artifact,
      sha256: crosswalkArtifact.sha256,
      byteCount: crosswalkArtifact.byteCount,
      resultUnits: officialRows.length,
      colorableResultUnits: pairs.length,
      matchedResultUnits: pairs.length,
      unmatchedResultUnits: 0,
      nonGeographicResultUnits: 0,
      sourceAliasResultUnits: 0,
      relationships: {
        oneToOne: pairs.length,
        oneToMany: 0,
        manyToOne: 0,
        unmatched: 0,
        nonGeographic: 0,
        sourceAlias: 0,
        pendingReview: 0,
      },
      reviewedRelationshipRecords: pairs.length,
      reviewedNoDataFeatures: 0,
      methods: ["reviewed_name"],
    },
    validation: {
      status: "blocked",
      geometryValid: true,
      rowLevelRenderingSafe: false,
      parentTotalsReconciled: true,
      resultTotalsReconciled: true,
      errors: [
        "This reviewed package covers Union County only; statewide Pennsylvania geometry coverage remains incomplete.",
        "An immutable parent-scoped public delivery package and guarded release review have not been completed.",
        ...(spec.vintageStatus === "election_date_confirmed"
          ? []
          : [
            "The pre-election archive export and complete name match do not independently establish that the polygon boundaries were effective on Election Day.",
          ]),
        "PASDA metadata does not state an explicit open-data license; terms review is required before delivery.",
      ],
      warnings: [
        `All ${pairs.length} official ${year} Union County presidential result units match one unique official county polygon by the complete normalized-name universe.`,
        "Union County PRECINCTID is retained as geometry identity but is not treated as the DOS Precinct Code.",
        "No geometry-source election value is retained or assigned; all result totals come only from the official Pennsylvania Department of State artifact.",
      ],
    },
    delivery: null,
    caveats,
  };
  const manifestArtifact = writeJson(paths.manifest, manifest);

  return {
    year,
    manifest: manifestArtifact,
    report: reportArtifact,
    evidence: evidenceArtifact,
    normalizedGeometry: geometryArtifact,
    crosswalk: crosswalkArtifact,
    geometryFeatures: geometry.features.length,
    matchedResultUnits: pairs.length,
    officialCountyVotes: officialTotals.total,
    candidateAdditionalUnits: baseline.candidateAdditionalResultUnits,
    candidateAdditionalVotes: baseline.candidateAdditionalTotals.total,
    delivery: null,
  };
}

for (const year of years) await acquireRawArchive(year);
const verifiedInputs = new Map(
  years.map((year) => [year, verifyInputs(year)]),
);
const outputs = [];
for (const year of years) {
  outputs.push(await buildYear(year, verifiedInputs.get(year)));
}
console.log(JSON.stringify({ reviewedAt: REVIEWED_AT, outputs }, null, 2));
