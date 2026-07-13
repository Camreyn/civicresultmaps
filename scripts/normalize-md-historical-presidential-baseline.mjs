import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const dataDir = path.join(repoRoot, "data");
const outputCsvPath = path.join(dataDir, "md-historical-presidential-baseline.csv");
const summaryPath = path.join(dataDir, "md-historical-presidential-baseline-summary.json");

const COUNTY_CODES = new Map([
  ["01", "Allegany County"],
  ["02", "Anne Arundel County"],
  ["03", "Baltimore City"],
  ["04", "Baltimore County"],
  ["05", "Calvert County"],
  ["06", "Caroline County"],
  ["07", "Carroll County"],
  ["08", "Cecil County"],
  ["09", "Charles County"],
  ["10", "Dorchester County"],
  ["11", "Frederick County"],
  ["12", "Garrett County"],
  ["13", "Harford County"],
  ["14", "Howard County"],
  ["15", "Kent County"],
  ["16", "Montgomery County"],
  ["17", "Prince George's County"],
  ["18", "Queen Anne's County"],
  ["19", "St. Mary's County"],
  ["20", "Somerset County"],
  ["21", "Talbot County"],
  ["22", "Washington County"],
  ["23", "Wicomico County"],
  ["24", "Worcester County"],
]);

const COUNTY_DISPLAY = new Map([...COUNTY_CODES.values()].map((name) => [name.replace(/ County$/, ""), name]));

const SOURCES = [
  {
    year: 2016,
    id: "md-2016-president-county-results",
    url: "https://elections.maryland.gov/elections/archive/2016/results/general/gen_detail_results_2016_4_BOT001-.html",
    localFile: path.join(dataDir, "md-2016-president-county-results.html"),
    expected: { rowCount: 24, dem: 1677928, rep: 943169, other: 160349, total: 2781446 },
  },
  {
    year: 2020,
    id: "md-2020-general-all-by-precinct",
    url: "https://elections.maryland.gov/elections/archive/2020/election_data/All_By_Precinct_2020_General.csv",
    localFile: path.join(dataDir, "md-2020-general-all-by-precinct.csv"),
    expected: { rowCount: 24, dem: 1985023, rep: 976414, other: 75594, total: 3037031 },
  },
];

function intText(value) {
  return Number(String(value ?? "").replace(/[^0-9-]/g, "")) || 0;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    const next = clean[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value !== ""));
}

