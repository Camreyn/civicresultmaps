import fs from "fs";
import Module from "module";
import path from "path";
import { createRequire } from "module";

Module._initPaths();
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const repoRoot = process.cwd();
const turnoutPdfPath = path.join(repoRoot, "data", "in-2024-general-turnout-report.pdf");
const turnoutCsvPath = path.join(repoRoot, "data", "in-2024-general-turnout.csv");
const sourceUrl = "https://www.in.gov/sos/elections/voter-information/files/2024-General-Election-Turnout-and-Registration-Report.pdf";

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
  return Number(String(value ?? "0").replace(/,/g, ""));
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

function countyName(rawName) {
  return `${normalizeWhitespace(rawName)} County`;
}

async function buildTurnoutRows() {
  const text = await extractText(turnoutPdfPath);
  const rows = [];
  const pattern = /^(.+?)\s+([\d,]+)\s+([\d,]+)\s+\d+\s+%\s+([\d,]+)\s+([\d,]+)\s+\d+\s+%$/;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = normalizeWhitespace(rawLine);
    const match = line.match(pattern);
    if (!match) {
      continue;
    }

    const county = countyName(match[1]);
    const registered = intValue(match[2]);
    const votersVoting = intValue(match[3]);
    const electionDay = intValue(match[4]);
    const absentee = intValue(match[5]);
    if (electionDay + absentee !== votersVoting) {
      throw new Error(`${county} turnout modes do not sum to voters voting`);
    }

    rows.push({
      state: "IN",
      election_year: 2024,
      jurisdiction_code: "",
      jurisdiction_name: county,
      county,
      local_unit: county,
      level: "county",
      ballots_cast: votersVoting,
      registered_voters: registered,
      turnout_pct: ((votersVoting / registered) * 100).toFixed(4),
      denominator_type: "registeredVoters",
      denominator_timing: "sosElectionTurnoutReport",
      denominator_note: "Indiana Election Division registered voters from the official 2024 General Election Turnout and Registration report.",
      warning_required: "false",
      source_url: sourceUrl,
      source_title: "Indiana Election Division 2024 General Election Turnout and Registration report",
      source_status: "loaded",
      notes: `Election Day Vote ${electionDay}; Absentee ${absentee}.`,
    });
  }

  const totals = rows.reduce(
    (acc, row) => ({
      ballots: acc.ballots + Number(row.ballots_cast),
      registered: acc.registered + Number(row.registered_voters),
    }),
    { ballots: 0, registered: 0 },
  );

  if (rows.length !== 92 || totals.ballots !== 2976599 || totals.registered !== 4837802) {
    throw new Error(`Indiana turnout validation failed: rows=${rows.length}, ballots=${totals.ballots}, registered=${totals.registered}`);
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

  console.log("Wrote 92 Indiana official turnout rows (2976599 ballots, 4837802 registered voters).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
