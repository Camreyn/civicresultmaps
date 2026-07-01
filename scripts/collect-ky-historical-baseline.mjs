import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const years = [2012, 2016, 2020];
const state = "KY";
const sourceId = "ky-historical-presidential-official-county";
const artifactDir = "data/ky-historical-official-results";
const output = "data/ky-historical-presidential-baseline.csv";
const sources = {
  2012: "https://elect.ky.gov/SiteCollectionDocuments/Election%20Results/2010-2019/2012/2012genresults.pdf",
  2016: "https://elect.ky.gov/results/2010-2019/Documents/2016%20General%20Election%20Results.pdf",
  2020: "https://elect.ky.gov/results/2020-2029/Documents/2020%20General%20Election%20Results.pdf",
};

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function numberCell(value) {
  return Number(String(value ?? "").replace(/,/g, ""));
}

async function downloadPdf(year) {
  const localFile = path.join(artifactDir, `${year}-general-election-results.pdf`);
  const response = await fetch(sources[year], { headers: { "User-Agent": "CivicResultMaps data normalization" } });
  if (!response.ok) throw new Error(`${sources[year]} failed: ${response.status} ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(localFile, buffer);
  return localFile;
}

async function pdfText(file) {
  let parser;
  try {
    const buffer = await readFile(file);
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text.replace(/\r\n/g, "\n");
  } finally {
    await parser?.destroy();
  }
}

async function countyNames() {
  const geojson = JSON.parse(await readFile("data/ky-counties.geojson", "utf8"));
  return geojson.features
    .map((feature) => String(feature.properties?.BASENAME ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

function parseRows(text, year, counties) {
  const rows = [];
  const seen = new Set();
  const headerStop =
    year === 2020
      ? "United States Senator"
      : year === 2016
        ? "United States Senator"
        : "United States Representative in Congress";
  const presidentialText = text.split(headerStop)[0] ?? text;

  for (const rawLine of presidentialText.split("\n")) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const county = counties.find((name) => line.toLowerCase().startsWith(`${name.toLowerCase()} `));
    if (!county || seen.has(county)) continue;

    const numbers = line.slice(county.length).match(/\d[\d,]*/g)?.map(numberCell) ?? [];
    if (numbers.length < 3) continue;

    const repVotes = numbers[0];
    const demVotes = numbers[1];
    const totalVotes = numbers.reduce((sum, value) => sum + value, 0);
    const otherVotes = totalVotes - repVotes - demVotes;
    if (![demVotes, repVotes, otherVotes, totalVotes].every(Number.isFinite) || otherVotes < 0) continue;

    const countyName = `${county} County`;
    rows.push({
      state,
      election_year: year,
      jurisdiction_name: countyName,
      county: countyName,
      local_unit: countyName,
      source_id: sourceId,
      source_level: "county",
      row_method: "kentuckyOfficialGeneralElectionPdf",
      source_url: sources[year],
      dem_votes: demVotes,
      rep_votes: repVotes,
      other_votes: otherVotes,
      total_votes: totalVotes,
    });
    seen.add(county);
  }
  return rows.sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));
}

await mkdir(artifactDir, { recursive: true });
const counties = await countyNames();
const rows = [];
for (const year of years) {
  const pdf = await downloadPdf(year);
  const text = await pdfText(pdf);
  const yearRows = parseRows(text, year, counties);
  if (yearRows.length !== 120) throw new Error(`${year} expected 120 county rows, got ${yearRows.length}`);
  rows.push(...yearRows);
}

const expectedTotals = {
  2012: { dem: 679370, rep: 1087190, total: 1797212 },
  2016: { dem: 628854, rep: 1202971, total: 1924149 },
  2020: { dem: 772474, rep: 1326646, total: 2136768 },
};
for (const year of years) {
  const yearRows = rows.filter((row) => row.election_year === year);
  const totals = {
    dem: yearRows.reduce((sum, row) => sum + row.dem_votes, 0),
    rep: yearRows.reduce((sum, row) => sum + row.rep_votes, 0),
    total: yearRows.reduce((sum, row) => sum + row.total_votes, 0),
  };
  const expected = expectedTotals[year];
  for (const key of Object.keys(expected)) {
    if (totals[key] !== expected[key]) {
      throw new Error(`${year} ${key} total expected ${expected[key]}, got ${totals[key]}`);
    }
  }
}

const headers = [
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
];
const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n") + "\n";
await writeFile(output, csv, "utf8");
console.log(JSON.stringify({ rows: rows.length, years, output, artifactDir }, null, 2));
