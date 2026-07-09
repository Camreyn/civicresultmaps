import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const summaryPath = path.join(repoRoot, "data", "hi-2020-general-summary.txt");
const detailPath = path.join(repoRoot, "data", "hi-2020-general-precinct-detail.txt");
const outputCsvPath = process.argv[2] ?? path.join(repoRoot, "data", "hi-historical-presidential-baseline.csv");
const outputSummaryPath = process.argv[3] ?? path.join(repoRoot, "data", "hi-2020-historical-presidential-baseline-summary.json");

const sourceUrl = "https://files.hawaii.gov/elections/files/results/2020/general/media.txt";
const summaryUrl = "https://files.hawaii.gov/elections/files/results/2020/general/summary.txt";

const expectedStatewide = {
  dem: 366130,
  rep: 196864,
  other: 11475,
  total: 574469,
};

const countyExpected = {
  "Hawaii County": {
    geoid: "15001",
    dem: 58731,
    rep: 26897,
    other: 2186,
    total: 87814,
    sourceUrl: "https://files.hawaii.gov/elections/files/results/2020/general/coh.pdf",
  },
  "Honolulu County": {
    geoid: "15003",
    dem: 238869,
    rep: 136259,
    other: 6986,
    total: 382114,
    sourceUrl: "https://files.hawaii.gov/elections/files/results/2020/general/cch.pdf",
  },
  "Kauai County": {
    geoid: "15007",
    dem: 21225,
    rep: 11582,
    other: 690,
    total: 33497,
    sourceUrl: "https://files.hawaii.gov/elections/files/results/2020/general/cok.pdf",
  },
  "Maui County": {
    geoid: "15009",
    dem: 47305,
    rep: 22126,
    other: 1613,
    total: 71044,
    sourceUrl: "https://files.hawaii.gov/elections/files/results/2020/general/com.pdf",
  },
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  const headers = rows.shift();
  return rows
    .filter((fields) => fields.length > 1)
    .map((fields) => Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ""])));
}

