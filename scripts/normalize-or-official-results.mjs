import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const inputPdf = "data/or-2024-general-official-results.pdf";
const presidentOut = "data/or-2024-general-president.csv";
const attorneyGeneralOut = "data/or-2024-general-attorney-general.csv";
const historicalOut = "data/or-historical-presidential-baseline.csv";

const historicalSources = [
  {
    year: 2020,
    recordId: "13735450",
    title: "2020 November General Election Official Results(2).PDF",
    localPdf: "data/or-2020-general-official-results.pdf",
    sourceId: "or-2020-general-president-county",
    sourceUrl: "https://records.sos.state.or.us/ORSOSWebDrawer/Recordhtml/13735450",
    expected: {
      rows: 36,
      demVotes: 1340383,
      repVotes: 958448,
      otherVotes: 75490,
      totalVotes: 2374321,
    },
    columns: {
      dem: 1,
      rep: 0,
      other: [2, 3, 4, 5],
    },
  },
];

const counties = [
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

function intText(value) {
  return Number(String(value ?? "").replace(/,/g, "").trim() || "0");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, header, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    [
      header.join(","),
      ...rows.map((row) => header.map((column) => csvEscape(row[column])).join(",")),
    ].join("\n") + "\n",
  );
}

function contestBlock(text, contestName) {
  const start = text.indexOf(`\n${contestName}\n`);
  if (start < 0) throw new Error(`Could not find contest block: ${contestName}`);
  const nextPage = text.indexOf("\n--", start);
  if (nextPage < 0) throw new Error(`Could not find page break after contest block: ${contestName}`);
  return text.slice(start, nextPage);
}

function parseCountyRows(block, contestName, expectedColumnCount) {
  const rows = new Map();
  for (const county of counties) {
    const match = block.match(new RegExp(`^${county.replace(/ /g, "\\s+")}\\s+([\\d,\\s]+)$`, "m"));
    if (!match) throw new Error(`${contestName} missing county row: ${county}`);
    const values = match[1].trim().split(/\s+/).map(intText);
    if (values.length !== expectedColumnCount) {
      throw new Error(`${contestName} ${county} row has ${values.length} columns, expected ${expectedColumnCount}`);
    }
    rows.set(county, values);
  }
  const totalMatch = block.match(/^Total\s+([\d,\s]+)$/m);
  if (!totalMatch) throw new Error(`${contestName} missing Total row`);
  const totalValues = totalMatch[1].trim().split(/\s+/).map(intText);
  if (totalValues.length !== expectedColumnCount) {
    throw new Error(`${contestName} Total row has ${totalValues.length} columns, expected ${expectedColumnCount}`);
  }
  return { rows, totalValues };
}

