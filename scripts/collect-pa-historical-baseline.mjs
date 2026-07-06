import { mkdir, readFile, writeFile } from "node:fs/promises";

import { parseCsv } from "./normalize-eac-turnout.mjs";

const state = "PA";
const sourceId = "pa-historical-presidential-official-bulk";
const output = "data/pa-historical-presidential-baseline.csv";

const sources = [
  {
    year: 2012,
    returnsFile: "data/pa-2012-general-election-returns-precinct.txt",
    readmeFile: "data/pa-2012-general-election-returns-readme.txt",
    sourceUrl:
      "https://www.pa.gov/agencies/dos/resources/voting-and-elections-resources/voting-and-election-statistics/election-data",
  },
  {
    year: 2016,
    returnsFile: "data/pa-2016-general-election-returns-precinct.txt",
    readmeFile: "data/pa-2016-general-election-returns-readme.txt",
    sourceUrl:
      "https://www.pa.gov/agencies/dos/resources/voting-and-elections-resources/voting-and-election-statistics/election-data",
  },
  {
    year: 2020,
    returnsFile: "data/pa-2020-general-election-returns-precinct.txt",
    readmeFile: "data/pa-2020-general-election-returns-readme.txt",
    sourceUrl:
      "https://www.pa.gov/agencies/dos/resources/voting-and-elections-resources/voting-and-election-statistics/election-data",
  },
];

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function parseCountyCodes(readmeText) {
  const codes = new Map();
  let inTable = false;
  for (const line of readmeText.split(/\r?\n/)) {
    const stripped = line.trim();
    if (stripped === "County Code Table") {
      inTable = true;
      continue;
    }
    if (!inTable || (stripped && /^-+$/.test(stripped))) {
      continue;
    }
    if (!stripped) {
      if (codes.size) {
        break;
      }
      continue;
    }
    const match = /^(\d{2})\s+(.+?)\s*$/.exec(stripped);
    if (match) {
      const code = Number(match[1]);
      if (code >= 1 && code <= 67) {
        codes.set(code, `${match[2]} County`);
      }
    }
  }
  if (codes.size !== 67) {
    throw new Error(`Expected 67 Pennsylvania county codes, got ${codes.size}`);
  }
  return codes;
}

function intValue(value) {
  const cleaned = String(value ?? "").replace(/[^0-9-]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

async function parseYear(source) {
  const countyCodes = parseCountyCodes(await readFile(source.readmeFile, "utf8"));
  const countyTotals = new Map();
  const rows = parseCsv(await readFile(source.returnsFile, "utf8"));

  for (const row of rows) {
    if (row[8] !== "USP") {
      continue;
    }
    const countyCode = Number(row[2]);
    const county = countyCodes.get(countyCode);
    if (!county) {
      throw new Error(`${source.year} unknown county code ${row[2]}`);
    }

    const votes = intValue(row[15]);
    const party = row[9];
    const bucket = countyTotals.get(county) ?? {
      state,
      election_year: source.year,
      jurisdiction_name: county,
      county,
      local_unit: county,
      source_id: sourceId,
      source_level: "county",
      row_method: "pennsylvaniaOfficialBulkPrecinctReturns",
      source_url: source.sourceUrl,
      dem_votes: 0,
      rep_votes: 0,
      other_votes: 0,
      total_votes: 0,
    };

    if (party === "DEM") {
      bucket.dem_votes += votes;
    } else if (party === "REP") {
      bucket.rep_votes += votes;
    } else {
      bucket.other_votes += votes;
    }
    bucket.total_votes += votes;
    countyTotals.set(county, bucket);
  }

  const outputRows = [...countyTotals.values()].sort((a, b) => a.county.localeCompare(b.county));
  if (outputRows.length !== 67) {
    throw new Error(`${source.year} expected 67 county rows, got ${outputRows.length}`);
  }
  return outputRows;
}

const rows = (await Promise.all(sources.map(parseYear))).flat();
for (const source of sources) {
  const yearRows = rows.filter((row) => row.election_year === source.year);
  if (yearRows.length !== 67) {
    throw new Error(`${source.year} expected 67 county rows, got ${yearRows.length}`);
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
console.log(
  JSON.stringify(
    {
      rows: rows.length,
      years: sources.map((source) => source.year),
      totalsByYear: Object.fromEntries(
        sources.map((source) => {
          const yearRows = rows.filter((row) => row.election_year === source.year);
          return [source.year, yearRows.reduce((sum, row) => sum + row.total_votes, 0)];
        }),
      ),
      sourceId,
      output,
    },
    null,
    2,
  ),
);
