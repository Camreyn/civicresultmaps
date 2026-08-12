import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { PDFParse } from "pdf-parse";
import shp from "shpjs";
import { reportingUnitCode } from "../src/lib/precinct-geography.ts";

const STATE = "NV";
const REVIEWED_RETRIEVAL = "2026-08-11T12:00:00.000Z";
const yearArgument = process.argv.find((value) => value.startsWith("--year="))?.slice(7);
const rootArgument = process.argv.find((value) => value.startsWith("--root="))?.slice(7);
const retrievedAt = process.argv.find((value) => value.startsWith("--retrieved-at="))?.slice(15);
const year = Number(yearArgument);
if (![2012, 2016, 2020, 2024].includes(year)) {
  throw new Error("Use --year=2012, --year=2016, --year=2020, or --year=2024.");
}
if (retrievedAt !== REVIEWED_RETRIEVAL) {
  throw new Error(`Use --retrieved-at=${REVIEWED_RETRIEVAL} for deterministic replay.`);
}

const root = path.resolve(rootArgument || process.cwd());
const absolute = (file) => path.resolve(root, ...file.split("/"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const CANONICAL_LF_INPUTS = new Set([
  "data/precinct-geometry/NV/2012-11-06-general/raw/nevada-secretary-of-state/2012-general-precinct.csv",
  "data/precinct-geometry/NV/2012-11-06-general/raw/clark-county/prec2012_p.geojson",
  "data/precinct-geometry/NV/2024-11-05-general/raw/nevada-secretary-of-state/2024-general-president.csv",
]);
function canonicalLf(bytes) {
  const output = Buffer.allocUnsafe(bytes.length);
  let writeIndex = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 13 && bytes[index + 1] === 10) continue;
    output[writeIndex] = bytes[index];
    writeIndex += 1;
  }
  return output.subarray(0, writeIndex);
}
const read = (file) => {
  const bytes = readFileSync(absolute(file));
  return CANONICAL_LF_INPUTS.has(file)
    ? canonicalLf(bytes)
    : bytes;
};
const readText = (file) => read(file).toString("utf8").replace(/^\uFEFF/, "");

function write(file, value) {
  const bytes = Buffer.isBuffer(value) ? value : jsonBytes(value);
  mkdirSync(path.dirname(absolute(file)), { recursive: true });
  writeFileSync(absolute(file), bytes);
  return { localArtifactPath: file, byteCount: bytes.length, sha256: sha256(bytes) };
}

const ELECTIONS = Object.freeze({
  2012: { id: "2012-11-06-general", date: "2012-11-06" },
  2016: { id: "2016-11-08-general", date: "2016-11-08" },
  2020: { id: "2020-11-03-general", date: "2020-11-03" },
  2024: { id: "2024-11-05-general", date: "2024-11-05" },
});

const COUNTY_FIPS = Object.freeze({
  "Carson City": "510",
  Churchill: "001",
  Clark: "003",
  Douglas: "005",
  Elko: "007",
  Esmeralda: "009",
  Eureka: "011",
  Humboldt: "013",
  Lander: "015",
  Lincoln: "017",
  Lyon: "019",
  Mineral: "021",
  Nye: "023",
  Pershing: "027",
  Storey: "029",
  Washoe: "031",
  "White Pine": "033",
});
const COUNTY_BY_FIPS = new Map(Object.entries(COUNTY_FIPS).map(([name, fips]) => [fips, name]));
const parentGeoid = (fips) => `32${String(fips).padStart(3, "0")}`;
const normalizeNumeric = (value) => String(value ?? "").trim().replace(/^0+(?=\d)/, "") || "0";

const INPUTS = Object.freeze({
  2012: [
    ["data/precinct-geometry/NV/2012-11-06-general/raw/nevada-secretary-of-state/2012-general-precinct.csv", 7_085_925, "1743593fd0462cf273ffdd96b89a923c2e562395f52428e2b5ddc6ceebcae724"],
    ["data/precinct-geometry/NV/2012-11-06-general/raw/us-census/tl_2012_32_vtd10.zip", 5_144_311, "eb52fc52993abc152911b509d5d567675113bf5782b187e2033cc1772579a855"],
    ["data/precinct-geometry/NV/2012-11-06-general/raw/clark-county/Election_Archive.zip", 8_604_501, "97cd8af08bd142263a5c956c1b818be42f5703d51e71fa87ed32fe24ae06bd2e"],
    ["data/precinct-geometry/NV/2012-11-06-general/raw/clark-county/prec2012_p.geojson", 3_016_512, "15d595cc43fcc7ea0af77a190382bfbdcd4466a5c9417e017e45e228e0141f68"],
    ["data/precinct-geometry/NV/2012-11-06-general/raw/washoe-county/Precinct-Changelog.xlsx", 150_410, "67ad36111d16b28e8f6ea90a5a219cbbbfd9fd8ced3f41931eecd239bae7845c"],
    ["data/precinct-geometry/NV/2016-11-08-general/raw/vest/nv_2016.zip", 6_798_273, "4e3ddd59f31d61f55ff2d94bd03eb9d3ba0771c910b9509889b76eea209e476d"],
  ],
  2016: [
    ["data/precinct-geometry/NV/2016-11-08-general/raw/nevada-secretary-of-state/2016-general-precinct.csv", 7_512_605, "17cf2360147e58211b29556303a2a29d5e2ba0f98d13df78e28a983c0b9dc184"],
    ["data/precinct-geometry/NV/2016-11-08-general/raw/vest/nv_2016.zip", 6_798_273, "4e3ddd59f31d61f55ff2d94bd03eb9d3ba0771c910b9509889b76eea209e476d"],
    ["data/precinct-geometry/NV/2016-11-08-general/raw/vest/dataverse-v89-license-evidence.json", 1_789, "55f331209a2bd2913185b33e8da94ceb26b141bc597a40c424d98cdde134f7b4"],
    ["data/precinct-geometry/NV/2016-11-08-general/raw/nevada-legislative-counsel-bureau/ElectionResults2016USPres.pdf", 8_605_504, "e61953a77b75326fbfb577eae4e3261e07dd97a253aa32ee0a4cfd19f8cec53a"],
  ],
  2020: [
    ["data/precinct-geometry/NV/2020-11-03-general/raw/nevada-secretary-of-state/2020-general-precinct.csv", 15_255_758, "1b87ec33209a6352270e6a5a3d0438eaae0b7ed9a921f035ef14fb56a166467a"],
    ["data/precinct-geometry/NV/2020-11-03-general/raw/vest/nv_2020.zip", 6_840_584, "bc6befa8917bb309540ff3414c036a577730bd301ecef119797b919c0abb2d90"],
    ["data/precinct-geometry/NV/2020-11-03-general/raw/vest/dataverse-v21-license-evidence.json", 1_374, "394a78723abad39926d99eb2c7b91a5d7260b6931a403e2217ca063a49497099"],
  ],
  2024: [
    ["data/precinct-geometry/NV/2024-11-05-general/raw/nevada-secretary-of-state/2024-general-president.csv", 898_445, "5a7c94660e3e0f32229cfb4e816b2819360277973b80ac3308c531fd7a08dda7"],
    ["data/precinct-geometry/NV/2024-11-05-general/raw/nevada-legislative-counsel-bureau/2024-precincts.geojson", 20_148_616, "04accb644e45d137ccf0b0e7ca414c9b0af49a3efb74a70687d29ffcdf7c84cc"],
    ["data/precinct-geometry/NV/2024-11-05-general/raw/nevada-legislative-counsel-bureau/2024-precincts-item-metadata.json", 1_775, "72b5f30fc8eafb7e790c559858afe94c9f9419a9078ee09a9ee39ea849edef70"],
    ["data/precinct-geometry/NV/2024-11-05-general/raw/nevada-legislative-counsel-bureau/2024-precincts-layer-metadata.json", 14_575, "098702342f6784da672afae2039712a4086366adfa7532f9c7667ef50fc38bb2"],
    ["data/precinct-geometry/NV/2024-11-05-general/raw/esri/arcgis-online-terms-of-use.html", 13_379, "3360bbd0c1569c599451f2cccee5b3dc2d4c2fe8ff1c79056196fc663cc8d65b"],
  ],
});

