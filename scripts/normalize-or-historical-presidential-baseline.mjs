import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const repoRoot = process.cwd();
const dataDir = path.join(repoRoot, "data");
const outputCsvPath = path.join(dataDir, "or-historical-presidential-baseline.csv");
const summaryPath = path.join(dataDir, "or-historical-presidential-baseline-summary.json");

const COUNTIES = [
  "Baker",
  "Benton",
  "Clackamas",
  "Clatsop",
  "Columbia",
  "Coos",
  "Crook",
  "Curry",
  "Deschutes",
  "Douglas",
  "Gilliam",
  "Grant",
  "Harney",
  "Hood River",
  "Jackson",
  "Jefferson",
  "Josephine",
  "Klamath",
  "Lake",
  "Lane",
  "Lincoln",
  "Linn",
  "Malheur",
  "Marion",
  "Morrow",
  "Multnomah",
  "Polk",
  "Sherman",
  "Tillamook",
  "Umatilla",
  "Union",
  "Wallowa",
  "Wasco",
  "Washington",
  "Wheeler",
  "Yamhill",
];

const SOURCES = [
  {
    year: 2016,
    id: "or-2016-general-official-results",
    url: "https://records.sos.state.or.us/ORSOSWebDrawer/Record/6873777/File/document",
    localFile: path.join(dataDir, "or-2016-general-official-results.pdf"),
    columns: {
      rep: 0,
      dem: 1,
      other: [2, 3, 4],
    },
    expected: { rowCount: 36, dem: 1002106, rep: 782403, other: 216827, total: 2001336 },
  },
  {
    year: 2020,
    id: "or-2020-general-official-results",
    url: "https://digitalcollections.library.oregon.gov/nodes/view/208504",
    localFile: path.join(dataDir, "or-2020-general-official-results.pdf"),
    columns: {
      rep: 0,
      dem: 1,
      other: [2, 3, 4, 5],
    },
    expected: { rowCount: 36, dem: 1340383, rep: 958448, other: 75490, total: 2374321 },
  },
];

function intText(value) {
  return Number(String(value ?? "").replace(/,/g, "").trim() || "0");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, headers, rows) {
  fs.writeFileSync(
    filePath,
    `${[
      headers.join(","),
      ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
    ].join("\n")}\n`,
    "utf8",
  );
}

async function extractPdfText(filePath) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const result = await parser.getText();
    return result.text.replace(/\r\n/g, "\n");
  } finally {
    await parser.destroy();
  }
}

function contestBlock(text, source) {
  const start = text.indexOf("\nUS President\n");
  if (start < 0) {
    throw new Error(`Could not find US President block in ${source.localFile}`);
  }
  const end = text.indexOf("\n--", start);
  if (end < 0) {
    throw new Error(`Could not find end of US President block in ${source.localFile}`);
  }
  return text.slice(start, end);
}

function parseCountyRows(block, source) {
  const rows = [];
  for (const county of COUNTIES) {
    const pattern = new RegExp(`^${county.replace(/ /g, "\\s+")}\\s+([\\d,\\s]+)$`, "m");
    const match = block.match(pattern);
    if (!match) {
      throw new Error(`${source.year} Oregon missing county row: ${county}`);
    }
    const values = match[1].trim().split(/\s+/).map(intText);
    const other = source.columns.other.reduce((sum, index) => sum + values[index], 0);
    rows.push({
      state: "OR",
      election_year: source.year,
      jurisdiction_name: `${county} County`,
      source_id: "or-historical-presidential-baseline",
      source_level: "county",
      row_method: "historicalPresidentialCsv",
      dem_votes: values[source.columns.dem],
      rep_votes: values[source.columns.rep],
      other_votes: other,
      total_votes: values[source.columns.dem] + values[source.columns.rep] + other,
      source_url: source.url,
    });
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
    throw new Error(`${source.year} Oregon totals did not reconcile: ${JSON.stringify({ totals, expected: source.expected })}`);
  }
  return totals;
}

const allRows = [];
const summary = {
  generatedAt: new Date().toISOString(),
  authority: "Oregon Secretary of State",
  parser: "scripts/normalize-or-historical-presidential-baseline.mjs",
  caveat: "Official Oregon 2016 and 2020 General Election Abstract of Votes PDFs normalized to county baselines. 2012 remains uncollected.",
  sources: [],
};

for (const source of SOURCES) {
  if (!fs.existsSync(source.localFile)) {
    throw new Error(`Missing source PDF: ${source.localFile}`);
  }
  const rows = parseCountyRows(contestBlock(await extractPdfText(source.localFile), source), source);
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
