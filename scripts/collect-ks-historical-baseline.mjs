import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);

function loadModule(name) {
  try {
    return require(name);
  } catch (error) {
    if (!process.env.NODE_PATH) throw error;
    return require(resolve(process.env.NODE_PATH, name));
  }
}

const xlsx = loadModule("xlsx");
const { PDFParse } = loadModule("pdf-parse");

const state = "KS";
const sourceId = "ks-historical-presidential-baseline";
const output = "data/ks-historical-presidential-baseline.csv";

const officialSources = {
  2012: {
    sourceUrl: "https://sos.ks.gov/elections/12elec/2012_General_Election_Results.pdf",
    localFile: "data/ks-2012-general-election-results.pdf",
    expected: { rows: 105, demVotes: 439908, repVotes: 689809, otherVotes: 27815, totalVotes: 1157532 },
    certifiedTotals: [440726, 692634],
  },
  2016: {
    sourceUrl: "https://sos.ks.gov/elections/16elec/2016_General_Election_President_Precinct_Level_Results.xlsx",
    localFile: "data/ks-2016-general-election-president-precinct-level-results.xlsx",
    sheetName: "Sheet1",
    expected: { rows: 105, demVotes: 427005, repVotes: 671018, otherVotes: 86379, totalVotes: 1184402 },
  },
  2020: {
    sourceUrl: "https://sos.ks.gov/elections/20elec/2020_General_Election_President_results_by_precinct.xlsx",
    localFile: "data/ks-2020-general-election-president-results-by-precinct.xlsx",
    sheetName: "President",
    expected: { rows: 105, demVotes: 570323, repVotes: 771406, otherVotes: 30574, totalVotes: 1372303 },
  },
};

const secondarySources = {
  2012: "https://en.wikipedia.org/wiki/2012_United_States_presidential_election_in_Kansas",
  2016: "https://en.wikipedia.org/wiki/2016_United_States_presidential_election_in_Kansas",
};

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function intValue(value) {
  const normalized = String(value ?? "").replace(/[^0-9-]/g, "");
  return normalized ? Number(normalized) : 0;
}

function countyName(value) {
  const cleaned = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  const title = cleaned
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
  return /\bCounty$/i.test(title) ? title : `${title} County`;
}

function stripTemplates(value) {
  let outputValue = value;
  for (let index = 0; index < 10; index += 1) {
    outputValue = outputValue.replace(/\{\{[^{}]*\}\}/g, "");
  }
  return outputValue;
}

