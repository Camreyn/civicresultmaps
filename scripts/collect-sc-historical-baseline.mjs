import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const state = "SC";
const sourceId = "sc-historical-presidential-baseline";
const contestId = 1974;
const rawFile = path.join("data", "sc-2020-election-history", "president-1974.csv");
const outputFile = path.join("data", "sc-historical-presidential-baseline.csv");
const sourceUrl = `https://sc.elstats.civera.com/api/download_contest/${contestId}_table.csv?split_party=false`;
const rowMethod = "southCarolinaElectionHistoryContestCsvCounty";
const expected = {
  rows: 46,
  demVotes: 1091541,
  repVotes: 1385103,
  otherVotes: 36685,
  totalVotes: 2513329,
};

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function intValue(value) {
  const normalized = String(value ?? "").replace(/[^0-9-]/g, "");
  return normalized ? Number(normalized) : 0;
}

function countyName(value) {
  const label = String(value ?? "").trim();
  if (!label) {
    return "";
  }
  return label.toLowerCase().endsWith(" county") ? label : `${label} County`;
}

function partyBucket(party, candidate) {
  const normalizedParty = String(party ?? "").trim().toLowerCase();
  const normalizedCandidate = String(candidate ?? "").trim().toLowerCase();
  if (normalizedParty === "democratic") {
    return "dem";
  }
  if (normalizedParty === "republican") {
    return "rep";
  }
  if (normalizedCandidate.includes("biden") || normalizedCandidate.includes("harris")) {
    return "dem";
  }
  if (normalizedCandidate.includes("trump")) {
    return "rep";
  }
  return "other";
}

function valuesFromRow(row, candidateHeader, partyHeader, totalVotesIndex) {
  const values = {
    demVotes: 0,
    repVotes: 0,
    otherVotes: 0,
    totalVotes: intValue(row[totalVotesIndex]),
  };

  for (let index = 2; index < totalVotesIndex; index += 1) {
    const votes = intValue(row[index]);
    const bucket = partyBucket(partyHeader[index], candidateHeader[index]);
    if (bucket === "dem") {
      values.demVotes += votes;
    } else if (bucket === "rep") {
      values.repVotes += votes;
    } else {
      values.otherVotes += votes;
    }
  }

  return values;
}

function assertTotals(label, totals, expectedTotals) {
  for (const [key, value] of Object.entries(expectedTotals)) {
    if (totals[key] !== value) {
      throw new Error(`${label} expected ${key}=${value}, got ${totals[key]}`);
    }
  }
}

async function maybeDownloadRaw() {
  if (!process.argv.includes("--download")) {
    return;
  }
  const response = await fetch(sourceUrl, { headers: { "user-agent": "CivicResultMaps data normalization" } });
  if (!response.ok) {
    throw new Error(`${sourceUrl} failed: ${response.status} ${response.statusText}`);
  }
  await mkdir(path.dirname(rawFile), { recursive: true });
  await writeFile(rawFile, await response.text(), "utf8");
}

await maybeDownloadRaw();

const text = await readFile(rawFile, "utf8");
const lines = text.trim().split(/\r?\n/).filter(Boolean);
if (lines.length < 3) {
  throw new Error(`South Carolina 2020 President CSV has too few rows: ${rawFile}`);
}

const candidateHeader = splitCsvLine(lines[0]);
const partyHeader = splitCsvLine(lines[1]);
const totalVotesIndex = candidateHeader.indexOf("Total Votes Cast");
if (totalVotesIndex < 0) {
  throw new Error("South Carolina 2020 President CSV is missing Total Votes Cast");
}

const rows = [];
let stateTotals = null;
for (const line of lines.slice(2)) {
  const cells = splitCsvLine(line);
  const rowType = cells[0]?.trim();
  const label = cells[1]?.trim();
  if (rowType === "State") {
    stateTotals = valuesFromRow(cells, candidateHeader, partyHeader, totalVotesIndex);
    continue;
  }
  if (rowType !== "County" || !label) {
    continue;
  }

  const values = valuesFromRow(cells, candidateHeader, partyHeader, totalVotesIndex);
  const jurisdictionName = countyName(label);
  rows.push({
    state,
    election_year: 2020,
    jurisdiction_name: jurisdictionName,
    county: jurisdictionName,
    local_unit: jurisdictionName,
    source_id: sourceId,
    source_level: "county",
    row_method: rowMethod,
    source_url: sourceUrl,
    dem_votes: values.demVotes,
    rep_votes: values.repVotes,
    other_votes: values.otherVotes,
    total_votes: values.totalVotes,
  });
}

if (!stateTotals) {
  throw new Error("South Carolina 2020 President CSV is missing the State row");
}

assertTotals("State row", stateTotals, {
  demVotes: expected.demVotes,
  repVotes: expected.repVotes,
  otherVotes: expected.otherVotes,
  totalVotes: expected.totalVotes,
});

const countyTotals = rows.reduce(
  (sum, row) => ({
    rows: sum.rows + 1,
    demVotes: sum.demVotes + row.dem_votes,
    repVotes: sum.repVotes + row.rep_votes,
    otherVotes: sum.otherVotes + row.other_votes,
    totalVotes: sum.totalVotes + row.total_votes,
  }),
  { rows: 0, demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
);
assertTotals("County rows", countyTotals, expected);

const headers = [
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
];
const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n") + "\n";
await writeFile(outputFile, csv, "utf8");

console.log(
  JSON.stringify(
    {
      rawFile,
      outputFile,
      sourceUrl,
      ...countyTotals,
    },
    null,
    2,
  ),
);
