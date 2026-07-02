import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { PDFParse } from "pdf-parse";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const canvassPdf = "data/ut-2024-general-election-statewide-canvass.pdf";
const turnoutWorkbook = "data/ut-2024-master-aggregated-numbers-2023-2025.xlsx";
const presidentOut = "data/ut-2024-general-president.csv";
const attorneyGeneralOut = "data/ut-2024-general-attorney-general.csv";
const turnoutOut = "data/ut-2024-general-turnout.csv";

const counties = [
  "Beaver County",
  "Box Elder County",
  "Cache County",
  "Carbon County",
  "Daggett County",
  "Davis County",
  "Duchesne County",
  "Emery County",
  "Garfield County",
  "Grand County",
  "Iron County",
  "Juab County",
  "Kane County",
  "Millard County",
  "Morgan County",
  "Piute County",
  "Rich County",
  "Salt Lake County",
  "San Juan County",
  "Sanpete County",
  "Sevier County",
  "Summit County",
  "Tooele County",
  "Uintah County",
  "Utah County",
  "Wasatch County",
  "Washington County",
  "Wayne County",
  "Weber County",
];

function intValue(value) {
  return Number(String(value ?? "0").replaceAll(",", "").trim() || "0");
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(filePath, headers, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    [headers.join(","), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(","))].join("\n") +
      "\n",
    "utf8",
  );
}

function countyRegex(county) {
  if (county === "Washington County") {
    return "Washington\\s+(?:County|Counl\\))";
  }
  return county.replaceAll(" ", "\\s+");
}

function parsePdfCountyRows(text, contestStart, contestEnd, columnCount) {
  const start = text.indexOf(contestStart);
  if (start < 0) throw new Error(`Missing contest start: ${contestStart}`);
  const end = text.indexOf(contestEnd, start);
  if (end < 0) throw new Error(`Missing contest end: ${contestEnd}`);
  const block = text.slice(start, end);
  const rows = new Map();

  for (const county of counties) {
    const match = block.match(new RegExp(`${countyRegex(county)}\\s+([0-9,\\s\\t]+)`, "m"));
    if (!match) throw new Error(`Missing ${contestStart} row for ${county}`);
    const values = match[1].trim().split(/\s+/).map(intValue);
    if (values.length !== columnCount) {
      throw new Error(`${contestStart} ${county} row has ${values.length} columns; expected ${columnCount}`);
    }
    rows.set(county, values);
  }

  return rows;
}

function parseSequentialCountyRows(text, contestStart, markerBeforeRows, contestEnd, columnCount) {
  const start = text.indexOf(contestStart);
  if (start < 0) throw new Error("Missing contest start: " + contestStart);
  const marker = text.indexOf(markerBeforeRows, start);
  if (marker < 0) throw new Error("Missing row marker for " + contestStart + ": " + markerBeforeRows);
  const end = text.indexOf(contestEnd, marker);
  if (end < 0) throw new Error("Missing contest end: " + contestEnd);
  const values = [];
  for (const line of text.slice(marker + markerBeforeRows.length, end).split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    if (parts.length === columnCount && parts.every((part) => /^[0-9,]+$/.test(part))) {
      values.push(parts.map(intValue));
    }
  }
  if (values.length < counties.length) {
    throw new Error(contestStart + " has " + values.length + " numeric county rows; expected at least " + counties.length);
  }
  return new Map(counties.map((county, index) => [county, values[index]]));
}
function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function extractPdfText(filePath) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const result = await parser.getText();
    return result.text.replace(/\r\n/g, "\n");
  } finally {
    await parser.destroy();
  }
}

