import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const CONTESTS = [
  {
    year: 2016,
    electionDate: "2016-11-08",
    contestId: "4436",
    electionId: "17",
    sourceUrl: "https://historicalelectiondata.coloradosos.gov/contest/4436",
    downloadUrl: "https://historicalelectiondata.coloradosos.gov/api/download_contest/4436_list.csv?split_party=false",
    rawOut: path.join(repoRoot, "data", "co-2016-general-president-list.csv"),
    demPrefix: "Hillary Clinton",
    repPrefix: "Donald J. Trump",
    expected: {
      rows: 64,
      totalVotes: 2780247,
      demVotes: 1338870,
      repVotes: 1202484,
      otherVotes: 238893,
    },
  },
  {
    year: 2020,
    electionDate: "2020-11-03",
    contestId: "3640",
    electionId: "11",
    sourceUrl: "https://historicalelectiondata.coloradosos.gov/contest/3640",
    downloadUrl: "https://historicalelectiondata.coloradosos.gov/api/download_contest/3640_list.csv?split_party=false",
    rawOut: path.join(repoRoot, "data", "co-2020-general-president-list.csv"),
    demPrefix: "Joseph R. Biden",
    repPrefix: "Donald J. Trump",
    expected: {
      rows: 64,
      totalVotes: 3256980,
      demVotes: 1804352,
      repVotes: 1364607,
      otherVotes: 88021,
    },
  },
];

