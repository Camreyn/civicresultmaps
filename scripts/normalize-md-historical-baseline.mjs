import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const SOURCE_ID = "md-2020-general-county-results";
const SOURCE_BASE_URL = "https://elections.maryland.gov/elections/archive/2020/election_data/";
const INPUT_DIR = path.join("data", "md-2020-general-county-results");
const INPUT_DIR_DISPLAY = "data/md-2020-general-county-results";
const STATEWIDE_FILE = path.join("data", "md-2020-general-statewide.csv");
const STATEWIDE_FILE_DISPLAY = "data/md-2020-general-statewide.csv";
const OUTPUT = path.join("data", "md-historical-presidential-baseline.csv");
const OUTPUT_DISPLAY = "data/md-historical-presidential-baseline.csv";
const SUMMARY_OUTPUT = path.join("data", "md-2020-historical-presidential-baseline-summary.json");

const counties = new Map([
  ["Allegany_County_2020_General.csv", { name: "Allegany County", geoid: "24001" }],
  ["Anne_Arundel_County_2020_General.csv", { name: "Anne Arundel County", geoid: "24003" }],
  ["Baltimore_City_County_2020_General.csv", { name: "Baltimore City", geoid: "24510" }],
  ["Baltimore_County_2020_General.csv", { name: "Baltimore County", geoid: "24005" }],
  ["Calvert_County_2020_General.csv", { name: "Calvert County", geoid: "24009" }],
  ["Caroline_County_2020_General.csv", { name: "Caroline County", geoid: "24011" }],
  ["Carroll_County_2020_General.csv", { name: "Carroll County", geoid: "24013" }],
  ["Cecil_County_2020_General.csv", { name: "Cecil County", geoid: "24015" }],
  ["Charles_County_2020_General.csv", { name: "Charles County", geoid: "24017" }],
  ["Dorchester_County_2020_General.csv", { name: "Dorchester County", geoid: "24019" }],
  ["Frederick_County_2020_General.csv", { name: "Frederick County", geoid: "24021" }],
  ["Garrett_County_2020_General.csv", { name: "Garrett County", geoid: "24023" }],
  ["Harford_County_2020_General.csv", { name: "Harford County", geoid: "24025" }],
  ["Howard_County_2020_General.csv", { name: "Howard County", geoid: "24027" }],
  ["Kent_County_2020_General.csv", { name: "Kent County", geoid: "24029" }],
  ["Montgomery_County_2020_General.csv", { name: "Montgomery County", geoid: "24031" }],
  ["Prince_Georges_County_2020_General.csv", { name: "Prince George's County", geoid: "24033" }],
  ["Queen_Annes_County_2020_General.csv", { name: "Queen Anne's County", geoid: "24035" }],
  ["Somerset_County_2020_General.csv", { name: "Somerset County", geoid: "24039" }],
  ["St._Marys_County_2020_General.csv", { name: "St. Mary's County", geoid: "24037" }],
  ["Talbot_County_2020_General.csv", { name: "Talbot County", geoid: "24041" }],
  ["Washington_County_2020_General.csv", { name: "Washington County", geoid: "24043" }],
  ["Wicomico_County_2020_General.csv", { name: "Wicomico County", geoid: "24045" }],
  ["Worcester_County_2020_General.csv", { name: "Worcester County", geoid: "24047" }],
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...records] = rows.filter((candidate) => candidate.some((value) => value !== ""));
  return records.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), (record[index] ?? "").trim()])),
  );
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function candidateBucket(row) {
  const candidate = row["Candidate Name"].toLowerCase();
  const party = row.Party.toUpperCase();
  if (candidate.includes("joe biden") || party === "DEM") {
    return "dem";
  }
  if (candidate.includes("donald j. trump") || party === "REP") {
    return "rep";
  }
  return "other";
}

function intValue(value) {
  const cleaned = String(value ?? "").replace(/[^\d-]/g, "");
  return cleaned ? Number.parseInt(cleaned, 10) : 0;
}

