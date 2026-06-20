import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "./normalize-eac-turnout.mjs";

const EAC_DATA_URL = "https://www.eac.gov/research-and-data/studies-and-reports";

const STATE_NAMES = {
  AK: "Alaska",
  AL: "Alabama",
  AR: "Arkansas",
  AZ: "Arizona",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  IA: "Iowa",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  MA: "Massachusetts",
  MD: "Maryland",
  ME: "Maine",
  MI: "Michigan",
  MN: "Minnesota",
  MO: "Missouri",
  MS: "Mississippi",
  MT: "Montana",
  NC: "North Carolina",
  ND: "North Dakota",
  NE: "Nebraska",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NV: "Nevada",
  NY: "New York",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VA: "Virginia",
  VT: "Vermont",
  WA: "Washington",
  WI: "Wisconsin",
  WV: "West Virginia",
  WY: "Wyoming",
};

function intValue(value) {
  const parsed = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function parseArgs(argv) {
  const args = {
    configDir: path.join("etl", "state-configs"),
    overwrite: false,
    states: [],
    summaryFile: path.join("data", "eac-2024-state-turnout", "summary.json"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config-dir") {
      args.configDir = argv[++index] ?? args.configDir;
    } else if (arg === "--overwrite") {
      args.overwrite = true;
    } else if (arg === "--states") {
      args.states = String(argv[++index] || "")
        .split(",")
        .map((state) => state.trim().toUpperCase())
        .filter(Boolean);
    } else if (arg === "--summary") {
      args.summaryFile = argv[++index] ?? args.summaryFile;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function turnoutTotals(turnoutFile) {
  const [header = [], ...records] = parseCsv(readFileSync(turnoutFile, "utf8"));
  const rows = records.map((record) => Object.fromEntries(header.map((name, index) => [name, record[index] ?? ""])));
  return rows.reduce(
    (totals, row) => {
      const registered = intValue(row.registered_voters);
      totals.ballotsCast += intValue(row.ballots_cast);
      totals.registeredVoters += registered > 0 ? registered : 0;
      totals.warningRows += row.warning_required === "true" || registered <= 0 ? 1 : 0;
      return totals;
    },
    { ballotsCast: 0, registeredVoters: 0, warningRows: 0 },
  );
}

function buildConfig(summary) {
  const code = summary.state;
  const name = STATE_NAMES[code] ?? code;
  const totals = turnoutTotals(summary.turnoutFile);

  return {
    code,
    name,
    authority: "U.S. Election Assistance Commission",
    electionYear: 2024,
    office: "President",
    turnoutOnly: true,
    sources: [
      {
        id: `${code.toLowerCase()}-2024-eac-turnout`,
        category: "EAC fallback turnout rows",
        url: EAC_DATA_URL,
        localFile: summary.turnoutFile,
        parser: "eacTurnoutCsv",
        authority: "U.S. Election Assistance Commission",
        timestampBasis: "EAC 2024 EAVS V2 public dataset released February 12, 2026.",
        confidence:
          "National EAC fallback turnout rows. Prefer state election office denominator artifacts when available; keep fallback caveats visible in the app.",
        status: "loaded",
      },
    ],
    turnout: {
      format: "eacTurnoutCsv",
      sourceId: `${code.toLowerCase()}-2024-eac-turnout`,
      denominatorType: "registeredVoters",
      registrationDenominatorTiming: "eacReported",
      sourceLevel: "jurisdiction",
      notes: `${name} turnout rows use EAC 2024 V2 county/jurisdiction fallback rows until a state-native turnout artifact is collected.`,
      warningRequired: totals.warningRows > 0,
      expected: {
        rowCount: summary.rowCount,
        ballotsCast: totals.ballotsCast,
        registeredVoters: totals.registeredVoters,
      },
    },
    expected: {
      jurisdictions: summary.rowCount,
      resultRows: 0,
      sources: 1,
      stateTotal: 0,
      trump: 0,
      harris: 0,
      other: 0,
      reviewRows: 0,
      turnoutRows: summary.rowCount,
    },
    capabilities: {
      sourcePlanner: true,
      certifiedResults: false,
      map: false,
      reviewGraphs: false,
      turnout: true,
      historicalBaseline: false,
    },
  };
}

function createConfigs(options) {
  const summary = JSON.parse(readFileSync(options.summaryFile, "utf8"));
  const requested = new Set(options.states);
  const written = [];
  const skipped = [];

  for (const stateSummary of summary.states) {
    if (requested.size && !requested.has(stateSummary.state)) {
      continue;
    }
    const configPath = path.join(options.configDir, `${stateSummary.state.toLowerCase()}.json`);
    if (existsSync(configPath) && !options.overwrite) {
      skipped.push(stateSummary.state);
      continue;
    }
    writeFileSync(configPath, `${JSON.stringify(buildConfig(stateSummary), null, 2)}\n`);
    written.push(stateSummary.state);
  }

  return { written, skipped };
}

try {
  console.log(JSON.stringify(createConfigs(parseArgs(process.argv.slice(2))), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
