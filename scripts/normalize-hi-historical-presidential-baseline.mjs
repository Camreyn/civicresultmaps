import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const dataDir = path.join(repoRoot, "data");
const outputCsvPath = path.join(dataDir, "hi-historical-presidential-baseline.csv");
const summaryPath = path.join(dataDir, "hi-historical-presidential-baseline-summary.json");

const COUNTY_TAGS = new Map([
  ["Hawaii County", "county:15001"],
  ["Honolulu County", "county:15003"],
  ["Kalawao County", "county:15005"],
  ["Kauai County", "county:15007"],
  ["Maui County", "county:15009"],
]);

const KALAWAO_PRECINCT = "13-09";
const KALAWAO_PRECINCT_SPLIT_ID = "78";
const HISTORICAL_DISTRICT_RANGES = new Map([
  [
    2016,
    [
      { min: 1, max: 7, county: "Hawaii County" },
      { min: 8, max: 13, county: "Maui County" },
      { min: 14, max: 16, county: "Kauai County" },
      { min: 17, max: 51, county: "Honolulu County" },
    ],
  ],
  [
    2020,
    [
      { min: 1, max: 7, county: "Hawaii County" },
      { min: 8, max: 13, county: "Maui County" },
      { min: 14, max: 16, county: "Kauai County" },
      { min: 17, max: 51, county: "Honolulu County" },
    ],
  ],
]);

const SOURCES = [
  {
    year: 2016,
    summaryId: "hi-2016-general-summary",
    detailId: "hi-2016-general-precinct-detail",
    summaryUrl: "https://files.hawaii.gov/elections/files/results/2016/general/summary.txt",
    detailUrl: "https://files.hawaii.gov/elections/files/results/2016/general/media.txt",
    summaryFile: path.join(dataDir, "hi-2016-general-summary.txt"),
    detailFile: path.join(dataDir, "hi-2016-general-precinct-detail.txt"),
    expected: { rowCount: 5, dem: 266891, rep: 128847, other: 33199, total: 428937 },
    expectedCountyTotals: {
      "Hawaii County": { dem: 41259, rep: 17501, other: 6107, total: 64867 },
      "Honolulu County": { dem: 175696, rep: 90326, other: 19768, total: 285790 },
      "Kalawao County": { dem: 14, rep: 1, other: 5, total: 20 },
      "Kauai County": { dem: 16456, rep: 7574, other: 2305, total: 26335 },
      "Maui County": { dem: 33466, rep: 13445, other: 5014, total: 51925 },
    },
  },
  {
    year: 2020,
    summaryId: "hi-2020-general-summary",
    detailId: "hi-2020-general-precinct-detail",
    summaryUrl: "https://files.hawaii.gov/elections/files/results/2020/general/summary.txt",
    detailUrl: "https://files.hawaii.gov/elections/files/results/2020/general/media.txt",
    summaryFile: path.join(dataDir, "hi-2020-general-summary.txt"),
    detailFile: path.join(dataDir, "hi-2020-general-precinct-detail.txt"),
    expected: { rowCount: 5, dem: 366130, rep: 196864, other: 11475, total: 574469 },
    expectedCountyTotals: {
      "Hawaii County": { dem: 58731, rep: 26897, other: 2186, total: 87814 },
      "Honolulu County": { dem: 238869, rep: 136259, other: 6986, total: 382114 },
      "Kalawao County": { dem: 23, rep: 1, other: 0, total: 24 },
      "Kauai County": { dem: 21225, rep: 11582, other: 690, total: 33497 },
      "Maui County": { dem: 47282, rep: 22125, other: 1613, total: 71020 },
    },
  },
];