function totalsFromFile(file) {
  const rows = parseCsv(readFileSync(path.join(INPUT_DIR, file), "utf8"));
  const totals = { dem: 0, rep: 0, other: 0, total: 0 };
  for (const row of rows) {
    if (row["Office Name"] !== "President - Vice Pres") {
      continue;
    }
    const votes = intValue(row["Total Votes"]);
    totals[candidateBucket(row)] += votes;
    totals.total += votes;
  }
  return totals;
}

function statewideTotals() {
  const rows = parseCsv(readFileSync(STATEWIDE_FILE, "utf8"));
  const totals = { dem: 0, rep: 0, other: 0, total: 0 };
  for (const row of rows) {
    if (row.County !== "00" || row["Office Name"] !== "President - Vice Pres") {
      continue;
    }
    const votes = intValue(row["Total Votes"]);
    totals[candidateBucket(row)] += votes;
    totals.total += votes;
  }
  return totals;
}

const actualFiles = readdirSync(INPUT_DIR).filter((file) => file.endsWith(".csv")).sort();
const expectedFiles = [...counties.keys()].sort();
const missing = expectedFiles.filter((file) => !actualFiles.includes(file));
const extra = actualFiles.filter((file) => !counties.has(file));
if (missing.length || extra.length) {
  throw new Error(`Maryland 2020 county file mismatch: missing=${missing.join(";")} extra=${extra.join(";")}`);
}

const rows = expectedFiles.map((file) => {
  const county = counties.get(file);
  const totals = totalsFromFile(file);
  return {
    state: "MD",
    election_year: 2020,
    jurisdiction_name: county.name,
    local_unit: county.name,
    jurisdiction_geoid: county.geoid,
    jurisdiction_tag: `county:${county.geoid}`,
    source_id: SOURCE_ID,
    source_level: "county",
    row_method: "marylandSbeCountyCsv",
    dem_votes: totals.dem,
    rep_votes: totals.rep,
    other_votes: totals.other,
    total_votes: totals.total,
    source_url: `${SOURCE_BASE_URL}${encodeURIComponent(file)}`,
  };
});

const aggregate = rows.reduce(
  (sum, row) => ({
    dem: sum.dem + row.dem_votes,
    rep: sum.rep + row.rep_votes,
    other: sum.other + row.other_votes,
    total: sum.total + row.total_votes,
  }),
  { dem: 0, rep: 0, other: 0, total: 0 },
);
const statewide = statewideTotals();
if (JSON.stringify(aggregate) !== JSON.stringify(statewide)) {
  throw new Error(`Maryland 2020 county totals do not reconcile to statewide totals: ${JSON.stringify({ aggregate, statewide })}`);
}

const headers = [
  "state",
  "election_year",
  "jurisdiction_name",
  "local_unit",
  "jurisdiction_geoid",
  "jurisdiction_tag",
  "source_id",
  "source_level",
  "row_method",
  "dem_votes",
  "rep_votes",
  "other_votes",
  "total_votes",
  "source_url",
];
writeFileSync(OUTPUT, `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")).join("\n")}\n`);
writeFileSync(
  SUMMARY_OUTPUT,
  `${JSON.stringify(
    {
      sourceAuthority: "Maryland State Board of Elections",
      sourceUrl: "https://elections.maryland.gov/elections/archive/2020/election_data/index.html",
      localSourceDirectory: INPUT_DIR_DISPLAY,
      output: OUTPUT_DISPLAY,
      rows: rows.length,
      electionYear: 2020,
      reportingGrain: "county_or_county_equivalent",
      totals: aggregate,
      reconcilesToStatewideFile: true,
      statewideReconciliationFile: STATEWIDE_FILE_DISPLAY,
      caveats: [
        "The official SBE statewide County=00 row is used only as a reconciliation check and is not emitted as a jurisdiction row.",
        "Baltimore City and Baltimore County are mapped only from distinct official county-result files and distinct Census county-equivalent GEOIDs.",
      ],
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify({ output: OUTPUT, rows: rows.length, totals: aggregate }, null, 2));
