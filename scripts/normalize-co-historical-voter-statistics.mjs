import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SOURCE_URL = "https://historicalelectiondata.coloradosos.gov/search?";
const DOWNLOAD_URL = "https://historicalelectiondata.coloradosos.gov/api/download_search.csv";
const RAW_OUT = path.join(repoRoot, "data", "co-2024-historical-voter-statistics.csv");
const NORMALIZED_OUT = path.join(repoRoot, "data", "co-2024-historical-voter-statistics-turnout.csv");
const SUMMARY_OUT = path.join(repoRoot, "data", "co-2024-historical-voter-statistics-summary.json");

const FILTERS = {
  global: { years: { from: 2024, to: 2024 } },
  voterStats: true,
  specialElectionsOnly: false,
  stages: [],
};

const EXPECTED = {
  countyRows: 64,
  activeVoters: 4074612,
  inactiveVoters: 508668,
  totalVoters: 4583280,
  ballotsCast: 3241155,
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

function toRecords(rows) {
  const [header, ...body] = rows;
  return body
    .filter((row) => row.length === header.length)
    .map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""])));
}

function integer(value) {
  const cleaned = String(value ?? "").replace(/[^\d-]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

async function downloadRawCsv() {
  const search = encodeURIComponent(JSON.stringify(FILTERS));
  const response = await fetch(`${DOWNLOAD_URL}?search=${search}`, {
    headers: { "X-Elstats-Tenant": "co" },
  });
  if (!response.ok) {
    throw new Error(`Colorado voter-statistics download failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function buildTurnoutRows(records) {
  const counties = new Map();
  for (const record of records) {
    if (
      record.election_id !== "159" ||
      record.election_type !== "General" ||
      record.office_name !== "Voting Statistics" ||
      record.division_type !== "County" ||
      record.vote_channel !== ""
    ) {
      continue;
    }

    const county = record.division_name;
    const bucket = counties.get(county) ?? {};
    bucket[record.candidate_name] = integer(record.votes);
    counties.set(county, bucket);
  }

  const output = [];
  for (const [county, values] of [...counties.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const active = values["Active Voters"] ?? 0;
    const inactive = values["Inactive Voters"] ?? 0;
    const totalVoters = values["Total Voters"] ?? 0;
    const ballotsCast = values["Total Ballots Cast"] ?? 0;
    if (active + inactive !== totalVoters) {
      throw new Error(`Colorado voter-statistics denominator mismatch for ${county}: ${active} + ${inactive} != ${totalVoters}`);
    }
    output.push({
      state: "CO",
      election_year: 2024,
      jurisdiction_name: `${county} County`,
      jurisdiction_code: "",
      county: `${county} County`,
      local_unit: `${county} County`,
      level: "county",
      ballots_cast: ballotsCast,
      registered_voters: totalVoters,
      turnout_pct: totalVoters ? ((ballotsCast / totalVoters) * 100).toFixed(4) : "",
      denominator_type: "activePlusInactiveRegisteredVoters",
      denominator_timing: "historicalElectionData2024General",
      denominator_note: "Colorado Historical Election Data 2024 General Voting Statistics Total Voters field; equals Active Voters plus Inactive Voters.",
      warning_required: "false",
      source_title: "Colorado Historical Election Data 2024 General Voting Statistics CSV",
      source_status: "official_state_native_turnout_replacement",
      source_url: SOURCE_URL,
      notes: "Normalized from the official voter-statistics download with election_id 159, County rows, blank vote_channel total rows, and fields Active Voters, Inactive Voters, Total Voters, and Total Ballots Cast.",
    });
  }
  return output;
}

function summarize(rows) {
  return rows.reduce(
    (totals, row) => ({
      rows: totals.rows + 1,
      ballotsCast: totals.ballotsCast + Number(row.ballots_cast),
      totalVoters: totals.totalVoters + Number(row.registered_voters),
    }),
    { rows: 0, ballotsCast: 0, totalVoters: 0 },
  );
}

function assertExpected(records, rows) {
  const active = records
    .filter((record) => record.election_id === "159" && record.office_name === "Voting Statistics" && record.division_type === "County" && record.vote_channel === "" && record.candidate_name === "Active Voters")
    .reduce((sum, record) => sum + integer(record.votes), 0);
  const inactive = records
    .filter((record) => record.election_id === "159" && record.office_name === "Voting Statistics" && record.division_type === "County" && record.vote_channel === "" && record.candidate_name === "Inactive Voters")
    .reduce((sum, record) => sum + integer(record.votes), 0);
  const totals = summarize(rows);
  const actual = {
    countyRows: totals.rows,
    activeVoters: active,
    inactiveVoters: inactive,
    totalVoters: totals.totalVoters,
    ballotsCast: totals.ballotsCast,
  };
  const mismatches = Object.entries(EXPECTED).filter(([key, value]) => actual[key] !== value);
  if (mismatches.length) {
    throw new Error(`Colorado voter-statistics totals mismatch: ${JSON.stringify({ expected: EXPECTED, actual })}`);
  }
  return actual;
}

const rawCsv = await downloadRawCsv();
await writeFile(RAW_OUT, rawCsv, "utf8");

const records = toRecords(parseCsv(rawCsv));
const turnoutRows = buildTurnoutRows(records);
const actual = assertExpected(records, turnoutRows);

const header = [
  "state",
  "election_year",
  "jurisdiction_name",
  "jurisdiction_code",
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
  "source_title",
  "source_status",
  "source_url",
  "notes",
];
await writeFile(NORMALIZED_OUT, writeCsv([header, ...turnoutRows.map((row) => header.map((name) => row[name]))]), "utf8");

await writeFile(
  SUMMARY_OUT,
  `${JSON.stringify(
    {
      sourceAuthority: "Colorado Secretary of State",
      sourceUrl: SOURCE_URL,
      downloadUrl: DOWNLOAD_URL,
      localRawCsv: "data/co-2024-historical-voter-statistics.csv",
      localNormalizedCsv: "data/co-2024-historical-voter-statistics-turnout.csv",
      parserOrNormalizationPath: "scripts/normalize-co-historical-voter-statistics.mjs",
      electionId: 159,
      electionDate: "2024-11-05",
      reportingGrain: "county",
      expected: actual,
      reconciliation: {
        eacFallbackBallotsCast: 3240754,
        eacFallbackRegisteredVoters: 4583280,
        clarityElectionVoterTurnoutBallotsCast: 3241120,
        clarityElectionVoterTurnoutTotalVoters: 4058938,
        historicalMinusEacBallotsCast: actual.ballotsCast - 3240754,
        historicalMinusClarityBallotsCast: actual.ballotsCast - 3241120,
        historicalMinusEacRegisteredVoters: actual.totalVoters - 4583280,
      },
      caveats: [
        "The Historical Election Data export is official Colorado Secretary of State data and provides explicit 2024 General Voting Statistics county rows.",
        "The normalized denominator uses Total Voters, which equals Active Voters plus Inactive Voters in every county and equals the current EAC registered-voter denominator statewide.",
        "Total Ballots Cast is election-level turnout, not presidential contest votes.",
        "Total Ballots Cast is 401 above the active EAC fallback and 35 above the Clarity ElectionVoterTurnout ballotsCast lead; keep this reconciliation note visible.",
        "The raw export also includes precinct voter-stat rows, but this pass normalizes only county rows to match the current map/review grain.",
      ],
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Wrote ${RAW_OUT}`);
console.log(`Wrote ${NORMALIZED_OUT}`);
console.log(`Wrote ${SUMMARY_OUT}`);
