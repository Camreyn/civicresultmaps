import fs from "fs";
import Module from "module";
import path from "path";
import { createHash } from "node:crypto";
import { createRequire } from "module";

Module._initPaths();
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const repoRoot = process.cwd();
const presidentCsvPath = path.join(repoRoot, "data", "mo-2024-general-president.csv");
const senateCsvPath = path.join(repoRoot, "data", "mo-2024-general-senate.csv");
const turnoutPdfPath = path.join(repoRoot, "data", "mo-2024-general-turnout.pdf");
const turnoutCsvPath = path.join(repoRoot, "data", "mo-2024-general-turnout.csv");
const historicalCsvPath = path.join(repoRoot, "data", "mo-historical-presidential-baseline.csv");
const countyGeometryPath = path.join(repoRoot, "data", "mo-counties.geojson");
const countyPresidentCsvPath = path.join(repoRoot, "data", "mo-2024-general-president-county.csv");
const countySenateCsvPath = path.join(repoRoot, "data", "mo-2024-general-senate-county.csv");
const countyTurnoutCsvPath = path.join(repoRoot, "data", "mo-2024-general-turnout-county.csv");
const countyHistoricalCsvPath = path.join(repoRoot, "data", "mo-historical-presidential-county-baseline.csv");
const reconciliationPath = path.join(repoRoot, "data", "mo-county-fips-reconciliation.json");

const presidentVoteColumns = ["trump", "harris", "oliver", "stein", "sonski", "de_la_cruz", "ayyadurai", "potus"];
const senateVoteColumns = ["comparison_rep", "comparison_dem", "comparison_other"];
const historicalVoteColumns = ["dem_votes", "rep_votes", "other_votes", "total_votes"];
const kansasCityAuthorityUrl = "https://www.sos.mo.gov/elections/goVoteMissouri/localelectionauthority";
const rawExpectedRows = { president: 116, senate: 116, turnout: 116, historical: 348 };
const canonicalExpectedRows = { president: 115, senate: 115, turnout: 115, historical: 345 };
const expectedStatewide = {
  president: { trump: 1751986, harris: 1200599, other: 42742, total: 2995327 },
  senate: { total: 2972559 },
  turnout: { ballots_cast: 2995376, registered_voters: 4433383 },
};
const expectedJackson = {
  president2024: { harris: 187026, trump: 125610, other: 5381, total: 318017 },
  senate2024: { dem: 189008, rep: 117054, other: 9410, total: 315472 },
  turnout2024: { ballots: 318017, registered: 507182, turnoutPct: "62.70" },
  historical: {
    2012: { dem: 183953, rep: 122708, other: 4916, total: 311577 },
    2016: { dem: 168972, rep: 116211, other: 15811, total: 300994 },
    2020: { dem: 199842, rep: 126535, other: 6556, total: 332933 },
  },
};

const historicalSources = [
  {
    year: 2012,
    pdfPath: path.join(repoRoot, "data", "mo-2012-general-election-by-county.pdf"),
    sourceUrl: "https://www.sos.mo.gov/CMSImages/ElectionResultsStatistics/OfficialResults11-6-12.pdf",
    rowMethod: "missouriSosOfficialCountyPdf",
    columns: "demRepLibConstitutionTotal",
    pattern: /^(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)$/,
  },
  {
    year: 2016,
    pdfPath: path.join(repoRoot, "data", "mo-2016-general-election-by-county.pdf"),
    sourceUrl: "https://www.sos.mo.gov/CMSImages/ElectionResultsStatistics/ActualResults-November82016-GeneralElection.pdf",
    rowMethod: "missouriSosOfficialCountyPdfPartyColumns",
    columns: "demRepLibConstitutionGreen",
    pattern: /^(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)$/,
  },
  {
    year: 2020,
    pdfPath: path.join(repoRoot, "data", "mo-2020-general-election-by-county.pdf"),
    sourceUrl: "https://www.sos.mo.gov/CMSImages/ElectionResultsStatistics/ActualResults-November32020.pdf",
    rowMethod: "missouriSosOfficialCountyPdf",
    columns: "repDemLibGreenConstitutionWriteIn",
    pattern: /^(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)$/,
  },
];

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function renderCsv(headers, rows) {
  const body = [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n");
  return `${body}\n`;
}

function writeCsv(filePath, headers, rows) {
  fs.writeFileSync(filePath, renderCsv(headers, rows), "utf8");
}

function preserveRawCsv(filePath, headers, rows) {
  const generated = renderCsv(headers, rows);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, generated, "utf8");
    return;
  }

  const existingRows = readCsv(filePath);
  assertEqual(existingRows.length, rows.length, path.basename(filePath) + " retained raw row count");
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    for (const header of headers) {
      const existing = String(existingRows[rowIndex][header] ?? "");
      const reproduced = String(rows[rowIndex][header] ?? "");
      if (existing !== reproduced) {
        throw new Error(path.basename(filePath) + " row " + (rowIndex + 2) + " field " + header + " no longer reproduces from the official PDF; refusing to overwrite the retained 116-jurisdiction source artifact");
      }
    }
  }
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === "," && !quoted) {
      values.push(value);
      value = "";
      continue;
    }
    value += character;
  }
  if (quoted) {
    throw new Error("Unterminated quoted CSV field");
  }
  values.push(value);
  return values;
}

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trimEnd();
  if (!text) {
    return [];
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvLine(lines.shift());
  return lines.map((line, rowIndex) => {
    const values = parseCsvLine(line);
    if (values.length !== headers.length) {
      throw new Error(path.basename(filePath) + " row " + (rowIndex + 2) + " has " + values.length + " values; expected " + headers.length);
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + " mismatch: expected " + expected + ", got " + actual);
  }
}

function assertExpectedValues(actual, expected, label) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    assertEqual(actual[key], expectedValue, label + " " + key);
  }
}

