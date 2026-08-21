import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");
const rawFile = path.join(dataDir, "sc-2024-election-history", "voter-statistics-7075.csv");
const normalizedFile = path.join(dataDir, "sc-2024-election-history", "voter-statistics-7075-county.csv");
const reconciliationFile = path.join(
  dataDir,
  "sc-2024-election-history",
  "voter-statistics-7075-vs-vrems-reconciliation.json",
);
const requestFile = path.join(dataDir, "sc-2024-election-history", "voter-statistics-7075-request.json");

const SOURCE_URL = "https://sc.elstats.civera.com/api/download_contest/7075_table.csv?split_party=false";
const SEARCH_URL = "https://electionhistory.scvotes.gov/search";
const VREMS_FILE = path.join(dataDir, "sc-2024-vrems-turnout.csv");
const EXPECTED_RAW = {
  byteCount: 81664,
  sha256: "c90adc5ca5a8939a870d6d65db1acb0f2a776887d93f6e2c5adb0823a8725b94",
};
const EXPECTED = {
  stateRows: 1,
  countyRows: 46,
  precinctRows: 2446,
  ballotsCast: 2566404,
  registeredVoters: 3451344,
  totalVotesCast: 0,
};

const SEARCH_FILTERS = {
  global: { years: { from: 2024, to: 2024 } },
  ballotQuestions: { text: "", types: [], number: "", divisions: [] },
  contests: { candidates: [], divisions: [], offices: [] },
  specialElectionsOnly: false,
  voterStats: true,
  stages: [],
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    const next = clean[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
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
  if (quoted) {
    throw new Error("Unterminated quoted field in South Carolina Election History voter-statistics CSV");
  }
  return rows;
}

function integer(value, context) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const normalized = text.replaceAll(",", "");
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`Invalid integer in ${context}: ${JSON.stringify(text)}`);
  }
  return Number(normalized);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(headers, rows) {
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function relative(file) {
  return path.relative(repoRoot, file).replace(/\\/g, "/");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`South Carolina Election History voter-statistics ${label} mismatch: ${actual} != ${expected}`);
  }
}

function countyName(value) {
  return `${String(value).trim()} County`;
}

function parseRows(rawText) {
  const rows = parseCsv(rawText);
  if (rows.length < 3) throw new Error("Election History voter-statistics export is empty");
  const header = rows[0];
  const expectedHeader = ["", "", "Total Votes Cast", "Total Ballots Cast", "Registered Voters"];
  if (JSON.stringify(header) !== JSON.stringify(expectedHeader)) {
    throw new Error(`Unexpected Election History voter-statistics header: ${JSON.stringify(header)}`);
  }
  if (rows[1].some((value) => value !== "")) {
    throw new Error("Election History voter-statistics second header row is not blank");
  }
  return rows.slice(2).map((row, index) => {
    if (row.length !== 5) {
      throw new Error(`Election History voter-statistics row ${index + 3} has ${row.length} fields`);
    }
    return {
      type: String(row[0] ?? "").trim(),
      name: String(row[1] ?? "").trim(),
      totalVotesCast: integer(row[2], `source row ${index + 3} Total Votes Cast`),
      totalBallotsCast: integer(row[3], `source row ${index + 3} Total Ballots Cast`),
      registeredVoters: integer(row[4], `source row ${index + 3} Registered Voters`),
    };
  });
}

function countyRowsWithParents(rows) {
  let currentCounty = "";
  const stateRows = [];
  const counties = [];
  const precincts = [];
  for (const row of rows) {
    if (row.type === "State") {
      stateRows.push(row);
    } else if (row.type === "County") {
      currentCounty = row.name;
      counties.push({ ...row, county: row.name });
    } else if (row.type === "Precinct") {
      if (!currentCounty) throw new Error(`Precinct row ${row.name} precedes a county row`);
      precincts.push({ ...row, county: currentCounty });
    } else {
      throw new Error(`Unexpected Election History voter-statistics row type: ${row.type}`);
    }
  }
  assertEqual(stateRows.length, EXPECTED.stateRows, "state row count");
  assertEqual(counties.length, EXPECTED.countyRows, "county row count");
  assertEqual(precincts.length, EXPECTED.precinctRows, "precinct row count");
  if (new Set(counties.map((row) => row.name)).size !== counties.length) {
    throw new Error("Election History voter-statistics county names are duplicated");
  }
  const precinctKeys = precincts.map((row) => `${row.county}\u0000${row.name}`);
  if (new Set(precinctKeys).size !== precinctKeys.length) {
    throw new Error("Election History voter-statistics county/precinct identities are duplicated");
  }
  return { state: stateRows[0], counties, precincts };
}