function buildTurnoutRows() {
  const workbook = XLSX.readFile(turnoutWorkbook);
  const worksheet = workbook.Sheets.G24;
  if (!worksheet) throw new Error("Workbook is missing G24 sheet");
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, defval: "" }).slice(1);
  const byCounty = new Map();

  for (const row of rows) {
    const county = String(row[0] ?? "").trim();
    if (!county || county === "Statewide") continue;
    byCounty.set(`${county} County`, row);
  }

  return counties.map((county, index) => {
    const row = byCounty.get(county);
    if (!row) throw new Error(`Turnout workbook missing ${county}`);
    const ballotsCast = intValue(row[7]);
    const activeVoters = intValue(row[2]);
    return {
      state: "UT",
      election_year: 2024,
      jurisdiction_code: `UT-${String(index + 1).padStart(3, "0")}`,
      jurisdiction_name: county,
      county,
      local_unit: county,
      level: "county",
      ballots_cast: ballotsCast,
      registered_voters: activeVoters,
      turnout_pct: activeVoters ? ((ballotsCast / activeVoters) * 100).toFixed(2) : "",
      denominator_type: "activeVoters",
      denominator_timing: "countyStandardizedCanvass",
      denominator_note:
        "Utah county standardized canvass G24 active voters; total ballots counted is the county canvass total, not presidential contest votes.",
      warning_required: "false",
      source_url: "https://vote.utah.gov/wp-content/uploads/2025/12/Master-Aggregated-Numbers-2023-2025.xlsx",
      source_title: "Utah aggregated county standardized canvass statistics 2023-2025",
      source_status: "loaded",
    };
  });
}

const text = await extractPdfText(canvassPdf);

const president = parsePdfCountyRows(text, "U.S. President and Vice President", "Total Votes Cast 2,199", 10);
const presidentRows = counties.map((county) => {
  const values = president.get(county);
  const other = values[0] + values[1] + values[2] + values[3] + values[5] + values[7] + values[8] + values[9];
  return {
    state: "UT",
    election_year: 2024,
    jurisdiction_name: county,
    harris: values[6],
    trump: values[4],
    other,
  };
});

assertEqual("President county rows", presidentRows.length, 29);
assertEqual("President Trump votes", presidentRows.reduce((sum, row) => sum + row.trump, 0), 883818);
assertEqual("President Harris votes", presidentRows.reduce((sum, row) => sum + row.harris, 0), 562566);
assertEqual("President other named-candidate votes", presidentRows.reduce((sum, row) => sum + row.other, 0), 41626);

const attorneyGeneral = parseSequentialCountyRows(text, "Attorney General", "MICHELLE QUIST\n(UUP)", "Single County Races", 5);
const attorneyGeneralRows = counties.map((county) => {
  const values = attorneyGeneral.get(county);
  return {
    state: "UT",
    election_year: 2024,
    jurisdiction_name: county,
    comparison_dem: values[1],
    comparison_rep: values[0],
    comparison_other: values[2] + values[3] + values[4],
  };
});

assertEqual("Attorney General county rows", attorneyGeneralRows.length, 29);
assertEqual("Attorney General Republican votes", attorneyGeneralRows.reduce((sum, row) => sum + row.comparison_rep, 0), 838445);
assertEqual("Attorney General Democratic votes", attorneyGeneralRows.reduce((sum, row) => sum + row.comparison_dem, 0), 401234);
assertEqual("Attorney General other votes", attorneyGeneralRows.reduce((sum, row) => sum + row.comparison_other, 0), 209816);

const turnoutRows = buildTurnoutRows();
assertEqual("Turnout county rows", turnoutRows.length, 29);
assertEqual("Turnout active voters", turnoutRows.reduce((sum, row) => sum + Number(row.registered_voters), 0), 1793317);
assertEqual("Turnout total ballots counted", turnoutRows.reduce((sum, row) => sum + Number(row.ballots_cast), 0), 1529139);

writeCsv(presidentOut, ["state", "election_year", "jurisdiction_name", "harris", "trump", "other"], presidentRows);
writeCsv(
  attorneyGeneralOut,
  ["state", "election_year", "jurisdiction_name", "comparison_dem", "comparison_rep", "comparison_other"],
  attorneyGeneralRows,
);
writeCsv(
  turnoutOut,
  [
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
  ],
  turnoutRows,
);

console.log(`Wrote ${presidentRows.length} Utah presidential rows to ${presidentOut}`);
console.log(`Wrote ${attorneyGeneralRows.length} Utah Attorney General rows to ${attorneyGeneralOut}`);
console.log(`Wrote ${turnoutRows.length} Utah turnout rows to ${turnoutOut}`);