function cleanWiki(value) {
  return stripTemplates(String(value ?? ""))
    .replace(/<ref[^>]*>.*?<\/ref>/gs, "")
    .replace(/<ref[^/]*\/>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''/g, "")
    .replace(/''/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wikiNumber(value) {
  const normalized = cleanWiki(value).replace(/[\u2212\u2013\u2014]/g, "-").replace(/[^0-9.-]/g, "");
  return normalized ? Number(normalized) : null;
}

function addCounty(map, county, bucket) {
  const name = countyName(county);
  if (!name) return;
  const current = map.get(name) ?? { demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 };
  current.demVotes += bucket.demVotes ?? 0;
  current.repVotes += bucket.repVotes ?? 0;
  current.otherVotes += bucket.otherVotes ?? 0;
  current.totalVotes += bucket.totalVotes ?? 0;
  map.set(name, current);
}

function rowsFromCountyMap(year, countyVotes, rowMethod, sourceUrl, allowedCounties = null) {
  return [...countyVotes.entries()]
    .filter(([county]) => !allowedCounties || allowedCounties.has(county))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([county, votes]) => ({
      state,
      election_year: year,
      jurisdiction_name: county,
      county,
      local_unit: county,
      source_id: sourceId,
      source_level: "county",
      row_method: rowMethod,
      source_url: sourceUrl,
      dem_votes: votes.demVotes,
      rep_votes: votes.repVotes,
      other_votes: votes.otherVotes,
      total_votes: votes.totalVotes,
    }));
}

function bucketOfficialWorkbookRow(row) {
  const candidate = String(row.Candidate ?? "").toUpperCase();
  const party = String(row.Party ?? "").toUpperCase();
  if (party.startsWith("DEMOCR") || /BIDEN|CLINTON/.test(candidate)) return "demVotes";
  if (party.startsWith("REPUB") || /TRUMP/.test(candidate)) return "repVotes";
  return "otherVotes";
}

function parseLongWorkbookRows(entry, year) {
  const workbook = xlsx.readFile(entry.localFile);
  const sheet = workbook.Sheets[entry.sheetName];
  if (!sheet) throw new Error(`${entry.localFile} missing sheet ${entry.sheetName}`);

  const countyVotes = new Map();
  for (const row of xlsx.utils.sheet_to_json(sheet, { defval: "" })) {
    if (!String(row.Race ?? "").includes("President")) continue;
    const county = countyName(row.County);
    if (!county) continue;
    const votes = intValue(row.Votes);
    const bucket = bucketOfficialWorkbookRow(row);
    const values = { demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: votes };
    values[bucket] = votes;
    addCounty(countyVotes, county, values);
  }
  return countyVotes;
}

function parse2020WideCountyTotals(entry, countyVotes) {
  const workbook = xlsx.readFile(entry.localFile);
  const specs = [
    { sheet: "Johnson", county: "Johnson County", dem: 2, other: 3, rep: 4 },
    { sheet: "Sedgwick", county: "Sedgwick County", dem: 1, other: 2, rep: 3 },
    { sheet: "Shawnee", county: "Shawnee County", dem: 2, other: 3, rep: 4 },
    { sheet: "Wyandotte", county: "Wyandotte County", dem: 2, other: 4, rep: 6 },
  ];

  for (const spec of specs) {
    const sheet = workbook.Sheets[spec.sheet];
    if (!sheet) throw new Error(`${entry.localFile} missing sheet ${spec.sheet}`);
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const totals = rows.find((row) => String(row[0] ?? "").trim().toUpperCase() === "TOTALS" || String(row[1] ?? "").trim().toUpperCase() === "COUNTY TOTALS");
    if (!totals) throw new Error(`${entry.localFile} ${spec.sheet} missing county totals row`);
    addCounty(countyVotes, spec.county, {
      demVotes: intValue(totals[spec.dem]),
      repVotes: intValue(totals[spec.rep]),
      otherVotes: intValue(totals[spec.other]),
      totalVotes: intValue(totals[spec.dem]) + intValue(totals[spec.rep]) + intValue(totals[spec.other]),
    });
  }
}

function countyTable(wikitext, year) {
  const starts = [...wikitext.matchAll(/\{\|[^\n]*wikitable[^\n]*/g)].map((match) => match.index);
  for (const start of starts) {
    const end = wikitext.indexOf("|}", start);
    const table = wikitext.slice(start, end + 2);
    if (
      /County/i.test(table) &&
      /Total votes cast|Total\b/i.test(table) &&
      (year === 2012 ? /Obama/i.test(table) && /Romney/i.test(table) : /Clinton/i.test(table) && /Trump/i.test(table))
    ) {
      return table;
    }
  }
  throw new Error(`${year} county presidential table not found.`);
}

function parseWikiRows(table, year) {
  const rows = [];
  for (const chunk of table.split(/^\|-/m).slice(1)) {
    const lines = chunk
      .split(/\n/)
      .filter((line) => line.trim().startsWith("|") && !line.trim().startsWith("|+"));
    const cells = [];
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith("|")) line = line.slice(1);
      for (let part of line.split(/\|\|/)) {
        part = part.trim().replace(/^([^|]*\|)/, "");
        cells.push(part);
      }
    }
    if (cells.length < 10) continue;
    const county = cleanWiki(cells[0]);
    if (!county || county === "County" || county === "Total") continue;

    const demVotes = year === 2012 ? wikiNumber(cells[3]) : wikiNumber(cells[3]);
    const repVotes = year === 2012 ? wikiNumber(cells[1]) : wikiNumber(cells[1]);
    const otherVotes =
      year === 2012
        ? [cells[5], cells[7], cells[9]].reduce((sum, cell) => sum + (wikiNumber(cell) ?? 0), 0)
        : wikiNumber(cells[5]);
    const totalVotes = demVotes + repVotes + otherVotes;
    if (![demVotes, repVotes, otherVotes, totalVotes].every(Number.isFinite)) continue;
    rows.push({
      state,
      election_year: year,
      jurisdiction_name: countyName(county),
      county: countyName(county),
      local_unit: countyName(county),
      source_id: sourceId,
      source_level: "county",
      row_method: year === 2012 ? "wikipediaCountyPresidentialTableSecondaryCountyContext" : "wikipediaCountyPresidentialTableMissingOfficialWorkbookCounties",
      source_url: secondarySources[year],
      dem_votes: demVotes,
      rep_votes: repVotes,
      other_votes: otherVotes,
      total_votes: totalVotes,
    });
  }
  return rows;
}

