import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const repoRoot = process.cwd();
const dataDir = path.join(repoRoot, "data");
const geometryPath = path.join(dataDir, "tn-counties.geojson");
const outputCsvPath = path.join(dataDir, "tn-historical-presidential-baseline.csv");
const summaryPath = path.join(dataDir, "tn-historical-presidential-baseline-summary.json");

const SOURCES = [
  {
    year: 2016,
    id: "tn-2016-president-by-county-pdf",
    url: "https://sos-tn-gov-files.s3.amazonaws.com/PresidentbyCountyNov2016.pdf",
    localFile: path.join(dataDir, "tn-2016-president-by-county.pdf"),
    expected: { rowCount: 95, dem: 870695, rep: 1522925, other: 114407, total: 2508027 },
  },
  {
    year: 2020,
    id: "tn-2020-general-by-county-pdf",
    url: "https://sos-tn-gov-files.tnsosfiles.com/Nov%202020%20General%20by%20County.pdf",
    localFile: path.join(dataDir, "tn-2020-general-by-county.pdf"),
    expected: { rowCount: 95, dem: 1143711, rep: 1852475, other: 57665, total: 3053851 },
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
  fs.writeFileSync(source.localFile, bytes);
}

async function extractPdfText(filePath) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function countyDisplayMap() {
  const geojson = JSON.parse(fs.readFileSync(geometryPath, "utf8"));
  const map = new Map();
  for (const feature of geojson.features ?? []) {
    const basename = feature.properties?.BASENAME;
    const name = feature.properties?.NAME;
    if (basename && name) {
      map.set(String(basename).toLowerCase(), String(name));
    }
  }
  if (map.size !== 95) {
    throw new Error(`Expected 95 Tennessee county geometry rows, got ${map.size}`);
  }
  return map;
}

function numericTokens(text) {
  return (text.match(/[0-9][0-9,]*/g) ?? []).map(intText);
}

function parseCountyLine(rawLine, counties) {
  if (!rawLine.includes("\t")) {
    return null;
  }
  const parts = rawLine.trim().split(/\t+/);
  const label = parts.at(-1)?.trim();
  if (!label || label === "STATE TOTALS") {
    return null;
  }
  const displayName = counties.get(label.toLowerCase());
  if (!displayName) {
    return null;
  }
  return { county: displayName, values: numericTokens(rawLine) };
}

function ensureCountyBucket(buckets, county) {
  if (!buckets.has(county)) {
    buckets.set(county, { primary: null, additional: null });
  }
  return buckets.get(county);
}

function parseHistoricalRows(text, source, counties) {
  const buckets = new Map();
  let contest = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line === "United States President") {
      contest = "president";
      continue;
    }
    if (/^(United States Senate|United States House|Tennessee Senate|Tennessee House)\b/.test(line)) {
      contest = null;
      continue;
    }
    if (contest !== "president") {
      continue;
    }

    const parsed = parseCountyLine(rawLine, counties);
    if (!parsed) {
      continue;
    }
    const bucket = ensureCountyBucket(buckets, parsed.county);
    if (parsed.values.length === 10 && bucket.primary === null) {
      bucket.primary = parsed.values;
    } else if (source.year === 2016 && parsed.values.length === 5 && bucket.additional === null) {
      bucket.additional = parsed.values;
    } else if (source.year === 2020 && parsed.values.length === 4 && bucket.additional === null) {
      bucket.additional = parsed.values;
    }
  }

  const missing = [];
  const rows = [];
  for (const county of [...counties.values()].sort((a, b) => a.localeCompare(b))) {
    const bucket = buckets.get(county);
    if (!bucket?.primary || !bucket?.additional) {
      missing.push(county);
      continue;
    }
    const primaryOther = bucket.primary.slice(2).reduce((sum, value) => sum + value, 0);
    const additionalOther = bucket.additional.reduce((sum, value) => sum + value, 0);
    const dem = bucket.primary[1];
    const rep = bucket.primary[0];
    const other = primaryOther + additionalOther;
    rows.push({
      state: "TN",
      election_year: source.year,
      jurisdiction_name: county,
      source_id: "tn-historical-presidential-baseline",
      source_level: "county",
      row_method: "historicalPresidentialCsv",
      dem_votes: dem,
      rep_votes: rep,
      other_votes: other,
      total_votes: dem + rep + other,
      source_url: source.url,
    });
  }

  if (missing.length) {
    throw new Error(`Missing ${source.year} Tennessee county rows: ${missing.join(", ")}`);
  }
  return rows;
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
    throw new Error(
      `${source.year} Tennessee historical totals did not reconcile: ${JSON.stringify({ totals, expected: source.expected })}`,
    );
  }
  return totals;
}

const counties = countyDisplayMap();
const allRows = [];
const summary = {
  generatedAt: new Date().toISOString(),
  authority: "Tennessee Secretary of State",
  parser: "scripts/normalize-tn-historical-presidential-baseline.mjs",
  caveat: "Official county-level 2016 and 2020 Tennessee presidential baselines. 2012 remains uncollected.",
  sources: [],
};

for (const source of SOURCES) {
  await downloadSource(source);
  const text = await extractPdfText(source.localFile);
  const rows = parseHistoricalRows(text, source, counties);
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
