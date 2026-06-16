import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EAC_SOURCE_URL = "https://www.eac.gov/research-and-data/studies-and-reports";

function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }
  return rows;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

function cleanKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function toInt(value) {
  const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") {
    return "";
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : "";
}

function firstValue(row, aliases) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

const aliases = {
  ballotsCast: [
    "ballotscast",
    "totalballotscast",
    "totalvoters",
    "totalvoted",
    "votescast",
    "f1a",
    "f1",
  ],
  jurisdiction: [
    "jurisdiction",
    "jurisdictionname",
    "county",
    "countyname",
    "localjurisdiction",
    "localjurisdictionname",
  ],
  registeredVoters: [
    "registeredvoters",
    "activeregisteredvoters",
    "totalregisteredvoters",
    "registrationtotal",
    "a1a",
    "a1",
  ],
  state: ["state", "stateabbreviation", "stateabbr", "statecode", "statefull"],
};

function extractCounty(jurisdictionName) {
  if (/\s-\sMULTIPLE COUNTIES$/i.test(String(jurisdictionName || ""))) {
    return "MULTIPLE COUNTIES";
  }

  const match = String(jurisdictionName || "").match(/\s-\s(.+?\s+COUNTY)$/i);
  if (!match) {
    return "";
  }
  return match[1].replace(/\s+/g, " ").trim();
}

function normalizeEacTurnoutRows(inputRows, options = {}) {
  if (inputRows.length < 2) {
    return [];
  }

  const header = inputRows[0].map(cleanKey);
  return inputRows.slice(1).flatMap((values) => {
    const row = Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""]));
    const rowState = String(firstValue(row, aliases.state)).trim().toUpperCase();
    if (options.state && rowState && rowState !== options.state) {
      return [];
    }

    const state = String(options.state || rowState).trim().toUpperCase();
    const jurisdictionName = String(firstValue(row, aliases.jurisdiction) || state).trim();
    const ballotsCast = toInt(firstValue(row, aliases.ballotsCast));
    const registeredVoters = toInt(firstValue(row, aliases.registeredVoters));
    const ballotsNumber = Number(ballotsCast);
    const registeredNumber = Number(registeredVoters);
    const hasPositiveDenominator = Number.isFinite(registeredNumber) && registeredNumber > 0;
    if (!state || !jurisdictionName || !ballotsCast) {
      return [];
    }

    return [
      {
        ballots_cast: ballotsCast,
        county: extractCounty(jurisdictionName),
        denominator_note: options.denominatorNote || "EAC-reported registered-voter denominator",
        denominator_timing: "eacReported",
        denominator_type: "registeredVoters",
        election_year: String(options.year || 2024),
        jurisdiction_code: row.fipscode || "",
        jurisdiction_name: jurisdictionName,
        level: options.level || (jurisdictionName === state ? "state" : "jurisdiction"),
        local_unit: jurisdictionName,
        registered_voters: registeredVoters,
        source_status: options.sourceStatus || "candidate",
        source_title: options.sourceTitle || "U.S. EAC Election Administration and Voting Survey",
        source_url: options.sourceUrl || EAC_SOURCE_URL,
        state,
        turnout_pct:
          Number.isFinite(ballotsNumber) && hasPositiveDenominator
            ? ((ballotsNumber / registeredNumber) * 100).toFixed(4)
            : "",
        warning_required: hasPositiveDenominator ? "false" : "true",
      },
    ];
  });
}

function parseArgs(argv) {
  const args = { inFile: "", outFile: "", sourceStatus: "", state: "", year: 2024 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--in") {
      args.inFile = argv[++index];
    } else if (arg === "--out") {
      args.outFile = argv[++index];
    } else if (arg === "--state") {
      args.state = argv[++index]?.toUpperCase() ?? "";
    } else if (arg === "--source-status") {
      args.sourceStatus = argv[++index] ?? "";
    } else if (arg === "--year") {
      args.year = Number(argv[++index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.inFile || !args.outFile) {
    throw new Error("Usage: node scripts/normalize-eac-turnout.mjs --in raw.csv --out normalized.csv [--year 2024] [--state XX]");
  }
  return args;
}

function normalizeEacTurnoutFile(options) {
  const inputRows = parseCsv(readFileSync(options.inFile, "utf8"));
  const normalized = normalizeEacTurnoutRows(inputRows, options);
  const columns = [
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
  mkdirSync(path.dirname(options.outFile), { recursive: true });
  writeFileSync(options.outFile, toCsv([columns, ...normalized.map((row) => columns.map((column) => row[column] ?? ""))]));
  return { rows: normalized.length, outFile: options.outFile };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(normalizeEacTurnoutFile(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export { normalizeEacTurnoutFile, normalizeEacTurnoutRows, parseCsv, toCsv };
