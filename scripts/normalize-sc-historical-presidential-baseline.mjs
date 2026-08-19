import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const dataDir = path.join(repoRoot, "data");
const outputCsvPath = path.join(dataDir, "sc-historical-presidential-baseline.csv");
const summaryPath = path.join(dataDir, "sc-historical-presidential-baseline-summary.json");

const SOURCES = [
  {
    year: 2012,
    id: "sc-2012-election-history-president",
    contestId: "9112",
    url: "https://sc.elstats.civera.com/api/download_contest/9112_table.csv?split_party=false",
    localFile: path.join(dataDir, "sc-2012-president-9112.csv"),
    expected: { rowCount: 46, dem: 865941, rep: 1071645, other: 26532, total: 1964118 },
    byteCount: 116772,
    sha256: "26d5c6aa23b1f6c259f2178c20114c82027acbb586d487047d99483dff89a33c",
  },
  {
    year: 2016,
    id: "sc-2016-election-history-president",
    contestId: "5292",
    url: "https://sc.elstats.civera.com/api/download_contest/5292_table.csv?split_party=false",
    localFile: path.join(dataDir, "sc-2016-president-5292.csv"),
    expected: { rowCount: 46, dem: 855373, rep: 1155389, other: 92265, total: 2103027 },
    byteCount: 132795,
    sha256: "cb2e118c354f87becf12883aafd40a7de83a1026be82516d13c6247b0122e42f",
  },
  {
    year: 2020,
    id: "sc-2020-election-history-president",
    contestId: "1974",
    url: "https://sc.elstats.civera.com/api/download_contest/1974_table.csv?split_party=false",
    localFile: path.join(dataDir, "sc-2020-president-1974.csv"),
    expected: { rowCount: 46, dem: 1091541, rep: 1385103, other: 36685, total: 2513329 },
    byteCount: 119261,
    sha256: "c57495268aa7c38e8e880caa1aca799eb2ace174c0a3770b4b1f471962453ba7",
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function intText(value, context) {
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
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
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
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (quoted) {
    throw new Error("Unterminated quoted field in South Carolina source CSV");
  }
  return rows.filter((item) => item.some((value) => value !== ""));
}

function writeCsv(filePath, headers, rows) {
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function downloadSource(source) {
  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(`Failed to download ${source.url}: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = { byteCount: bytes.length, sha256: sha256(bytes) };
  const expected = { byteCount: source.byteCount, sha256: source.sha256 };
  if (actual.byteCount !== expected.byteCount || actual.sha256 !== expected.sha256) {
    throw new Error(`South Carolina ${source.year} source drifted: ${JSON.stringify({ expected, actual })}`);
  }
  const tmpFile = `${source.localFile}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(source.localFile), { recursive: true });
  fs.writeFileSync(tmpFile, bytes);
  fs.renameSync(tmpFile, source.localFile);
  return actual;
}

function readSourceArtifact(source) {
  if (!fs.existsSync(source.localFile)) {
    throw new Error(`Missing retained South Carolina ${source.year} source: ${source.localFile}`);
  }
  const bytes = fs.readFileSync(source.localFile);
  const actual = { byteCount: bytes.length, sha256: sha256(bytes) };
  const expected = { byteCount: source.byteCount, sha256: source.sha256 };
  if (actual.byteCount !== expected.byteCount || actual.sha256 !== expected.sha256) {
    throw new Error(`Retained South Carolina ${source.year} source drifted: ${JSON.stringify({ expected, actual })}`);
  }
  return actual;
}

function countyDisplayMap() {
  const geojson = JSON.parse(fs.readFileSync(path.join(dataDir, "sc-counties.geojson"), "utf8"));
  const map = new Map();
  for (const feature of geojson.features ?? []) {
    const basename = feature.properties?.BASENAME;
    const name = feature.properties?.NAME;
    if (basename && name) {
      map.set(String(basename).trim().toLowerCase(), String(name));
    }
  }
  if (map.size !== 46) {
    throw new Error(`Expected 46 South Carolina county geometry rows, got ${map.size}`);
  }
  return map;
}

function parseHistoricalRows(source, counties) {
  const rows = parseCsv(fs.readFileSync(source.localFile, "utf8"));
  const [candidateHeader, partyHeader, ...body] = rows;
  const candidateColumns = candidateHeader.slice(2).map((candidate, offset) => ({
    index: offset + 2,
    candidate: String(candidate ?? "").trim(),
    party: String(partyHeader[offset + 2] ?? "").trim().toLowerCase(),
  }));
  const voteColumns = candidateColumns.filter((column) => !["total votes cast", "overvotes/undervotes", "total ballots cast"].includes(column.candidate.toLowerCase()));
  const totalVotesColumn = candidateColumns.find((column) => column.candidate.toLowerCase() === "total votes cast");
  if (!totalVotesColumn) {
    throw new Error(`Missing Total Votes Cast column in ${source.localFile}`);
  }

  const output = [];
  for (const row of body) {
    if (row[0] !== "County") {
      continue;
    }
    const rawCounty = String(row[1] ?? "").trim();
    const county = counties.get(rawCounty.toLowerCase());
    if (!county) {
      throw new Error(`Unknown ${source.year} South Carolina county: ${rawCounty}`);
    }
    let dem = 0;
    let rep = 0;
    let other = 0;
    for (const column of voteColumns) {
      const votes = intText(row[column.index], `${source.year} ${rawCounty} ${column.candidate}`);
      if (column.party === "democratic") {
        dem += votes;
      } else if (column.party === "republican") {
        rep += votes;
      } else {
        other += votes;
      }
    }
    const total = intText(row[totalVotesColumn.index], `${source.year} ${rawCounty} Total Votes Cast`);
    if (dem + rep + other !== total) {
      throw new Error(`${source.year} ${rawCounty} candidate votes do not reconcile: ${dem + rep + other} != ${total}`);
    }
    output.push({
      state: "SC",
      election_year: source.year,
      jurisdiction_name: county,
      source_id: "sc-historical-presidential-baseline",
      source_level: "county",
      row_method: "historicalPresidentialCsv",
      dem_votes: dem,
      rep_votes: rep,
      other_votes: other,
      total_votes: total,
      source_url: source.url,
    });
  }

  const matched = new Set(output.map((row) => row.jurisdiction_name));
  const missing = [...counties.values()].filter((county) => !matched.has(county));
  if (missing.length) {
    throw new Error(`Missing ${source.year} South Carolina county rows: ${missing.join(", ")}`);
  }
  return output.sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));
}

function assertSummary(source, rows) {
  const totals = rows.reduce(
    (acc, row) => ({
      rowCount: acc.rowCount + 1,
      dem: acc.dem + row.dem_votes,
      rep: acc.rep + row.rep_votes,
      other: acc.other + row.other_votes,
      total: acc.total + row.total_votes,
    }),
    { rowCount: 0, dem: 0, rep: 0, other: 0, total: 0 },
  );
  const mismatches = Object.entries(source.expected).filter(([key, expected]) => totals[key] !== expected);
  if (mismatches.length) {
    throw new Error(`${source.year} South Carolina totals did not reconcile: ${JSON.stringify({ totals, expected: source.expected })}`);
  }
  return totals;
}

const counties = countyDisplayMap();
const allRows = [];
const summary = {
  generatedAt: "2026-08-19T00:00:00.000Z",
  authority: "South Carolina Election Commission",
  parser: "scripts/normalize-sc-historical-presidential-baseline.mjs",
  caveat: "Official South Carolina Elections Database 2012, 2016, and 2020 presidential contest CSVs normalized to county baselines. County rows are historical context and not 2024 certified-result rows.",
  sources: [],
};

for (const source of SOURCES) {
  const artifact = process.argv.includes("--download")
    ? await downloadSource(source)
    : readSourceArtifact(source);
  const rows = parseHistoricalRows(source, counties);
  const totals = assertSummary(source, rows);
  allRows.push(...rows);
  summary.sources.push({
    id: source.id,
    year: source.year,
    contestId: source.contestId,
    url: source.url,
    localFile: path.relative(repoRoot, source.localFile).replace(/\\/g, "/"),
    rowCount: totals.rowCount,
    demVotes: totals.dem,
    repVotes: totals.rep,
    otherVotes: totals.other,
    totalVotes: totals.total,
    byteCount: artifact.byteCount,
    sha256: artifact.sha256,
  });
}

writeCsv(
  outputCsvPath,
  [
    "state",
    "election_year",
    "jurisdiction_name",
    "source_id",
    "source_level",
    "row_method",
    "dem_votes",
    "rep_votes",
    "other_votes",
    "total_votes",
    "source_url",
  ],
  allRows.sort((a, b) => a.election_year - b.election_year || a.jurisdiction_name.localeCompare(b.jurisdiction_name)),
);

summary.output = {
  localFile: path.relative(repoRoot, outputCsvPath).replace(/\\/g, "/"),
  rowCount: allRows.length,
  years: SOURCES.map((source) => source.year),
};
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary.output));