function writeCsv(filePath, headers, rows) {
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function cleanHtmlCell(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parse2016CountyHtml(source) {
  const html = fs.readFileSync(source.localFile, "utf8");
  const totals = new Map([...COUNTY_DISPLAY.entries()].map(([county, display]) => [county, {
    jurisdiction_name: display,
    dem_votes: 0,
    rep_votes: 0,
    other_votes: 0,
  }]));

  let tableIndex = -1;
  for (const table of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    if (!table.includes("DetailsNameCol")) {
      continue;
    }
    tableIndex += 1;
    for (const tr of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => cleanHtmlCell(match[1]));
      if (cells.length < 2 || !totals.has(cells[0])) {
        continue;
      }
      const county = totals.get(cells[0]);
      const values = cells.slice(1).map(intText);
      if (tableIndex === 0) {
        county.rep_votes += values[0] ?? 0;
        county.dem_votes += values[1] ?? 0;
        county.other_votes += values.slice(2).reduce((sum, votes) => sum + votes, 0);
      } else {
        county.other_votes += values.reduce((sum, votes) => sum + votes, 0);
      }
    }
  }

  return [...totals.values()].map((row) => ({
    state: "MD",
    election_year: source.year,
    jurisdiction_name: row.jurisdiction_name,
    source_id: "md-historical-presidential-baseline",
    source_level: "county",
    row_method: "historicalPresidentialCsv",
    dem_votes: row.dem_votes,
    rep_votes: row.rep_votes,
    other_votes: row.other_votes,
    total_votes: row.dem_votes + row.rep_votes + row.other_votes,
    source_url: source.url,
  }));
}

function parse2020PrecinctCsv(source) {
  const rows = parseCsv(fs.readFileSync(source.localFile, "utf8"));
  const [headers, ...body] = rows;
  const index = new Map(headers.map((header, offset) => [header, offset]));
  for (const required of ["County", "Office Name", "Candidate Name", "Party", "Total Votes"]) {
    if (!index.has(required)) {
      throw new Error(`Maryland 2020 historical CSV missing column: ${required}`);
    }
  }

  const totals = new Map([...COUNTY_CODES.values()].map((county) => [county, {
    jurisdiction_name: county,
    dem_votes: 0,
    rep_votes: 0,
    other_votes: 0,
  }]));

  for (const row of body) {
    if (row[index.get("Office Name")] !== "President - Vice Pres") {
      continue;
    }
    const county = COUNTY_CODES.get(row[index.get("County")]);
    if (!county) {
      throw new Error(`Unknown Maryland county code in 2020 historical CSV: ${row[index.get("County")]}`);
    }
    const candidate = row[index.get("Candidate Name")];
    const party = row[index.get("Party")];
    const votes = intText(row[index.get("Total Votes")]);
    const countyTotals = totals.get(county);
    if (party === "DEM" || candidate === "Joe Biden") {
      countyTotals.dem_votes += votes;
    } else if (party === "REP" || candidate === "Donald J. Trump") {
      countyTotals.rep_votes += votes;
    } else {
      countyTotals.other_votes += votes;
    }
  }

  return [...totals.values()].map((row) => ({
    state: "MD",
    election_year: source.year,
    jurisdiction_name: row.jurisdiction_name,
    source_id: "md-historical-presidential-baseline",
    source_level: "county",
    row_method: "historicalPresidentialCsv",
    dem_votes: row.dem_votes,
    rep_votes: row.rep_votes,
    other_votes: row.other_votes,
    total_votes: row.dem_votes + row.rep_votes + row.other_votes,
    source_url: source.url,
  }));
}

function assertSummary(source, rows) {
  const totals = rows.reduce(
    (acc, row) => ({
      rowCount: acc.rowCount + 1,
      dem: acc.dem + row.dem_votes,
      rep: acc.rep + row.rep_votes,
      other: acc.other + row.other_votes,
      total: acc.total + row.total_votes,
    }),
    { rowCount: 0, dem: 0, rep: 0, other: 0, total: 0 },
  );
  const mismatches = Object.entries(source.expected).filter(([key, expected]) => totals[key] !== expected);
  if (mismatches.length) {
    throw new Error(`${source.year} Maryland totals did not reconcile: ${JSON.stringify({ totals, expected: source.expected })}`);
  }
  return totals;
}

const allRows = [];
const summary = {
  generatedAt: new Date().toISOString(),
  authority: "Maryland State Board of Elections",
  parser: "scripts/normalize-md-historical-presidential-baseline.mjs",
  caveat: "Official Maryland 2016 county result HTML and 2020 full all-precinct CSV normalized to county/county-equivalent baselines. The 2020 all-by-precinct source totals 3,037,031 votes, one more Other/write-in vote than the county/statewide package total of 3,037,030 because Calvert County Other Write-Ins is 248 versus 247; the all-by-precinct source value is preserved without allocating or suppressing the difference. Baltimore City and Baltimore County remain distinct county-equivalent rows. 2012 remains uncollected.",
  sources: [],
};

for (const source of SOURCES) {
  if (!fs.existsSync(source.localFile)) {
    throw new Error(`Missing source artifact: ${source.localFile}`);
  }
  const rows = source.year === 2016 ? parse2016CountyHtml(source) : parse2020PrecinctCsv(source);
  const totals = assertSummary(source, rows);
  allRows.push(...rows);
  summary.sources.push({
    id: source.id,
    year: source.year,
    url: source.url,
    localFile: path.relative(repoRoot, source.localFile).replace(/\\/g, "/"),
    rowCount: totals.rowCount,
    demVotes: totals.dem,
    repVotes: totals.rep,
    otherVotes: totals.other,
    totalVotes: totals.total,
  });
}

writeCsv(
  outputCsvPath,
  [
    "state",
    "election_year",
    "jurisdiction_name",
    "source_id",
    "source_level",
    "row_method",
    "dem_votes",
    "rep_votes",
    "other_votes",
    "total_votes",
    "source_url",
  ],
  allRows.sort((a, b) => a.election_year - b.election_year || a.jurisdiction_name.localeCompare(b.jurisdiction_name)),
);

summary.output = {
  localFile: path.relative(repoRoot, outputCsvPath).replace(/\\/g, "/"),
  rowCount: allRows.length,
  years: SOURCES.map((source) => source.year),
};
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary.output));
