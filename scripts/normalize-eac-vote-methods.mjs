import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCsv, toCsv } from "./normalize-eac-turnout.mjs";

const EAC_SOURCE_URL = "https://www.eac.gov/research-and-data/studies-and-reports";
const EAC_SOURCE_TITLE = "U.S. EAC Election Administration and Voting Survey";
const MISSING_SENTINELS = new Set([-77, -88, -99]);

const VOTE_METHODS = [
  {
    field: "F1b",
    key: "physical_polling_place",
    label: "Physical polling place",
  },
  {
    field: "F1c",
    key: "absentee_uocava",
    label: "Absentee UOCAVA",
  },
  {
    field: "F1d",
    key: "mail_votes",
    label: "Mail votes",
  },
  {
    field: "F1e",
    key: "provisional_ballot",
    label: "Provisional ballot",
  },
  {
    field: "F1f",
    key: "in_person_early",
    label: "In-person early voting",
  },
  {
    field: "F1g",
    key: "mail_votes_vote_by_mail_jurisdiction",
    label: "Mail votes in vote-by-mail jurisdiction",
  },
  {
    field: "F1h",
    key: "other_participation",
    label: "Other participation",
  },
];

const OUTPUT_COLUMNS = [
  "state",
  "election_year",
  "jurisdiction_code",
  "jurisdiction_name",
  "county",
  "local_unit",
  "level",
  "method",
  "method_label",
  "source_field",
  "voters",
  "method_share_pct",
  "total_voters",
  "value_status",
  "source_url",
  "source_title",
  "source_status",
];

function cleanKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cleanInteger(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return { status: "missing", value: null };
  }

  const parsed = Number(raw.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(parsed)) {
    return { status: "missing", value: null };
  }

  const valueNumber = Math.trunc(parsed);
  if (MISSING_SENTINELS.has(valueNumber)) {
    return { status: "unavailable", value: null };
  }

  return { status: "reported", value: valueNumber };
}

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

function normalizeEacVoteMethodRows(inputRows, options = {}) {
  if (inputRows.length < 2) {
    return [];
  }

  const header = inputRows[0].map(cleanKey);
  const rows = [];

  for (const values of inputRows.slice(1)) {
    const row = Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""]));
    const targetState = String(options.state || "").trim().toUpperCase();
    const outputState = String(row.stateabbr || row.state || targetState).trim().toUpperCase();

    if (targetState && outputState !== targetState) {
      continue;
    }

    const jurisdictionName = String(row.jurisdictionname || outputState).trim();
    const total = cleanInteger(row.f1a);
    if (!outputState || !jurisdictionName) {
      continue;
    }

    for (const method of VOTE_METHODS) {
      const methodValue = cleanInteger(row[cleanKey(method.field)]);
      rows.push({
        county: extractCounty(jurisdictionName),
        election_year: String(options.year || 2024),
        jurisdiction_code: row.fipscode || "",
        jurisdiction_name: jurisdictionName,
        level: options.level || (jurisdictionName === outputState ? "state" : "jurisdiction"),
        local_unit: jurisdictionName,
        method: method.key,
        method_label: method.label,
        method_share_pct:
          methodValue.value !== null && total.value !== null && total.value > 0
            ? ((methodValue.value / total.value) * 100).toFixed(4)
            : "",
        source_field: method.field,
        source_status: options.sourceStatus || "candidate",
        source_title: options.sourceTitle || EAC_SOURCE_TITLE,
        source_url: options.sourceUrl || EAC_SOURCE_URL,
        state: outputState,
        total_voters: total.value === null ? "" : String(total.value),
        value_status: methodValue.status,
        voters: methodValue.value === null ? "" : String(methodValue.value),
      });
    }
  }

  return rows;
}

function parseArgs(argv) {
  const args = {
    inFile: "",
    outDir: path.join("data", "eac-2024-vote-methods"),
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
    throw new Error(
      "Usage: node scripts/normalize-eac-vote-methods.mjs --in .etl/eac-2024-v2.csv [--states MI,MN,OH,PA,WI] [--out-dir data/eac-2024-vote-methods]",
    );
  }

  return args;
}

function intValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEacVoteMethodFile(options) {
  const inputRows = parseCsv(readFileSync(options.inFile, "utf8"));
  const allRows = normalizeEacVoteMethodRows(inputRows, options);
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
    const outFile = path.join(options.outDir, `${state.toLowerCase()}-${options.year}-eac-vote-methods.csv`);
    const jurisdictionTotals = new Map();
    for (const row of rows) {
      const key = row.jurisdiction_code || row.jurisdiction_name;
      if (!jurisdictionTotals.has(key)) {
        jurisdictionTotals.set(key, intValue(row.total_voters));
      }
    }
    const totalVoters = [...jurisdictionTotals.values()].reduce((sum, value) => sum + value, 0);
    const methodVoters = rows.reduce((sum, row) => sum + intValue(row.voters), 0);
    writeFileSync(outFile, toCsv([OUTPUT_COLUMNS, ...rows.map((row) => OUTPUT_COLUMNS.map((column) => row[column] ?? ""))]));

    summary.push({
      state,
      file: outFile.replaceAll("\\", "/"),
      rows: rows.length,
      jurisdictionRows: rows.length / VOTE_METHODS.length,
      reportedRows: rows.filter((row) => row.value_status === "reported").length,
      unavailableRows: rows.filter((row) => row.value_status !== "reported").length,
      totalVoters,
      methodVoters,
      methodTotalDelta: methodVoters - totalVoters,
    });
  }

  writeFileSync(
    path.join(options.outDir, "summary.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        methods: VOTE_METHODS,
        sourceTitle: EAC_SOURCE_TITLE,
        sourceUrl: EAC_SOURCE_URL,
        states: summary,
      },
      null,
      2,
    )}\n`,
  );

  return { outDir: options.outDir, states: summary.length, rows: summary.reduce((sum, state) => sum + state.rows, 0) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(normalizeEacVoteMethodFile(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export { VOTE_METHODS, normalizeEacVoteMethodFile, normalizeEacVoteMethodRows };
