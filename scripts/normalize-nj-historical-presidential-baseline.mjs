import fs from "fs";
import Module from "module";
import path from "path";
import { createRequire } from "module";

Module._initPaths();
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const repoRoot = process.cwd();
const dataDir = path.join(repoRoot, "data");
const outputCsvPath = path.join(dataDir, "nj-historical-presidential-baseline.csv");
const summaryPath = path.join(dataDir, "nj-historical-presidential-baseline-summary.json");

const COUNTIES = [
  "ATLANTIC",
  "BERGEN",
  "BURLINGTON",
  "CAMDEN",
  "CAPE MAY",
  "CUMBERLAND",
  "ESSEX",
  "GLOUCESTER",
  "HUDSON",
  "HUNTERDON",
  "MERCER",
  "MIDDLESEX",
  "MONMOUTH",
  "MORRIS",
  "OCEAN",
  "PASSAIC",
  "SALEM",
  "SOMERSET",
  "SUSSEX",
  "UNION",
  "WARREN",
];

const COUNTY_SLUGS = new Map([
  ["ATLANTIC", "atlantic"],
  ["BERGEN", "bergen"],
  ["BURLINGTON", "burlington"],
  ["CAMDEN", "camden"],
  ["CAPE MAY", "cape-may"],
  ["CUMBERLAND", "cumberland"],
  ["ESSEX", "essex"],
  ["GLOUCESTER", "gloucester"],
  ["HUDSON", "hudson"],
  ["HUNTERDON", "hunterdon"],
  ["MERCER", "mercer"],
  ["MIDDLESEX", "middlesex"],
  ["MONMOUTH", "monmouth"],
  ["MORRIS", "morris"],
  ["OCEAN", "ocean"],
  ["PASSAIC", "passaic"],
  ["SALEM", "salem"],
  ["SOMERSET", "somerset"],
  ["SUSSEX", "sussex"],
  ["UNION", "union"],
  ["WARREN", "warren"],
]);

const COUNTY_DISPLAY = new Map(COUNTIES.map((county) => [county, `${titleCase(county)} County`]));
const COUNTY_PATTERN = new RegExp(`^(${COUNTIES.map(escapeRegex).sort((a, b) => b.length - a.length).join("|")})(?:\\s+.+?)?\\s+([\\d,]+)$`);

const SOURCES = [
  {
    year: 2016,
    id: "nj-2016-county-president-pdfs",
    url: "https://www.nj.gov/state/elections/election-information-2016.shtml",
    localDir: path.join(dataDir, "nj-2016-county-president-pdfs"),
    expected: { rowCount: 21, dem: 2148278, rep: 1601933, other: 123835, total: 3874046 },
  },
  {
    year: 2020,
    id: "nj-2020-official-general-results-president",
    url: "https://www.nj.gov/state/elections/assets/pdf/election-results/2020/2020-official-general-results-president.pdf",
    localFile: path.join(dataDir, "nj-2020-official-general-results-president.pdf"),
    expected: { rowCount: 21, dem: 2608400, rep: 1883313, other: 57744, total: 4549457 },
  },
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(value) {
  return value
    .toLowerCase()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function intText(value) {
  return Number(String(value ?? "").replace(/[^0-9-]/g, "")) || 0;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, headers, rows) {
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function extractText(pdfPath) {
  const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function historicalRow(source, county, dem, rep, other, sourceUrl) {
  return {
    state: "NJ",
    election_year: source.year,
    jurisdiction_name: COUNTY_DISPLAY.get(county),
    source_id: "nj-historical-presidential-baseline",
    source_level: "county",
    row_method: "historicalPresidentialCsv",
    dem_votes: dem,
    rep_votes: rep,
    other_votes: other,
    total_votes: dem + rep + other,
    source_url: sourceUrl,
  };
}

async function parse2016CountyPdfs(source) {
  if (!fs.existsSync(source.localDir)) {
    throw new Error(`Missing New Jersey 2016 county PDF directory: ${source.localDir}`);
  }
  const rows = [];
  for (const county of COUNTIES) {
    const slug = COUNTY_SLUGS.get(county);
    const filePath = path.join(source.localDir, `${slug}.pdf`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing New Jersey 2016 county PDF: ${filePath}`);
    }
    const line = (await extractText(filePath))
      .split(/\r?\n/)
      .map((value) => value.replace(/\s+/g, " ").trim())
      .find((value) => value.startsWith("COUNTY TOTAL "));
    if (!line) {
      throw new Error(`Missing COUNTY TOTAL line in ${filePath}`);
    }
    const values = [...line.matchAll(/[\d,]+/g)].map((match) => intText(match[0]));
    const dem = values[0];
    const rep = values[1];
    const other = values.slice(2).reduce((sum, votes) => sum + votes, 0);
    rows.push(historicalRow(source, county, dem, rep, other, `https://www.nj.gov/state/elections/assets/pdf/election-results/2016/2016-gen-elect-presidential-results-${slug}.pdf`));
  }
  return rows;
}

function candidateBucket(line) {
  if (/^JOSEPH R\. BIDEN\b/.test(line)) {
    return "dem";
  }
  if (/^DONALD J\. TRUMP\b/.test(line)) {
    return "rep";
  }
  if (/^(JO JORGENSEN|HOWIE GRESHAM HAWKINS|BILL HAMMONS|DON BLANKENSHIP|GLORIA ESTELA LA RIVA|ROQUE |JADE |BROCK |KANYE |BRIAN |MARK |PRINCESS )/.test(line)) {
    return "other";
  }
  return null;
}

async function parse2020StatewidePdf(source) {
  if (!fs.existsSync(source.localFile)) {
    throw new Error(`Missing New Jersey 2020 President PDF: ${source.localFile}`);
  }
  const rowsByCounty = new Map(COUNTIES.map((county) => [county, { dem: 0, rep: 0, other: 0 }]));
  let bucket = null;
  for (const rawLine of (await extractText(source.localFile)).split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const nextBucket = candidateBucket(line);
    if (nextBucket) {
      bucket = nextBucket;
      continue;
    }
    const match = line.match(COUNTY_PATTERN);
    if (!match || !bucket) {
      continue;
    }
    rowsByCounty.get(match[1])[bucket] += intText(match[2]);
  }
  return COUNTIES.map((county) => {
    const row = rowsByCounty.get(county);
    return historicalRow(source, county, row.dem, row.rep, row.other, source.url);
  });
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
    throw new Error(`${source.year} New Jersey totals did not reconcile: ${JSON.stringify({ totals, expected: source.expected })}`);
  }
  return totals;
}

const allRows = [];
const summary = {
  generatedAt: new Date().toISOString(),
  authority: "New Jersey Department of State, Division of Elections",
  parser: "scripts/normalize-nj-historical-presidential-baseline.mjs",
  caveat: "Official New Jersey 2016 county President PDFs and 2020 statewide President PDF normalized to county baselines. 2012 remains uncollected.",
  sources: [],
};

for (const source of SOURCES) {
  const rows = source.year === 2016 ? await parse2016CountyPdfs(source) : await parse2020StatewidePdf(source);
  const totals = assertSummary(source, rows);
  allRows.push(...rows);
  summary.sources.push({
    id: source.id,
    year: source.year,
    url: source.url,
    localFile: source.localFile ? path.relative(repoRoot, source.localFile).replace(/\\/g, "/") : path.relative(repoRoot, source.localDir).replace(/\\/g, "/"),
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
