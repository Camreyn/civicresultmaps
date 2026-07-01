import { mkdir, readFile, writeFile } from "node:fs/promises";

const state = "GA";
const sourceId = "ga-historical-presidential-media-export";
const output = "data/ga-historical-presidential-baseline.csv";

const years = [
  {
    year: 2012,
    sourceUrl: "https://results.sos.ga.gov/cdn/results/Georgia/export-2012NovGen.json",
    localFile: "data/ga-2012-official-results-export.json",
    demNeedles: ["OBAMA"],
    repNeedles: ["ROMNEY"],
    expected: { rows: 159, demVotes: 1773827, repVotes: 2078688, otherVotes: 45324, totalVotes: 3897839 },
  },
  {
    year: 2016,
    sourceUrl: "https://results.sos.ga.gov/cdn/results/Georgia/export-2016NovGen.json",
    localFile: "data/ga-2016-official-results-export.json",
    demNeedles: ["CLINTON"],
    repNeedles: ["TRUMP"],
    expected: { rows: 159, demVotes: 1877963, repVotes: 2089104, otherVotes: 125306, totalVotes: 4092373 },
  },
  {
    year: 2020,
    sourceUrl: "https://results.sos.ga.gov/cdn/results/Georgia/export-2020NovGen.json",
    localFile: "data/ga-2020-official-results-export.json",
    demNeedles: ["BIDEN"],
    repNeedles: ["TRUMP"],
    expected: { rows: 159, demVotes: 2474507, repVotes: 2461837, otherVotes: 62138, totalVotes: 4998482 },
  },
];

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function intValue(value) {
  const normalized = String(value ?? "").replace(/[^0-9-]/g, "");
  return normalized ? Number(normalized) : 0;
}

function countyName(value) {
  const name = String(value ?? "").trim();
  return name ? name.replace(/\s+County$/i, "") + " County" : "";
}

function bucketCandidate(name, demNeedles, repNeedles) {
  const normalized = String(name ?? "").toUpperCase();
  if (demNeedles.some((needle) => normalized.includes(needle))) return "dem";
  if (repNeedles.some((needle) => normalized.includes(needle))) return "rep";
  return "other";
}

function contest(payload) {
  const item = payload?.results?.ballotItems?.find((candidate) => /President of the United States/i.test(candidate?.name ?? ""));
  if (!item) {
    throw new Error("Missing statewide President of the United States contest");
  }
  return item;
}

function parseEntry(entry, payload) {
  const statewideContest = contest(payload);
  const statewideTotal = statewideContest.ballotOptions.reduce((sum, option) => sum + intValue(option.voteCount), 0);
  if (statewideTotal !== entry.expected.totalVotes) {
    throw new Error(`${entry.year} statewide total mismatch: expected ${entry.expected.totalVotes}, got ${statewideTotal}`);
  }

  const rows = [];
  for (const local of payload.localResults ?? []) {
    const county = countyName(local.name);
    if (!county) continue;
    const presidentialContest = local.ballotItems?.find((candidate) => /President of the United States/i.test(candidate?.name ?? ""));
    if (!presidentialContest) continue;

    const values = { dem: 0, other: 0, rep: 0, total: 0 };
    for (const option of presidentialContest.ballotOptions ?? []) {
      const votes = intValue(option.voteCount);
      values[bucketCandidate(option.name, entry.demNeedles, entry.repNeedles)] += votes;
      values.total += votes;
    }
    if (!values.total) continue;

    rows.push({
      state,
      election_year: entry.year,
      jurisdiction_name: county,
      county,
      local_unit: county,
      source_id: sourceId,
      source_level: "county",
      row_method: "georgiaMediaExportJsonCountyHistorical",
      source_url: entry.sourceUrl,
      dem_votes: values.dem,
      rep_votes: values.rep,
      other_votes: values.other,
      total_votes: values.total,
    });
  }

  const totals = rows.reduce(
    (sum, row) => ({
      rows: sum.rows + 1,
      demVotes: sum.demVotes + row.dem_votes,
      repVotes: sum.repVotes + row.rep_votes,
      otherVotes: sum.otherVotes + row.other_votes,
      totalVotes: sum.totalVotes + row.total_votes,
    }),
    { rows: 0, demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );

  for (const [key, expectedValue] of Object.entries(entry.expected)) {
    if (totals[key] !== expectedValue) {
      throw new Error(`${entry.year} expected ${key}=${expectedValue}, got ${totals[key]}`);
    }
  }

  return rows;
}

const rows = [];
for (const entry of years) {
  const payload = JSON.parse(await readFile(entry.localFile, "utf8"));
  rows.push(...parseEntry(entry, payload));
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
console.log(JSON.stringify({ rows: rows.length, years: years.map((entry) => entry.year), output }, null, 2));
