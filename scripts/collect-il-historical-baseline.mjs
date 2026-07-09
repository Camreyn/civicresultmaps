import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const SOURCE_CSV = path.join(
  repoRoot,
  "data",
  "il-2020-official-results",
  "58-120-PRESIDENT AND VICE PRESIDENT-2020GE.csv",
);
const OUT = path.join(repoRoot, "data", "il-historical-presidential-baseline.csv");
const SOURCE_ID = "il-2020-general-president-by-office";
const SOURCE_URL =
  "https://www.elections.il.gov/ElectionOperations/ElectionVoteTotals.aspx?ID=58";
const DIRECT_DOWNLOAD =
  "https://elections.il.gov/Downloads/ElectionOperations/ElectionResults/ByOffice/58/58-120-PRESIDENT%20AND%20VICE%20PRESIDENT-2020GE.csv";
const NON_CANDIDATE_ROWS = new Set(["OVER VOTES", "UNDER VOTES", "BLANK BALLOTS"]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  if (current.length || row.length) {
    row.push(current);
    if (row.some((value) => value !== "")) {
      rows.push(row);
    }
  }

  const header = rows.shift();
  return rows.map((values) =>
    Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])),
  );
}

function intValue(value) {
  return Number.parseInt(String(value ?? "").replace(/,/g, ""), 10) || 0;
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function candidateBucket(row) {
  const candidate = String(row.CandidateName ?? "").trim().toUpperCase();
  if (NON_CANDIDATE_ROWS.has(candidate)) {
    return null;
  }

  if (candidate.includes("BIDEN")) {
    return "dem";
  }
  if (candidate.includes("TRUMP")) {
    return "rep";
  }
  const party = String(row.PartyName ?? "").trim().toUpperCase();
  if (party.includes("DEMOCRATIC")) {
    return "dem";
  }
  if (party.includes("REPUBLICAN")) {
    return "rep";
  }
  return "other";
}

function isCountyJurisdiction(name) {
  return !/^CITY OF /i.test(String(name ?? "").trim());
}

const rows = parseCsv(fs.readFileSync(SOURCE_CSV, "utf8"));
const required = [
  "JurisName",
  "CandidateName",
  "ContestName",
  "PartyName",
  "VoteCount",
];
for (const field of required) {
  if (!Object.hasOwn(rows[0] ?? {}, field)) {
    throw new Error(`Illinois 2020 President CSV missing ${field}`);
  }
}

const totalsByJurisdiction = new Map();
for (const row of rows) {
  if (!isCountyJurisdiction(row.JurisName)) {
    continue;
  }

  const bucket = candidateBucket(row);
  if (!bucket) {
    continue;
  }

  const jurisdiction = String(row.JurisName ?? "").trim();
  const totals = totalsByJurisdiction.get(jurisdiction) ?? {
    jurisdiction,
    dem: 0,
    rep: 0,
    other: 0,
  };
  totals[bucket] += intValue(row.VoteCount);
  totalsByJurisdiction.set(jurisdiction, totals);
}

const outputRows = Array.from(totalsByJurisdiction.values())
  .map((row) => ({
    state: "IL",
    election_year: 2020,
    jurisdiction_name: row.jurisdiction,
    source_id: SOURCE_ID,
    source_level: "county",
    row_method: "illinoisByOfficePresidentCsvCountyAggregate",
    dem_votes: row.dem,
    rep_votes: row.rep,
    other_votes: row.other,
    total_votes: row.dem + row.rep + row.other,
    source_url: DIRECT_DOWNLOAD,
  }))
  .sort((left, right) => left.jurisdiction_name.localeCompare(right.jurisdiction_name));

const headers = [
  "state",
  "election_year",
  "jurisdiction_name",
  "source_id",
  "source_level",
  "row_method",
  "dem_votes",
  "rep_votes",
  "other_votes",
  "total_votes",
  "source_url",
];

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  `${headers.join(",")}\n${outputRows
    .map((row) => headers.map((header) => csvValue(row[header])).join(","))
    .join("\n")}\n`,
);

const metrics = outputRows.reduce(
  (acc, row) => {
    acc.dem += row.dem_votes;
    acc.rep += row.rep_votes;
    acc.other += row.other_votes;
    acc.total += row.total_votes;
    return acc;
  },
  { rows: outputRows.length, dem: 0, rep: 0, other: 0, total: 0 },
);

console.log(
  JSON.stringify(
    {
      sourceUrl: SOURCE_URL,
      directDownload: DIRECT_DOWNLOAD,
      output: path.relative(repoRoot, OUT).replaceAll("\\", "/"),
      ...metrics,
    },
    null,
    2,
  ),
);
