import { mkdir, writeFile } from "node:fs/promises";

const elections = [
  {
    year: 2012,
    electionId: "112698",
    expected: { dem: 1921290, rep: 1188314, other: 58163, total: 3167767 },
  },
  {
    year: 2016,
    electionId: "130243",
    expected: { dem: 1995196, rep: 1090893, other: 238957, total: 3325046 },
  },
  {
    year: 2020,
    electionId: "140751",
    expected: { dem: 2382202, rep: 1167202, other: 81999, total: 3631403 },
  },
];
const state = "MA";
const sourceId = "ma-historical-presidential-pd43-county";
const output = "data/ma-historical-presidential-baseline.csv";

function clean(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&raquo;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function numberFromCell(value) {
  const normalized = clean(value).replace(/[^0-9.-]/g, "");
  return normalized ? Number(normalized) : null;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function parseCountyRows(html, election) {
  const rows = [];
  for (const match of html.matchAll(/<tr\b[^>]*class="[^"]*\bm_item\b[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = match[1];
    const countyMatch = rowHtml.match(/<a\b[^>]*class="label"[^>]*>([\s\S]*?)<\/a>/i);
    const county = clean(countyMatch?.[1] ?? "");
    if (!county || county === "Totals") continue;

    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cellMatch) => cellMatch[1]);
    if (cells.length < 6) continue;
    const demVotes = numberFromCell(cells[1]);
    const repVotes = numberFromCell(cells[2]);
    const blanks = numberFromCell(cells.at(-2));
    const totalVotesCast = numberFromCell(cells.at(-1));
    if (![demVotes, repVotes, blanks, totalVotesCast].every(Number.isFinite)) continue;
    const totalVotes = totalVotesCast - blanks;
    const otherVotes = totalVotes - demVotes - repVotes;
    if (![otherVotes, totalVotes].every(Number.isFinite) || otherVotes < 0 || totalVotes <= 0) {
      throw new Error(election.year + " " + county + " County has invalid official PD43+ county totals");
    }

    const sourceUrl = "https://electionstats.state.ma.us/elections/view/" + election.electionId + "/";
    rows.push({
      state,
      election_year: election.year,
      jurisdiction_name: county + " County",
      county: county + " County",
      local_unit: county + " County",
      source_id: sourceId,
      source_level: "county",
      row_method: "pd43OfficialCountyTable",
      source_url: sourceUrl,
      dem_votes: demVotes,
      rep_votes: repVotes,
      other_votes: otherVotes,
      total_votes: totalVotes,
    });
  }
  return rows;
}

async function fetchRows(election) {
  const url = "https://electionstats.state.ma.us/elections/view/" + election.electionId + "/";
  const response = await fetch(url, { headers: { "User-Agent": "CivicResultMaps data normalization" } });
  if (!response.ok) throw new Error(url + " failed: " + response.status + " " + response.statusText);
  return parseCountyRows(await response.text(), election);
}

const rows = (await Promise.all(elections.map(fetchRows))).flat();
for (const election of elections) {
  const yearRows = rows.filter((row) => row.election_year === election.year);
  if (yearRows.length !== 14) throw new Error(election.year + " expected 14 county rows, got " + yearRows.length);
  const totals = yearRows.reduce(
    (acc, row) => ({
      dem: acc.dem + row.dem_votes,
      rep: acc.rep + row.rep_votes,
      other: acc.other + row.other_votes,
      total: acc.total + row.total_votes,
    }),
    { dem: 0, rep: 0, other: 0, total: 0 },
  );
  for (const [key, value] of Object.entries(election.expected)) {
    if (totals[key] !== value) throw new Error(election.year + " expected statewide " + key + " " + value + ", got " + totals[key]);
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
console.log(JSON.stringify({ rows: rows.length, years: elections.map((election) => election.year), sourceId, output }, null, 2));
