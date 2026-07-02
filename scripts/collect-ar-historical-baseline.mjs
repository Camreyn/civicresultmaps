import { mkdir, writeFile } from "node:fs/promises";

const state = "AR";
const output = "data/ar-historical-presidential-baseline.csv";
const sourceId = "ar-historical-presidential-baseline";
const apiBase = "https://enr-results-api.totalresults.com";

const officialYears = [
  {
    year: 2016,
    electionId: "1836",
    contestId: "467",
    sourceUrl: `${apiBase}/Contest/GetContestResults?cId=arkansas&electionID=1836&contestType=FED`,
    expected: { rows: 75, demVotes: 380494, repVotes: 684872, otherVotes: 65310, totalVotes: 1130676 },
  },
  {
    year: 2020,
    electionId: "1841",
    contestId: "673",
    sourceUrl: `${apiBase}/Contest/GetContestResults?cId=arkansas&electionID=1841&contestType=FED`,
    expected: { rows: 75, demVotes: 423932, repVotes: 760647, otherVotes: 34490, totalVotes: 1219069 },
  },
];

const secondaryYears = [
  {
    year: 2012,
    page: "2012_United_States_presidential_election_in_Arkansas",
    sourceUrl: "https://en.wikipedia.org/wiki/2012_United_States_presidential_election_in_Arkansas",
    expected: { rows: 75, demVotes: 394409, repVotes: 647744, otherVotes: 27315, totalVotes: 1069468 },
  },
];

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function intValue(value) {
  const normalized = String(value ?? "").replace(/[−–—]/g, "-").replace(/[^0-9-]/g, "");
  return normalized ? Number(normalized) : 0;
}

function stripTemplates(value) {
  let outputValue = value;
  for (let index = 0; index < 10; index += 1) {
    outputValue = outputValue.replace(/\{\{[^{}]*\}\}/g, "");
  }
  return outputValue;
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

function countyName(value) {
  const name = clean(value);
  if (!name || /^total/i.test(name) || /^county$/i.test(name)) return "";
  const titled = name === name.toUpperCase() ? name.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : name;
  return /\bcounty$/i.test(titled) ? titled : `${titled} County`;
}

function totals(rows) {
  return rows.reduce(
    (sum, row) => ({
      rows: sum.rows + 1,
      demVotes: sum.demVotes + row.dem_votes,
      repVotes: sum.repVotes + row.rep_votes,
      otherVotes: sum.otherVotes + row.other_votes,
      totalVotes: sum.totalVotes + row.total_votes,
    }),
    { rows: 0, demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );
}

function assertExpected(entry, rows) {
  const actual = totals(rows);
  for (const [key, expectedValue] of Object.entries(entry.expected)) {
    if (actual[key] !== expectedValue) {
      throw new Error(`${entry.year} expected ${key}=${expectedValue}, got ${actual[key]}`);
    }
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "CivicResultMaps data normalization" } });
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function officialRows(entry) {
  const [electionInfo, contestPayload] = await Promise.all([
    fetchJson(`${apiBase}/Election/GetElectionInfo?cId=arkansas&electionID=${entry.electionId}`),
    fetchJson(entry.sourceUrl),
  ]);
  if (!electionInfo.isOfficial || !contestPayload.isOfficial) {
    throw new Error(`${entry.year} TotalResults API response is not marked official`);
  }

  const locations = electionInfo.response?.locations ?? {};
  const contest = contestPayload.response?.contests?.[entry.contestId];
  if (!contest) {
    throw new Error(`${entry.year} missing presidential contest ${entry.contestId}`);
  }

  const rows = Object.values(contest.locations ?? {}).map((location) => {
    const county = countyName(locations[location.locationId]?.locationName);
    const values = { dem: 0, rep: 0, other: 0 };
    for (const choice of location.choices ?? []) {
      const votes = intValue(choice.totalVotes);
      if (String(choice.partyID) === "2099") values.dem += votes;
      else if (String(choice.partyID) === "2096") values.rep += votes;
      else values.other += votes;
    }
    const total = values.dem + values.rep + values.other;
    return {
      state,
      election_year: entry.year,
      jurisdiction_name: county,
      county,
      local_unit: county,
      source_id: sourceId,
      source_level: "county",
      row_method: "arkansasTotalResultsOfficialCountyHistorical",
      source_url: entry.sourceUrl,
      dem_votes: values.dem,
      rep_votes: values.rep,
      other_votes: values.other,
      total_votes: total,
    };
  });

  assertExpected(entry, rows);
  return rows.sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));
}

function countyTable(wikitext) {
  const starts = [...wikitext.matchAll(/\{\|[^\n]*wikitable[^\n]*/g)].map((match) => match.index);
  for (const start of starts) {
    const end = wikitext.indexOf("|}", start);
    const table = wikitext.slice(start, end + 2);
    if (/County/i.test(table) && /Obama/i.test(table) && /Romney/i.test(table) && /Other parties/i.test(table)) {
      return table;
    }
  }
  throw new Error("2012 Arkansas county presidential table not found.");
}

function parseSecondaryCountyRows(table, entry) {
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
    const county = countyName(cells[0]);
    if (!county) continue;
    const repVotes = intValue(cells[1]);
    const demVotes = intValue(cells[3]);
    const otherVotes = intValue(cells[5]);
    if (![demVotes, repVotes, otherVotes].every(Number.isFinite)) continue;
    rows.push({
      state,
      election_year: entry.year,
      jurisdiction_name: county,
      county,
      local_unit: county,
      source_id: sourceId,
      source_level: "county",
      row_method: "wikipediaCountyPresidentialTable2012OfficialApiBlocked",
      source_url: entry.sourceUrl,
      dem_votes: demVotes,
      rep_votes: repVotes,
      other_votes: otherVotes,
      total_votes: demVotes + repVotes + otherVotes,
    });
  }
  assertExpected(entry, rows);
  return rows.sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));
}

async function secondaryRows(entry) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${entry.page}&prop=wikitext&format=json&formatversion=2`;
  const payload = await fetchJson(url);
  return parseSecondaryCountyRows(countyTable(payload.parse.wikitext), entry);
}

const rows = [
  ...(await Promise.all(secondaryYears.map(secondaryRows))).flat(),
  ...(await Promise.all(officialYears.map(officialRows))).flat(),
].sort((a, b) => a.election_year - b.election_year || a.jurisdiction_name.localeCompare(b.jurisdiction_name));

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
console.log(JSON.stringify({ rows: rows.length, years: [2012, 2016, 2020], output, totals: totals(rows) }, null, 2));