function totals(rows) {
  return rows.reduce(
    (sum, row) => ({
      totalVotesCast: sum.totalVotesCast + row.totalVotesCast,
      ballotsCast: sum.ballotsCast + row.totalBallotsCast,
      registeredVoters: sum.registeredVoters + row.registeredVoters,
    }),
    { totalVotesCast: 0, ballotsCast: 0, registeredVoters: 0 },
  );
}

function assertSourceTotals(state, counties, precincts) {
  if (state.name !== "South Carolina") throw new Error(`Unexpected Election History state row: ${state.name}`);
  for (const [label, row] of [["state", state], ...counties.map((item) => ["county", item])]) {
    if (row.totalVotesCast !== 0) throw new Error(`${label} row ${row.name} unexpectedly has Total Votes Cast`);
  }
  const countyTotals = totals(counties);
  const precinctTotals = totals(precincts);
  const stateTotals = totals([state]);
  for (const key of Object.keys(stateTotals)) {
    assertEqual(countyTotals[key], stateTotals[key], `county ${key} sum`);
    assertEqual(precinctTotals[key], stateTotals[key], `precinct ${key} sum`);
  }
  assertEqual(stateTotals.totalVotesCast, EXPECTED.totalVotesCast, "state Total Votes Cast");
  assertEqual(stateTotals.ballotsCast, EXPECTED.ballotsCast, "state Total Ballots Cast");
  assertEqual(stateTotals.registeredVoters, EXPECTED.registeredVoters, "state Registered Voters");
  const countyByName = new Map(counties.map((row) => [row.name, row]));
  const precinctSums = new Map();
  for (const row of precincts) {
    const sum = precinctSums.get(row.county) ?? { totalVotesCast: 0, ballotsCast: 0, registeredVoters: 0 };
    sum.totalVotesCast += row.totalVotesCast;
    sum.ballotsCast += row.totalBallotsCast;
    sum.registeredVoters += row.registeredVoters;
    precinctSums.set(row.county, sum);
  }
  for (const [name, county] of countyByName) {
    const precinct = precinctSums.get(name);
    if (!precinct) throw new Error(`No precinct rows for Election History county ${name}`);
    for (const key of Object.keys(precinct)) {
      assertEqual(precinct[key], county[key === "ballotsCast" ? "totalBallotsCast" : key], `${name} precinct ${key} sum`);
    }
  }
  return { stateTotals, countyTotals, precinctTotals };
}

