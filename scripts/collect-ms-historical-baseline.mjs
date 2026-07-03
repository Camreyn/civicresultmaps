import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const state = "MS";
const output = "data/ms-historical-presidential-baseline.csv";
const artifactDir = "data/ms-historical-official-results";

const sources = {
  2020: {
    url: "https://www.sos.ms.gov/elections/electionresults/2020%20General%20Election%20Official%20Statewide%20Recapitulation%20(CSV).csv",
    localFile: path.join(artifactDir, "2020-general-official-statewide-recap.csv"),
    rowMethod: "mississippiOfficialRecapCsvHistoricalPresident",
  },
  2016: {
    url: "https://www.sos.ms.gov/elections/electionresults/2016%20GE%20Statewide%20Recap%20Report.pdf",
    localFile: path.join(artifactDir, "2016-ge-statewide-recap-report.pdf"),
    rowMethod: "mississippiOfficialRecapPdfHistoricalPresident",
  },
  2012: {
    url: "https://sos.ms.gov/elections/electionresults/2012General/certified%20results/President%20and%20Vice%20President.pdf",
    localFile: path.join(artifactDir, "2012-president-and-vice-president-certified.pdf"),
    rowMethod: "mississippiOfficialCertifiedPdfHistoricalPresident",
  },
};

const expected = {
  2020: { rows: 82, demVotes: 539398, repVotes: 756764, totalVotes: 1313759 },
  2016: { rows: 82, demVotes: 485131, repVotes: 700714, totalVotes: 1209357 },
  2012: { rows: 82, demVotes: 562949, repVotes: 710746, totalVotes: 1285584 },
};

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function intValue(value) {
  const text = String(value ?? "").replace(/[^0-9]/g, "");
  return text ? Number(text) : 0;
}

function cleanCountyName(value) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s+County$/i, "")
    .trim();
  if (/^Jeff Davis$/i.test(normalized)) return "Jefferson Davis";
  if (/^Desoto$/i.test(normalized)) return "DeSoto";
  return normalized;
}

function countyDisplayName(value) {
  return `${cleanCountyName(value)} County`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows.shift();
  return rows.filter((items) => items.some(Boolean)).map((items) => Object.fromEntries(header.map((key, index) => [key, items[index] ?? ""])));
}

function readCountyNames() {
  const geojson = JSON.parse(readFileSync("data/ms-counties.geojson", "utf8"));
  return geojson.features
    .map((feature) => cleanCountyName(feature.properties?.NAME ?? feature.properties?.BASENAME))
    .filter(Boolean)
    .sort();
}

async function downloadSource(source) {
  await mkdir(artifactDir, { recursive: true });
  if (existsSync(source.localFile)) return;
  const response = await fetch(source.url, {
    headers: { "User-Agent": "CivicResultMaps Mississippi historical baseline collector" },
  });
  if (!response.ok) throw new Error(`${source.url} failed: ${response.status} ${response.statusText}`);
  await writeFile(source.localFile, Buffer.from(await response.arrayBuffer()));
}

async function pdfText(file) {
  let parser;
  try {
    parser = new PDFParse({ data: readFileSync(file) });
    const result = await parser.getText();
    return result.text.replace(/\r/g, "");
  } finally {
    await parser?.destroy();
  }
}

function row({ year, county, demVotes, repVotes, otherVotes, totalVotes }) {
  const jurisdiction = countyDisplayName(county);
  return {
    state,
    election_year: year,
    jurisdiction_name: jurisdiction,
    county: jurisdiction,
    local_unit: jurisdiction,
    source_id: `ms-${year}-historical-presidential-official`,
    source_level: "county",
    row_method: sources[year].rowMethod,
    source_url: sources[year].url,
    dem_votes: demVotes,
    rep_votes: repVotes,
    other_votes: otherVotes,
    total_votes: totalVotes,
  };
}

function candidateKey(candidate, party) {
  const text = `${candidate} ${party}`.toLowerCase();
  if (text.includes("democrat") || text.includes("biden") || text.includes("clinton")) return "dem";
  if (text.includes("republican") || text.includes("trump")) return "rep";
  return "other";
}

function parse2020() {
  const byCounty = new Map();
  for (const item of parseCsv(readFileSync(sources[2020].localFile, "utf8"))) {
    if (item.Office !== "United States-President") continue;
    const county = cleanCountyName(item.County);
    if (!byCounty.has(county)) byCounty.set(county, { dem: 0, rep: 0, other: 0 });
    const bucket = candidateKey(item.Candidate, item.Party);
    byCounty.get(county)[bucket] += intValue(item["County Total"]);
  }
  return [...byCounty.entries()].map(([county, totals]) => row({
    year: 2020,
    county,
    demVotes: totals.dem,
    repVotes: totals.rep,
    otherVotes: totals.other,
    totalVotes: totals.dem + totals.rep + totals.other,
  }));
}

