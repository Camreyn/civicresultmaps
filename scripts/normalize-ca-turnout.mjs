import fs from "fs";
import Module from "module";
import path from "path";
import { createRequire } from "module";

Module._initPaths();
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const repoRoot = process.cwd();
const turnoutPdfPath = path.join(repoRoot, "data", "ca-2024-voter-participation-stats-by-county.pdf");
const turnoutCsvPath = path.join(repoRoot, "data", "ca-2024-voter-participation-stats-by-county.csv");
const sourceUrl = "https://elections.cdn.sos.ca.gov/sov/2024-general/sov/03-voter-participation-stats-by-county.pdf";

const counties = new Set([
  "Alameda",
  "Alpine",
  "Amador",
  "Butte",
  "Calaveras",
  "Colusa",
  "Contra Costa",
  "Del Norte",
  "El Dorado",
  "Fresno",
  "Glenn",
  "Humboldt",
  "Imperial",
  "Inyo",
  "Kern",
  "Kings",
  "Lake",
  "Lassen",
  "Los Angeles",
  "Madera",
  "Marin",
  "Mariposa",
  "Mendocino",
  "Merced",
  "Modoc",
  "Mono",
  "Monterey",
  "Napa",
  "Nevada",
  "Orange",
  "Placer",
  "Plumas",
  "Riverside",
  "Sacramento",
  "San Benito",
  "San Bernardino",
  "San Diego",
  "San Francisco",
  "San Joaquin",
  "San Luis Obispo",
  "San Mateo",
  "Santa Barbara",
  "Santa Clara",
  "Santa Cruz",
  "Shasta",
  "Sierra",
  "Siskiyou",
  "Solano",
  "Sonoma",
  "Stanislaus",
  "Sutter",
  "Tehama",
  "Trinity",
  "Tulare",
  "Tuolumne",
  "Ventura",
  "Yolo",
  "Yuba",
]);

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, headers, rows) {
  const body = [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n");
  fs.writeFileSync(filePath, `${body}\n`, "utf8");
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function intValue(value) {
  return Number(String(value ?? "0").replace(/[^\d]/g, ""));
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

async function buildTurnoutRows() {
  const text = await extractText(turnoutPdfPath);
  const rows = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const columns = rawLine.split(/\t+/).map((column) => normalizeWhitespace(column));
    if (columns.length !== 10) {
      continue;
    }

    const county = columns[0].replace(/\*$/, "");
    if (!counties.has(county)) {
      continue;
    }

    const registered = intValue(columns[3]);
    const precinctVoters = intValue(columns[4]);
    const voteByMailVoters = intValue(columns[5]);
    const totalVoters = intValue(columns[6]);
    if (precinctVoters + voteByMailVoters !== totalVoters) {
      throw new Error(`${county} precinct and vote-by-mail voters do not sum to total voters`);
    }

    rows.push({
      state: "CA",
      election_year: 2024,
      jurisdiction_code: "",
      jurisdiction_name: county,
      county,
      local_unit: county,
      level: "county",
      ballots_cast: totalVoters,
      registered_voters: registered,
      turnout_pct: Number(columns[8].replace("%", "")).toFixed(2),
      denominator_type: "registeredVoters",
      denominator_timing: "sos15DayReportOfRegistration",
      denominator_note: "California SOS registered-voter totals from the 15-day Report of Registration; Same Day Voter Registration after the 15-day close is not included in registered-voter totals.",
      warning_required: "false",
      source_url: sourceUrl,
      source_title: "California SOS 2024 General Election voter participation statistics by county",
      source_status: "loaded",
      notes: `Eligible ${intValue(columns[2])}; precinct voters ${precinctVoters}; vote-by-mail voters ${voteByMailVoters}; eligible turnout ${Number(columns[9].replace("%", "")).toFixed(2)}%.`,
    });
  }

  const totals = rows.reduce(
    (acc, row) => ({
      ballots: acc.ballots + Number(row.ballots_cast),
      registered: acc.registered + Number(row.registered_voters),
    }),
    { ballots: 0, registered: 0 },
  );

  if (rows.length !== 58 || totals.ballots !== 16140044 || totals.registered !== 22595659) {
    throw new Error(`California turnout validation failed: rows=${rows.length}, ballots=${totals.ballots}, registered=${totals.registered}`);
  }

  return rows;
}

async function main() {
  const rows = await buildTurnoutRows();
  writeCsv(
    turnoutCsvPath,
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
      "notes",
    ],
    rows,
  );

  console.log("Wrote 58 California official turnout rows (16140044 ballots, 22595659 registered voters).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
