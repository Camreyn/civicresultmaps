import { mkdir, writeFile } from "node:fs/promises";

const years = [2012, 2016, 2020];
const state = "MI";
const stateName = "Michigan";
const sourceId = "mi-historical-presidential-wikipedia-county";
const output = "data/mi-historical-presidential-baseline.csv";

function stripTemplates(value) {
  let output = value;
  for (let index = 0; index < 12; index += 1) {
    output = output.replace(/\{\{[^{}]*\}\}/g, "");
  }
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
  const normalized = clean(value)
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/[^0-9.-]/g, "");
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
    if (/^\s*!\s*(?:[^|\n]*\|\s*)?County/im.test(table) && /Total votes cast|Total votes|Total\b/i.test(table) && /(Obama|Biden|Clinton)/i.test(table) && /(Romney|Trump)/i.test(table)) {
      return table;
    }
  }
  throw new Error("County presidential table not found.");
}

function parseCells(chunk) {
  const lines = chunk.split("\n").filter((line) => /^[!|]/.test(line.trim()) && !line.trim().startsWith("|+"));
  const cells = [];
  for (let line of lines) {
    line = line.trim();
    if (line.startsWith("!") || line.startsWith("|")) {
      line = line.slice(1);
    }
    const separator = line.includes("!!") ? /!!/ : /\|\|/;
    for (let part of line.split(separator)) {
      part = part.trim().replace(/^([^|]*\|)/, "");
      cells.push(part);
    }
  }
  return cells;
}

function columnIndexes(table) {
  const headerChunk =
    table
      .split(/^\|-/m)
      .find((chunk) => /^\s*!\s*(?:[^|\n]*\|\s*)?County/im.test(chunk) && /(Obama|Biden|Clinton)/i.test(chunk) && /(Romney|Trump)/i.test(chunk)) ?? "";
  const headers = parseCells(headerChunk).map(clean);
  const demHeader = headers.findIndex((header) => /Democratic|Obama|Clinton|Biden/i.test(header));
  const repHeader = headers.findIndex((header) => /Republican|Romney|Trump/i.test(header));
  const totalHeader = headers.findIndex((header) => /Total votes cast|Total votes|Total/i.test(header));
  if (demHeader === -1 || repHeader === -1 || totalHeader === -1) {
    throw new Error(`Could not identify vote columns: ${headers.join(" | ")}`);
  }
  const voteCell = (headerIndex) => headerIndex * 2 - 1;
  return { dem: voteCell(demHeader), rep: voteCell(repHeader), total: voteCell(totalHeader) };
}

function parseCountyRows(table, year) {
  const columns = columnIndexes(table);
  const rows = [];
  for (const chunk of table.split(/^\|-/m).slice(1)) {
    const cells = parseCells(chunk);
    if (cells.length <= Math.max(columns.dem, columns.rep, columns.total)) {
      continue;
    }

    const county = clean(cells[0])
      .replace(new RegExp(` County,? ${stateName}$`, "i"), "")
      .replace(/ County$/i, "");
    if (!county || county === "County" || /^Totals?$/i.test(county) || county.includes("|") || county.length > 32) {
      continue;
    }

    const demVotes = numberFromCell(cells[columns.dem]);
    const repVotes = numberFromCell(cells[columns.rep]);
    const totalVotes = numberFromCell(cells[columns.total]);
    const otherVotes = totalVotes - demVotes - repVotes;
    if (![demVotes, repVotes, otherVotes, totalVotes].every(Number.isFinite) || otherVotes < 0) {
      continue;
    }

    rows.push({
      state,
      election_year: year,
      jurisdiction_name: `${county} County`,
      county: `${county} County`,
      local_unit: `${county} County`,
      source_id: sourceId,
      source_level: "county",
      row_method: "wikipediaCountyPresidentialTable",
      source_url: `https://en.wikipedia.org/wiki/${year}_United_States_presidential_election_in_${stateName}`,
      dem_votes: demVotes,
      rep_votes: repVotes,
      other_votes: otherVotes,
      total_votes: totalVotes,
    });
  }
  return rows;
}

async function fetchRows(year) {
  const page = `${year}_United_States_presidential_election_in_${stateName}`;
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=wikitext&format=json&formatversion=2`;
  const response = await fetch(url, { headers: { "User-Agent": "CivicResultMaps data normalization" } });
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  return parseCountyRows(countyTable(payload.parse.wikitext), year);
}

const rows = (await Promise.all(years.map(fetchRows))).flat();
for (const year of years) {
  const yearRows = rows.filter((row) => row.election_year === year);
  if (yearRows.length !== 83) {
    throw new Error(`${year} expected 83 county rows, got ${yearRows.length}`);
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
await mkdir("data", { recursive: true });
await writeFile(output, csv, "utf8");
console.log(JSON.stringify({ rows: rows.length, years, output }, null, 2));
