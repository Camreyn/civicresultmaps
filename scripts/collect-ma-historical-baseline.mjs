import { mkdir, writeFile } from "node:fs/promises";

const years = [2012, 2016, 2020];
const state = "MA";
const sourceId = "ma-historical-presidential-wikipedia-county";
const output = "data/ma-historical-presidential-baseline.csv";

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

function countyTable(wikitext) {
  const starts = [...wikitext.matchAll(/\{\|[^\n]*wikitable[^\n]*/g)].map((match) => match.index);
  for (const start of starts) {
    const end = wikitext.indexOf("|}", start);
    const table = wikitext.slice(start, end + 2);
    if (/County/i.test(table) && /Total votes cast|Total\b/i.test(table) && /(Obama|Biden|Clinton)/i.test(table) && /(Romney|Trump)/i.test(table)) return table;
  }
  throw new Error("County presidential table not found.");
}

function parseCountyRows(table, year) {
  const rows = [];
  for (const chunk of table.split(/^\|-/m).slice(1)) {
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
    if (cells.length < 10) continue;
    const county = clean(cells[0]).replace(/ County,? Massachusetts$/i, "").replace(/ County$/i, "");
    if (!county || county === "County" || county === "Total") continue;
    const demVotes = numberFromCell(cells[1]);
    const repVotes = numberFromCell(cells[3]);
    const otherVotes = numberFromCell(cells[5]);
    const totalVotes = numberFromCell(cells[9]) ?? demVotes + repVotes + otherVotes;
    if (![demVotes, repVotes, otherVotes, totalVotes].every(Number.isFinite)) continue;
    rows.push({
      state,
      election_year: year,
      jurisdiction_name: county + ' County',
      county: county + ' County',
      local_unit: county + ' County',
      source_id: sourceId,
      source_level: "county",
      row_method: "wikipediaCountyPresidentialTable",
      source_url: 'https://en.wikipedia.org/wiki/' + year + '_United_States_presidential_election_in_Massachusetts',
      dem_votes: demVotes,
      rep_votes: repVotes,
      other_votes: otherVotes,
      total_votes: totalVotes,
    });
  }
  return rows;
}

async function fetchRows(year) {
  const page = year + '_United_States_presidential_election_in_Massachusetts';
  const url = 'https://en.wikipedia.org/w/api.php?action=parse&page=' + page + '&prop=wikitext&format=json&formatversion=2';
  const response = await fetch(url, { headers: { "User-Agent": "CivicResultMaps data normalization" } });
  if (!response.ok) throw new Error(url + ' failed: ' + response.status + ' ' + response.statusText);
  const payload = await response.json();
  return parseCountyRows(countyTable(payload.parse.wikitext), year);
}

const rows = (await Promise.all(years.map(fetchRows))).flat();
for (const year of years) {
  const yearRows = rows.filter((row) => row.election_year === year);
  if (yearRows.length !== 14) throw new Error(year + ' expected 14 county rows, got ' + yearRows.length);
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
await mkdir("data", { recursive: true });
await writeFile(output, csv, "utf8");
console.log(JSON.stringify({ rows: rows.length, years, output }, null, 2));
