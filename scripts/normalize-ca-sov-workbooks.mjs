import { writeFileSync } from "node:fs";
import XLSX from "xlsx";

const counties = new Map([
  ["Alameda", "CA-001"],
  ["Alpine", "CA-003"],
  ["Amador", "CA-005"],
  ["Butte", "CA-007"],
  ["Calaveras", "CA-009"],
  ["Colusa", "CA-011"],
  ["Contra Costa", "CA-013"],
  ["Del Norte", "CA-015"],
  ["El Dorado", "CA-017"],
  ["Fresno", "CA-019"],
  ["Glenn", "CA-021"],
  ["Humboldt", "CA-023"],
  ["Imperial", "CA-025"],
  ["Inyo", "CA-027"],
  ["Kern", "CA-029"],
  ["Kings", "CA-031"],
  ["Lake", "CA-033"],
  ["Lassen", "CA-035"],
  ["Los Angeles", "CA-037"],
  ["Madera", "CA-039"],
  ["Marin", "CA-041"],
  ["Mariposa", "CA-043"],
  ["Mendocino", "CA-045"],
  ["Merced", "CA-047"],
  ["Modoc", "CA-049"],
  ["Mono", "CA-051"],
  ["Monterey", "CA-053"],
  ["Napa", "CA-055"],
  ["Nevada", "CA-057"],
  ["Orange", "CA-059"],
  ["Placer", "CA-061"],
  ["Plumas", "CA-063"],
  ["Riverside", "CA-065"],
  ["Sacramento", "CA-067"],
  ["San Benito", "CA-069"],
  ["San Bernardino", "CA-071"],
  ["San Diego", "CA-073"],
  ["San Francisco", "CA-075"],
  ["San Joaquin", "CA-077"],
  ["San Luis Obispo", "CA-079"],
  ["San Mateo", "CA-081"],
  ["Santa Barbara", "CA-083"],
  ["Santa Clara", "CA-085"],
  ["Santa Cruz", "CA-087"],
  ["Shasta", "CA-089"],
  ["Sierra", "CA-091"],
  ["Siskiyou", "CA-093"],
  ["Solano", "CA-095"],
  ["Sonoma", "CA-097"],
  ["Stanislaus", "CA-099"],
  ["Sutter", "CA-101"],
  ["Tehama", "CA-103"],
  ["Trinity", "CA-105"],
  ["Tulare", "CA-107"],
  ["Tuolumne", "CA-109"],
  ["Ventura", "CA-111"],
  ["Yolo", "CA-113"],
  ["Yuba", "CA-115"],
]);

const sourceUrls = {
  2012: "https://elections.cdn.sos.ca.gov/sov/2012-general/10-president.xls",
  2016: "https://elections.cdn.sos.ca.gov/sov/2016-general/sov/17-presidential-formatted.xls",
  2020: "https://elections.cdn.sos.ca.gov/sov/2020-general/sov/18-presidential.xlsx",
};

function rowsFromWorkbook(path) {
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false, defval: "" });
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function number(value) {
  const text = clean(value).replace(/,/g, "");
  return text ? Number(text) : 0;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(path, headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  writeFileSync(path, `${lines.join("\n")}\n`);
  console.log(`wrote ${path} (${rows.length} rows)`);
}

function partyColumns(headerRow, partyRow) {
  const columns = { dem: -1, rep: -1, other: [] };
  for (let index = 1; index < partyRow.length; index += 1) {
    const party = clean(partyRow[index]).toUpperCase();
    const name = clean(headerRow[index]);
    if (party === "DEM") {
      columns.dem = index;
    } else if (party.includes("REP")) {
      columns.rep = index;
    } else if (name) {
      columns.other.push(index);
    }
  }
  if (columns.dem < 0 || columns.rep < 0) {
    throw new Error(`Could not locate DEM/REP columns in workbook headers: ${JSON.stringify(partyRow)}`);
  }
  return columns;
}

function dataRows(path) {
  const rows = rowsFromWorkbook(path);
  const columns = partyColumns(rows[0] ?? [], rows[1] ?? []);
  return rows.slice(2).filter((row) => {
    const name = clean(row[0]);
    return name && name !== "Percent" && name !== "State Totals" && counties.has(name);
  }).map((row) => ({ row, columns, county: clean(row[0]) }));
}

function presidentRows(path, year, sourceId) {
  return dataRows(path).map(({ row, columns, county }) => {
    const harris = number(row[columns.dem]);
    const trump = number(row[columns.rep]);
    const other = columns.other.reduce((sum, index) => sum + number(row[index]), 0);
    return {
      state: "CA",
      election_year: year,
      jurisdiction_code: counties.get(county),
      jurisdiction_name: county,
      harris,
      trump,
      other,
      source_id: sourceId,
      source_url: sourceUrls[year] ?? "",
    };
  });
}

function senateRows(path) {
  return dataRows(path).map(({ row, columns, county }) => ({
    state: "CA",
    election_year: 2024,
    jurisdiction_code: counties.get(county),
    jurisdiction_name: county,
    comparison_dem: number(row[columns.dem]),
    comparison_rep: number(row[columns.rep]),
    comparison_other: columns.other.reduce((sum, index) => sum + number(row[index]), 0),
  }));
}

const currentPresident = presidentRows(
  "data/ca-2024-president-county.xlsx",
  2024,
  "ca-2024-general-president-sov",
);
writeCsv("data/ca-2024-general-president.csv", [
  "state",
  "election_year",
  "jurisdiction_code",
  "jurisdiction_name",
  "harris",
  "trump",
  "other",
], currentPresident);

writeCsv("data/ca-2024-general-us-senate-full-term.csv", [
  "state",
  "election_year",
  "jurisdiction_code",
  "jurisdiction_name",
  "comparison_dem",
  "comparison_rep",
  "comparison_other",
], senateRows("data/ca-2024-us-senate-full-term-county.xlsx"));

const historical = [
  ...presidentRows("data/ca-2012-president-county.xls", 2012, "ca-2012-general-president-sov"),
  ...presidentRows("data/ca-2016-president-county.xls", 2016, "ca-2016-general-president-sov"),
  ...presidentRows("data/ca-2020-president-county.xlsx", 2020, "ca-2020-general-president-sov"),
].map((row) => ({
  state: row.state,
  election_year: row.election_year,
  jurisdiction_code: row.jurisdiction_code,
  jurisdiction_name: row.jurisdiction_name,
  source_id: row.source_id,
  source_level: "county",
  row_method: "californiaSovCountyWorkbook",
  dem_votes: row.harris,
  rep_votes: row.trump,
  other_votes: row.other,
  total_votes: row.harris + row.trump + row.other,
  source_url: row.source_url,
}));

writeCsv("data/ca-historical-presidential-baseline.csv", [
  "state",
  "election_year",
  "jurisdiction_code",
  "jurisdiction_name",
  "source_id",
  "source_level",
  "row_method",
  "dem_votes",
  "rep_votes",
  "other_votes",
  "total_votes",
  "source_url",
], historical);
