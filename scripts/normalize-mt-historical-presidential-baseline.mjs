import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const repoRoot = process.cwd();
const dataDir = path.join(repoRoot, "data");
const outputCsvPath = path.join(dataDir, "mt-historical-presidential-baseline.csv");
const summaryPath = path.join(dataDir, "mt-historical-presidential-baseline-summary.json");

const SOURCES = [
  {
    year: 2016,
    id: "mt-2016-general-results-by-precinct",
    url: "https://sosmt.gov/Portals/142/Elections/archives/2010s/2016/2016-General-Results-by-Precinct.xlsx",
    localFile: path.join(dataDir, "mt-2016-general-results-by-precinct.xlsx"),
    race: "PRESIDENT AND VICE PRESIDENT",
    expected: { rowCount: 56, dem: 177709, rep: 279240, other: 37577, total: 494526 },
  },
  {
    year: 2020,
    id: "mt-2020-general-precinct-by-precinct",
    url: "https://sosmt.gov/wp-content/uploads/2020_General_Precinct-by-Precinct.xlsx",
    localFile: path.join(dataDir, "mt-2020-general-precinct-by-precinct.xlsx"),
    race: "PRESIDENT",
    expected: { rowCount: 56, dem: 244786, rep: 343602, other: 15252, total: 603640 },
  },
];

const CONTEXT_SOURCES = [
  {
    year: 2016,
    id: "mt-2016-general-statewide-canvass",
    url: "https://sosmt.gov/wp-content/uploads/attachments/2016GeneralStatewideCanvass.pdf",
    localFile: path.join(dataDir, "mt-2016-general-statewide-canvass.pdf"),
  },
  {
    year: 2016,
    id: "mt-2016-general-state-canvass-write-in",
    url: "https://sosmt.gov/wp-content/uploads/attachments/2016GeneralStateCanvassWriteIn.pdf",
    localFile: path.join(dataDir, "mt-2016-general-state-canvass-write-in.pdf"),
    statewideWriteInVotes: 2621,
  },
  {
    year: 2020,
    id: "mt-2020-state-canvass-report",
    url: "https://sosmt.gov/wp-content/uploads/State_Canvass_Report.pdf",
    localFile: path.join(dataDir, "mt-2020-state-canvass-report.pdf"),
  },
  {
    year: 2020,
    id: "mt-2020-state-canvass-write-in-by-county",
    url: "https://sosmt.gov/wp-content/uploads/State_Canvass_Writein_by_County.pdf",
    localFile: path.join(dataDir, "mt-2020-state-canvass-write-in-by-county.pdf"),
    statewideWriteInVotes: 34,
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
  const tmpFile = `${source.localFile}.tmp-${process.pid}`;
  fs.writeFileSync(tmpFile, Buffer.from(await response.arrayBuffer()));
  fs.renameSync(tmpFile, source.localFile);
}

function countyDisplayMap() {
  const geojson = JSON.parse(fs.readFileSync(path.join(dataDir, "mt-counties.geojson"), "utf8"));
  const map = new Map();
  for (const feature of geojson.features ?? []) {
    const basename = feature.properties?.BASENAME;
    const name = feature.properties?.NAME;
    if (basename && name) {
      map.set(String(basename).toLowerCase(), String(name));
    }
  }
  if (map.size !== 56) {
    throw new Error(`Expected 56 Montana county geometry rows, got ${map.size}`);
  }
  return map;
}

function columnIndex(row) {
  return Object.fromEntries(row.map((name, index) => [String(name ?? "").trim(), index]));
}

function countyKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s*&\s*/g, " and ");
}

function parseHistoricalRows(source, counties) {
  const workbook = XLSX.readFile(source.localFile);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerIndex = rows.findIndex((row) => row.includes("CountyName") && row.includes("RaceName"));
  if (headerIndex < 0) {
    throw new Error(`Missing CountyName/RaceName header in ${source.localFile}`);
  }
  const columns = columnIndex(rows[headerIndex]);
  const missing = ["CountyName", "RaceName", "PartyCode", "Votes"].filter((name) => columns[name] === undefined);
  if (missing.length) {
    throw new Error(`Missing columns in ${source.localFile}: ${missing.join(", ")}`);
  }

  const grouped = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    if (String(row[columns.RaceName] ?? "").trim() !== source.race) {
      continue;
    }
    const rawCounty = String(row[columns.CountyName] ?? "").trim();
    const county = counties.get(countyKey(rawCounty));
    if (!county) {
      continue;
    }
    const party = String(row[columns.PartyCode] ?? "").trim().toUpperCase();
    const values = grouped.get(county) ?? { dem: 0, rep: 0, other: 0, total: 0 };
    const votes = intText(row[columns.Votes]);
    if (party === "DEM") {
      values.dem += votes;
    } else if (party === "REP") {
      values.rep += votes;
    } else {
      values.other += votes;
    }
    values.total += votes;
    grouped.set(county, values);
  }

  const missingCounties = [...counties.values()].filter((county) => !grouped.has(county));
  if (missingCounties.length) {
    throw new Error(`Missing ${source.year} Montana county rows: ${missingCounties.join(", ")}`);
  }

  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([county, values]) => ({
    state: "MT",
    election_year: source.year,
    jurisdiction_name: county,
    source_id: "mt-historical-presidential-baseline",
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
    throw new Error(`${source.year} Montana totals did not reconcile: ${JSON.stringify({ totals, expected: source.expected })}`);
  }
  return totals;
}

const counties = countyDisplayMap();
const allRows = [];
const summary = {
  generatedAt: new Date().toISOString(),
  authority: "Montana Secretary of State",
  parser: "scripts/normalize-mt-historical-presidential-baseline.mjs",
  caveat:
    "Official Montana 2016 and 2020 precinct workbooks are normalized to county presidential baselines. The election-results export and precinct workbooks do not allocate separate write-in canvass votes into county rows, so Dem/Rep winners join by FIPS while other_votes and total_votes exclude write-in canvass totals.",
  sources: [],
  contextSources: [],
};

for (const source of [...SOURCES, ...CONTEXT_SOURCES]) {
  await downloadSource(source);
}

for (const source of SOURCES) {
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

for (const source of CONTEXT_SOURCES) {
  summary.contextSources.push({
    id: source.id,
    year: source.year,
    url: source.url,
    localFile: path.relative(repoRoot, source.localFile).replace(/\\/g, "/"),
    statewideWriteInVotes: source.statewideWriteInVotes ?? null,
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