async function fetchWikiRows(year) {
  const page = `${year}_United_States_presidential_election_in_Kansas`;
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=wikitext&format=json&formatversion=2`;
  const response = await fetch(url, { headers: { "User-Agent": "CivicResultMaps Kansas historical baseline normalizer" } });
  if (!response.ok) throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  const payload = await response.json();
  return parseWikiRows(countyTable(payload.parse.wikitext, year), year);
}

async function assertOfficialPdfTotals(entry, year) {
  const parser = new PDFParse({ data: readFileSync(entry.localFile) });
  try {
    const result = await parser.getText();
    const text = result.text.replace(/\s+/g, " ");
    for (const value of entry.certifiedTotals ?? [entry.expected.demVotes, entry.expected.repVotes]) {
      if (!text.includes(value.toLocaleString("en-US"))) {
        throw new Error(`${year} official PDF text did not include expected total ${value}`);
      }
    }
  } finally {
    await parser.destroy();
  }
}

function assertYearTotals(rows, entry, year) {
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

  for (const [key, expected] of Object.entries(entry.expected)) {
    if (totals[key] !== expected) {
      throw new Error(`${year} expected ${key}=${expected}, got ${totals[key]}`);
    }
  }
}

await assertOfficialPdfTotals(officialSources[2012], 2012);
const rows2012 = await fetchWikiRows(2012);
assertYearTotals(rows2012, officialSources[2012], 2012);

await assertOfficialPdfTotals({ ...officialSources[2016], localFile: "data/ks-2016-general-election-official-results.pdf" }, 2016);
const official2016CountyVotes = parseLongWorkbookRows(officialSources[2016], 2016);
const missing2016Counties = new Set(["Johnson County", "Sedgwick County", "Shawnee County", "Wyandotte County"]);
const rows2016 = [
  ...rowsFromCountyMap(2016, official2016CountyVotes, "kansasOfficialPresidentPrecinctWorkbookCountyAggregate", officialSources[2016].sourceUrl),
  ...(await fetchWikiRows(2016)).filter((row) => missing2016Counties.has(row.county)),
].sort((left, right) => left.county.localeCompare(right.county));
assertYearTotals(rows2016, officialSources[2016], 2016);

await assertOfficialPdfTotals({ ...officialSources[2020], localFile: "data/ks-2020-general-official-vote-totals.pdf" }, 2020);
const official2020CountyVotes = parseLongWorkbookRows(officialSources[2020], 2020);
parse2020WideCountyTotals(officialSources[2020], official2020CountyVotes);
const rows2020 = rowsFromCountyMap(2020, official2020CountyVotes, "kansasOfficialPresidentPrecinctWorkbookCountyAggregate", officialSources[2020].sourceUrl);
assertYearTotals(rows2020, officialSources[2020], 2020);

const rows = [...rows2012, ...rows2016, ...rows2020];
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
await mkdir("data", { recursive: true });
await writeFile(output, csv, "utf8");

console.log(JSON.stringify({ output, rows: rows.length, years: [2012, 2016, 2020] }, null, 2));
