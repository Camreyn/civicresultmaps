import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SOURCE_URL = "https://historicalelectiondata.coloradosos.gov/contest/3640";
const DOWNLOAD_URL = "https://historicalelectiondata.coloradosos.gov/api/download_contest/3640_list.csv?split_party=false";
const RAW_OUT = path.join(repoRoot, "data", "co-2020-general-president-list.csv");
const NORMALIZED_OUT = path.join(repoRoot, "data", "co-2020-historical-presidential-baseline.csv");
const SUMMARY_OUT = path.join(repoRoot, "data", "co-2020-historical-presidential-baseline-summary.json");

const EXPECTED = {
  rows: 64,
  totalVotes: 3256980,
  demVotes: 1804352,
  repVotes: 1364607,
  otherVotes: 88021,
};

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

async function downloadRawCsv() {
  const response = await fetch(DOWNLOAD_URL, {
    headers: { "X-Elstats-Tenant": "co" },
  });
  if (!response.ok) {
    throw new Error(`Colorado 2020 President download failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function candidateBucket(record) {
  const candidate = record.candidate_name ?? "";
  if (candidate.startsWith("Joseph R. Biden")) {
    return "dem";
  }
  if (candidate.startsWith("Donald J. Trump")) {
    return "rep";
  }
  if (candidate === "Total Votes Cast" || candidate === "Total Ballots Cast") {
    return null;
  }
  return "other";
}

function buildHistoricalRows(records) {
  const counties = new Map();
  for (const record of records) {
    if (
      record.contest_id !== "3640" ||
      record.election_id !== "11" ||
      record.election_type !== "General" ||
      record.office_name !== "President" ||
      record.division_type !== "County" ||
      record.vote_channel !== ""
    ) {
      continue;
    }

    const bucket = candidateBucket(record);
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
        election_year: 2020,
        jurisdiction_name: `${county} County`,
        jurisdiction_code: "",
        source_id: "co-2020-general-president-list",
        source_level: "county",
        row_method: "coloradoHistoricalElectionDataContestCsvCountyAggregate",
        dem_votes: values.dem,
        rep_votes: values.rep,
        other_votes: values.other,
        total_votes: total,
        source_url: SOURCE_URL,
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

function assertExpected(rows) {
  const actual = summarize(rows);
  const mismatches = Object.entries(EXPECTED).filter(([key, value]) => actual[key] !== value);
  if (mismatches.length) {
    throw new Error(`Colorado 2020 President totals mismatch: ${JSON.stringify({ expected: EXPECTED, actual })}`);
  }
  return actual;
}

const rawCsv = await downloadRawCsv();
await writeFile(RAW_OUT, rawCsv, "utf8");

const records = toRecords(parseCsv(rawCsv));
const historicalRows = buildHistoricalRows(records);
const actual = assertExpected(historicalRows);

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

await writeFile(NORMALIZED_OUT, writeCsv([header, ...historicalRows.map((row) => header.map((name) => row[name]))]), "utf8");

await writeFile(
  SUMMARY_OUT,
  `${JSON.stringify(
    {
      sourceAuthority: "Colorado Secretary of State",
      sourceUrl: SOURCE_URL,
      downloadUrl: DOWNLOAD_URL,
      localRawCsv: "data/co-2020-general-president-list.csv",
      localNormalizedCsv: "data/co-2020-historical-presidential-baseline.csv",
      parserOrNormalizationPath: "scripts/normalize-co-historical-presidential-baseline.mjs",
      contestId: 3640,
      electionId: 11,
      electionDate: "2020-11-03",
      reportingGrain: "county",
      expected: actual,
      caveats: [
        "The Historical Election Data export is official Colorado Secretary of State data for the 2020 General Election President contest.",
        "The normalizer uses county rows with blank vote_channel values and excludes Total Votes Cast and Total Ballots Cast pseudocandidate rows.",
        "Rows are county historical baseline context for 2020-to-2024 flip joins, not 2024 certified-result rows.",
        "Official 2012 and 2016 Colorado historical presidential baselines remain uncollected in this pass.",
      ],
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Wrote ${RAW_OUT}`);
console.log(`Wrote ${NORMALIZED_OUT}`);
console.log(`Wrote ${SUMMARY_OUT}`);
