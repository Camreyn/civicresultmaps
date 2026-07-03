import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseCsv, toCsv } from "./normalize-eac-turnout.mjs";

const repoRoot = process.cwd();
const inputPath = path.join(repoRoot, "data", "ak-2024-general-enr-by-precinct.csv");
const outputPath = path.join(repoRoot, "data", "ak-2024-general-precinct-president-us-house-review.csv");

const PRESIDENT_CONTEST = "U.S. President / Vice President";
const HOUSE_CONTEST = "U.S. Representative";
const EXPECTED_TOTALS = {
  precinctRows: 523,
  harris: 140026,
  trump: 184458,
  presidentOther: 13693,
  presidentTotal: 338177,
  houseDem: 156245,
  houseRep: 159550,
  houseOther: 13010,
  houseTotal: 328805,
};

function intValue(value) {
  const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") {
    return 0;
  }
  return Number.parseInt(cleaned, 10);
}

function rowObjects(csvText) {
  const [header, ...records] = parseCsv(csvText);
  if (!header) {
    throw new Error("Alaska ENR CSV is empty.");
  }
  return records.map((record) => Object.fromEntries(header.map((column, index) => [column, record[index] ?? ""])));
}

function precinctKey(row) {
  const precinctId = String(row.Pct_Id ?? "").trim();
  const precinctName = String(row.Precinct_name ?? "").trim();
  if (!precinctName) {
    throw new Error(`Missing Alaska precinct key in row: ${JSON.stringify(row)}`);
  }
  if (!precinctId) {
    return precinctName;
  }
  return precinctName.startsWith(precinctId) ? precinctName : `${precinctId} ${precinctName}`;
}

function houseDistrict(row) {
  const precinctId = String(row.Pct_Id ?? "").trim();
  const precinctMatch = precinctId.match(/^(\d{2})-/);
  if (precinctMatch) {
    return `HD${precinctMatch[1]}`;
  }
  const name = String(row.Precinct_name ?? "").trim();
  const districtMatch = name.match(/^District\s+(\d+)/i);
  return districtMatch ? `HD${districtMatch[1].padStart(2, "0")}` : "HD_UNKNOWN";
}

function bucketForCandidate(row) {
  const contest = String(row.Contest_title ?? "").trim();
  const candidate = String(row.candidate_name ?? "").trim();
  const party = String(row.Party_Code ?? "").trim().toUpperCase();
  if (contest === PRESIDENT_CONTEST) {
    if (candidate === "Harris/Walz") {
      return "pres_harris";
    }
    if (candidate === "Trump/Vance") {
      return "pres_trump";
    }
    return "pres_other";
  }
  if (contest === HOUSE_CONTEST) {
    if (party === "DEM") {
      return "comparison_dem";
    }
    if (party === "REP") {
      return "comparison_rep";
    }
    return "comparison_other";
  }
  return null;
}

function assertTotals(actual, expected) {
  const mismatches = Object.entries(expected)
    .filter(([key, value]) => actual[key] !== value)
    .map(([key, value]) => `${key}: ${actual[key]} != ${value}`);
  if (mismatches.length) {
    throw new Error(`Alaska ENR precinct normalization totals mismatch: ${mismatches.join("; ")}`);
  }
}

function normalize() {
  const precincts = new Map();
  for (const row of rowObjects(readFileSync(inputPath, "utf8"))) {
    const contest = String(row.Contest_title ?? "").trim();
    if (![PRESIDENT_CONTEST, HOUSE_CONTEST].includes(contest)) {
      continue;
    }
    const key = precinctKey(row);
    const bucket = bucketForCandidate(row);
    if (!bucket) {
      continue;
    }
    const entry = precincts.get(key) ?? {
      state: "AK",
      election_year: 2024,
      county: "Alaska",
      local_unit: `${houseDistrict(row)} ${key}`,
      pres_harris: 0,
      pres_trump: 0,
      pres_other: 0,
      pres_total: 0,
      comparison_dem: 0,
      comparison_rep: 0,
      comparison_other: 0,
      comparison_total: 0,
    };
    const votes = intValue(row.total_votes);
    entry[bucket] += votes;
    if (bucket.startsWith("pres_")) {
      entry.pres_total += votes;
    } else {
      entry.comparison_total += votes;
    }
    precincts.set(key, entry);
  }

  const rows = [...precincts.values()]
    .filter((row) => row.pres_total > 0 && row.comparison_total > 0)
    .sort((left, right) => left.local_unit.localeCompare(right.local_unit, "en"));

  const actual = rows.reduce(
    (totals, row) => {
      totals.precinctRows += 1;
      totals.harris += row.pres_harris;
      totals.trump += row.pres_trump;
      totals.presidentOther += row.pres_other;
      totals.presidentTotal += row.pres_total;
      totals.houseDem += row.comparison_dem;
      totals.houseRep += row.comparison_rep;
      totals.houseOther += row.comparison_other;
      totals.houseTotal += row.comparison_total;
      return totals;
    },
    {
      precinctRows: 0,
      harris: 0,
      trump: 0,
      presidentOther: 0,
      presidentTotal: 0,
      houseDem: 0,
      houseRep: 0,
      houseOther: 0,
      houseTotal: 0,
    },
  );
  assertTotals(actual, EXPECTED_TOTALS);

  const columns = [
    "state",
    "election_year",
    "county",
    "local_unit",
    "pres_harris",
    "pres_trump",
    "pres_other",
    "pres_total",
    "comparison_dem",
    "comparison_rep",
    "comparison_other",
    "comparison_total",
  ];
  writeFileSync(outputPath, toCsv([columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))]), "utf8");
  return actual;
}

console.log(JSON.stringify(normalize(), null, 2));