function parseVrems(text) {
  const rows = parseCsv(text).filter((row) => row.some((value) => value !== ""));
  const header = rows.shift();
  const index = new Map(header.map((name, position) => [name, position]));
  for (const field of ["jurisdiction_name", "ballots_cast", "registered_voters"]) {
    if (!index.has(field)) throw new Error(`VREMS turnout artifact is missing ${field}`);
  }
  const output = new Map();
  for (const row of rows) {
    const name = String(row[index.get("jurisdiction_name")] ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (output.has(key)) throw new Error(`VREMS turnout artifact duplicates ${name}`);
    output.set(key, {
      ballotsCast: integer(row[index.get("ballots_cast")], `${name} VREMS ballots_cast`),
      registeredVoters: integer(row[index.get("registered_voters")], `${name} VREMS registered_voters`),
    });
  }
  assertEqual(output.size, EXPECTED.countyRows, "VREMS county row count");
  return output;
}

function reconcile(counties, vrems) {
  const rows = [];
  for (const county of counties) {
    const name = countyName(county.name);
    const active = vrems.get(name.toLowerCase());
    if (!active) throw new Error(`VREMS turnout artifact is missing ${name}`);
    rows.push({
      state: "SC",
      election_year: 2024,
      jurisdiction_name: name,
      source_id: "sc-2024-election-history-voter-statistics",
      source_level: "county",
      row_method: "electionHistoryVoterStatisticsCandidate",
      ballots_cast: county.totalBallotsCast,
      registered_voters: county.registeredVoters,
      total_votes_cast: county.totalVotesCast,
      source_url: SOURCE_URL,
      source_status: "candidate",
      source_jurisdiction_name: county.name,
    });
  }
  rows.sort((left, right) => left.jurisdiction_name.localeCompare(right.jurisdiction_name));
  const candidateTotals = rows.reduce(
    (sum, row) => ({
      countyRows: sum.countyRows + 1,
      ballotsCast: sum.ballotsCast + row.ballots_cast,
      registeredVoters: sum.registeredVoters + row.registered_voters,
    }),
    { countyRows: 0, ballotsCast: 0, registeredVoters: 0 },
  );
  const vremsTotals = [...vrems.values()].reduce(
    (sum, row) => ({
      countyRows: sum.countyRows + 1,
      ballotsCast: sum.ballotsCast + row.ballotsCast,
      registeredVoters: sum.registeredVoters + row.registeredVoters,
    }),
    { countyRows: 0, ballotsCast: 0, registeredVoters: 0 },
  );
  return {
    rows,
    candidateTotals,
    vremsTotals,
    deltas: {
      ballotsCast: candidateTotals.ballotsCast - vremsTotals.ballotsCast,
      registeredVoters: candidateTotals.registeredVoters - vremsTotals.registeredVoters,
    },
    matchedCountyRows: rows.length,
  };
}

async function readRaw() {
  const bytes = process.argv.includes("--download")
    ? await downloadRaw()
    : await readFile(rawFile);
  const actual = { byteCount: bytes.length, sha256: sha256(bytes) };
  if (actual.byteCount !== EXPECTED_RAW.byteCount || actual.sha256 !== EXPECTED_RAW.sha256) {
    throw new Error(`Pinned SC Election History voter-statistics export drifted: ${JSON.stringify({ expected: EXPECTED_RAW, actual })}`);
  }
  return { bytes, actual };
}

async function downloadRaw() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download South Carolina Election History voter-statistics export: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = { byteCount: bytes.length, sha256: sha256(bytes) };
  if (actual.byteCount !== EXPECTED_RAW.byteCount || actual.sha256 !== EXPECTED_RAW.sha256) {
    throw new Error(`South Carolina Election History voter-statistics export drifted during download: ${JSON.stringify({ expected: EXPECTED_RAW, actual })}`);
  }
  await mkdir(path.dirname(rawFile), { recursive: true });
  const temporaryFile = `${rawFile}.tmp-${process.pid}`;
  await writeFile(temporaryFile, bytes);
  await rename(temporaryFile, rawFile);
  return bytes;
}

const { bytes, actual: rawArtifact } = await readRaw();
const { state, counties, precincts } = countyRowsWithParents(parseRows(bytes.toString("utf8")));
const sourceTotals = assertSourceTotals(state, counties, precincts);
const vremsBytes = await readFile(VREMS_FILE);
const vrems = parseVrems(vremsBytes.toString("utf8"));
const reconciliation = reconcile(counties, vrems);

await mkdir(path.dirname(normalizedFile), { recursive: true });
const headers = [
  "state",
  "election_year",
  "jurisdiction_name",
  "source_id",
  "source_level",
  "row_method",
  "ballots_cast",
  "registered_voters",
  "total_votes_cast",
  "source_url",
  "source_status",
  "source_jurisdiction_name",
];
await writeFile(
  normalizedFile,
  writeCsv(headers, reconciliation.rows.map((row) => headers.map((header) => row[header]))),
  "utf8",
);

const requestDocument = {
  schemaVersion: 1,
  sourceAuthority: "South Carolina Election Commission",
  queryInterfaceUrl: SEARCH_URL,
  searchFilters: SEARCH_FILTERS,
  selectedVoterStatistic: {
    contestId: "7075",
    electionId: "58",
    electionDate: "2024-11-05",
    electionType: "General",
    office: "Voting Statistics",
    division: "State > County > Precinct",
  },
  downloadUrl: SOURCE_URL,
  localFile: relative(rawFile),
  byteCount: rawArtifact.byteCount,
  sha256: rawArtifact.sha256,
  note: "The search UI's Voter Statistics toggle is recorded as voterStats=true; the selected 2024 General statewide statistic is contest 7075.",
};
await writeFile(requestFile, `${JSON.stringify(requestDocument, null, 2)}\n`, "utf8");