function intCell(value) {
  return Number(String(value ?? "").replace(/,/g, "").trim() || "0");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function presidentBucket(candidate) {
  const value = String(candidate ?? "").toUpperCase();
  if (value.includes("BIDEN")) return "dem";
  if (value.includes("TRUMP")) return "rep";
  return "other";
}

function precinctCounty(precinctName) {
  const match = /^(\d{2})-\d{2}$/.exec(String(precinctName ?? ""));
  if (!match) return null;

  const district = Number(match[1]);
  if (district >= 1 && district <= 7) return "Hawaii County";
  if (district >= 8 && district <= 13) return "Maui County";
  if (district >= 14 && district <= 16) return "Kauai County";
  if (district >= 17 && district <= 51) return "Honolulu County";
  return null;
}

function assertTotals(label, actual, expected) {
  for (const key of ["dem", "rep", "other", "total"]) {
    if (actual[key] !== expected[key]) {
      throw new Error(`${label} ${key} mismatch: ${actual[key]} expected ${expected[key]}`);
    }
  }
}

function addVotes(target, bucket, votes) {
  target[bucket] += votes;
  target.total += votes;
}

function main() {
  const summaryRows = parseCsv(readFileSync(summaryPath, "utf8"));
  const detailRows = parseCsv(readFileSync(detailPath, "utf8"));

  const summaryTotals = { dem: 0, rep: 0, other: 0, total: 0 };
  for (const row of summaryRows.filter((item) => item["Contest ID"] === "1")) {
    const votes = intCell(row["Total Votes"]);
    addVotes(summaryTotals, presidentBucket(row["Candidate Name"]), votes);
  }
  assertTotals("2020 statewide summary", summaryTotals, expectedStatewide);

  const counties = Object.fromEntries(
    Object.keys(countyExpected).map((name) => [name, { dem: 0, rep: 0, other: 0, total: 0 }]),
  );
  const nonGeographicKeys = new Set();
  const unmappedDistricts = new Set();

  for (const row of detailRows.filter((item) => item.Contest_id === "1")) {
    const county = precinctCounty(row.Precinct_Name);
    const key = String(row.precinct_splitId ?? "").trim();
    if (!county) {
      if (key) nonGeographicKeys.add(key);
      const district = String(row.Precinct_Name ?? "").split("-", 1)[0];
      if (district) unmappedDistricts.add(district);
      continue;
    }
    const votes = intCell(row.Absentee_votes) + intCell(row.Early_votes) + intCell(row.Election_Votes);
    addVotes(counties[county], presidentBucket(row.Candidate_name), votes);
  }

  for (const [county, expected] of Object.entries(countyExpected)) {
    assertTotals(`2020 ${county}`, counties[county], expected);
  }

  const detailTotals = Object.values(counties).reduce(
    (totals, row) => ({
      dem: totals.dem + row.dem,
      rep: totals.rep + row.rep,
      other: totals.other + row.other,
      total: totals.total + row.total,
    }),
    { dem: 0, rep: 0, other: 0, total: 0 },
  );
  assertTotals("2020 detail aggregate", detailTotals, expectedStatewide);

  const headers = [
    "state",
    "election_year",
    "jurisdiction_code",
    "jurisdiction_tag",
    "jurisdiction_name",
    "source_id",
    "source_level",
    "row_method",
    "dem_votes",
    "rep_votes",
    "other_votes",
    "total_votes",
    "source_url",
    "local_unit",
    "notes",
  ];

  const records = Object.entries(counties)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([county, values]) => ({
      state: "HI",
      election_year: 2020,
      jurisdiction_code: countyExpected[county].geoid,
      jurisdiction_tag: `county:${countyExpected[county].geoid}`,
      jurisdiction_name: county,
      source_id: "hi-2020-general-precinct-detail",
      source_level: "county_from_precinct_split",
      row_method: "hawaiiOffice2020PrecinctSplitCountyAggregate",
      dem_votes: values.dem,
      rep_votes: values.rep,
      other_votes: values.other,
      total_votes: values.total,
      source_url: sourceUrl,
      local_unit: county,
      notes:
        "Aggregated from official Hawaii Office of Elections 2020 precinct detail text using the 2020 numbered district county crosswalk; Kalawao is not a separate Office result row.",
    }));

  writeFileSync(outputCsvPath, `${[headers.join(","), ...records.map((record) => headers.map((header) => csvEscape(record[header])).join(","))].join("\n")}\n`);

  const summary = {
    state: "HI",
    electionYear: 2020,
    sourceAuthority: "Hawaii Office of Elections",
    sourceUrls: {
      statewideSummaryText: summaryUrl,
      statewidePrecinctDetailText: sourceUrl,
      countySummaryPdfs: Object.fromEntries(Object.entries(countyExpected).map(([county, value]) => [county, value.sourceUrl])),
    },
    localArtifacts: {
      statewideSummaryText: "data/hi-2020-general-summary.txt",
      statewidePrecinctDetailText: "data/hi-2020-general-precinct-detail.txt",
      normalizedCsv: "data/hi-historical-presidential-baseline.csv",
    },
    parser: "scripts/normalize-hi-historical-baseline.mjs",
    reportingGrain: "county_from_precinct_split",
    rowCount: records.length,
    statewideTotals: detailTotals,
    countyTotals: records.map((record) => ({
      county: record.jurisdiction_name,
      jurisdictionTag: record.jurisdiction_tag,
      dem: record.dem_votes,
      rep: record.rep_votes,
      other: record.other_votes,
      total: record.total_votes,
      sourceUrl: countyExpected[record.jurisdiction_name].sourceUrl,
    })),
    crosswalk: {
      "01-07": "Hawaii County",
      "08-13": "Maui County",
      "14-16": "Kauai County",
      "17-51": "Honolulu County",
    },
    caveats: [
      "County rows are aggregated from official numbered precinct/split rows because the text exports are statewide files.",
      "The 2020 district-to-county crosswalk differs from the 2024 parser's reapportioned district ranges.",
      "Kalawao has county geometry/EAC context but no separate Hawaii Office presidential result county row and is not emitted.",
      "Statewide-only, non-geographic, or unmapped rows are excluded rather than forced into county tags.",
    ],
    excluded: {
      nonGeographicKeys: [...nonGeographicKeys].sort(),
      unmappedDistricts: [...unmappedDistricts].sort(),
    },
  };
  writeFileSync(outputSummaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(`Wrote ${records.length} Hawaii 2020 historical baseline rows to ${path.relative(repoRoot, outputCsvPath)}`);
  console.log(`Wrote Hawaii historical baseline summary to ${path.relative(repoRoot, outputSummaryPath)}`);
}

main();