function numericLineValues(section, label) {
  const line = section
    .split("\n")
    .map((item) => item.trim())
    .find((item) => new RegExp(`^${label}\\s+\\d`).test(item));
  if (!line) return [];
  return line
    .replace(new RegExp(`^${label}\\s+`), "")
    .split(/\s+/)
    .filter(Boolean)
    .map((item) => (/^X$/i.test(item) ? 0 : intValue(item)));
}

function footerCounties(section, countySet) {
  const marker = "Official Recapitulation\n2016 PRESIDENTIAL ELECTION\nNames of Counties";
  const markerIndex = section.indexOf(marker);
  if (markerIndex < 0) return [];
  return section
    .slice(markerIndex + marker.length)
    .split("\n")
    .map((line) => cleanCountyName(line))
    .filter((line) => countySet.has(line));
}


function parse2016Text(text, counties) {
  const countySet = new Set(counties);
  const rows = [];
  const pages = text.split(/Statewide Election Management System\s+Page\s+:\s+\d+\s*\n\s*--\s+\d+\s+of\s+\d+\s+--/);
  for (const page of pages) {
    if (!page.includes("United States-President and Vice President")) continue;
    const names = footerCounties(page, countySet);
    if (!names.length) continue;
    const presidentSection = page.split(/US House Of Rep/i)[0];
    const dem = numericLineValues(presidentSection, "Democrat").slice(0, names.length);
    const rep = numericLineValues(presidentSection, "Republican").slice(0, names.length);
    const otherBuckets = ["Constitution", "American Delta", "Prohibition", "Libertarian", "Green"].map((label) => numericLineValues(presidentSection, label).slice(0, names.length));
    if (dem.length !== names.length || rep.length !== names.length || otherBuckets.some((bucket) => bucket.length !== names.length)) {
      throw new Error(`2016 page county/value mismatch for ${names.join(", ")}`);
    }
    for (let index = 0; index < names.length; index += 1) {
      const otherVotes = otherBuckets.reduce((sum, bucket) => sum + bucket[index], 0);
      rows.push(row({
        year: 2016,
        county: names[index],
        demVotes: dem[index],
        repVotes: rep[index],
        otherVotes,
        totalVotes: dem[index] + rep[index] + otherVotes,
      }));
    }
  }
  return rows;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parse2012Text(text, counties) {
  const countyPattern = [...counties, "Desoto"].sort((a, b) => b.length - a.length).map(escapeRegex).join("|");
  const pattern = new RegExp(
    `\\b(${countyPattern})\\s+Barack Obama[\\s\\S]*?Democrat\\s+(\\d[\\d,]*)\\s+[\\d.]+%[\\s\\S]*?Mitt Romney[\\s\\S]*?Republican\\s+(\\d[\\d,]*)\\s+[\\d.]+%[\\s\\S]*?Total For County\\s+(\\d[\\d,]*)`,
    "g",
  );
  const rows = [];
  for (const match of text.matchAll(pattern)) {
    const demVotes = intValue(match[2]);
    const repVotes = intValue(match[3]);
    const totalVotes = intValue(match[4]);
    rows.push(row({
      year: 2012,
      county: match[1],
      demVotes,
      repVotes,
      otherVotes: totalVotes - demVotes - repVotes,
      totalVotes,
    }));
  }
  return rows;
}

function validateYear(year, rows) {
  const totals = rows.reduce(
    (sum, item) => ({
      rows: sum.rows + 1,
      demVotes: sum.demVotes + item.dem_votes,
      repVotes: sum.repVotes + item.rep_votes,
      totalVotes: sum.totalVotes + item.total_votes,
    }),
    { rows: 0, demVotes: 0, repVotes: 0, totalVotes: 0 },
  );
  for (const [key, value] of Object.entries(expected[year])) {
    if (totals[key] !== value) throw new Error(`${year} expected ${key}=${value}, got ${totals[key]}`);
  }
}

for (const source of Object.values(sources)) await downloadSource(source);

const counties = readCountyNames();
const rows = [
  ...parse2012Text(await pdfText(sources[2012].localFile), [...counties]),
  ...parse2016Text(await pdfText(sources[2016].localFile), [...counties]),
  ...parse2020(),
].sort((a, b) => a.election_year - b.election_year || a.jurisdiction_name.localeCompare(b.jurisdiction_name));

for (const year of [2012, 2016, 2020]) validateYear(year, rows.filter((item) => item.election_year === year));

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
await writeFile(output, `${[headers.join(","), ...rows.map((item) => headers.map((header) => csvCell(item[header])).join(","))].join("\n")}\n`, "utf8");
console.log(JSON.stringify({ rows: rows.length, years: [2012, 2016, 2020], output, artifactDir }, null, 2));
