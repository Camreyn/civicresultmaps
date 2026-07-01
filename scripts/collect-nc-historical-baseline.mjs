import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import JSZip from "jszip";

const elections = [
  { year: 2012, date: "2012_11_06", fileDate: "20121106" },
  { year: 2016, date: "2016_11_08", fileDate: "20161108" },
  { year: 2020, date: "2020_11_03", fileDate: "20201103" },
];

const output = "data/nc-historical-presidential-baseline.csv";
const sourceId = "nc-historical-presidential-results-zips";

function sourceUrl(election) {
  return `https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/${election.date}/results_pct_${election.fileDate}.zip`;
}

function localZip(election) {
  return `data/nc-${election.year}-results-precinct.zip`;
}

function intText(value) {
  return Number(String(value ?? "").replace(/[^0-9-]/g, "")) || 0;
}

function countyName(value) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return "";
  return /\bCounty$/i.test(cleaned) ? cleaned : `${cleaned} County`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function splitDelimitedLine(line, delimiter) {
  if (delimiter === "\t") return line.split("\t");
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current);
  return cells;
}

function parseDelimited(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const firstLine = lines.shift() ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const headers = splitDelimitedLine(firstLine, delimiter);
  return lines.map((line) => {
    const cells = splitDelimitedLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function valueFor(row, ...names) {
  for (const name of names) {
    if (Object.hasOwn(row, name)) return row[name];
  }
  return "";
}

async function ensureZip(election) {
  const path = localZip(election);
  if (existsSync(path)) return path;

  const url = sourceUrl(election);
  const response = await fetch(url, {
    headers: { "User-Agent": "CivicResultMaps official NC historical baseline collector" },
  });
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  }
  await mkdir("data", { recursive: true });
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  return path;
}

async function rowsForElection(election) {
  const path = await ensureZip(election);
  const archive = await JSZip.loadAsync(await readFile(path));
  const entry = Object.values(archive.files).find((file) => !file.dir && file.name.toLowerCase().endsWith(".txt"));
  if (!entry) {
    throw new Error(`${path} does not contain a TXT result file`);
  }

  const countyVotes = new Map();
  for (const row of parseDelimited(await entry.async("string"))) {
    const contest = String(valueFor(row, "Contest Name", "contest")).trim().toUpperCase();
    if (contest !== "US PRESIDENT" && contest !== "PRESIDENT AND VICE PRESIDENT OF THE UNITED STATES") continue;
    const county = countyName(valueFor(row, "County", "county"));
    if (!county) continue;
    const party = String(valueFor(row, "Choice Party", "party")).trim().toUpperCase();
    const votes = intText(valueFor(row, "Total Votes", "total votes"));
    const bucket = countyVotes.get(county) ?? { dem: 0, rep: 0, other: 0, total: 0 };
    if (party === "DEM") bucket.dem += votes;
    else if (party === "REP") bucket.rep += votes;
    else bucket.other += votes;
    bucket.total += votes;
    countyVotes.set(county, bucket);
  }

  const rows = [...countyVotes.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([county, votes]) => ({
    state: "NC",
    election_year: election.year,
    jurisdiction_name: county,
    county,
    local_unit: county,
    source_id: sourceId,
    source_level: "county",
    row_method: "northCarolinaPrecinctResultsZipCountyAggregate",
    source_url: sourceUrl(election),
    dem_votes: votes.dem,
    rep_votes: votes.rep,
    other_votes: votes.other,
    total_votes: votes.total,
  }));

  if (rows.length !== 100) {
    throw new Error(`${election.year} expected 100 county rows, got ${rows.length}`);
  }
  return rows;
}

const rows = (await Promise.all(elections.map(rowsForElection))).flat();
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

const totals = Object.fromEntries(
  elections.map((election) => {
    const yearRows = rows.filter((row) => row.election_year === election.year);
    return [
      election.year,
      {
        rows: yearRows.length,
        dem: yearRows.reduce((sum, row) => sum + row.dem_votes, 0),
        rep: yearRows.reduce((sum, row) => sum + row.rep_votes, 0),
        other: yearRows.reduce((sum, row) => sum + row.other_votes, 0),
        total: yearRows.reduce((sum, row) => sum + row.total_votes, 0),
      },
    ];
  }),
);

console.log(JSON.stringify({ output, rows: rows.length, totals }, null, 2));