function sumColumn(rows, columnIndex) {
  return [...rows.values()].reduce((sum, values) => sum + values[columnIndex], 0);
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function fetchOrmsEmbeddedPdf(recordId, outputPath) {
  const url = `https://records.sos.state.or.us/ORSOSWebDrawer/Recordhtml/${recordId}`;
  const response = await fetch(url, {
    headers: { "user-agent": "CivicResultMaps Oregon historical baseline normalizer" },
  });
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const match = html.match(/pdfjsProcessing"\s*:\s*\{\s*"file"\s*:\s*\{\s*"data"\s*:\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`${url} did not expose an embedded PDF payload`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(match[1], "base64"));
}

async function ensureHistoricalPdf(source) {
  if (fs.existsSync(source.localPdf)) return;
  await fetchOrmsEmbeddedPdf(source.recordId, source.localPdf);
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

function historicalRowsFromPdf(text, source) {
  const parsed = parseCountyRows(contestBlock(text, "US President"), `${source.year} US President`, 6);
  const rows = [...parsed.rows.entries()].map(([county, values]) => {
    const demVotes = values[source.columns.dem];
    const repVotes = values[source.columns.rep];
    const otherVotes = source.columns.other.reduce((sum, index) => sum + values[index], 0);
    return {
      state: "OR",
      election_year: source.year,
      jurisdiction_name: county,
      county,
      local_unit: county,
      source_id: source.sourceId,
      source_level: "county",
      row_method: "oregonOfficialAbstractPdfHistorical",
      source_url: source.sourceUrl,
      dem_votes: demVotes,
      rep_votes: repVotes,
      other_votes: otherVotes,
      total_votes: demVotes + repVotes + otherVotes,
    };
  });
  const totals = rows.reduce(
    (sum, row) => ({
      rows: sum.rows + 1,
      demVotes: sum.demVotes + row.dem_votes,
      repVotes: sum.repVotes + row.rep_votes,
      otherVotes: sum.otherVotes + row.other_votes,
      totalVotes: sum.totalVotes + row.total_votes,
    }),
    { rows: 0, demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );
  for (const [key, expected] of Object.entries(source.expected)) {
    assertEqual(`${source.year} historical ${key}`, totals[key], expected);
  }
  return rows;
}

const text = await extractPdfText(inputPdf);

const president = parseCountyRows(contestBlock(text, "US President"), "US President", 8);
const presidentRows = [...president.rows.entries()].map(([county, values]) => {
  const other = values[0] + values[1] + values[2] + values[3] + values[5] + values[7];
  return {
    state: "OR",
    election_year: 2024,
    jurisdiction_name: county,
    harris: values[6],
    trump: values[4],
    other,
  };
});

assertEqual("US President county count", presidentRows.length, 36);
assertEqual("US President Trump total", sumColumn(president.rows, 4), 919480);
assertEqual("US President Harris total", sumColumn(president.rows, 6), 1240600);
assertEqual("US President other total", presidentRows.reduce((sum, row) => sum + row.other, 0), 84413);
assertEqual("US President total votes", presidentRows.reduce((sum, row) => sum + row.trump + row.harris + row.other, 0), 2244493);

const attorneyGeneral = parseCountyRows(contestBlock(text, "Attorney General"), "Attorney General", 3);
const attorneyGeneralRows = [...attorneyGeneral.rows.entries()].map(([county, values]) => ({
  state: "OR",
  election_year: 2024,
  jurisdiction_name: county,
  comparison_dem: values[1],
  comparison_rep: values[0],
  comparison_other: values[2],
}));

assertEqual("Attorney General county count", attorneyGeneralRows.length, 36);
assertEqual("Attorney General Republican total", sumColumn(attorneyGeneral.rows, 0), 967964);
assertEqual("Attorney General Democratic total", sumColumn(attorneyGeneral.rows, 1), 1156489);
assertEqual("Attorney General other total", sumColumn(attorneyGeneral.rows, 2), 2612);

writeCsv(presidentOut, ["state", "election_year", "jurisdiction_name", "harris", "trump", "other"], presidentRows);
writeCsv(
  attorneyGeneralOut,
  ["state", "election_year", "jurisdiction_name", "comparison_dem", "comparison_rep", "comparison_other"],
  attorneyGeneralRows,
);

const historicalRows = [];
for (const source of historicalSources) {
  await ensureHistoricalPdf(source);
  historicalRows.push(...historicalRowsFromPdf(await extractPdfText(source.localPdf), source));
}

writeCsv(
  historicalOut,
  [
    "state",
    "election_year",
    "jurisdiction_name",
    "county",
    "local_unit",
    "source_id",
    "source_level",
    "row_method",
    "source_url",
    "dem_votes",
    "rep_votes",
    "other_votes",
    "total_votes",
  ],
  historicalRows.sort((a, b) => a.election_year - b.election_year || a.jurisdiction_name.localeCompare(b.jurisdiction_name)),
);

console.log(`Wrote ${presidentRows.length} presidential county rows to ${presidentOut}`);
console.log(`Wrote ${attorneyGeneralRows.length} Attorney General county rows to ${attorneyGeneralOut}`);
console.log(`Wrote ${historicalRows.length} historical presidential county rows to ${historicalOut}`);