function canonicalCountyName(rawName) {
  const name = normalizeWhitespace(rawName);
  if (name === "Kansas City") {
    return "Jackson County";
  }
  if (name === "De Kalb County") {
    return "DeKalb County";
  }
  return name;
}

function loadCountyIndex() {
  const geometry = JSON.parse(fs.readFileSync(countyGeometryPath, "utf8"));
  assertCondition(Array.isArray(geometry.features), "Missouri county geometry is missing features");
  assertEqual(geometry.features.length, canonicalExpectedRows.president, "Missouri Census county geometry feature count");

  const byName = new Map();
  for (const feature of geometry.features) {
    const properties = feature.properties ?? {};
    const geoid = String(properties.GEOID ?? "").padStart(5, "0");
    assertCondition(/^29\d{3}$/.test(geoid), "Invalid Missouri county GEOID in geometry: " + geoid);
    const name = geoid === "29510" ? "St. Louis City" : normalizeWhitespace(properties.BASENAME) + " County";
    assertCondition(!byName.has(name), "Duplicate Missouri county geometry name: " + name);
    byName.set(name, { geoid, jurisdictionTag: "county:" + geoid });
  }
  return byName;
}

function aggregateCountyGroups(rows, numericColumns, countyIndex, label) {
  const groups = new Map();
  for (const row of rows) {
    const state = String(row.state ?? "").trim().toUpperCase();
    assertEqual(state, "MO", label + " state");
    const year = intValue(row.election_year);
    assertCondition(year > 0, label + " row is missing election_year");
    const sourceName = normalizeWhitespace(row.jurisdiction_name);
    assertCondition(sourceName, label + " row is missing jurisdiction_name");
    const countyName = canonicalCountyName(sourceName);
    const county = countyIndex.get(countyName);
    assertCondition(county, label + " row does not resolve to Missouri Census county geometry: " + sourceName);

    const key = year + "|" + countyName;
    let group = groups.get(key);
    if (!group) {
      group = {
        state,
        year,
        countyName,
        geoid: county.geoid,
        jurisdictionTag: county.jurisdictionTag,
        sourceNames: [],
        sourceRows: [],
        values: Object.fromEntries(numericColumns.map((column) => [column, 0])),
      };
      groups.set(key, group);
    }
    if (!group.sourceNames.includes(sourceName)) {
      group.sourceNames.push(sourceName);
    }
    group.sourceRows.push(row);
    for (const column of numericColumns) {
      group.values[column] += intValue(row[column]);
    }
  }
  return [...groups.values()];
}

function normalizationNote(group) {
  if (group.sourceNames.includes("Kansas City")) {
    return "Aggregated the Kansas City election-authority row into Jackson County because the Missouri Secretary of State identifies that jurisdiction as Kansas City within Jackson County.";
  }
  if (group.sourceNames.length === 1 && group.sourceNames[0] !== group.countyName) {
    return "Normalized the source display name " + group.sourceNames[0] + " to the Census county display name " + group.countyName + ".";
  }
  return "";
}