function verifyInputs() {
  for (const [file, byteCount, expectedSha] of INPUTS[year]) {
    const bytes = read(file);
    if (bytes.length !== byteCount || sha256(bytes) !== expectedSha) {
      throw new Error(`Raw artifact tampering or source drift detected before derived write: ${file}`);
    }
  }
}

function parseCsv(text, headerPredicate = (row) => row[0] === "Jurisdiction" && row[1] === "Precinct") {
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
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const headerIndex = rows.findIndex(headerPredicate);
  if (headerIndex < 0) throw new Error("CSV header was not found");
  const headers = rows[headerIndex].map((value) => value.replace(/^\uFEFF/, ""));
  return rows.slice(headerIndex + 1)
    .filter((values) => values.some((value) => value !== ""))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function readOfficialPrecinctCsv(targetYear) {
  const election = ELECTIONS[targetYear];
  const file = `data/precinct-geometry/NV/${election.id}/raw/nevada-secretary-of-state/${targetYear}-general-precinct.csv`;
  const bytes = read(file);
  const text = targetYear === 2020
    ? new TextDecoder("windows-1252").decode(bytes)
    : bytes.toString("utf8");
  return text.replace(/^\uFEFF/, "");
}

function roundCoordinates(value, digits = 6) {
  if (Array.isArray(value)) return value.map((item) => roundCoordinates(item, digits));
  if (typeof value === "number") {
    const rounded = Number(value.toFixed(digits));
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  return value;
}

function normalizedFeature(feature, featureId, fips, extra = {}) {
  const geometry = feature?.geometry;
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    throw new Error(`Feature ${fips}|${featureId} is not polygonal`);
  }
  return {
    type: "Feature",
    properties: {
      CRM_FEATURE_ID: String(featureId),
      CRM_PARENT_GEOID: parentGeoid(fips),
      ...extra,
    },
    geometry: { type: geometry.type, coordinates: roundCoordinates(geometry.coordinates) },
  };
}

function normalizeNevadaResultCode(county, precinct) {
  const value = String(precinct ?? "").trim();
  if (county === "Lyon") return normalizeLyonLabel(value);
  if (county === "Carson City") return normalizeNumeric(value.replace(/^Precinct\s+/i, ""));
  if (["Douglas", "Lander"].includes(county)) return normalizeNumeric(value.match(/\d+/)?.[0] ?? value);
  if (["Clark", "Washoe"].includes(county) && /^\d{6}$/.test(value)) return normalizeNumeric(value.slice(0, 4));
  const numeric = value.match(/(?:Precinct(?:\s+No\.)?\s*)?(\d+(?:-\d+)?)/i)?.[1];
  return numeric ? normalizeNumeric(numeric) : value.trim();
}

function normalizeLyonLabel(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/^PRECINCT\s+NO\.\s*\d+\s*-\s*/, "")
    .replace(/#/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalized2024Code(county, precinct) {
  const value = String(precinct ?? "").trim();
  if (county === "Douglas") return normalizeNumeric(value.match(/^\d+/)?.[0] ?? value);
  if (county === "Lander") return normalizeNumeric(value.replace(/^Precinct\s+/i, ""));
  if (county === "Washoe") return value.match(/(\d{4})$/)?.[1] ?? value.toUpperCase();
  return /^\d+$/.test(value) ? normalizeNumeric(value) : value.toUpperCase();
}

function groupVotes(candidateVotes, democraticField, republicanField) {
  const democratic = Number(candidateVotes[democraticField] ?? 0);
  const republican = Number(candidateVotes[republicanField] ?? 0);
  const other = Object.entries(candidateVotes)
    .filter(([candidate]) => ![democraticField, republicanField].includes(candidate))
    .reduce((sum, [, votes]) => sum + Number(votes ?? 0), 0);
  return { democratic, republican, other, total: democratic + republican + other };
}

function createUnit({ county, sourceUnitId, sourceDisplayName, candidateVotes, suppressedCandidates = [], mapping = null, exclusionReason = null }) {
  const fips = COUNTY_FIPS[county];
  if (!fips) throw new Error(`Unknown Nevada county-equivalent: ${county}`);
  return {
    county,
    parentGeoid: parentGeoid(fips),
    sourceUnitId: String(sourceUnitId),
    sourceDisplayName: String(sourceDisplayName),
    candidateVotes,
    suppressedCandidates,
    mapping,
    exclusionReason,
  };
}

function summarizeCrosswalk(rows) {
  const summary = {
    resultUnits: rows.length,
    colorableResultUnits: rows.length,
    matchedResultUnits: rows.length,
    unmatchedResultUnits: 0,
    nonGeographicResultUnits: 0,
    sourceAliasResultUnits: 0,
    relationships: { oneToOne: 0, oneToMany: 0, manyToOne: 0, unmatched: 0, nonGeographic: 0, sourceAlias: 0, pendingReview: 0 },
  };
  for (const row of rows) {
    const type = row.relationships[0].relationshipType;
    if (type === "one_to_one") summary.relationships.oneToOne += 1;
    else if (type === "one_to_many") summary.relationships.oneToMany += 1;
    else if (type === "many_to_one") summary.relationships.manyToOne += 1;
  }
  return summary;
}

function crosswalkRow(unit, electionId) {
  const relationshipType = unit.mapping.featureIds.length === 1 ? "one_to_one" : "one_to_many";
  return {
    resultUnitCode: reportingUnitCode({ state: STATE, electionId, reportingGrain: "precinct", parentGeoid: unit.parentGeoid, sourceUnitId: unit.sourceUnitId }),
    sourceUnitId: unit.sourceUnitId,
    sourceDisplayName: unit.sourceDisplayName,
    parentGeoid: unit.parentGeoid,
    reportingGrain: "precinct",
    isGeographic: true,
    relationships: unit.mapping.featureIds.map((featureId) => ({
      sourceFeatureId: `${unit.parentGeoid}|${featureId}`,
      relationshipType,
      matchMethod: unit.mapping.matchMethod,
      reviewStatus: "reviewed",
      confidence: unit.mapping.confidence,
      note: unit.mapping.note,
    })),
  };
}

function reconciliation(units) {
  const grouped = new Map([[STATE, 0]]);
  for (const unit of units) {
    grouped.set(STATE, grouped.get(STATE) + unit.groupedVotes.total);
    grouped.set(unit.parentGeoid, (grouped.get(unit.parentGeoid) ?? 0) + unit.groupedVotes.total);
  }
  return {
    status: "passed",
    scopes: [...grouped.entries()].map(([scopeId, presidentVotes]) => ({
      scopeType: scopeId === STATE ? "state" : "parent",
      scopeId,
      resultTotals: { presidentVotes },
      mappedTotals: { presidentVotes },
      deltas: { presidentVotes: 0 },
    })),
    caveat: "Reconciliation covers only colorable rows retained by the reviewed privacy and geography filters; source-universe exclusions remain enumerated in the report.",
  };
}

async function validate2016OfficialMapReconciliation(units) {
  const pdfPath = "data/precinct-geometry/NV/2016-11-08-general/raw/nevada-legislative-counsel-bureau/ElectionResults2016USPres.pdf";
  const parser = new PDFParse({ data: read(pdfPath) });
  let text;
  try {
    text = (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
  for (const requiredText of [
    "2016 Presidential Race",
    "Nevada Election Results by Precinct",
    "Clinton (D) 47.92%, Trump (R) 45.50%, all other candidates 6.58%",
    "Election data from the Nevada Secretary of State.",
  ]) {
    if (!text.includes(requiredText)) {
      throw new Error(
        "Nevada 2016 official LCB reconciliation map text drifted: "
        + requiredText,
      );
    }
  }
  const totals = units.reduce(
    (sum, unit) => ({
      democratic: sum.democratic + unit.groupedVotes.democratic,
      republican: sum.republican + unit.groupedVotes.republican,
      other: sum.other + unit.groupedVotes.other,
      total: sum.total + unit.groupedVotes.total,
    }),
    { democratic: 0, republican: 0, other: 0, total: 0 },
  );
  const expectedTotals = {
    democratic: 537_405,
    republican: 510_920,
    other: 73_891,
    total: 1_122_216,
  };
  if (JSON.stringify(totals) !== JSON.stringify(expectedTotals)) {
    throw new Error("Nevada 2016 official known-colorable presidential totals drifted");
  }
  return {
    status: "official_precinct_rows_reconciled_to_lcb_context",
    authority: "Nevada Legislative Counsel Bureau using Nevada Secretary of State election data",
    artifact: pdfPath,
    normalizedKnownColorableTotals: totals,
    publishedPercentages: {
      democratic: 47.92,
      republican: 45.5,
      other: 6.58,
    },
    limitation:
      "The official map confirms the statewide source authority and published percentages. The normalized known-colorable totals are intentionally lower because official privacy-suppressed major-party cells and non-geographic categories are excluded rather than estimated.",
  };
}

function isReviewedSpecialResultUnit(targetYear, unit) {
  const display = String(unit.sourceDisplayName ?? "").trim().toUpperCase();
  if (targetYear === 2016) {
    return /^PRECINCT (?:88|99)$/.test(display)
      || (unit.county === "Carson City" && ["997", "998", "999"].includes(unit.sourceUnitId))
      || (unit.county === "Clark" && ["9991", "9993", "9994", "9995", "9996"].includes(unit.sourceUnitId))
      || (unit.county === "Washoe" && ["9600", "9700", "9800", "9900"].includes(unit.sourceUnitId));
  }
  return display === "PRECINCT 88"
    || (unit.county === "Carson City" && unit.sourceUnitId === "998")
    || (unit.county === "Clark" && ["9995", "9996"].includes(unit.sourceUnitId))
    || (unit.county === "Washoe" && ["FOC", "NEW RESIDENT", "NO FIXED RES", "PROVISIONAL"].includes(unit.sourceUnitId));
}

async function buildOfficialResultsWithVestGeometry(targetYear) {
  const election = ELECTIONS[targetYear];
  const zipPath = `data/precinct-geometry/NV/${election.id}/raw/vest/nv_${targetYear}.zip`;
  const parsed = await shp(read(zipPath));
  const source = Array.isArray(parsed) ? parsed[0] : parsed;
  const settings = targetYear === 2016
    ? {
        dem: "CLINTON, HILLARY",
        rep: "TRUMP, DONALD J.",
        resultRows: 12_012,
        sourceUnits: 2_002,
        geometryFeatures: 2_067,
        geometryOnlyFeatures: 105,
        colorableUnits: 1_843,
        excludedUnits: 159,
        vestVoteFields: ["G16PREDCLI", "G16PRERTRU", "G16PRELJOH", "G16PREICAS", "G16PRENROC", "G16PREONON"],
      }
    : {
        dem: "BIDEN, JOSEPH R.",
        rep: "TRUMP, DONALD J.",
        resultRows: 10_060,
        sourceUnits: 2_012,
        geometryFeatures: 2_094,
        geometryOnlyFeatures: 103,
        colorableUnits: 1_869,
        excludedUnits: 143,
        vestVoteFields: ["G20PREDBID", "G20PRERTRU", "G20PRELJOR", "G20PREIBLA", "G20PREONON"],
      };
  const sourceFeatureByKey = new Map();
  const featureRows = source.features.map((feature) => {
    const fips = String(feature.properties.COUNTYFP).padStart(3, "0");
    const county = COUNTY_BY_FIPS.get(fips);
    if (!county) throw new Error(`Nevada ${targetYear} VEST feature has unknown county FIPS ${fips}`);
    const sourcePrecinct = String(feature.properties.NAME).trim();
    const code = normalizeNevadaResultCode(county, sourcePrecinct);
    const key = `${parentGeoid(fips)}|${code}`;
    if (sourceFeatureByKey.has(key)) throw new Error(`Nevada ${targetYear} normalized VEST identities are not unique: ${key}`);
    sourceFeatureByKey.set(key, feature);
    return normalizedFeature(feature, code, fips, {
      SOURCE_PRECINCT: sourcePrecinct,
      SOURCE_COUNTY_FIPS: fips,
      SOURCE_KIND: "VEST election-specific geometry reconstruction",
    });
  }).sort((left, right) => `${left.properties.CRM_PARENT_GEOID}|${left.properties.CRM_FEATURE_ID}`.localeCompare(`${right.properties.CRM_PARENT_GEOID}|${right.properties.CRM_FEATURE_ID}`, "en", { numeric: true }));
  const featureKeys = new Set(featureRows.map((feature) => `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`));
  if (featureKeys.size !== featureRows.length || featureRows.length !== settings.geometryFeatures) {
    throw new Error(`Nevada ${targetYear} VEST geometry identities drifted`);
  }

  const sourceRows = parseCsv(readOfficialPrecinctCsv(targetYear))
    .filter((row) => row.Contest === "President and Vice President of the United States");
  const unitMap = new Map();
  for (const row of sourceRows) {
    const county = String(row.Jurisdiction).trim();
    const code = normalizeNevadaResultCode(county, row.Precinct);
    const key = `${county}|${code}`;
    const unit = unitMap.get(key) ?? createUnit({ county, sourceUnitId: code, sourceDisplayName: row.Precinct, candidateVotes: {}, suppressedCandidates: [] });
    if (Object.hasOwn(unit.candidateVotes, row.Selection) || unit.suppressedCandidates.includes(row.Selection)) {
      throw new Error(`Nevada ${targetYear} duplicate official candidate cell: ${key}|${row.Selection}`);
    }
    if (row.Votes === "*") unit.suppressedCandidates.push(row.Selection);
    else {
      const votes = Number(row.Votes);
      if (!Number.isInteger(votes) || votes < 0) throw new Error(`Nevada ${targetYear} invalid official vote cell: ${key}|${row.Selection}`);
      unit.candidateVotes[row.Selection] = votes;
    }
    unitMap.set(key, unit);
  }
  if (sourceRows.length !== settings.resultRows || unitMap.size !== settings.sourceUnits) {
    throw new Error(`Nevada ${targetYear} official result-source cardinality drifted`);
  }

  const officialFeatureKeys = new Set([...unitMap.values()].map((unit) => `${unit.parentGeoid}|${unit.sourceUnitId}`));
  const geometryOnlyFeatures = [...sourceFeatureByKey.entries()].filter(([key]) => !officialFeatureKeys.has(key));
  const geometryOnlyVoteTotal = geometryOnlyFeatures.reduce(
    (total, [, feature]) => total + settings.vestVoteFields.reduce((sum, field) => sum + Number(feature.properties[field] ?? 0), 0),
    0,
  );
  if (geometryOnlyFeatures.length !== settings.geometryOnlyFeatures || geometryOnlyVoteTotal !== 0) {
    throw new Error(`Nevada ${targetYear} zero-vote geometry-only diagnostic drifted`);
  }

  const included = [];
  const excluded = [];
  for (const unit of unitMap.values()) {
    const key = `${unit.parentGeoid}|${unit.sourceUnitId}`;
    const majorSuppressed = unit.suppressedCandidates.some((candidate) => [settings.dem, settings.rep].includes(candidate));
    if (!featureKeys.has(key)) {
      if (!isReviewedSpecialResultUnit(targetYear, unit)) {
        throw new Error(`Nevada ${targetYear} potentially geographic official unit lacks reviewed geometry: ${key}|${unit.sourceDisplayName}`);
      }
      unit.exclusionReason = "official special or non-geographic reporting category without a corresponding election-specific polygon";
    } else if (majorSuppressed) {
      unit.exclusionReason = "major-party vote cell suppressed by the Nevada Secretary of State";
    }
    if (unit.exclusionReason) excluded.push(unit);
    else {
      unit.mapping = {
        featureIds: [unit.sourceUnitId],
        matchMethod: "exact_official_id",
        confidence: "high",
        note: `Exact county/precinct identity between the official Nevada Secretary of State ${targetYear} result export and the election-specific VEST geometry reconstruction. Only geometry is taken from VEST; all displayed vote values come from the official export.`,
      };
      unit.groupedVotes = groupVotes(unit.candidateVotes, settings.dem, settings.rep);
      included.push(unit);
    }
  }
  if (
    included.length !== settings.colorableUnits
    || excluded.length !== settings.excludedUnits
    || new Set(included.map((unit) => unit.parentGeoid)).size !== 17
  ) {
    throw new Error(`Nevada ${targetYear} reviewed official-result/geometry counts drifted`);
  }
  const officialReconciliation = targetYear === 2016
    ? await validate2016OfficialMapReconciliation(included)
    : null;
  return {
    features: featureRows,
    units: included,
    excluded,
    sourceUnitCount: unitMap.size,
    officialReconciliation,
  };
}

async function build2024() {
  const election = ELECTIONS[2024];
  const resultPath = `data/precinct-geometry/NV/${election.id}/raw/nevada-secretary-of-state/2024-general-president.csv`;
  const geometryPath = `data/precinct-geometry/NV/${election.id}/raw/nevada-legislative-counsel-bureau/2024-precincts.geojson`;
  const metadataBase = `data/precinct-geometry/NV/${election.id}/raw/nevada-legislative-counsel-bureau`;
  const itemMetadata = JSON.parse(readText(`${metadataBase}/2024-precincts-item-metadata.json`));
  const layerMetadata = JSON.parse(readText(`${metadataBase}/2024-precincts-layer-metadata.json`));
  const publicTerms = readText(`data/precinct-geometry/NV/${election.id}/raw/esri/arcgis-online-terms-of-use.html`);
  if (
    itemMetadata.id !== "6303f14785fb401c8e4c53e333f44472"
    || itemMetadata.owner !== "haley.proehl_NVLCB"
    || itemMetadata.title !== "2024 Precincts"
    || itemMetadata.snippet !== "Nevada voting precincts for the 2024 election cycle."
    || itemMetadata.accessInformation !== "Nevada Legislative Counsel Bureau, 2024"
    || itemMetadata.access !== "public"
    || itemMetadata.contentStatus !== "public_authoritative"
    || itemMetadata.licenseInfo !== ""
    || itemMetadata.created !== 1_712_267_572_000
    || itemMetadata.modified !== 1_712_270_310_000
  ) {
    throw new Error("Nevada 2024 official LCB item metadata drifted");
  }
  if (
    layerMetadata.name !== "2024 Precincts"
    || layerMetadata.type !== "Feature Layer"
    || layerMetadata.hasStaticData !== true
    || layerMetadata.capabilities !== "Query,Extract"
    || layerMetadata.editingInfo?.lastEditDate !== 1_712_268_530_110
    || layerMetadata.editingInfo?.dataLastEditDate !== 1_712_268_383_185
  ) {
    throw new Error("Nevada 2024 official LCB layer metadata drifted");
  }
  for (const requiredText of [
    "Permission to reproduce",
    "you expressly grant",
    "permission to use, reproduce,",
    "prepare derivative works of, and distribute content",
    "subject to any use",
  ]) {
    if (!publicTerms.includes(requiredText)) {
      throw new Error(`ArcGIS Online public-sharing terms drifted: ${requiredText}`);
    }
  }
  const rows = parseCsv(readText(resultPath));
  const unitMap = new Map();
  for (const row of rows) {
    const county = String(row.Jurisdiction).trim();
    const code = normalized2024Code(county, row.Precinct);
    const key = `${county}|${code}`;
    const unit = unitMap.get(key) ?? createUnit({ county, sourceUnitId: code, sourceDisplayName: row.Precinct, candidateVotes: {}, suppressedCandidates: [] });
    if (row.Votes === "*") unit.suppressedCandidates.push(row.Candidate);
    else unit.candidateVotes[row.Candidate] = Number(row.Votes);
    unitMap.set(key, unit);
  }
  const geometry = JSON.parse(readText(geometryPath));
  const features = geometry.features.map((feature) => {
    const county = String(feature.properties.County).trim();
    const fips = COUNTY_FIPS[county];
    const code = normalized2024Code(county, feature.properties.PRECINCT);
    return normalizedFeature(feature, code, fips, {
      SOURCE_PRECINCT: String(feature.properties.PRECINCT).trim(),
      SOURCE_COUNTY: county,
      SOURCE_KIND: "Nevada LCB 2024 Precincts",
    });
  }).sort((left, right) => `${left.properties.CRM_PARENT_GEOID}|${left.properties.CRM_FEATURE_ID}`.localeCompare(`${right.properties.CRM_PARENT_GEOID}|${right.properties.CRM_FEATURE_ID}`, "en", { numeric: true }));
  const featureKeys = new Set(features.map((feature) => `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`));
  if (features.length !== 1_726 || featureKeys.size !== features.length || unitMap.size !== 1_671 || rows.length !== 8_355) {
    throw new Error("Nevada 2024 official source cardinality drifted");
  }
  const demName = "Harris, Kamala D. and Walz, Tim";
  const repName = "Trump, Donald J. and Vance, JD";
  const included = [];
  const excluded = [];
  for (const unit of unitMap.values()) {
    const key = `${unit.parentGeoid}|${unit.sourceUnitId}`;
    const majorSuppressed = unit.suppressedCandidates.some((candidate) => [demName, repName].includes(candidate));
    if (majorSuppressed) unit.exclusionReason = "major-party vote cell suppressed by the Nevada Secretary of State";
    else if (!featureKeys.has(key)) unit.exclusionReason = "no matching feature in the official LCB 2024 precinct layer";
    if (unit.exclusionReason) excluded.push(unit);
    else {
      unit.mapping = {
        featureIds: [unit.sourceUnitId],
        matchMethod: "exact_official_id",
        confidence: "high",
        note: "Exact county/precinct identity between the official Nevada Secretary of State result export and the official Nevada Legislative Counsel Bureau 2024 precinct layer.",
      };
      unit.groupedVotes = groupVotes(unit.candidateVotes, demName, repName);
      included.push(unit);
    }
  }
  if (included.length !== 1_518 || excluded.length !== 153) {
    throw new Error(`Nevada 2024 reviewed privacy/geography counts drifted: included=${included.length}, excluded=${excluded.length}`);
  }
  return { features, units: included, excluded, sourceUnitCount: unitMap.size };
}

function geometryParts(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`Cannot retain non-polygon multipart geometry: ${geometry.type}`);
}

function dissolveReviewedMultipartMappings(features, units) {
  const featureByKey = new Map(features.map((feature) => [
    `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`,
    feature,
  ]));
  const consumed = new Set();
  const replacements = [];
  for (const unit of units.filter((entry) => entry.mapping.featureIds.length > 1)) {
    const sourcePartIds = [...unit.mapping.featureIds];
    const parts = [];
    for (const featureId of sourcePartIds) {
      const key = `${unit.parentGeoid}|${featureId}`;
      const feature = featureByKey.get(key);
      if (!feature || consumed.has(key)) {
        throw new Error(`Nevada 2012 multipart source feature is missing or reused: ${key}`);
      }
      consumed.add(key);
      parts.push(...geometryParts(feature.geometry));
    }
    replacements.push(normalizedFeature(
      { geometry: { type: "MultiPolygon", coordinates: parts } },
      unit.sourceUnitId,
      unit.parentGeoid.slice(2),
      {
        SOURCE_PRECINCT: unit.sourceUnitId,
        SOURCE_PART_IDS: sourcePartIds,
        SOURCE_KIND: "Deterministic reviewed multipart precinct assembled without coordinate union",
      },
    ));
    unit.mapping = {
      ...unit.mapping,
      featureIds: [unit.sourceUnitId],
      note: `${unit.mapping.note} The reviewed source pieces are retained as one MultiPolygon feature so the result relationship is one-to-one without altering any boundary coordinates.`,
    };
  }
  const output = features
    .filter((feature) => !consumed.has(`${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`))
    .concat(replacements)
    .sort((left, right) => `${left.properties.CRM_PARENT_GEOID}|${left.properties.CRM_FEATURE_ID}`.localeCompare(`${right.properties.CRM_PARENT_GEOID}|${right.properties.CRM_FEATURE_ID}`, "en", { numeric: true }));
  const outputKeys = new Set(output.map((feature) => `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`));
  if (outputKeys.size !== output.length) throw new Error("Nevada 2012 multipart normalization created duplicate identities");
  return output;
}

async function build2012() {
  const election = ELECTIONS[2012];
  const base = `data/precinct-geometry/NV/${election.id}/raw`;
  const rows = parseCsv(readText(`${base}/nevada-secretary-of-state/2012-general-precinct.csv`))
    .filter((row) => row.Contest === "President and Vice President of the United States");
  const unitMap = new Map();
  for (const row of rows) {
    const county = String(row.Jurisdiction).trim();
    const code = normalizeNevadaResultCode(county, row.Precinct);
    const key = `${county}|${code}`;
    const unit = unitMap.get(key) ?? createUnit({ county, sourceUnitId: code, sourceDisplayName: row.Precinct, candidateVotes: {}, suppressedCandidates: [] });
    if (row.Votes === "*") unit.suppressedCandidates.push(row.Selection);
    else unit.candidateVotes[row.Selection] = Number(row.Votes);
    unitMap.set(key, unit);
  }
  if (rows.length !== 10_115 || unitMap.size !== 2_023) throw new Error("Nevada 2012 result-source cardinality drifted");

  const census = await shp(read(`${base}/us-census/tl_2012_32_vtd10.zip`));
  const clark = JSON.parse(readText(`${base}/clark-county/prec2012_p.geojson`));
  const vest = await shp(read("data/precinct-geometry/NV/2016-11-08-general/raw/vest/nv_2016.zip"));
  const features = [];
  const sourceNames = new Map();
  for (const feature of census.features) {
    const fips = String(feature.properties.COUNTYFP10).padStart(3, "0");
    if (["003", "031"].includes(fips)) continue;
    const code = normalizeNumeric(feature.properties.VTDST10);
    features.push(normalizedFeature(feature, code, fips, {
      SOURCE_PRECINCT: String(feature.properties.VTDST10).trim(),
      SOURCE_NAME: String(feature.properties.NAME10).trim(),
      SOURCE_KIND: "2012 Census TIGER VTD",
    }));
    sourceNames.set(`${parentGeoid(fips)}|${code}`, String(feature.properties.NAME10).trim());
  }
  for (const feature of clark.features) {
    const code = normalizeNumeric(feature.properties.PREC);
    features.push(normalizedFeature(feature, code, "003", { SOURCE_PRECINCT: code, SOURCE_KIND: "Clark County 2012 precinct archive" }));
  }
  for (const feature of vest.features.filter((entry) => String(entry.properties.COUNTYFP).padStart(3, "0") === "031")) {
    const code = String(feature.properties.NAME).trim();
    features.push(normalizedFeature(feature, code, "031", { SOURCE_PRECINCT: code, SOURCE_KIND: "VEST 2016 Washoe proxy partition" }));
  }
  features.sort((left, right) => `${left.properties.CRM_PARENT_GEOID}|${left.properties.CRM_FEATURE_ID}`.localeCompare(`${right.properties.CRM_PARENT_GEOID}|${right.properties.CRM_FEATURE_ID}`, "en", { numeric: true }));
  const featureKeys = new Set(features.map((feature) => `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`));
  if (featureKeys.size !== features.length) throw new Error("Nevada 2012 normalized source contains duplicate feature identities");

  const post2012ChangedWashoe = new Set(["1058", "2019", "2062", "2065", "2068", "2074", "2080", "7319", "7573", "7577", "7581", "8290", "9125", "9249"]);
  const demName = "Obama, Barack";
  const repName = "Romney, Mitt";
  const included = [];
  const excluded = [];
  for (const unit of unitMap.values()) {
    const fips = COUNTY_FIPS[unit.county];
    const key = `${unit.parentGeoid}|${unit.sourceUnitId}`;
    const majorSuppressed = unit.suppressedCandidates.some((candidate) => [demName, repName].includes(candidate));
    let featureIds = featureKeys.has(key) ? [unit.sourceUnitId] : [];
    let matchMethod = "exact_official_id";
    let note = "Exact county/precinct code between the official result identity and the retained boundary source.";
    let confidence = "high";

    if (unit.county === "Churchill" && /^\d+$/.test(unit.sourceUnitId)) {
      const pieces = features.filter((feature) => feature.properties.CRM_PARENT_GEOID === unit.parentGeoid && (feature.properties.CRM_FEATURE_ID === unit.sourceUnitId || feature.properties.CRM_FEATURE_ID.startsWith(`${unit.sourceUnitId}-`))).map((feature) => feature.properties.CRM_FEATURE_ID);
      if (pieces.length > 1) {
        featureIds = pieces;
        matchMethod = "reviewed_name";
        note = "Reviewed Census VTD base code plus suffixed polygon pieces allocated to the official county precinct result.";
      }
    }
    if (unit.county === "Humboldt" && unit.sourceUnitId === "7") {
      featureIds = ["7-1", "7-2"];
      matchMethod = "reviewed_name";
      note = "Reviewed two-piece Census VTD representation for official Humboldt precinct 7.";
    }
    if (unit.county === "Lyon") {
      const target = normalizeLyonLabel(unit.sourceDisplayName);
      const matches = [...sourceNames.entries()].filter(([featureKey, sourceName]) => featureKey.startsWith(`${unit.parentGeoid}|`) && normalizeLyonLabel(sourceName) === target).map(([featureKey]) => featureKey.slice(unit.parentGeoid.length + 1));
      if (matches.length === 1) {
        featureIds = matches;
        matchMethod = "reviewed_name";
        note = "Reviewed Lyon precinct label equivalence after removing the Census display prefix and punctuation.";
      }
    }
    if (unit.county === "White Pine" && /^\d+$/.test(unit.sourceUnitId)) {
      const matches = [...sourceNames.entries()].filter(([featureKey, sourceName]) => featureKey.startsWith(`${unit.parentGeoid}|`) && sourceName.match(/VTD\s+(\d+)$/i)?.[1] === unit.sourceUnitId).map(([featureKey]) => featureKey.slice(unit.parentGeoid.length + 1));
      if (matches.length === 1) {
        featureIds = matches;
        matchMethod = "reviewed_name";
        note = "Reviewed White Pine VTD number embedded in the official Census VTD display name.";
      }
    }
    if (["88", "99", "997", "998", "999", "9700", "9800", "9900"].includes(unit.sourceUnitId) || (unit.county === "Clark" && /^9/.test(unit.sourceUnitId))) {
      unit.exclusionReason = "non-geographic or special reporting category";
    } else if (majorSuppressed) {
      unit.exclusionReason = "major-party vote cell suppressed by the Nevada Secretary of State";
    } else if (unit.county === "Washoe" && post2012ChangedWashoe.has(unit.sourceUnitId)) {
      unit.exclusionReason = "only a later Washoe proxy polygon exists and the official change log records a post-2012 boundary change";
    } else if (featureIds.length === 0) {
      unit.exclusionReason = "no reviewed geometry relationship";
    }

    if (unit.exclusionReason) excluded.push(unit);
    else {
      if (unit.county === "Washoe") {
        confidence = "medium";
        note = "Exact precinct code in the VEST 2016 Washoe proxy partition; the official change log does not list this code among the reviewed 2013-2016 changes. Election-date geometry still requires the retained 2012 county archive.";
      }
      unit.mapping = { featureIds, matchMethod, confidence, note };
      unit.groupedVotes = groupVotes(unit.candidateVotes, demName, repName);
      included.push(unit);
    }
  }
  const normalizedFeatures = dissolveReviewedMultipartMappings(features, included);
  if (normalizedFeatures.length !== 2_002 || included.some((unit) => unit.mapping.featureIds.length !== 1)) {
    throw new Error("Nevada 2012 multipart normalization counts drifted");
  }
  return { features: normalizedFeatures, units: included, excluded, sourceUnitCount: unitMap.size };
}

function rawArtifact(file, sourceUrl, authority, format, note, sourceUrls = null) {
  const bytes = read(file);
  return {
    localArtifactPath: file,
    ...(sourceUrls ? { sourceUrls } : { sourceUrl }),
    authority,
    derivation: "Retained or deterministically converted from the cited source; the collector verifies the reviewed local byte hash before writing derived artifacts.",
    byteCount: bytes.length,
    sha256: sha256(bytes),
    format,
    note,
  };
}

function evidenceFor(targetYear, result) {
  const election = ELECTIONS[targetYear];
  if (targetYear === 2012) {
    const base = `data/precinct-geometry/NV/${election.id}/raw`;
    return {
      authority: "Nevada Secretary of State with official Clark County, Census, and Washoe evidence",
      sourceUrl: "https://www.nvsos.gov/silverstate2012gen/",
      license: "U.S. government Census data are public domain; Clark and Nevada public-record reuse terms are not separately stated; VEST database content is CC BY 4.0.",
      boundaryVintage: "Hybrid 2012 Clark/Census boundaries with a 2016 Washoe proxy partition",
      vintageStatus: "unknown",
      derivationMethod: "hybrid_reconstruction",
      artifacts: [
        rawArtifact(`${base}/nevada-secretary-of-state/2012-general-precinct.csv`, "https://www.nvsos.gov/silverstate2012gen/", "Nevada Secretary of State", "CSV", "Official statewide precinct result export; low-count cells are suppressed with an asterisk."),
        rawArtifact(`${base}/us-census/tl_2012_32_vtd10.zip`, "https://www2.census.gov/geo/tiger/TIGER2012/VTD/tl_2012_32_vtd10.zip", "U.S. Census Bureau", "ESRI Shapefile ZIP", "Statewide 2010-vintage VTD geography retained from the 2012 TIGER archive."),
        rawArtifact(`${base}/clark-county/Election_Archive.zip`, "https://mapsrv.clarkcountynv.gov/pub/crgeodb/Election_Archive.zip", "Clark County GIS Management Office", "Esri File Geodatabase ZIP", "Official historical archive containing the prec2012_p layer."),
        rawArtifact(`${base}/clark-county/prec2012_p.geojson`, "https://mapsrv.clarkcountynv.gov/pub/crgeodb/Election_Archive.zip", "Clark County GIS Management Office", "GeoJSON", "Deterministic WGS84 conversion of official FileGDB layer prec2012_p."),
        rawArtifact(`${base}/washoe-county/Precinct-Changelog.xlsx`, "https://www.washoecounty.gov/voters/data/files/Precinct%20Changelog.xlsx", "Washoe County Registrar of Voters", "XLSX", "Official precinct lineage used to reject known post-2012 proxy changes."),
        rawArtifact("data/precinct-geometry/NV/2016-11-08-general/raw/vest/nv_2016.zip", "https://election.lab.ufl.edu/dataset/nv-2016-precinct-level-election-results/", "Voting and Election Science Team", "ESRI Shapefile ZIP", "Secondary 2016 Washoe partition used only as an explicitly labeled proxy; not proof of 2012 vintage."),
      ],
    };
  }
  if ([2016, 2020].includes(targetYear)) {
    const officialFile = `data/precinct-geometry/NV/${election.id}/raw/nevada-secretary-of-state/${targetYear}-general-precinct.csv`;
    const geometryFile = `data/precinct-geometry/NV/${election.id}/raw/vest/nv_${targetYear}.zip`;
    const artifacts = [
      rawArtifact(
        officialFile,
        targetYear === 2016
          ? "https://www.nvsos.gov/home/showpublisheddocument/4615/636160169602900000"
          : "https://www.nvsos.gov/home/showpublisheddocument/9195/637441629458970000",
        "Nevada Secretary of State",
        "CSV",
        "Official statewide precinct result export. All normalized vote values come from this artifact; low-count cells remain suppressed with an asterisk.",
      ),
      rawArtifact(
        geometryFile,
        targetYear === 2016
          ? "https://election.lab.ufl.edu/dataset/nv-2016-precinct-level-election-results/"
          : "https://dataverse.harvard.edu/api/access/datafile/4863168",
        "Voting and Election Science Team",
        "ESRI Shapefile ZIP",
        "Election-specific secondary geometry reconstruction. Its vote fields are used only to prove unmatched extra polygons have zero votes; they are removed from normalized geometry and never used as displayed results.",
      ),
    ];
    if (targetYear === 2016) {
      artifacts.push(rawArtifact(
        "data/precinct-geometry/NV/2016-11-08-general/raw/vest/dataverse-v89-license-evidence.json",
        "https://dataverse.harvard.edu/api/datasets/:persistentId/versions/89.0/customlicense?persistentId=doi:10.7910/DVN/NH5S2I",
        "Harvard Dataverse / Voting and Election Science Team",
        "JSON",
        "Retained human review of the version-pinned file and Terms pages. The exact Nevada file MD5 binds the retained ZIP to dataset version 89.0 and its Creative Commons Attribution 4.0 terms.",
      ));
      artifacts.push(rawArtifact(
        "data/precinct-geometry/NV/2016-11-08-general/raw/nevada-legislative-counsel-bureau/ElectionResults2016USPres.pdf",
        "https://www.leg.state.nv.us/Division/Research/Documents/ElectionResults2016USPres.pdf",
        "Nevada Legislative Counsel Bureau",
        "PDF",
        "Official statewide precinct-result map. Its text attributes election data to the Nevada Secretary of State and publishes statewide presidential percentages used for deterministic reconciliation.",
      ));
    } else {
      artifacts.push(rawArtifact(
        "data/precinct-geometry/NV/2020-11-03-general/raw/vest/dataverse-v21-license-evidence.json",
        "https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/K7760H&version=21.0&selectTab=termsTab",
        "Harvard Dataverse / Voting and Election Science Team",
        "JSON",
        "Retained human review of the version-pinned Terms tab identifying dataset version 21.0 and Creative Commons Attribution 4.0 terms for file 4863168.",
      ));
    }
    return {
      authority: "Nevada Secretary of State results with explicitly attributed VEST election-specific geometry",
      sourceUrl: "https://www.nvsos.gov/sos/elections/election-information/precinct-level-results",
      license: targetYear === 2016
        ? "Official Nevada result export with VEST database geometry under CC BY 4.0 attribution; the official LCB PDF is retained as additional statewide source-context evidence."
        : "Official Nevada result export with exact Harvard Dataverse version-21 VEST geometry terms retained as Creative Commons Attribution 4.0.",
      boundaryVintage: `${targetYear} election-specific VEST precinct reconstruction`,
      vintageStatus: "election_date_confirmed",
      derivationMethod: "secondary_reconstruction",
      artifacts,
    };
  }
  const base = `data/precinct-geometry/NV/${election.id}/raw`;
  return {
    authority: "Nevada Legislative Counsel Bureau and Nevada Secretary of State",
    sourceUrl: "https://services9.arcgis.com/UU5yXg9PV67U0ebq/arcgis/rest/services/2024_Precincts/FeatureServer/0",
    license: "The retained ArcGIS item is public_authoritative and permits Query and Extract. ArcGIS Online Terms of Use expressly grant end users permission to use, reproduce, prepare derivative works of, and distribute publicly shared content, subject to owner-stated constraints; this item states no additional constraint.",
    boundaryVintage: "Nevada LCB 2024 Precincts snapshot published April 5, 2024",
    vintageStatus: "election_date_confirmed",
    derivationMethod: "official_service",
    artifacts: [
      rawArtifact(`${base}/nevada-secretary-of-state/2024-general-president.csv`, "https://www.nvsos.gov/electionresults/RaceResults.aspx", "Nevada Secretary of State", "CSV", "Official statewide presidential precinct export; low-count cells are suppressed with an asterisk."),
      rawArtifact(`${base}/nevada-legislative-counsel-bureau/2024-precincts.geojson`, "https://services9.arcgis.com/UU5yXg9PV67U0ebq/arcgis/rest/services/2024_Precincts/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson", "Nevada Legislative Counsel Bureau", "GeoJSON", "Official statewide 2024 Precincts FeatureServer snapshot."),
      rawArtifact(`${base}/nevada-legislative-counsel-bureau/2024-precincts-item-metadata.json`, "https://www.arcgis.com/sharing/rest/content/items/6303f14785fb401c8e4c53e333f44472?f=json", "Nevada Legislative Counsel Bureau / ArcGIS Online", "JSON", "Retained item metadata identifies this public_authoritative layer as Nevada voting precincts for the 2024 election cycle; licenseInfo is empty."),
      rawArtifact(`${base}/nevada-legislative-counsel-bureau/2024-precincts-layer-metadata.json`, "https://services9.arcgis.com/UU5yXg9PV67U0ebq/arcgis/rest/services/2024_Precincts/FeatureServer/0?f=pjson", "Nevada Legislative Counsel Bureau / ArcGIS Online", "JSON", "Retained layer metadata records static data, Query and Extract capabilities, and April 2024 edit timestamps; copyrightText is empty."),
      rawArtifact(`${base}/esri/arcgis-online-terms-of-use.html`, "https://doc.arcgis.com/en/arcgis-online/reference/terms-of-use.htm", "Esri ArcGIS Online", "HTML", "Retained public-sharing terms expressly grant ArcGIS Online end users permission to use, reproduce, prepare derivative works of, and distribute publicly shared content, subject to owner-stated constraints."),
    ],
  };
}

verifyInputs();
const election = ELECTIONS[year];
const base = `data/precinct-geometry/NV/${election.id}`;
const manifestId = `nv-${election.id}-precinct-geometry-candidate-v1`;
const built = year === 2012 ? await build2012() : year === 2024 ? await build2024() : await buildOfficialResultsWithVestGeometry(year);
const rows = built.units
  .sort((left, right) => `${left.parentGeoid}|${left.sourceUnitId}`.localeCompare(`${right.parentGeoid}|${right.sourceUnitId}`, "en", { numeric: true }))
  .map((unit) => crosswalkRow(unit, election.id));
const summary = summarizeCrosswalk(rows);
const reviewedRelationshipRecords = rows.reduce(
  (count, row) => count + row.relationships.length,
  0,
);
const reviewedFeatureIds = new Set(
  rows.flatMap((row) =>
    row.relationships
      .map((relationship) => relationship.sourceFeatureId)
      .filter((featureId) => typeof featureId === "string" && featureId)
  ),
);
const reviewedNoDataFeatures = built.features.length - reviewedFeatureIds.size;
if (reviewedNoDataFeatures < 0) {
  throw new Error(`Nevada ${year} reviewed feature accounting drifted`);
}
const crosswalk = {
  schemaVersion: 1,
  manifestId,
  state: STATE,
  electionId: election.id,
  geographyLevel: "precinct",
  resultSourceId: `nv-${year}-president-precinct-results`,
  generatedAt: retrievedAt,
  rows,
  reconciliation: reconciliation(built.units),
};
const normalizedDocument = { type: "FeatureCollection", features: built.features };
const normalizedPlain = Buffer.from(JSON.stringify(normalizedDocument));
const normalizedBytes = gzipSync(normalizedPlain, { level: 9 });
const resultDocument = {
  schemaVersion: 1,
  state: STATE,
  electionId: election.id,
  reportingGrain: "precinct",
  sourceUnitCount: built.sourceUnitCount,
  colorableUnitCount: built.units.length,
  excludedUnitCount: built.excluded.length,
  rows: built.units.map((unit) => ({
    resultUnitCode: reportingUnitCode({ state: STATE, electionId: election.id, reportingGrain: "precinct", parentGeoid: unit.parentGeoid, sourceUnitId: unit.sourceUnitId }),
    sourceUnitId: unit.sourceUnitId,
    sourceDisplayName: unit.sourceDisplayName,
    parentGeoid: unit.parentGeoid,
    democratic: unit.groupedVotes.democratic,
    republican: unit.groupedVotes.republican,
    other: unit.groupedVotes.other,
    total: unit.groupedVotes.total,
  })),
  exclusions: built.excluded.map((unit) => ({
    sourceUnitId: unit.sourceUnitId,
    sourceDisplayName: unit.sourceDisplayName,
    parentGeoid: unit.parentGeoid,
    reason: unit.exclusionReason,
    suppressedCandidateCount: unit.suppressedCandidates.length,
  })).sort((left, right) => `${left.parentGeoid}|${left.sourceUnitId}`.localeCompare(`${right.parentGeoid}|${right.sourceUnitId}`, "en", { numeric: true })),
};
const resultsPlain = jsonBytes(resultDocument);
const resultsBytes = gzipSync(resultsPlain, { level: 9 });
const normalizedPath = `${base}/normalized/nv-${year}-precincts.geojson.gz`;
const resultsPath = `${base}/normalized/nv-${year}-president-results.json.gz`;
const crosswalkPath = `${base}/crosswalk/nv-${year}-precinct-result-crosswalk.json`;
const reportPath = `${base}/reports/nv-${year}-precinct-geometry-report.json`;
const evidencePath = `${base}/source-evidence.json`;
const manifestPath = `${base}/manifest.json`;
const normalizedArtifact = write(normalizedPath, normalizedBytes);
const resultsArtifact = write(resultsPath, resultsBytes);
const crosswalkArtifact = write(crosswalkPath, crosswalk);
const source = evidenceFor(year, built);
const evidence = {
  schemaVersion: 1,
  id: `nv-${year}-precinct-geometry-source-evidence`,
  state: STATE,
  election: { id: election.id, date: election.date, year, type: "general", office: "president" },
  authority: source.authority,
  retrievedAt,
  sourceCrs: year === 2012 ? "mixed retained source CRS normalized by shpjs and reviewed Clark converter" : "source-defined; parsed by shpjs or official EPSG:4326 GeoJSON",
  servedCrs: "EPSG:4326",
  artifacts: source.artifacts,
  resultIdentity: {
    sourceId: crosswalk.resultSourceId,
    sourceResultUnits: built.sourceUnitCount,
    colorableResultUnits: built.units.length,
    excludedResultUnits: built.excluded.length,
    knownColorablePresidentVotes: built.units.reduce((sum, unit) => sum + unit.groupedVotes.total, 0),
    normalizedResultArtifact: { path: resultsArtifact.localArtifactPath, sha256: resultsArtifact.sha256, byteCount: resultsArtifact.byteCount },
    ...(built.officialReconciliation
      ? { officialStatewideReconciliation: built.officialReconciliation }
      : {}),
  },
  boundaryContext: { vintage: source.boundaryVintage, vintageStatus: source.vintageStatus, licenseOrTerms: source.license },
  caveats: [
    "No election-result value is embedded in the normalized geometry or crosswalk.",
    "Nevada Secretary of State values suppressed for ballot secrecy remain unknown and are never converted to zero or estimated.",
    ...(year === 2012 ? ["Washoe uses a clearly labeled 2016 proxy partition; the 2012 manifest remains blocked pending the election-date archive held by Nevada custodians."] : []),
    ...(year === 2016 ? ["All displayed vote values come from the retained official Nevada Secretary of State export. VEST supplies election-specific geometry only, under CC BY 4.0 attribution; it must not be presented as an official Nevada GIS export. The official LCB map independently confirms the statewide source context."] : []),
    ...(year === 2020 ? ["All displayed vote values come from the retained official Nevada Secretary of State export. VEST supplies election-specific geometry only, under the retained Harvard Dataverse version-21 CC BY 4.0 terms; it must not be presented as an official Nevada GIS export."] : []),
    ...(year === 2024 ? ["The reviewed delivery contract retains all 1,726 official LCB polygons: 1,518 have result relationships and 208 remain visible as no-data. Of the no-data polygons, 115 correspond to result identities excluded because a major-party cell is suppressed and 93 lack a retained joinable result identity; 29 source result identities have no matching feature.", "The official LCB layer is public_authoritative, has no item-level use constraint, and is covered by retained ArcGIS Online public-sharing permission for end-user use, reproduction, derivative works, and distribution."] : []),
  ],
};
const evidenceArtifact = write(evidencePath, evidence);
const report = {
  schemaVersion: 1,
  state: STATE,
  electionId: election.id,
  generatedAt: retrievedAt,
  disposition: year === 2012
    ? "blocked_pending_election_date_washoe_archive"
    : "source_and_crosswalk_gates_passed_delivery_pending",
  source: {
    featureCount: built.features.length,
    parentCount: new Set(built.features.map((feature) => feature.properties.CRM_PARENT_GEOID)).size,
    sourceResultUnits: built.sourceUnitCount,
  },
  crosswalk: {
    ...summary,
    reviewedRelationshipRecords,
    reviewedNoDataFeatures,
  },
  exclusions: {
    count: built.excluded.length,
    byReason: Object.fromEntries([...new Set(built.excluded.map((unit) => unit.exclusionReason))].sort().map((reason) => [reason, built.excluded.filter((unit) => unit.exclusionReason === reason).length])),
  },
  artifacts: {
    normalizedGeometry: normalizedArtifact,
    normalizedGeometryUncompressed: { byteCount: normalizedPlain.length, sha256: sha256(normalizedPlain) },
    normalizedResults: resultsArtifact,
    normalizedResultsUncompressed: { byteCount: resultsPlain.length, sha256: sha256(resultsPlain) },
    crosswalk: crosswalkArtifact,
  },
  caveats: evidence.caveats,
};
const reportArtifact = write(reportPath, report);
const releaseBlockers = ["An immutable parent-scoped public delivery package and production release review have not been completed."];
if (year === 2012) releaseBlockers.push("The election-date Washoe precinct archive is not retained; proxy geometry cannot pass the canonical election-vintage gate.");
const manifest = {
  schemaVersion: 1,
  id: manifestId,
  state: STATE,
  election: evidence.election,
  geography: {
    level: "precinct",
    parentLevel: "county",
    boundaryVintage: source.boundaryVintage,
    vintageStatus: source.vintageStatus,
    derivationMethod: source.derivationMethod,
  },
  source: {
    authority: source.authority,
    url: source.sourceUrl,
    retrievedAt,
    artifact: evidenceArtifact.localArtifactPath,
    sha256: evidenceArtifact.sha256,
    byteCount: evidenceArtifact.byteCount,
    format: "precinct-source-evidence+json",
    licenseOrTerms: source.license,
  },
  normalization: {
    script: "scripts/collect-nv-precinct-geometry.mjs",
    sourceCrs: evidence.sourceCrs,
    servedCrs: "EPSG:4326",
    artifact: normalizedArtifact.localArtifactPath,
    sha256: normalizedArtifact.sha256,
    byteCount: normalizedArtifact.byteCount,
    featureCount: built.features.length,
    sourceFeatureIdFields: ["CRM_FEATURE_ID"],
    parentIdFields: ["CRM_PARENT_GEOID"],
  },
  crosswalk: {
    status: "reviewed",
    resultSourceId: crosswalk.resultSourceId,
    artifact: crosswalkArtifact.localArtifactPath,
    sha256: crosswalkArtifact.sha256,
    byteCount: crosswalkArtifact.byteCount,
    ...summary,
    reviewedRelationshipRecords,
    reviewedNoDataFeatures,
    methods: [...new Set(rows.flatMap((row) => row.relationships.map((relationship) => relationship.matchMethod)))].sort(),
  },
  validation: {
    status: "blocked",
    geometryValid: true,
    rowLevelRenderingSafe: false,
    parentTotalsReconciled: year !== 2012,
    errors: releaseBlockers,
    warnings: evidence.caveats.slice(1),
  },
  delivery: null,
  caveats: evidence.caveats,
};
const manifestArtifact = write(manifestPath, manifest);

console.log(JSON.stringify({
  year,
  manifest: manifestArtifact,
  report: reportArtifact,
  geometryFeatures: built.features.length,
  sourceResultUnits: built.sourceUnitCount,
  colorableResultUnits: built.units.length,
  excludedResultUnits: built.excluded.length,
  parentCount: new Set(built.features.map((feature) => feature.properties.CRM_PARENT_GEOID)).size,
  delivery: null,
}, null, 2));