const summary = {
  schemaVersion: 1,
  state: "SC",
  election: {
    year: 2024,
    date: "2024-11-05",
    type: "General",
    electionId: "58",
    contestId: "7075",
    office: "Voting Statistics",
  },
  sourceAuthority: "South Carolina Election Commission",
  sourceUrl: SOURCE_URL,
  queryInterfaceUrl: SEARCH_URL,
  localRawCsv: relative(rawFile),
  localNormalizedCsv: relative(normalizedFile),
  localRequestJson: relative(requestFile),
  parserOrNormalizationPath: "scripts/normalize-sc-election-history-voter-statistics.mjs",
  rawArtifact: rawArtifact,
  reportingGrain: {
    sourceRows: "state, county, and precinct",
    normalizedRows: "county",
    normalizedRowCount: reconciliation.rows.length,
  },
  sourceRows: {
    state: EXPECTED.stateRows,
    county: EXPECTED.countyRows,
    precinct: EXPECTED.precinctRows,
  },
  sourceTotals: {
    state: sourceTotals.stateTotals,
    county: sourceTotals.countyTotals,
    precinct: sourceTotals.precinctTotals,
  },
  reconciliation: {
    grain: {
      electionHistorySource: "state/county/precinct",
      normalizedCandidate: "county",
      vremsActive: "county",
    },
    timing: {
      electionHistory: "2024-11-05 General election event (electionId 58)",
      vrems: "2024 General voter-history election-list statistics for the same election event",
      unresolved: "The retained Election History export and VREMS artifact do not expose a common snapshot/publication timestamp proving denominator equivalence.",
    },
    inactiveTreatment: {
      electionHistory: "No active/inactive registration breakdown is present in the retained export.",
      vrems: "The source page describes printed-list registration counts as all active voters plus some inactive voters printed for the selected election.",
      resolution: "Semantic equivalence is unresolved; preserve VREMS as active warning-required turnout and keep Election History as candidate_not_loaded.",
    },
    matchedCountyRows: reconciliation.matchedCountyRows,
    electionHistory: reconciliation.candidateTotals,
    vremsActive: {
      sourceId: "sc-2024-vrems-turnout",
      localFile: "data/sc-2024-vrems-turnout.csv",
      sourceSha256: sha256(vremsBytes),
      ...reconciliation.vremsTotals,
    },
    deltas: reconciliation.deltas,
    disposition: "candidate_not_loaded",
    activeTurnoutSourceId: "sc-2024-vrems-turnout",
  },
  provenance: {
    queryInterfaceUrl: SEARCH_URL,
    electionHistoryDownloadUrl: SOURCE_URL,
    electionHistoryRequestFile: relative(requestFile),
    electionHistoryRawSha256: rawArtifact.sha256,
    vremsSourceUrl: "https://vrems.scvotes.sc.gov/Statistics/VoterHistoryResults",
    vremsLocalFile: "data/sc-2024-vrems-turnout.csv",
    vremsRawSha256: sha256(vremsBytes),
  },
  caveats: [
    "The official Election History Voter Statistics export labels fields Total Ballots Cast and Registered Voters and provides no active/inactive breakdown in the retained CSV.",
    "The candidate export reports 2,566,404 ballots and 3,451,344 registered voters across 46 counties; active VREMS reports 2,553,185 participating voters and 3,851,930 printed-list registrants.",
    "The 13,219-ballot and -400,586-registration differences are source/timing/denominator reconciliation gaps, not a basis for silently replacing VREMS. VREMS documents that its printed-list count includes active voters plus some inactive voters printed for the selected election.",
    "Total Ballots Cast is election-level turnout context, not presidential contest votes. The candidate source is not used for advisory indicators or native turnout rows.",
  ],
};
await writeFile(reconciliationFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  rawArtifact,
  sourceRows: summary.sourceRows,
  candidateTotals: reconciliation.candidateTotals,
  vremsTotals: reconciliation.vremsTotals,
  deltas: reconciliation.deltas,
  normalizedFile: relative(normalizedFile),
  reconciliationFile: relative(reconciliationFile),
}));
