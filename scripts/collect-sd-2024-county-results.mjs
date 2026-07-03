import { mkdir, writeFile } from "node:fs/promises";

const state = "SD";
const presidentSourceId = "sd-2024-president-wikipedia-county";
const houseSourceId = "sd-2024-us-house-wikipedia-county";
const presidentOutput = "data/sd-2024-general-president-county.csv";
const houseOutput = "data/sd-2024-general-us-house-county.csv";

const pages = {
  president: "2024_United_States_presidential_election_in_South_Dakota",
  house: "2024_United_States_House_of_Representatives_election_in_South_Dakota",
};

function stripTemplates(value) {
  let output = value;
  for (let index = 0; index < 12; index += 1) output = output.replace(/\{\{[^{}]*\}\}/g, "");
  return output;
}

function clean(value) {
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

function numberFromCell(value) {
  const normalized = clean(value).replace(/[\u2212\u2013\u2014]/g, "-").replace(/[^0-9.-]/g, "");
  return normalized ? Number(normalized) : null;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function countyTable(wikitext, requiredPattern) {
  const starts = [...wikitext.matchAll(/\{\|[^\n]*wikitable[^\n]*/g)].map((match) => match.index);
  for (const start of starts) {
    const end = wikitext.indexOf("|}", start);
    if (end < 0) continue;
    const table = wikitext.slice(start, end + 2);
    if (/County/i.test(table) && /Total/i.test(table) && requiredPattern.test(table)) return table;
  }
  throw new Error("County table not found.");
}

function rowCells(chunk) {
  const lines = chunk.split("\n").filter((line) => line.trim().startsWith("|") && !line.trim().startsWith("|+"));
  const cells = [];
  for (let line of lines) {
    line = line.trim();
    if (line.startsWith("|")) line = line.slice(1);
    for (let part of line.split(/\|\|/)) {
      part = part.trim().replace(/^([^|]*\|)/, "");
      cells.push(part);
    }
  }
  return cells;
}

function parsePresidentRows(table) {
  const rows = [];
  for (const chunk of table.split(/^\|-/m).slice(1)) {
    const cells = rowCells(chunk);
    if (cells.length < 8) continue;
    const county = clean(cells[0]).replace(/ County,? South Dakota$/i, "").replace(/ County$/i, "");
    if (!county || county === "County" || county === "Total" || county === "Totals") continue;

    const numbers = cells.slice(1).map(numberFromCell).filter(Number.isFinite);
    if (numbers.length < 5) continue;

    const trump = numbers[0];
    const harris = numbers[2];
    const total = numbers[numbers.length - 1];
    const other = total - trump - harris;
    if (![trump, harris, other, total].every(Number.isFinite) || other < 0) continue;

    rows.push({
      state,
      election_year: 2024,
      jurisdiction_name: county + " County",
      trump,
      harris,
      other,
    });
  }
  return rows;
}

function parseHouseRows(table) {
  const rows = [];
  for (const chunk of table.split(/^\|-/m).slice(1)) {
    const cells = rowCells(chunk);
    if (cells.length < 6) continue;
    const county = clean(cells[0]).replace(/ County,? South Dakota$/i, "").replace(/ County$/i, "");
    if (!county || county === "County" || county === "Total" || county === "Totals") continue;

    const numbers = cells.slice(1).map(numberFromCell).filter(Number.isFinite);
    if (numbers.length < 3) continue;

    rows.push({
      state,
      election_year: 2024,
      jurisdiction_name: county + " County",
      comparison_rep: numbers[0],
      comparison_dem: numbers[2],
      comparison_other: 0,
    });
  }
  return rows;
}

async function fetchWikitext(page) {
  const url = "https://en.wikipedia.org/w/api.php?action=parse&page=" + page + "&prop=wikitext&format=json&formatversion=2";
  const response = await fetch(url, { headers: { "User-Agent": "CivicResultMaps data normalization" } });
  if (!response.ok) throw new Error(url + " failed: " + response.status + " " + response.statusText);
  const payload = await response.json();
  return payload.parse.wikitext;
}

function writeCsvRows(rows, headers) {
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n") + "\n";
}

const [presidentText, houseText] = await Promise.all([fetchWikitext(pages.president), fetchWikitext(pages.house)]);
const presidentRows = parsePresidentRows(countyTable(presidentText, /(Harris|Trump|Oliver|Stein|Kennedy)/i));
const houseRows = parseHouseRows(countyTable(houseText, /(Dusty|Sheryl)\s+Johnson/i));

if (presidentRows.length !== 66) throw new Error(`Expected 66 President county rows, got ${presidentRows.length}.`);
if (houseRows.length !== 66) throw new Error(`Expected 66 U.S. House county rows, got ${houseRows.length}.`);

const presidentTotals = presidentRows.reduce(
  (acc, row) => ({
    trump: acc.trump + row.trump,
    harris: acc.harris + row.harris,
    other: acc.other + row.other,
  }),
  { trump: 0, harris: 0, other: 0 },
);
const houseTotals = houseRows.reduce(
  (acc, row) => ({
    comparison_rep: acc.comparison_rep + row.comparison_rep,
    comparison_dem: acc.comparison_dem + row.comparison_dem,
    comparison_other: acc.comparison_other + row.comparison_other,
  }),
  { comparison_rep: 0, comparison_dem: 0, comparison_other: 0 },
);

const expectedPresident = { trump: 272081, harris: 146859, other: 9982 };
const expectedHouse = { comparison_rep: 303630, comparison_dem: 117818, comparison_other: 0 };
for (const [key, value] of Object.entries(expectedPresident)) {
  if (presidentTotals[key] !== value) throw new Error(`President ${key} expected ${value}, got ${presidentTotals[key]}.`);
}
for (const [key, value] of Object.entries(expectedHouse)) {
  if (houseTotals[key] !== value) throw new Error(`U.S. House ${key} expected ${value}, got ${houseTotals[key]}.`);
}

await mkdir("data", { recursive: true });
await writeFile(presidentOutput, writeCsvRows(presidentRows, ["state", "election_year", "jurisdiction_name", "trump", "harris", "other"]), "utf8");
await writeFile(houseOutput, writeCsvRows(houseRows, ["state", "election_year", "jurisdiction_name", "comparison_rep", "comparison_dem", "comparison_other"]), "utf8");

console.log(JSON.stringify({
  sources: { presidentSourceId, houseSourceId },
  outputs: { presidentOutput, houseOutput },
  presidentRows: presidentRows.length,
  houseRows: houseRows.length,
  presidentTotals,
  houseTotals,
}, null, 2));
