import fs from "fs";
import Module from "module";
import path from "path";
import { createRequire } from "module";

Module._initPaths();
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const repoRoot = process.cwd();
const presidentCsvPath = path.join(repoRoot, "data", "mo-2024-general-president.csv");
const turnoutPdfPath = path.join(repoRoot, "data", "mo-2024-general-turnout.pdf");
const turnoutCsvPath = path.join(repoRoot, "data", "mo-2024-general-turnout.csv");
const historicalCsvPath = path.join(repoRoot, "data", "mo-historical-presidential-baseline.csv");

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
  const jurisdictions = loadMissouriJurisdictions();
  const turnoutRows = await buildTurnoutRows(jurisdictions);
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
    ],
    turnoutRows,
  );

  const historicalRows = await buildHistoricalRows(jurisdictions);
  writeCsv(
    historicalCsvPath,
    [
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
    ],
    historicalRows,
  );

  const turnoutTotals = turnoutRows.reduce(
    (totals, row) => ({
      ballots: totals.ballots + Number(row.ballots_cast),
      registered: totals.registered + Number(row.registered_voters),
    }),
    { ballots: 0, registered: 0 },
  );
  console.log(
    `Wrote ${turnoutRows.length} Missouri turnout rows (${turnoutTotals.ballots} ballots, ${turnoutTotals.registered} registered voters) and ${historicalRows.length} historical rows.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
