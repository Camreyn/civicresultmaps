import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseCsv, toCsv } from "./normalize-eac-turnout.mjs";

const repoRoot = process.cwd();
const inputPath = path.join(repoRoot, "data", "wa-2020-all-counties.csv");
const outputPath = path.join(repoRoot, "data", "wa-historical-presidential-baseline.csv");

const SOURCE_ID = "wa-2020-all-counties-csv";
const SOURCE_URL = "https://results.vote.wa.gov/results/20201103/export/20201103_AllCounties.csv";
const PRESIDENT_CONTEST = "Washington State President/Vice President";
const EXPECTED_TOTALS = {
  rows: 39,
  dem: 2369612,
  rep: 1584651,
  other: 133368,
  total: 4087631,
};

function intValue(value) {
  const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") {
    return 0;
  }
  return Number.parseInt(cleaned, 10);
}

function countyName(value) {
  const name = String(value ?? "").trim();
  if (!name) {
    return "";
  }
  return /\bcounty$/i.test(name) ? name.replace(/\s+/g, " ") : `${name.replace(/\s+/g, " ")} County`;
}

function rowObjects(csvText) {
  const [header, ...records] = parseCsv(csvText);
  if (!header) {
    throw new Error("Washington 2020 county CSV is empty.");
  }
  return records.map((record) => Object.fromEntries(header.map((column, index) => [column, record[index] ?? ""])));
}

function bucketForCandidate(candidate) {
  const normalized = String(candidate ?? "").toLowerCase();
  if (normalized.includes("joseph r. biden")) {
    return "dem";
  }
  if (normalized.includes("donald j. trump")) {
    return "rep";
  }
  return "other";
}

function assertTotals(rows) {
  const actual = rows.reduce(
    (totals, row) => ({
      rows: totals.rows + 1,
      dem: totals.dem + row.dem_votes,
      rep: totals.rep + row.rep_votes,
      other: totals.other + row.other_votes,
      total: totals.total + row.total_votes,
    }),
    { rows: 0, dem: 0, rep: 0, other: 0, total: 0 },
  );
  const mismatches = Object.entries(EXPECTED_TOTALS).filter(([key, value]) => actual[key] !== value);
  if (mismatches.length) {
    throw new Error(`Washington historical totals mismatch: ${JSON.stringify(actual)} expected ${JSON.stringify(EXPECTED_TOTALS)}`);
  }
  return actual;
}

const counties = new Map();
for (const row of rowObjects(readFileSync(inputPath, "utf8"))) {
  if (String(row.Race ?? "").trim() !== PRESIDENT_CONTEST) {
    continue;
  }
  const county = countyName(row.County);
  if (!county) {
    throw new Error(`Missing county in Washington 2020 presidential row: ${JSON.stringify(row)}`);
  }
  const values = counties.get(county) ?? { dem_votes: 0, rep_votes: 0, other_votes: 0, total_votes: 0 };
  const votes = intValue(row.Votes);
  const bucket = bucketForCandidate(row.Candidate);
  if (bucket === "dem") {
    values.dem_votes += votes;
  } else if (bucket === "rep") {
    values.rep_votes += votes;
  } else {
    values.other_votes += votes;
  }
  values.total_votes += votes;
  counties.set(county, values);
}

const rows = [...counties.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([county, values]) => ({
    state: "WA",
    election_year: 2020,
    jurisdiction_name: county,
    county,
    local_unit: county,
    source_id: SOURCE_ID,
    source_level: "county",
    row_method: "washingtonOfficialCountyCsvHistorical",
    source_url: SOURCE_URL,
    ...values,
  }));

const totals = assertTotals(rows);
writeFileSync(
  outputPath,
  toCsv([
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
    ...rows.map((row) => [
      row.state,
      row.election_year,
      row.jurisdiction_name,
      row.county,
      row.local_unit,
      row.source_id,
      row.source_level,
      row.row_method,
      row.source_url,
      row.dem_votes,
      row.rep_votes,
      row.other_votes,
      row.total_votes,
    ]),
  ]),
  "utf8",
);

console.log(JSON.stringify({ output: path.relative(repoRoot, outputPath), ...totals }, null, 2));
