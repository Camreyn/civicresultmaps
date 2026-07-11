import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const dataDir = path.join(repoRoot, "data");
const outputCsvPath = path.join(dataDir, "hi-historical-presidential-baseline.csv");
const summaryPath = path.join(dataDir, "hi-historical-presidential-baseline-summary.json");

const COUNTY_TAGS = new Map([
  ["Hawaii County", "county:15001"],
  ["Honolulu County", "county:15003"],
  ["Kauai County", "county:15007"],
  ["Maui County", "county:15009"],
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
    expected: { rowCount: 4, dem: 266891, rep: 128847, other: 33199, total: 428937 },
  },
  {
    year: 2020,
    summaryId: "hi-2020-general-summary",
    detailId: "hi-2020-general-precinct-detail",
    summaryUrl: "https://files.hawaii.gov/elections/files/results/2020/general/summary.txt",
    detailUrl: "https://files.hawaii.gov/elections/files/results/2020/general/media.txt",
    summaryFile: path.join(dataDir, "hi-2020-general-summary.txt"),
    detailFile: path.join(dataDir, "hi-2020-general-precinct-detail.txt"),
    expected: { rowCount: 4, dem: 366130, rep: 196864, other: 11475, total: 574469 },
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

function countyForPrecinct(precinctName) {
  if (!/^\d{2}-\d{2}$/.test(String(precinctName ?? ""))) return null;
  const district = Number(String(precinctName).split("-", 1)[0]);
  if (district >= 1 && district <= 8) return "Hawaii County";
  if (district >= 9 && district <= 14) return "Maui County";
  if (district >= 15 && district <= 17) return "Kauai County";
  if (district >= 18 && district <= 51) return "Honolulu County";
  return null;
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
  let skippedNonGeographicVotes = 0;
  for (const row of readHawaiiRows(source.detailFile)) {
    if (String(row.Contest_id ?? "") !== "1") continue;
    const county = countyForPrecinct(row.Precinct_Name);
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
  return { rows, totals, skippedNonGeographicVotes };
}

const outputRows = [];
const summary = {
  authority: "Hawaii Office of Elections",
  parser: "scripts/normalize-hi-historical-presidential-baseline.mjs",
  caveat: "Official Hawaii 2016 and 2020 statewide summary/detail text exports are normalized to four county result rows. Kalawao County is not reported as a separate official result county in these exports and is not forced into a zero or allocated county row.",
  sources: [],
};

for (const source of SOURCES) {
  const { rows, totals, skippedNonGeographicVotes } = parseSource(source);
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
