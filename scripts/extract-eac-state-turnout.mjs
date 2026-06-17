import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeEacTurnoutRows, parseCsv, toCsv } from "./normalize-eac-turnout.mjs";

const EAC_DATA_URL = "https://www.eac.gov/sites/default/files/2026-02/2024_EAVS_for_Public_Release_nolabel_V2_csv.zip";
const EAC_CODEBOOK_URL = "https://www.eac.gov/sites/default/files/2025-06/2024_EAVS_Codebook.xlsx";

const TURNOUT_COLUMNS = [
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

const DENOMINATOR_COLUMNS = [
  "state",
  "election_year",
  "jurisdiction_code",
  "jurisdiction_name",
  "county",
  "local_unit",
  "registered_voters",
  "source_field",
  "source_url",
  "codebook_url",
  "warning_required",
  "notes",
];

function parseArgs(argv) {
  const args = {
    inFile: "",
    outDir: path.join("data", "eac-2024-state-turnout"),
    sourceStatus: "candidate",
    states: [],
    year: 2024,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--in") {
      args.inFile = argv[++index];
    } else if (arg === "--out-dir") {
      args.outDir = argv[++index];
    } else if (arg === "--source-status") {
      args.sourceStatus = argv[++index] ?? args.sourceStatus;
    } else if (arg === "--states") {
      args.states = String(argv[++index] || "")
        .split(",")
        .map((state) => state.trim().toUpperCase())
        .filter(Boolean);
    } else if (arg === "--year") {
      args.year = Number(argv[++index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.inFile) {
    throw new Error("Usage: node scripts/extract-eac-state-turnout.mjs --in .etl/eac-2024-v2.csv [--states AZ,GA] [--out-dir data/eac-2024-state-turnout]");
  }

  return args;
}

function intValue(value) {
  const parsed = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function writeCsv(file, rows) {
  writeFileSync(file, toCsv(rows));
}

function extractEacStateTurnout(options) {
  const inputRows = parseCsv(readFileSync(options.inFile, "utf8"));
  const allRows = normalizeEacTurnoutRows(inputRows, {
    sourceStatus: options.sourceStatus,
    year: options.year,
  });
  const requestedStates = new Set(options.states.length ? options.states : allRows.map((row) => row.state));
  const rowsByState = new Map();

  for (const row of allRows) {
    if (!requestedStates.has(row.state)) {
      continue;
    }
    if (!rowsByState.has(row.state)) {
      rowsByState.set(row.state, []);
    }
    rowsByState.get(row.state).push(row);
  }

  mkdirSync(options.outDir, { recursive: true });
  const summary = [];

  for (const state of [...rowsByState.keys()].sort()) {
    const rows = rowsByState.get(state);
    const statePrefix = path.join(options.outDir, `${state.toLowerCase()}-2024-eac`);
    const turnoutFile = `${statePrefix}-turnout.csv`;
    const denominatorCsvFile = `${statePrefix}-registered-voter-denominator.csv`;
    const denominatorJsonFile = `${statePrefix}-registered-voter-denominator.json`;
    const ballotsCast = rows.reduce((sum, row) => sum + intValue(row.ballots_cast), 0);
    const registeredVoters = rows.reduce((sum, row) => sum + intValue(row.registered_voters), 0);
    const warningRows = rows.filter((row) => row.warning_required === "true").length;

    writeCsv(turnoutFile, [TURNOUT_COLUMNS, ...rows.map((row) => TURNOUT_COLUMNS.map((column) => row[column] ?? ""))]);

    const denominatorRows = rows.map((row) =>
      DENOMINATOR_COLUMNS.map((column) => {
        if (column === "source_field") {
          return "A1a Total Reg";
        }
        if (column === "codebook_url") {
          return EAC_CODEBOOK_URL;
        }
        if (column === "notes") {
          return row.warning_required === "true"
            ? "EAC reports zero registered voters for this jurisdiction; denominator warning required."
            : "EAC 2024 EAVS V2 A1a Total Reg registered-voter denominator.";
        }
        return row[column] ?? "";
      }),
    );
    writeCsv(denominatorCsvFile, [DENOMINATOR_COLUMNS, ...denominatorRows]);

    const denominatorSummary = {
      state,
      electionYear: options.year,
      sourceTitle: `U.S. EAC ${options.year} EAVS V2 ${state} registered-voter denominator`,
      sourceUrl: EAC_DATA_URL,
      codebookUrl: EAC_CODEBOOK_URL,
      localFile: denominatorCsvFile.replaceAll("\\", "/"),
      sourceField: "A1a Total Reg",
      rowCount: rows.length,
      registeredVoters,
      warningRows,
      denominatorTiming: "eacReported",
      denominatorType: "registeredVoters",
      caveats: [
        "EAC A1a Total Reg is the registered-voter denominator used for this fallback collection.",
        "Prefer state election office denominator artifacts when they provide equal or finer official detail.",
        "Rows with zero registered voters are warning-gated and have blank turnout percentages.",
      ],
    };
    writeFileSync(denominatorJsonFile, `${JSON.stringify(denominatorSummary, null, 2)}\n`);

    summary.push({
      state,
      turnoutFile: turnoutFile.replaceAll("\\", "/"),
      denominatorCsvFile: denominatorCsvFile.replaceAll("\\", "/"),
      denominatorJsonFile: denominatorJsonFile.replaceAll("\\", "/"),
      rowCount: rows.length,
      ballotsCast,
      registeredVoters,
      warningRows,
    });
  }

  writeFileSync(
    path.join(options.outDir, "summary.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceUrl: EAC_DATA_URL,
        codebookUrl: EAC_CODEBOOK_URL,
        states: summary,
      },
      null,
      2,
    )}\n`,
  );

  return { outDir: options.outDir, states: summary.length, rows: summary.reduce((sum, state) => sum + state.rowCount, 0) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(extractEacStateTurnout(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export { extractEacStateTurnout };
