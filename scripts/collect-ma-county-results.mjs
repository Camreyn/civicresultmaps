import { mkdir, writeFile } from "node:fs/promises";

const counties = [
  "Barnstable",
  "Berkshire",
  "Bristol",
  "Dukes",
  "Essex",
  "Franklin",
  "Hampden",
  "Hampshire",
  "Middlesex",
  "Nantucket",
  "Norfolk",
  "Plymouth",
  "Suffolk",
  "Worcester",
];

const electionId = "165300";
const sourceId = "ma-2024-president-pd43-county-pages";
const output = "data/ma-2024-president-county-results.csv";

function stripTags(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function numberFromCell(value) {
  const cleaned = stripTags(value).replace(/[^0-9.-]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function countyTotalsRow(html, county) {
  const rows = [...html.matchAll(/<tr[^>]*class="[^"]*total[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const row = rows.find((candidate) => /County Totals/i.test(candidate));
  if (!row) throw new Error('County Totals row not found for ' + county);
  const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
  if (cells.length < 12) throw new Error(county + ' County Totals row has ' + cells.length + ' cells');
  const harris = numberFromCell(cells[1]);
  const trump = numberFromCell(cells[2]);
  const total = numberFromCell(cells.at(-1));
  const other = total - harris - trump;
  if (![harris, trump, other, total].every(Number.isFinite) || total <= 0 || other < 0) {
    throw new Error(county + ' County Totals row has invalid vote counts');
  }
  return { harris, trump, other, total };
}

async function fetchCounty(county) {
  const url = 'https://electionstats.state.ma.us/elections/view/' + electionId + '/filter_by_county:' + encodeURIComponent(county);
  const response = await fetch(url, { headers: { "User-Agent": "CivicResultMaps data normalization" } });
  if (!response.ok) throw new Error(url + ' failed: ' + response.status + ' ' + response.statusText);
  const html = await response.text();
  const totals = countyTotalsRow(html, county);
  return {
    state: "MA",
    election_year: 2024,
    county: county + ' County',
    source_id: sourceId,
    source_level: "county",
    row_method: "pd43CountyFilteredPageTotals",
    source_url: url,
    harris_votes: totals.harris,
    trump_votes: totals.trump,
    other_votes: totals.other,
    total_votes: totals.total,
  };
}

const rows = await Promise.all(counties.map(fetchCounty));
const statewide = rows.reduce(
  (acc, row) => ({
    harris: acc.harris + row.harris_votes,
    trump: acc.trump + row.trump_votes,
    other: acc.other + row.other_votes,
    total: acc.total + row.total_votes,
  }),
  { harris: 0, trump: 0, other: 0, total: 0 },
);

const expected = { harris: 2126518, trump: 1251303, other: 135109, total: 3512930 };
for (const [key, value] of Object.entries(expected)) {
  if (statewide[key] !== value) throw new Error('Expected statewide ' + key + ' ' + value + ', got ' + statewide[key]);
}

const headers = [
  "state",
  "election_year",
  "county",
  "source_id",
  "source_level",
  "row_method",
  "source_url",
  "harris_votes",
  "trump_votes",
  "other_votes",
  "total_votes",
];
const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n") + "\n";
await mkdir("data", { recursive: true });
await writeFile(output, csv, "utf8");
console.log(JSON.stringify({ rows: rows.length, statewide, output }, null, 2));
