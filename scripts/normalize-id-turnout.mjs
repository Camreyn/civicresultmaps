import fs from "fs";
import Module from "module";
import path from "path";
import { createRequire } from "module";

Module._initPaths();
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const repoRoot = process.cwd();
const countyWorkbookPath = path.join(repoRoot, "data", "id-2024-turnout-county-general.xlsx");
const rawStatsWorkbookPath = path.join(repoRoot, "data", "id-2024-raw-stats-general.xlsx");
const eacTurnoutPath = path.join(repoRoot, "data", "eac-2024-state-turnout", "id-2024-eac-turnout.csv");
const outputCsvPath = path.join(repoRoot, "data", "id-2024-general-turnout.csv");
const summaryPath = path.join(repoRoot, "data", "id-2024-turnout-reconciliation-summary.json");

const sourcePageUrl = "https://voteidaho.gov/data-and-dashboards/voter-turnout/";
const countyWorkbookUrl = "https://sos.idaho.gov/elections/data/results/2024/turnout_county_general.xlsx";
const rawStatsWorkbookUrl = "https://sos.idaho.gov/elections/data/results/2024/raw_stats_general.xlsx";

const headers = [
  "state",
  "election_year",
  "jurisdiction_code",
  "jurisdiction_name",
  "county",
  "local_unit",
  "level",
  "registration_at_cutoff",
  "election_day_registrations",
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
];

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, rows) {
  const body = [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n");
  fs.writeFileSync(filePath, `${body}\n`, "utf8");
}

function readCsv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/);
  const columns = lines.shift().split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ""]));
  });
}

function normalizeCountyName(value) {
  const text = String(value ?? "").trim().replace(/\s+County$/i, "");
  if (!text || /^total$/i.test(text)) {
    return text;
  }
  const county = text
    .toLowerCase()
    .split(/\s+/)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
  return `${county} County`;
}

function cell(row, columnName) {
  const key = Object.keys(row).find((candidate) => candidate.trim() === columnName);
  if (!key) {
    throw new Error(`Missing column ${columnName}`);
  }
  return row[key];
}

function numberCell(row, columnName) {
  const value = cell(row, columnName);
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  return Number(value);
}

function readSheetRows(workbookPath, expectedSheetName) {
  const workbook = XLSX.readFile(workbookPath);
  if (!workbook.SheetNames.includes(expectedSheetName)) {
    throw new Error(`${workbookPath} missing expected sheet ${expectedSheetName}`);
  }
  return XLSX.utils.sheet_to_json(workbook.Sheets[expectedSheetName], { defval: null });
}

function summarize(rows) {
  return rows.reduce(
    (acc, row) => ({
      rows: acc.rows + 1,
      registrationAtCutoff: acc.registrationAtCutoff + Number(row.registration_at_cutoff),
      electionDayRegistrations: acc.electionDayRegistrations + Number(row.election_day_registrations),
      registeredVoters: acc.registeredVoters + Number(row.registered_voters),
      ballotsCast: acc.ballotsCast + Number(row.ballots_cast),
    }),
    { rows: 0, registrationAtCutoff: 0, electionDayRegistrations: 0, registeredVoters: 0, ballotsCast: 0 },
  );
}

function buildRawCountyTotals() {
  const rows = readSheetRows(rawStatsWorkbookPath, "raw_stats");
  const countyTotals = new Map();
  for (const row of rows) {
    if (String(row.Precinct ?? "").trim().toLowerCase() !== "total") {
      continue;
    }
    const county = normalizeCountyName(row.County);
    countyTotals.set(county, {
      registrationAtCutoff: numberCell(row, "Registration at Cutoff"),
      electionDayRegistrations: numberCell(row, "Election Day Registrations"),
      registeredVoters: numberCell(row, "Total Registered Voters"),
      ballotsCast: numberCell(row, "Ballots Cast"),
    });
  }
  return countyTotals;
}

function buildEacCountyRows() {
  const rows = readCsv(eacTurnoutPath);
  return new Map(
    rows.map((row) => [
      normalizeCountyName(row.local_unit || row.jurisdiction_name),
      {
        jurisdictionCode: row.jurisdiction_code,
        registeredVoters: Number(row.registered_voters),
        ballotsCast: Number(row.ballots_cast),
      },
    ]),
  );
}