const NORMALIZED_OUT = path.join(repoRoot, "data", "co-historical-presidential-baseline.csv");
const SUMMARY_OUT = path.join(repoRoot, "data", "co-historical-presidential-baseline-summary.json");
const LEGACY_2020_OUT = path.join(repoRoot, "data", "co-2020-historical-presidential-baseline.csv");
const LEGACY_2020_SUMMARY_OUT = path.join(repoRoot, "data", "co-2020-historical-presidential-baseline-summary.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(rows) {
  return `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

function toRecords(rows) {
  const [header, ...body] = rows;
  return body
    .filter((row) => row.length === header.length)
    .map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""])));
}

function integer(value) {
  const cleaned = String(value ?? "").replace(/[^\d-]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

async function downloadRawCsv(contest) {
  const response = await fetch(contest.downloadUrl, {
    headers: { "X-Elstats-Tenant": "co" },
  });
  if (!response.ok) {
    throw new Error(`Colorado ${contest.year} President download failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function candidateBucket(record, contest) {
  const candidate = record.candidate_name ?? "";
  if (candidate.startsWith(contest.demPrefix)) {
    return "dem";
  }
  if (candidate.startsWith(contest.repPrefix)) {
    return "rep";
  }
  if (candidate === "Total Votes Cast" || candidate === "Total Ballots Cast") {
    return null;
  }
  return "other";
}

function buildHistoricalRows(records, contest) {
  const counties = new Map();
  for (const record of records) {
    if (
      record.contest_id !== contest.contestId ||
      record.election_id !== contest.electionId ||
      record.election_type !== "General" ||
      record.office_name !== "President" ||
      record.division_type !== "County" ||
      record.vote_channel !== ""
    ) {
      continue;
    }

    const bucket = candidateBucket(record, contest);
    if (!bucket) {
      continue;
    }

    const county = record.division_name;
    const current = counties.get(county) ?? { dem: 0, rep: 0, other: 0 };
    current[bucket] += integer(record.votes);
    counties.set(county, current);
  }

  return [...counties.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([county, values]) => {
      const total = values.dem + values.rep + values.other;
      return {
        state: "CO",
        election_year: contest.year,
        jurisdiction_name: `${county} County`,
        jurisdiction_code: "",
        source_id: `co-${contest.year}-general-president-list`,
        source_level: "county",
        row_method: "coloradoHistoricalElectionDataContestCsvCountyAggregate",
        dem_votes: values.dem,
        rep_votes: values.rep,
        other_votes: values.other,
        total_votes: total,
        source_url: contest.sourceUrl,
      };
    });
}

function summarize(rows) {
  return rows.reduce(
    (totals, row) => ({
      rows: totals.rows + 1,
      demVotes: totals.demVotes + Number(row.dem_votes),
      repVotes: totals.repVotes + Number(row.rep_votes),
      otherVotes: totals.otherVotes + Number(row.other_votes),
      totalVotes: totals.totalVotes + Number(row.total_votes),
    }),
    { rows: 0, demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );
}

function assertExpected(rows, contest) {
  const actual = summarize(rows);
  const mismatches = Object.entries(contest.expected).filter(([key, value]) => actual[key] !== value);
  if (mismatches.length) {
    throw new Error(`Colorado ${contest.year} President totals mismatch: ${JSON.stringify({ expected: contest.expected, actual })}`);
  }
  return actual;
}

const header = [
  "state",
  "election_year",
  "jurisdiction_name",
  "jurisdiction_code",
  "source_id",
  "source_level",
  "row_method",
  "dem_votes",
  "rep_votes",
  "other_votes",
  "total_votes",
  "source_url",
];

const allRows = [];
const summaries = [];
for (const contest of CONTESTS) {
  const rawCsv = await downloadRawCsv(contest);
  await writeFile(contest.rawOut, rawCsv, "utf8");

  const records = toRecords(parseCsv(rawCsv));
  const historicalRows = buildHistoricalRows(records, contest);
  const actual = assertExpected(historicalRows, contest);
  allRows.push(...historicalRows);
  summaries.push({
    year: contest.year,
    sourceUrl: contest.sourceUrl,
    downloadUrl: contest.downloadUrl,
    localRawCsv: path.relative(repoRoot, contest.rawOut).replaceAll("\\", "/"),
    contestId: Number(contest.contestId),
    electionId: Number(contest.electionId),
    electionDate: contest.electionDate,
    expected: actual,
  });
}

const combinedCsv = writeCsv([header, ...allRows.map((row) => header.map((name) => row[name]))]);
await writeFile(NORMALIZED_OUT, combinedCsv, "utf8");
await writeFile(LEGACY_2020_OUT, writeCsv([header, ...allRows.filter((row) => row.election_year === 2020).map((row) => header.map((name) => row[name]))]), "utf8");

const summary = {
  sourceAuthority: "Colorado Secretary of State",
  sourceUrls: summaries.map((item) => item.sourceUrl),
  localRawCsvs: summaries.map((item) => item.localRawCsv),
  localNormalizedCsv: "data/co-historical-presidential-baseline.csv",
  parserOrNormalizationPath: "scripts/normalize-co-historical-presidential-baseline.mjs",
  reportingGrain: "county",
  contests: summaries,
  expected: summarize(allRows),
  caveats: [
    "The Historical Election Data exports are official Colorado Secretary of State data for the 2016 and 2020 General Election President contests.",
    "The normalizer uses county rows with blank vote_channel values and excludes Total Votes Cast and Total Ballots Cast pseudocandidate rows.",
    "Rows are county historical baseline context for jurisdictionTag flip joins, not 2024 certified-result rows.",
    "Official 2012 Colorado historical presidential baselines remain uncollected in this pass.",
  ],
};

await writeFile(SUMMARY_OUT, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
await writeFile(
  LEGACY_2020_SUMMARY_OUT,
  `${JSON.stringify({
    ...summary,
    localNormalizedCsv: "data/co-2020-historical-presidential-baseline.csv",
    contests: summaries.filter((item) => item.year === 2020),
    expected: summaries.find((item) => item.year === 2020).expected,
    caveats: summary.caveats,
  }, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${NORMALIZED_OUT}`);
console.log(`Wrote ${SUMMARY_OUT}`);
for (const contest of CONTESTS) {
  console.log(`Wrote ${contest.rawOut}`);
}