function buildCanonicalPresidentRows(rawRows, countyIndex) {
  return aggregateCountyGroups(rawRows, presidentVoteColumns, countyIndex, "Missouri presidential source").map((group) => ({
    state: group.state,
    election_year: group.year,
    jurisdiction_name: group.countyName,
    jurisdiction_geoid: group.geoid,
    jurisdiction_tag: group.jurisdictionTag,
    ...group.values,
    source_jurisdictions: group.sourceNames.join(" + "),
    normalization_note: normalizationNote(group),
  }));
}

function buildCanonicalSenateRows(rawRows, countyIndex) {
  return aggregateCountyGroups(rawRows, senateVoteColumns, countyIndex, "Missouri U.S. Senate source").map((group) => ({
    state: group.state,
    election_year: group.year,
    jurisdiction_name: group.countyName,
    jurisdiction_geoid: group.geoid,
    jurisdiction_tag: group.jurisdictionTag,
    ...group.values,
    source_jurisdictions: group.sourceNames.join(" + "),
    normalization_note: normalizationNote(group),
  }));
}

function buildCanonicalTurnoutRows(rawRows, countyIndex) {
  return aggregateCountyGroups(rawRows, ["ballots_cast", "registered_voters"], countyIndex, "Missouri turnout source").map((group) => {
    const first = group.sourceRows[0];
    const ballots = group.values.ballots_cast;
    const registered = group.values.registered_voters;
    return {
      state: group.state,
      election_year: group.year,
      jurisdiction_code: group.geoid,
      jurisdiction_name: group.countyName,
      jurisdiction_geoid: group.geoid,
      jurisdiction_tag: group.jurisdictionTag,
      county: group.countyName,
      local_unit: group.countyName,
      level: "county",
      ballots_cast: ballots,
      registered_voters: registered,
      turnout_pct: registered ? ((ballots / registered) * 100).toFixed(2) : "",
      denominator_type: first.denominator_type,
      denominator_timing: first.denominator_timing,
      denominator_note: first.denominator_note,
      warning_required: group.sourceRows.some((row) => String(row.warning_required).toLowerCase() === "true") ? "true" : "false",
      source_url: first.source_url,
      source_title: first.source_title,
      source_status: first.source_status,
      source_jurisdictions: group.sourceNames.join(" + "),
      normalization_note: normalizationNote(group),
    };
  });
}

