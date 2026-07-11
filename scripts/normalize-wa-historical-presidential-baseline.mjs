import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const dataDir = path.join(repoRoot, "data");
const outputCsvPath = path.join(dataDir, "wa-historical-presidential-baseline.csv");
const summaryPath = path.join(dataDir, "wa-historical-presidential-baseline-summary.json");

const SOURCES = [
  {
    year: 2016,
    id: "wa-2016-all-counties-csv",
    url: "https://results.vote.wa.gov/results/20161108/export/20161108_AllCounties.csv",
    localFile: path.join(dataDir, "wa-2016-all-counties.csv"),
    race: "United States President/Vice President",
    demNeedles: ["Hillary Clinton"],
    repNeedles: ["Donald J. Trump"],
    expected: { rowCount: 39, dem: 1742718, rep: 1221747, other: 244749, total: 3209214 },
  },
  {
    year: 2020,
    id: "wa-2020-all-counties-csv",
    url: "https://results.vote.wa.gov/results/20201103/export/20201103_AllCounties.csv",
    localFile: path.join(dataDir, "wa-2020-all-counties.csv"),
    race: "Washington State President/Vice President",
    demNeedles: ["Joseph R. Biden"],
    repNeedles: ["Donald J. Trump"],
    expected: { rowCount: 39, dem: 2369612, rep: 1584651, other: 133368, total: 4087631 },
  },
];

function intText(value) {
  return Number(String(value ?? "").replace(/[^0-9-]/g, "")) || 0;
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
    } else if (char === ',') {
      row.push(cell);
      cell = "";
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== '\r') {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value !== ""));
}

function toRecords(rows) {
  const [header, ...body] = rows;
  return body.map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""])));
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
  const tmpFile = `${source.localFile}.tmp-${process.pid}`;
  fs.writeFileSync(tmpFile, Buffer.from(await response.arrayBuffer()));
  fs.renameSync(tmpFile, source.localFile);
}

function countyDisplayMap() {
  const geojson = JSON.parse(fs.readFileSync(path.join(dataDir, "wa-counties.geojson"), "utf8"));
  const map = new Map();
  for (const feature of geojson.features ?? []) {
    const basename = feature.properties?.BASENAME;
    const name = feature.properties?.NAME;
    if (basename && name) {
      map.set(String(basename).toLowerCase(), String(name));
    }
  }
  if (map.size !== 39) {
    throw new Error(`Expected 39 Washington county geometry rows, got ${map.size}`);
  }
  return map;
}

function candidateBucket(row, source) {
  const candidate = String(row.Candidate ?? "").toLowerCase();
  const party = String(row.Party ?? "").toLowerCase();
  if (source.demNeedles.some((needle) => candidate.includes(needle.toLowerCase())) || party.includes("democratic")) {
    return "dem";
  }
  if (source.repNeedles.some((needle) => candidate.includes(needle.toLowerCase())) || party.includes("republican")) {
    return "rep";
  }
  return "other";
}

function parseHistoricalRows(source, counties) {
  const records = toRecords(parseCsv(fs.readFileSync(source.localFile, "utf8")));
  const grouped = new Map();
  for (const record of records) {
    if (String(record.Race ?? "").trim() !== source.race) {
      continue;
    }
    const county = counties.get(String(record.County ?? "").trim().toLowerCase());
    if (!county) {
      continue;
    }
    const bucket = candidateBucket(record, source);
    const values = grouped.get(county) ?? { dem: 0, rep: 0, other: 0, total: 0 };
    const votes = intText(record.Votes);
    values[bucket] += votes;
    values.total += votes;
    grouped.set(county, values);
  }
  const missing = [...counties.values()].filter((county) => !grouped.has(county));
  if (missing.length) {
    throw new Error(`Missing ${source.year} Washington county rows: ${missing.join(", ")}`);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([county, values]) => ({
    state: "WA",
    election_year: source.year,
    jurisdiction_name: county,
    source_id: "wa-historical-presidential-baseline",
    source_level: "county",
    row_method: "historicalPresidentialCsv",
    dem_votes: values.dem,
    rep_votes: values.rep,
    other_votes: values.other,
    total_votes: values.total,
    source_url: source.url,
  }));
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
    throw new Error(`${source.year} Washington totals did not reconcile: ${JSON.stringify({ totals, expected: source.expected })}`);
  }
  return totals;
}

const counties = countyDisplayMap();
const allRows = [];
const summary = {
  generatedAt: new Date().toISOString(),
  authority: "Washington Secretary of State",
  parser: "scripts/normalize-wa-historical-presidential-baseline.mjs",
  caveat: "Official county-level 2016 and 2020 Washington presidential baselines from Secretary of State all-counties CSV exports. 2012 remains uncollected.",
  sources: [],
};

for (const source of SOURCES) {
  await downloadSource(source);
  const rows = parseHistoricalRows(source, counties);
  const totals = assertSummary(source, rows);
  allRows.push(...rows);
  summary.sources.push({
    id: source.id,
    year: source.year,
    url: source.url,
    localFile: path.relative(repoRoot, source.localFile).replace(/\\/g, "/"),
    rowCount: totals.rowCount,
    demVotes: totals.dem,
    repVotes: totals.rep,
    otherVotes: totals.other,
    totalVotes: totals.total,
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