function buildRows() {
  const countyRows = readSheetRows(countyWorkbookPath, "turnout_county");
  const rawCountyTotals = buildRawCountyTotals();
  const eacCountyRows = buildEacCountyRows();
  const outputRows = [];
  let sourceTotal = null;

  for (const row of countyRows) {
    const county = normalizeCountyName(row.County);
    const registrationAtCutoff = numberCell(row, "Registration at Cutoff");
    const electionDayRegistrations = numberCell(row, "Election Day Registrations");
    const registeredVoters = numberCell(row, "Total Registered Voters");
    const ballotsCast = numberCell(row, "Ballots Cast");
    const turnoutPct = Number(cell(row, "Voter Turnout")) * 100;

    if (/^total$/i.test(county)) {
      sourceTotal = { registrationAtCutoff, electionDayRegistrations, registeredVoters, ballotsCast, turnoutPct };
      continue;
    }

    const rawCounty = rawCountyTotals.get(county);
    if (!rawCounty) {
      throw new Error(`Missing raw-stat county total row for ${county}`);
    }
    for (const [field, value] of Object.entries(rawCounty)) {
      const countyValue = { registrationAtCutoff, electionDayRegistrations, registeredVoters, ballotsCast }[field];
      if (countyValue !== value) {
        throw new Error(`${county} ${field} mismatch between county workbook and raw stats: ${countyValue} != ${value}`);
      }
    }

    const eacCounty = eacCountyRows.get(county);
    if (!eacCounty) {
      throw new Error(`Missing EAC fallback row for ${county}`);
    }
    if (registeredVoters !== eacCounty.registeredVoters || ballotsCast !== eacCounty.ballotsCast) {
      throw new Error(
        `${county} SOS/EAC turnout mismatch: ballots ${ballotsCast}/${eacCounty.ballotsCast}, registered ${registeredVoters}/${eacCounty.registeredVoters}`,
      );
    }

    outputRows.push({
      state: "ID",
      election_year: 2024,
      jurisdiction_code: eacCounty.jurisdictionCode,
      jurisdiction_name: county,
      county,
      local_unit: county,
      level: "county",
      registration_at_cutoff: registrationAtCutoff,
      election_day_registrations: electionDayRegistrations,
      ballots_cast: ballotsCast,
      registered_voters: registeredVoters,
      turnout_pct: turnoutPct.toFixed(4),
      denominator_type: "registeredVoters",
      denominator_timing: "idahoSosGeneralElectionTurnout",
      denominator_note: "Idaho SOS Total Registered Voters equals Registration at Cutoff plus Election Day Registrations in the official county turnout workbook.",
      warning_required: "false",
      source_url: countyWorkbookUrl,
      source_title: "Idaho Secretary of State 2024 General Election county turnout workbook",
      source_status: "loaded",
      notes: `Registration at cutoff ${registrationAtCutoff}; Election Day registrations ${electionDayRegistrations}.`,
    });
  }

  const totals = summarize(outputRows);
  const expected = {
    rows: 44,
    registrationAtCutoff: 1057735,
    electionDayRegistrations: 121015,
    registeredVoters: 1178750,
    ballotsCast: 917469,
  };
  const mismatches = Object.fromEntries(Object.entries(expected).filter(([key, value]) => totals[key] !== value));
  if (Object.keys(mismatches).length > 0) {
    throw new Error(`Idaho turnout totals mismatch: ${JSON.stringify({ totals, expected })}`);
  }
  if (!sourceTotal || sourceTotal.registeredVoters !== totals.registeredVoters || sourceTotal.ballotsCast !== totals.ballotsCast) {
    throw new Error(`Idaho source statewide total row mismatch: ${JSON.stringify({ sourceTotal, totals })}`);
  }

  return { rows: outputRows, totals, sourceTotal };
}

const { rows, totals, sourceTotal } = buildRows();
writeCsv(outputCsvPath, rows);
fs.writeFileSync(
  summaryPath,
  `${JSON.stringify(
    {
      checkedAt: "2026-07-06",
      state: "ID",
      electionYear: 2024,
      status: "loaded_state_native_turnout_replaces_eac_fallback",
      sourcePageUrl,
      countyWorkbookUrl,
      rawStatsWorkbookUrl,
      localArtifacts: {
        countyWorkbook: "data/id-2024-turnout-county-general.xlsx",
        rawStatsWorkbook: "data/id-2024-raw-stats-general.xlsx",
        normalizedTurnoutCsv: "data/id-2024-general-turnout.csv",
        eacBenchmark: "data/eac-2024-state-turnout/id-2024-eac-turnout.csv",
      },
      parserOrNormalizationPath: "scripts/normalize-id-turnout.mjs",
      reportingGrain: "county",
      denominator: {
        type: "registeredVoters",
        timing: "idahoSosGeneralElectionTurnout",
        note: "The official county workbook reports Registration at Cutoff, Election Day Registrations, Total Registered Voters, Ballots Cast, and Voter Turnout. Total Registered Voters equals cutoff registration plus Election Day registrations in every county.",
      },
      totals,
      sourceStatewideTotalRow: sourceTotal,
      eacBenchmarkComparison: {
        ballotsCastDeltaSosMinusEac: 0,
        registeredVotersDeltaSosMinusEac: 0,
        note: "The Idaho SOS county workbook matches the retained EAC 2024 V2 county fallback rows for ballots cast and total registered voters in every county.",
      },
      caveats: [
        "Rows are county turnout and registration denominators, not precinct turnout rows.",
        "Precinct turnout is available in the raw stats workbook as a source lead, but active Idaho review rows remain county-level President-versus-U.S. House rows.",
        "State-native turnout replacement does not change result, review, or advisory indicator semantics.",
      ],
      confidence: "loaded_official_reconciled_to_raw_stats_and_eac_benchmark",
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Wrote ${rows.length} Idaho turnout rows to ${path.relative(repoRoot, outputCsvPath)}.`);
console.log(`Wrote Idaho turnout reconciliation summary to ${path.relative(repoRoot, summaryPath)}.`);
