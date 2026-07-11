import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const dataDir = path.join(repoRoot, "data");
const manifestPath = path.join(dataDir, "vt-2024-official-sources", "2024-general-manifest.json");
const outputCsvPath = path.join(dataDir, "vt-historical-presidential-baseline.csv");
const summaryPath = path.join(dataDir, "vt-historical-presidential-baseline-summary.json");

const COUNTY_TAGS = new Map([
  ["Addison County", "county:50001"],
  ["Bennington County", "county:50003"],
  ["Caledonia County", "county:50005"],
  ["Chittenden County", "county:50007"],
  ["Essex County", "county:50009"],
  ["Franklin County", "county:50011"],
  ["Grand Isle County", "county:50013"],
  ["Lamoille County", "county:50015"],
  ["Orange County", "county:50017"],
  ["Orleans County", "county:50019"],
  ["Rutland County", "county:50021"],
  ["Washington County", "county:50023"],
  ["Windham County", "county:50025"],
  ["Windsor County", "county:50027"],
]);

const TOWN_ALIASES = new Map([
  ["E HAVEN", "EAST HAVEN"],
  ["E MONTPELIER", "EAST MONTPELIER"],
  ["ESSEX", "ESSEX TOWN"],
  ["N HERO", "NORTH HERO"],
  ["S BURLINGTON", "SOUTH BURLINGTON"],
  ["S HERO", "SOUTH HERO"],
  ["ST ALBANS CITY", "SAINT ALBANS CITY"],
  ["ST ALBANS TOWN", "SAINT ALBANS TOWN"],
  ["ST GEORGE", "SAINT GEORGE"],
  ["ST JOHNSBURY", "SAINT JOHNSBURY"],
  ["W FAIRLEE", "WEST FAIRLEE"],
  ["W HAVEN", "WEST HAVEN"],
  ["W RUTLAND", "WEST RUTLAND"],
  ["W WINDSOR", "WEST WINDSOR"],
]);

const SOURCES = [
  {
    year: 2016,
    id: "vt-2016-president-municipality-results",
    electionId: "82048",
    url: "https://electionarchive.vermont.gov/elections/download/82048/precincts_include:0/",
    localFile: path.join(dataDir, "vt-2016-president-municipality-results.csv"),
    demCandidate: "Hillary Clinton",
    repCandidate: "Donald Trump",
    expected: { rowCount: 14, dem: 178573, rep: 95369, other: 41125, total: 315067 },
  },
  {
    year: 2020,
    id: "vt-2020-president-municipality-results",
    electionId: "144513",
    url: "https://electionarchive.vermont.gov/elections/download/144513/precincts_include:0/",
    localFile: path.join(dataDir, "vt-2020-president-municipality-results.csv"),
    demCandidate: "Joseph R. Biden",
    repCandidate: "Donald J. Trump",
    expected: { rowCount: 14, dem: 242820, rep: 112704, other: 11904, total: 367428 },
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
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
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
  const [header, partyRow, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [String(name).trim(), cells[index] ?? ""])));
}

function titleCounty(value) {
  return `${String(value ?? "")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())} County`;
}

function normalTown(value) {
  const key = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  return TOWN_ALIASES.get(key) ?? key;
}

function townCountyMap() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const map = new Map();
  for (const district of manifest.townDistricts ?? []) {
    const key = normalTown(district.townName);
    const county = titleCounty(district.countyName);
    if (key && !map.has(key)) map.set(key, county);
  }
  return map;
}

function parseSource(source, townToCounty) {
  const rows = parseCsv(fs.readFileSync(source.localFile, "utf8")).filter((row) => row["City/Town"] && row["City/Town"] !== "TOTALS");
  const counties = new Map([...COUNTY_TAGS.keys()].map((county) => [county, { dem: 0, rep: 0, other: 0, total: 0 }]));
  const missing = [];
  for (const row of rows) {
    const townKey = normalTown(row["City/Town"]);
    const county = townToCounty.get(townKey);
    if (!county) {
      missing.push(row["City/Town"]);
      continue;
    }
    const dem = intText(row[source.demCandidate]);
    const rep = intText(row[source.repCandidate]);
    let other = 0;
    for (const [key, value] of Object.entries(row)) {
      if (!key || key === "City/Town" || key === source.demCandidate || key === source.repCandidate || key === "Blanks" || key === "Spoiled" || key === "Total Votes Cast") continue;
      other += intText(value);
    }
    const bucket = counties.get(county);
    bucket.dem += dem;
    bucket.rep += rep;
    bucket.other += other;
    bucket.total += dem + rep + other;
  }
  if (missing.length) {
    throw new Error(`${source.year} Vermont rows missing town-to-county crosswalk: ${missing.join(", ")}`);
  }
  const outputRows = [...counties.entries()].map(([county, votes]) => ({
    state: "VT",
    election_year: source.year,
    jurisdiction_name: county,
    jurisdiction_tag: COUNTY_TAGS.get(county),
    source_id: "vt-historical-presidential-baseline",
    source_level: "county",
    row_method: "historicalPresidentialCsv",
    dem_votes: votes.dem,
    rep_votes: votes.rep,
    other_votes: votes.other,
    total_votes: votes.total,
    source_url: source.url,
  }));
  const totals = {
    rowCount: outputRows.length,
    dem: outputRows.reduce((sum, row) => sum + row.dem_votes, 0),
    rep: outputRows.reduce((sum, row) => sum + row.rep_votes, 0),
    other: outputRows.reduce((sum, row) => sum + row.other_votes, 0),
    total: outputRows.reduce((sum, row) => sum + row.total_votes, 0),
  };
  if (JSON.stringify(totals) !== JSON.stringify(source.expected)) {
    throw new Error(`${source.year} Vermont totals did not reconcile: ${JSON.stringify(totals)} != ${JSON.stringify(source.expected)}`);
  }
  return { rows: outputRows, totals };
}

const townToCounty = townCountyMap();
const allRows = [];
const summary = {
  authority: "Vermont Secretary of State Elections Division",
  parser: "scripts/normalize-vt-historical-presidential-baseline.mjs",
  caveat: "Official Vermont Election Results Archive municipality CSV downloads are aggregated to county baselines using the official Vermont 2024 static manifest town-to-county crosswalk plus explicit abbreviation aliases. Blank and spoiled ballots remain excluded from candidate-vote historical baselines.",
  sources: [],
};
for (const source of SOURCES) {
  const { rows, totals } = parseSource(source, townToCounty);
  allRows.push(...rows);
  summary.sources.push({
    id: source.id,
    year: source.year,
    electionArchiveId: source.electionId,
    url: source.url,
    localFile: path.relative(repoRoot, source.localFile).replace(/\\/g, "/"),
    ...totals,
  });
}

const columns = ["state", "election_year", "jurisdiction_name", "jurisdiction_tag", "source_id", "source_level", "row_method", "dem_votes", "rep_votes", "other_votes", "total_votes", "source_url"];
const csv = [
  columns.join(","),
  ...allRows
    .sort((a, b) => Number(a.election_year) - Number(b.election_year) || String(a.jurisdiction_name).localeCompare(String(b.jurisdiction_name)))
    .map((row) => columns.map((column) => csvCell(row[column])).join(",")),
].join("\n");
fs.writeFileSync(outputCsvPath, `${csv}\n`, "utf8");
summary.output = {
  localFile: path.relative(repoRoot, outputCsvPath).replace(/\\/g, "/"),
  rowCount: allRows.length,
  years: [2016, 2020],
};
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary.output));