function intText(value) {
  return Number(String(value ?? "").replace(/[^0-9-]/g, "")) || 0;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    const next = clean[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((item) => item !== "")) rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [String(name).trim().replace(/^#/, ""), cells[index] ?? ""])));
}

function readHawaiiRows(file) {
  let text = fs.readFileSync(file, "utf8");
  text = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (text.startsWith("Format#1")) {
    text = text.split(/\r?\n/).slice(1).join("\n");
  }
  return parseCsv(text);
}

function presidentBucket(candidate) {
  const value = String(candidate ?? "").toUpperCase();
  if (value.includes("BIDEN") || value.includes("CLINTON") || value.includes("HARRIS")) return "dem";
  if (value.includes("TRUMP")) return "rep";
  return "other";
}

function countyForPrecinct(precinctName, year) {
  if (!/^\d{2}-\d{2}$/.test(String(precinctName ?? ""))) return null;
  if (precinctName === KALAWAO_PRECINCT) return "Kalawao County";

  const ranges = HISTORICAL_DISTRICT_RANGES.get(year);
  if (!ranges) {
    throw new Error("No reviewed Hawaii historical county crosswalk for " + year);
  }
  const district = Number(String(precinctName).split("-", 1)[0]);
  return ranges.find((range) => district >= range.min && district <= range.max)?.county ?? null;
}

function voteTotal(row) {
  return (
    intText(row.Absentee_votes) +
    intText(row.Early_votes) +
    intText(row.Election_Votes) +
    intText(row["Mail votes"]) +
    intText(row["In-Person votes"])
  );
}

function summarizeRows(rows) {
  return {
    rowCount: rows.length,
    dem: rows.reduce((sum, row) => sum + Number(row.dem_votes), 0),
    rep: rows.reduce((sum, row) => sum + Number(row.rep_votes), 0),
    other: rows.reduce((sum, row) => sum + Number(row.other_votes), 0),
    total: rows.reduce((sum, row) => sum + Number(row.total_votes), 0),
  };
}

function assertVoteTuple(label, actual, expected) {
  const mismatches = Object.fromEntries(
    ["dem", "rep", "other", "total"]
      .filter((key) => actual[key] !== expected[key])
      .map((key) => [key, { actual: actual[key], expected: expected[key] }]),
  );
  if (Object.keys(mismatches).length) {
    throw new Error(label + " reconciliation failed: " + JSON.stringify(mismatches));
  }
}

function parseSource(source) {
  const summaryRows = readHawaiiRows(source.summaryFile).filter((row) => row["Contest ID"] === "1");
  const summaryTotals = { dem: 0, rep: 0, other: 0, total: 0 };
  for (const row of summaryRows) {
    const bucket = presidentBucket(row["Candidate Name"]);
    const votes = intText(row["Total Votes"]);
    summaryTotals[bucket] += votes;
    summaryTotals.total += votes;
  }

  const counties = new Map([...COUNTY_TAGS.keys()].map((county) => [county, { dem: 0, rep: 0, other: 0, total: 0 }]));
  const kalawaoPrecinctSplitIds = new Set();
  let skippedNonGeographicVotes = 0;
  for (const row of readHawaiiRows(source.detailFile)) {
    if (String(row.Contest_id ?? "") !== "1") continue;
    if (row.Precinct_Name === KALAWAO_PRECINCT) {
      kalawaoPrecinctSplitIds.add(String(row.precinct_splitId ?? "").trim());
    }
    const county = countyForPrecinct(row.Precinct_Name, source.year);
    const votes = voteTotal(row);
    if (!county) {
      skippedNonGeographicVotes += votes;
      continue;
    }
    const bucket = presidentBucket(row.Candidate_name);
    const countyTotals = counties.get(county);
    countyTotals[bucket] += votes;
    countyTotals.total += votes;
  }

  const actualKalawaoSplitIds = [...kalawaoPrecinctSplitIds].sort();
  if (JSON.stringify(actualKalawaoSplitIds) !== JSON.stringify([KALAWAO_PRECINCT_SPLIT_ID])) {
    throw new Error(
      source.year + " Kalawao precinct split IDs changed: " + JSON.stringify(actualKalawaoSplitIds)
        + " != " + JSON.stringify([KALAWAO_PRECINCT_SPLIT_ID]),
    );
  }
  const expectedCountyNames = Object.keys(source.expectedCountyTotals).sort();
  const actualCountyNames = [...counties.keys()].sort();
  if (JSON.stringify(actualCountyNames) !== JSON.stringify(expectedCountyNames)) {
    throw new Error(
      source.year + " Hawaii expected county pins changed: "
        + JSON.stringify(actualCountyNames) + " != " + JSON.stringify(expectedCountyNames),
    );
  }
  for (const [county, expected] of Object.entries(source.expectedCountyTotals)) {
    assertVoteTuple(source.year + " " + county, counties.get(county), expected);
  }

  const rows = [...counties.entries()].map(([county, votes]) => ({
    state: "HI",
    election_year: source.year,
    jurisdiction_name: county,
    jurisdiction_tag: COUNTY_TAGS.get(county),
    source_id: "hi-historical-presidential-baseline",
    source_level: "county",
    row_method: "historicalPresidentialCsv",
    dem_votes: votes.dem,
    rep_votes: votes.rep,
    other_votes: votes.other,
    total_votes: votes.total,
    source_url: `${source.summaryUrl}; ${source.detailUrl}`,
  }));
  const totals = summarizeRows(rows);
  if (JSON.stringify(totals) !== JSON.stringify(source.expected)) {
    throw new Error(`${source.year} Hawaii county totals did not reconcile: ${JSON.stringify(totals)} != ${JSON.stringify(source.expected)}`);
  }
  const summaryComparable = { rowCount: rows.length, ...summaryTotals };
  if (JSON.stringify(summaryComparable) !== JSON.stringify(source.expected)) {
    throw new Error(`${source.year} Hawaii summary totals did not reconcile: ${JSON.stringify(summaryComparable)} != ${JSON.stringify(source.expected)}`);
  }
  return {
    rows,
    totals,
    skippedNonGeographicVotes,
    kalawaoPrecinct: {
      precinctName: KALAWAO_PRECINCT,
      precinctSplitIds: actualKalawaoSplitIds,
      jurisdictionTag: COUNTY_TAGS.get("Kalawao County"),
      ...source.expectedCountyTotals["Kalawao County"],
    },
    mauiResidual: { ...counties.get("Maui County") },
    countyTotals: Object.fromEntries(
      [...counties.entries()].map(([county, values]) => [county, { ...values }]),
    ),
    districtRanges: HISTORICAL_DISTRICT_RANGES.get(source.year).map((range) => ({
      districts: String(range.min).padStart(2, "0") + "-" + String(range.max).padStart(2, "0"),
      county: range.county,
    })),
  };
}

const outputRows = [];
const summary = {
  authority: "Hawaii Office of Elections",
  parser: "scripts/normalize-hi-historical-presidential-baseline.mjs",
  caveat: "Official Hawaii 2016 and 2020 statewide summary/detail text exports are normalized with the reviewed pre-reapportionment district ranges for each source year: 01-07 Hawaii, 08-13 Maui, 14-16 Kauai, and 17-51 Honolulu. Precinct 13-09 is split from Maui and pinned to Kalawao County FIPS 15005; all five county tuples and statewide totals are asserted before output.",
  sources: [],
};

for (const source of SOURCES) {
  const {
    rows,
    totals,
    skippedNonGeographicVotes,
    kalawaoPrecinct,
    mauiResidual,
    countyTotals,
    districtRanges,
  } = parseSource(source);
  outputRows.push(...rows);
  summary.sources.push({
    year: source.year,
    sourceIds: [source.summaryId, source.detailId],
    urls: [source.summaryUrl, source.detailUrl],
    localFiles: [
      path.relative(repoRoot, source.summaryFile).replace(/\\/g, "/"),
      path.relative(repoRoot, source.detailFile).replace(/\\/g, "/"),
    ],
    ...totals,
    skippedNonGeographicVotes,
    kalawaoPrecinct,
    mauiResidual,
    countyTotals,
    districtRanges,
  });
}

const columns = ["state", "election_year", "jurisdiction_name", "jurisdiction_tag", "source_id", "source_level", "row_method", "dem_votes", "rep_votes", "other_votes", "total_votes", "source_url"];
const csv = [
  columns.join(","),
  ...outputRows
    .sort((a, b) => Number(a.election_year) - Number(b.election_year) || String(a.jurisdiction_name).localeCompare(String(b.jurisdiction_name)))
    .map((row) => columns.map((column) => csvCell(row[column])).join(",")),
].join("\n");
fs.writeFileSync(outputCsvPath, `${csv}\n`, "utf8");
summary.output = {
  localFile: path.relative(repoRoot, outputCsvPath).replace(/\\/g, "/"),
  rowCount: outputRows.length,
  years: [2016, 2020],
};
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary.output));