function buildCanonicalHistoricalRows(rawRows, countyIndex) {
  return aggregateCountyGroups(rawRows, historicalVoteColumns, countyIndex, "Missouri historical presidential source").map((group) => {
    const first = group.sourceRows[0];
    const merged = group.sourceNames.includes("Kansas City");
    return {
      state: group.state,
      election_year: group.year,
      jurisdiction_name: group.countyName,
      jurisdiction_geoid: group.geoid,
      jurisdiction_tag: group.jurisdictionTag,
      county: group.countyName,
      local_unit: group.countyName,
      source_id: first.source_id,
      source_level: "county",
      row_method: merged ? first.row_method + "KansasCityWithinJacksonCountyAggregation" : first.row_method,
      source_url: first.source_url,
      source_display_name: group.sourceNames.join(" + "),
      source_jurisdiction_name: group.sourceNames.join(" + "),
      ...group.values,
      notes: normalizationNote(group),
    };
  });
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function setDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function assertSameJurisdictions(referenceRows, candidateRows, label) {
  const expected = sortedUnique(referenceRows.map((row) => normalizeWhitespace(row.jurisdiction_name)));
  const actual = sortedUnique(candidateRows.map((row) => normalizeWhitespace(row.jurisdiction_name)));
  const missing = setDifference(expected, actual);
  const extra = setDifference(actual, expected);
  assertCondition(!missing.length && !extra.length, label + " jurisdiction mismatch; missing=" + missing.join("|") + "; extra=" + extra.join("|"));
}

function assertCanonicalCoverage(rows, countyIndex, label) {
  assertEqual(rows.length, countyIndex.size, label + " row count");
  const expectedTags = sortedUnique([...countyIndex.values()].map((county) => county.jurisdictionTag));
  const actualTags = rows.map((row) => row.jurisdiction_tag);
  assertEqual(new Set(actualTags).size, rows.length, label + " unique jurisdictionTag count");
  const missing = setDifference(expectedTags, actualTags);
  const extra = setDifference(sortedUnique(actualTags), expectedTags);
  assertCondition(!missing.length && !extra.length, label + " FIPS coverage mismatch; missing=" + missing.join("|") + "; extra=" + extra.join("|"));
}

function numericTotals(rows, columns) {
  return Object.fromEntries(columns.map((column) => [column, rows.reduce((sum, row) => sum + intValue(row[column]), 0)]));
}

function reconcileTotals(rawRows, canonicalRows, columns, derive, label) {
  const raw = derive(numericTotals(rawRows, columns));
  const canonical = derive(numericTotals(canonicalRows, columns));
  const delta = Object.fromEntries(Object.keys(raw).map((key) => [key, canonical[key] - raw[key]]));
  for (const [key, value] of Object.entries(delta)) {
    assertEqual(value, 0, label + " statewide delta " + key);
  }
  return { raw, canonical, delta };
}

function presidentSummary(totals) {
  const other = presidentVoteColumns.slice(2).reduce((sum, column) => sum + totals[column], 0);
  return { trump: totals.trump, harris: totals.harris, other, total: totals.trump + totals.harris + other };
}

function senateSummary(totals) {
  const total = totals.comparison_rep + totals.comparison_dem + totals.comparison_other;
  return { rep: totals.comparison_rep, dem: totals.comparison_dem, other: totals.comparison_other, total };
}

function turnoutSummary(totals) {
  return { ballots_cast: totals.ballots_cast, registered_voters: totals.registered_voters };
}

function historicalSummary(totals) {
  return { dem: totals.dem_votes, rep: totals.rep_votes, other: totals.other_votes, total: totals.total_votes };
}

function artifactSummary(filePath, rowCount) {
  return {
    localArtifact: path.relative(repoRoot, filePath).replace(/\\/g, "/"),
    rowCount,
    sha256: sha256File(filePath),
  };
}


function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function intValue(value) {
  return Number(String(value ?? "0").replace(/,/g, ""));
}

function loadMissouriJurisdictions() {
  const lines = fs.readFileSync(presidentCsvPath, "utf8").trim().split(/\r?\n/);
  const header = lines.shift().split(",");
  const jurisdictionIndex = header.indexOf("jurisdiction_name");
  if (jurisdictionIndex < 0) {
    throw new Error("Missouri president CSV is missing jurisdiction_name");
  }
  return lines.map((line) => line.split(",")[jurisdictionIndex]);
}

function toMissouriJurisdictionName(rawName) {
  const name = normalizeWhitespace(rawName);
  if (name === "Kansas City" || name === "St. Louis City") {
    return name;
  }
  return `${name} County`;
}

async function extractText(pdfPath) {
  const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function buildTurnoutRows(jurisdictions) {
  const jurisdictionSet = new Set(jurisdictions);
  const rowsByJurisdiction = new Map();
  const text = await extractText(turnoutPdfPath);
  const pattern = /^(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)%$/;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = normalizeWhitespace(rawLine);
    const match = line.match(pattern);
    if (!match) {
      continue;
    }
    const jurisdiction = toMissouriJurisdictionName(match[1]);
    if (!jurisdictionSet.has(jurisdiction)) {
      continue;
    }
    rowsByJurisdiction.set(jurisdiction, {
      registered: intValue(match[2]),
      active: intValue(match[3]),
      inactive: intValue(match[4]),
      ballots: intValue(match[5]),
      turnoutPct: Number(match[6]),
    });
  }

  const missing = jurisdictions.filter((jurisdiction) => !rowsByJurisdiction.has(jurisdiction));
  if (missing.length) {
    throw new Error(`Turnout PDF missing Missouri jurisdictions: ${missing.join(", ")}`);
  }

  return jurisdictions.map((jurisdiction, index) => {
    const row = rowsByJurisdiction.get(jurisdiction);
    return {
      state: "MO",
      election_year: 2024,
      jurisdiction_code: `MO-${String(index + 1).padStart(3, "0")}`,
      jurisdiction_name: jurisdiction,
      county: jurisdiction,
      local_unit: jurisdiction,
      level: "jurisdiction",
      ballots_cast: row.ballots,
      registered_voters: row.registered,
      turnout_pct: row.turnoutPct.toFixed(2),
      denominator_type: "registeredVoters",
      denominator_timing: "sosElectionTurnoutReport",
      denominator_note: "Missouri SOS registered voters from the official 2024 General Election voter turnout report.",
      warning_required: "false",
      source_url: "https://www.sos.mo.gov/CMSImages/ElectionResultsStatistics/Nov2024OfficialVoterTurnout.pdf",
      source_title: "Missouri SOS 2024 General Election voter turnout report",
      source_status: "loaded",
    };
  });
}

function historicalVotes(source, values) {
  if (source.columns === "demRepLibConstitutionTotal") {
    const dem = intValue(values[0]);
    const rep = intValue(values[1]);
    const other = intValue(values[2]) + intValue(values[3]);
    return { dem, rep, other, total: intValue(values[4]) };
  }
  if (source.columns === "demRepLibConstitutionGreen") {
    const dem = intValue(values[0]);
    const rep = intValue(values[1]);
    const other = intValue(values[2]) + intValue(values[3]) + intValue(values[4]);
    return { dem, rep, other, total: dem + rep + other };
  }
  if (source.columns === "repDemLibGreenConstitutionWriteIn") {
    const rep = intValue(values[0]);
    const dem = intValue(values[1]);
    const other = intValue(values[2]) + intValue(values[3]) + intValue(values[4]) + intValue(values[5]);
    return { dem, rep, other, total: dem + rep + other };
  }
  throw new Error(`Unhandled historical source columns: ${source.columns}`);
}

async function buildHistoricalRows(jurisdictions) {
  const jurisdictionSet = new Set(jurisdictions);
  const rows = [];

  for (const source of historicalSources) {
    const text = await extractText(source.pdfPath);
    const rowsByJurisdiction = new Map();

    for (const rawLine of text.split(/\r?\n/)) {
      const line = normalizeWhitespace(rawLine);
      const match = line.match(source.pattern);
      if (!match) {
        continue;
      }
      const jurisdiction = toMissouriJurisdictionName(match[1]);
      if (!jurisdictionSet.has(jurisdiction) || rowsByJurisdiction.has(jurisdiction)) {
        continue;
      }
      rowsByJurisdiction.set(jurisdiction, historicalVotes(source, match.slice(2)));
    }

    const missing = jurisdictions.filter((jurisdiction) => !rowsByJurisdiction.has(jurisdiction));
    if (missing.length) {
      throw new Error(`${source.year} historical PDF missing Missouri jurisdictions: ${missing.join(", ")}`);
    }

    for (const jurisdiction of jurisdictions) {
      const votes = rowsByJurisdiction.get(jurisdiction);
      rows.push({
        state: "MO",
        election_year: source.year,
        jurisdiction_name: jurisdiction,
        county: jurisdiction,
        local_unit: jurisdiction,
        source_id: "mo-historical-presidential-sos-county-pdfs",
        source_level: "county_reporting_jurisdiction",
        row_method: source.rowMethod,
        source_url: source.sourceUrl,
        dem_votes: votes.dem,
        rep_votes: votes.rep,
        other_votes: votes.other,
        total_votes: votes.total,
      });
    }
  }

  return rows;
}

async function main() {
  const turnoutHeaders = [
    "state",
    "election_year",
    "jurisdiction_code",
    "jurisdiction_name",
    "county",
    "local_unit",
    "level",
    "ballots_cast",
    "registered_voters",
    "turnout_pct",
    "denominator_type",
    "denominator_timing",
    "denominator_note",
    "warning_required",
    "source_url",
    "source_title",
    "source_status",
  ];
  const historicalHeaders = [
    "state",
    "election_year",
    "jurisdiction_name",
    "county",
    "local_unit",
    "source_id",
    "source_level",
    "row_method",
    "source_url",
    "dem_votes",
    "rep_votes",
    "other_votes",
    "total_votes",
  ];

  const jurisdictions = loadMissouriJurisdictions();
  const generatedTurnoutRows = await buildTurnoutRows(jurisdictions);
  const generatedHistoricalRows = await buildHistoricalRows(jurisdictions);
  preserveRawCsv(turnoutCsvPath, turnoutHeaders, generatedTurnoutRows);
  preserveRawCsv(historicalCsvPath, historicalHeaders, generatedHistoricalRows);

  const rawPresidentRows = readCsv(presidentCsvPath);
  const rawSenateRows = readCsv(senateCsvPath);
  const rawTurnoutRows = readCsv(turnoutCsvPath);
  const rawHistoricalRows = readCsv(historicalCsvPath);
  assertEqual(rawPresidentRows.length, rawExpectedRows.president, "Raw Missouri presidential row count");
  assertEqual(rawSenateRows.length, rawExpectedRows.senate, "Raw Missouri U.S. Senate row count");
  assertEqual(rawTurnoutRows.length, rawExpectedRows.turnout, "Raw Missouri turnout row count");
  assertEqual(rawHistoricalRows.length, rawExpectedRows.historical, "Raw Missouri historical row count");
  assertSameJurisdictions(rawPresidentRows, rawSenateRows, "Missouri President/Senate");
  assertSameJurisdictions(rawPresidentRows, rawTurnoutRows, "Missouri President/turnout");

  const historicalYears = [2012, 2016, 2020];
  for (const year of historicalYears) {
    const yearRows = rawHistoricalRows.filter((row) => intValue(row.election_year) === year);
    assertEqual(yearRows.length, rawExpectedRows.president, "Raw Missouri historical " + year + " row count");
    assertSameJurisdictions(rawPresidentRows, yearRows, "Missouri President/historical " + year);
  }

  const countyIndex = loadCountyIndex();
  const countyPresidentRows = buildCanonicalPresidentRows(rawPresidentRows, countyIndex);
  const countySenateRows = buildCanonicalSenateRows(rawSenateRows, countyIndex);
  const countyTurnoutRows = buildCanonicalTurnoutRows(rawTurnoutRows, countyIndex);
  const countyHistoricalRows = buildCanonicalHistoricalRows(rawHistoricalRows, countyIndex);
  assertEqual(countyPresidentRows.length, canonicalExpectedRows.president, "Canonical Missouri presidential row count");
  assertEqual(countySenateRows.length, canonicalExpectedRows.senate, "Canonical Missouri U.S. Senate row count");
  assertEqual(countyTurnoutRows.length, canonicalExpectedRows.turnout, "Canonical Missouri turnout row count");
  assertEqual(countyHistoricalRows.length, canonicalExpectedRows.historical, "Canonical Missouri historical row count");
  assertCanonicalCoverage(countyPresidentRows, countyIndex, "Canonical Missouri 2024 presidential");
  assertCanonicalCoverage(countySenateRows, countyIndex, "Canonical Missouri 2024 U.S. Senate");
  assertCanonicalCoverage(countyTurnoutRows, countyIndex, "Canonical Missouri 2024 turnout");
  for (const year of historicalYears) {
    assertCanonicalCoverage(
      countyHistoricalRows.filter((row) => intValue(row.election_year) === year),
      countyIndex,
      "Canonical Missouri historical " + year,
    );
  }

  const presidentialReconciliation = reconcileTotals(
    rawPresidentRows,
    countyPresidentRows,
    presidentVoteColumns,
    presidentSummary,
    "Missouri 2024 presidential",
  );
  const senateReconciliation = reconcileTotals(
    rawSenateRows,
    countySenateRows,
    senateVoteColumns,
    senateSummary,
    "Missouri 2024 U.S. Senate",
  );
  const turnoutReconciliation = reconcileTotals(
    rawTurnoutRows,
    countyTurnoutRows,
    ["ballots_cast", "registered_voters"],
    turnoutSummary,
    "Missouri 2024 turnout",
  );
  assertExpectedValues(presidentialReconciliation.raw, expectedStatewide.president, "Missouri official presidential statewide pin");
  assertExpectedValues({ total: senateReconciliation.raw.total }, expectedStatewide.senate, "Missouri official U.S. Senate statewide pin");
  assertExpectedValues(turnoutReconciliation.raw, expectedStatewide.turnout, "Missouri official turnout statewide pin");

  const historicalReconciliation = {};
  for (const year of historicalYears) {
    historicalReconciliation[year] = reconcileTotals(
      rawHistoricalRows.filter((row) => intValue(row.election_year) === year),
      countyHistoricalRows.filter((row) => intValue(row.election_year) === year),
      historicalVoteColumns,
      historicalSummary,
      "Missouri historical presidential " + year,
    );
  }

  const jacksonPresident = countyPresidentRows.find((row) => row.jurisdiction_tag === "county:29095");
  const jacksonSenate = countySenateRows.find((row) => row.jurisdiction_tag === "county:29095");
  const jacksonTurnout = countyTurnoutRows.find((row) => row.jurisdiction_tag === "county:29095");
  assertCondition(jacksonPresident && jacksonSenate && jacksonTurnout, "Canonical Missouri artifacts are missing Jackson County");
  const jacksonPresidentPin = presidentSummary(numericTotals([jacksonPresident], presidentVoteColumns));
  const jacksonSenatePin = senateSummary(numericTotals([jacksonSenate], senateVoteColumns));
  const jacksonTurnoutPin = {
    ballots: intValue(jacksonTurnout.ballots_cast),
    registered: intValue(jacksonTurnout.registered_voters),
    turnoutPct: jacksonTurnout.turnout_pct,
  };
  assertExpectedValues(jacksonPresidentPin, expectedJackson.president2024, "Jackson County 2024 presidential pin");
  assertExpectedValues(jacksonSenatePin, expectedJackson.senate2024, "Jackson County 2024 U.S. Senate pin");
  assertExpectedValues(jacksonTurnoutPin, expectedJackson.turnout2024, "Jackson County 2024 turnout pin");

  const jacksonHistoricalPins = {};
  for (const year of historicalYears) {
    const row = countyHistoricalRows.find(
      (candidate) => intValue(candidate.election_year) === year && candidate.jurisdiction_tag === "county:29095",
    );
    assertCondition(row, "Canonical Missouri historical artifact is missing Jackson County for " + year);
    const pin = historicalSummary(numericTotals([row], historicalVoteColumns));
    assertExpectedValues(pin, expectedJackson.historical[year], "Jackson County historical presidential pin " + year);
    jacksonHistoricalPins[year] = pin;
  }

  writeCsv(
    countyPresidentCsvPath,
    [
      "state",
      "election_year",
      "jurisdiction_name",
      "jurisdiction_geoid",
      "jurisdiction_tag",
      ...presidentVoteColumns,
      "source_jurisdictions",
      "normalization_note",
    ],
    countyPresidentRows,
  );
  writeCsv(
    countySenateCsvPath,
    [
      "state",
      "election_year",
      "jurisdiction_name",
      "jurisdiction_geoid",
      "jurisdiction_tag",
      ...senateVoteColumns,
      "source_jurisdictions",
      "normalization_note",
    ],
    countySenateRows,
  );
  writeCsv(
    countyTurnoutCsvPath,
    [
      "state",
      "election_year",
      "jurisdiction_code",
      "jurisdiction_name",
      "jurisdiction_geoid",
      "jurisdiction_tag",
      "county",
      "local_unit",
      "level",
      "ballots_cast",
      "registered_voters",
      "turnout_pct",
      "denominator_type",
      "denominator_timing",
      "denominator_note",
      "warning_required",
      "source_url",
      "source_title",
      "source_status",
      "source_jurisdictions",
      "normalization_note",
    ],
    countyTurnoutRows,
  );
  writeCsv(
    countyHistoricalCsvPath,
    [
      "state",
      "election_year",
      "jurisdiction_name",
      "jurisdiction_geoid",
      "jurisdiction_tag",
      "county",
      "local_unit",
      "source_id",
      "source_level",
      "row_method",
      "source_url",
      "source_display_name",
      "source_jurisdiction_name",
      ...historicalVoteColumns,
      "notes",
    ],
    countyHistoricalRows,
  );

  const projectSourceRows = (rows, columns) => rows
    .filter((row) => ["Jackson County", "Kansas City"].includes(row.jurisdiction_name))
    .map((row) => ({
      jurisdictionName: row.jurisdiction_name,
      ...Object.fromEntries(columns.map((column) => [column, intValue(row[column])])),
    }));
  const rawHistoricalJackson = Object.fromEntries(historicalYears.map((year) => [
    year,
    projectSourceRows(rawHistoricalRows.filter((row) => intValue(row.election_year) === year), historicalVoteColumns),
  ]));

  const reconciliation = {
    schemaVersion: 1,
    state: "MO",
    electionYears: [2012, 2016, 2020, 2024],
    generatedBy: "scripts/normalize-mo-sos-pdfs.mjs",
    purpose: "Reproducible Missouri Census-county FIPS aggregation that preserves the official 116-election-authority source rows and emits 115 county/county-equivalent rows.",
    officialGeographyEvidence: {
      authority: "Missouri Secretary of State",
      url: kansasCityAuthorityUrl,
      checkedAt: "2026-07-10",
      finding: "The official local-election-authority directory identifies Jackson County outside Kansas City and Kansas City within Jackson County as separate election authorities. Their rows are therefore summed for Census Jackson County GEOID 29095.",
      censusGeometryArtifact: "data/mo-counties.geojson",
      censusCountyEquivalentCount: countyIndex.size,
    },
    transformation: {
      inputGrain: "116 Missouri election authorities, including Jackson County outside Kansas City and Kansas City within Jackson County",
      outputGrain: "115 Census counties/county-equivalents",
      aggregation: "Kansas City + Jackson County -> Jackson County (county:29095)",
      displayNameNormalization: "De Kalb County -> DeKalb County (county:29063)",
      rawArtifactsRemainUnchanged: true,
    },
    artifacts: {
      president2024: {
        raw: artifactSummary(presidentCsvPath, rawPresidentRows.length),
        canonical: artifactSummary(countyPresidentCsvPath, countyPresidentRows.length),
      },
      senate2024: {
        raw: artifactSummary(senateCsvPath, rawSenateRows.length),
        canonical: artifactSummary(countySenateCsvPath, countySenateRows.length),
      },
      turnout2024: {
        raw: artifactSummary(turnoutCsvPath, rawTurnoutRows.length),
        canonical: artifactSummary(countyTurnoutCsvPath, countyTurnoutRows.length),
      },
      historicalPresidential: {
        raw: artifactSummary(historicalCsvPath, rawHistoricalRows.length),
        canonical: artifactSummary(countyHistoricalCsvPath, countyHistoricalRows.length),
      },
    },
    fipsCoverage: {
      expectedCountyEquivalentsPerYear: countyIndex.size,
      president2024: sortedUnique(countyPresidentRows.map((row) => row.jurisdiction_tag)).length,
      senate2024: sortedUnique(countySenateRows.map((row) => row.jurisdiction_tag)).length,
      turnout2024: sortedUnique(countyTurnoutRows.map((row) => row.jurisdiction_tag)).length,
      historicalByYear: Object.fromEntries(historicalYears.map((year) => [
        year,
        sortedUnique(countyHistoricalRows.filter((row) => intValue(row.election_year) === year).map((row) => row.jurisdiction_tag)).length,
      ])),
      missingTags: [],
      duplicateTags: [],
    },
    statewideZeroDeltaGates: {
      president2024: presidentialReconciliation,
      senate2024: senateReconciliation,
      turnout2024: turnoutReconciliation,
      historicalPresidential: historicalReconciliation,
    },
    jacksonCountyPins: {
      sourceRows: {
        president2024: projectSourceRows(rawPresidentRows, presidentVoteColumns),
        senate2024: projectSourceRows(rawSenateRows, senateVoteColumns),
        turnout2024: projectSourceRows(rawTurnoutRows, ["ballots_cast", "registered_voters"]),
        historicalPresidential: rawHistoricalJackson,
      },
      canonical: {
        president2024: jacksonPresidentPin,
        senate2024: jacksonSenatePin,
        turnout2024: jacksonTurnoutPin,
        historicalPresidential: jacksonHistoricalPins,
      },
    },
    gates: {
      rawRowCounts: rawExpectedRows,
      canonicalRowCounts: canonicalExpectedRows,
      rawArtifactsPreservedByteForByte: true,
      statewideDeltasAreZero: true,
      jacksonPinsMatchReviewedValues: true,
      everyCanonicalRowHasCountyFips: true,
    },
    caveats: [
      "The source PDFs remain authoritative at 116-election-authority grain; the canonical artifacts are a deterministic county-geography view.",
      "The aggregation does not create precinct geography and does not change the documented precinct-file purchase/crosswalk blocker.",
      "The 2016 historical PDF does not expose county-level write-in detail; its other and total values remain sums of visible party columns.",
    ],
  };
  fs.writeFileSync(reconciliationPath, JSON.stringify(reconciliation, null, 2) + "\n", "utf8");

  console.log(
    "Preserved 116 raw Missouri rows per 2024 source and wrote 115 FIPS county rows for President, U.S. Senate, and turnout; wrote "
      + countyHistoricalRows.length
      + " county historical rows (115 per year) with zero statewide deltas.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
