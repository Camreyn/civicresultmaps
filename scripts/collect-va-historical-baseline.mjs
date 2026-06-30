import { mkdir, writeFile } from "node:fs/promises";

const state = "VA";
const sourceId = "va-historical-presidential-electionstats-locality";
const output = "data/va-historical-presidential-baseline.csv";
const contests = [
  {
    year: 2012,
    contestId: 44930,
    demColumn: "Barack Obama",
    repColumn: "Willard M. Romney",
    expected: { rows: 134, demVotes: 1971820, repVotes: 1822522, otherVotes: 63701, totalVotes: 3858043 },
  },
  {
    year: 2016,
    contestId: 80871,
    demColumn: "Hillary R. Clinton",
    repColumn: "Donald J. Trump",
    expected: { rows: 133, demVotes: 1981473, repVotes: 1769443, otherVotes: 233704, totalVotes: 3984620 },
    stateExpected: { demVotes: 1981473, repVotes: 1769443, otherVotes: 233715, totalVotes: 3984631 },
  },
  {
    year: 2020,
    contestId: 144567,
    demColumn: "Joseph Robinette Biden, Jr",
    repColumn: "Donald J. Trump",
    expected: { rows: 133, demVotes: 2413568, repVotes: 1962430, otherVotes: 84526, totalVotes: 4460524 },
  },
];

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
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function intValue(value) {
  const normalized = String(value ?? "").replace(/[^0-9-]/g, "");
  return normalized ? Number(normalized) : 0;
}

function contestDownloadUrl(contestId) {
  return `https://va2.elstats.civera.com/api/download_contest/${contestId}_table.csv?split_party=false`;
}

function contestPageUrl(contestId) {
  return `https://historical.elections.virginia.gov/contest/${contestId}`;
}

function columnIndex(headers, name) {
  const index = headers.findIndex((header) => header.trim() === name);
  if (index < 0) {
    throw new Error(`Missing expected candidate column: ${name}`);
  }
  return index;
}

function parseRows(entry, text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines[0]);
  const demIndex = columnIndex(headers, entry.demColumn);
  const repIndex = columnIndex(headers, entry.repColumn);
  const totalIndex = columnIndex(headers, "Total Votes Cast");
  const stateRow = splitCsvLine(lines.find((line) => line.startsWith("State,")) ?? "");
  if (!stateRow.length) {
    throw new Error(`${entry.year} is missing the State row`);
  }

  const stateDem = intValue(stateRow[demIndex]);
  const stateRep = intValue(stateRow[repIndex]);
  const stateTotal = intValue(stateRow[totalIndex]);
  const stateOther = stateTotal - stateDem - stateRep;
  const stateExpected = entry.stateExpected ?? entry.expected;
  if (stateDem !== stateExpected.demVotes || stateRep !== stateExpected.repVotes || stateOther !== stateExpected.otherVotes || stateTotal !== stateExpected.totalVotes) {
    throw new Error(
      `${entry.year} State row mismatch: got DEM ${stateDem}, REP ${stateRep}, Other ${stateOther}, Total ${stateTotal}`,
    );
  }

  const rows = [];
  for (const line of lines.slice(2)) {
    const cells = splitCsvLine(line);
    if (cells[0] !== "Locality") {
      continue;
    }

    const locality = cells[1]?.trim();
    if (!locality || locality === "Virginia") {
      continue;
    }

    const demVotes = intValue(cells[demIndex]);
    const repVotes = intValue(cells[repIndex]);
    const totalVotes = intValue(cells[totalIndex]);
    const otherVotes = totalVotes - demVotes - repVotes;
    if (otherVotes < 0) {
      throw new Error(`${entry.year} ${locality} has negative computed other votes`);
    }

    rows.push({
      state,
      election_year: entry.year,
      jurisdiction_name: locality,
      county: locality,
      local_unit: locality,
      source_id: sourceId,
      source_level: "locality",
      row_method: "virginiaElectionStatsContestCsvLocality",
      source_url: contestPageUrl(entry.contestId),
      dem_votes: demVotes,
      rep_votes: repVotes,
      other_votes: otherVotes,
      total_votes: totalVotes,
    });
  }

  const totals = rows.reduce(
    (sum, row) => ({
      rows: sum.rows + 1,
      demVotes: sum.demVotes + row.dem_votes,
      repVotes: sum.repVotes + row.rep_votes,
      otherVotes: sum.otherVotes + row.other_votes,
      totalVotes: sum.totalVotes + row.total_votes,
    }),
    { rows: 0, demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );

  for (const [key, value] of Object.entries(entry.expected)) {
    if (totals[key] !== value) {
      throw new Error(`${entry.year} expected ${key}=${value}, got ${totals[key]}`);
    }
  }

  return rows;
}

async function fetchRows(entry) {
  const url = contestDownloadUrl(entry.contestId);
  const response = await fetch(url, { headers: { "User-Agent": "CivicResultMaps data normalization" } });
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  }
  return parseRows(entry, await response.text());
}

const rows = (await Promise.all(contests.map(fetchRows))).flat();
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
await mkdir("data", { recursive: true });
await writeFile(output, csv, "utf8");
console.log(JSON.stringify({ rows: rows.length, years: contests.map((entry) => entry.year), output }, null, 2));