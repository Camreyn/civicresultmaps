import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const DATA_BASE = "https://voterportal.sos.la.gov/ElectionResults/ElectionResults/Data?blob=";

const ELECTIONS = [
  {
    year: 2016,
    electionDate: "2016-11-08",
    staticUrl: "https://voterportal.sos.la.gov/static/20161108/resultsRace/Presidential",
    raceId: "53898",
    blob: "20161108/csv/ByParish_53898.csv",
    rawOut: path.join(repoRoot, "data", "la-2016-general-president-by-parish.csv"),
    demNeedle: "Hillary Clinton",
    repNeedle: "Donald Trump",
    expected: {
      rows: 64,
      demVotes: 780154,
      repVotes: 1178638,
      otherVotes: 70240,
      totalVotes: 2029032,
    },
  },
  {
    year: 2020,
    electionDate: "2020-11-03",
    staticUrl: "https://voterportal.sos.la.gov/static/20201103/resultsRace/Presidential",
    raceId: "59568",
    blob: "20201103/csv/ByParish_59568.csv",
    rawOut: path.join(repoRoot, "data", "la-2020-general-president-by-parish.csv"),
    demNeedle: "Joseph R. Biden",
    repNeedle: "Donald J. Trump",
    expected: {
      rows: 64,
      demVotes: 856034,
      repVotes: 1255776,
      otherVotes: 36252,
      totalVotes: 2148062,
    },
  },
];

const NORMALIZED_OUT = path.join(repoRoot, "data", "la-historical-presidential-baseline.csv");
const SUMMARY_OUT = path.join(repoRoot, "data", "la-historical-presidential-baseline-summary.json");

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

function integer(value) {
  const cleaned = String(value ?? "").replace(/[^\d-]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

async function downloadCsv(election) {
  const response = await fetch(`${DATA_BASE}${encodeURIComponent(election.blob)}`);
  if (!response.ok) {
    throw new Error(`Louisiana ${election.year} ByParish CSV download failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
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

function assertExpected(rows, election) {
  const actual = summarize(rows);
  const mismatches = Object.entries(election.expected).filter(([key, value]) => actual[key] !== value);
  if (mismatches.length) {
    throw new Error(`Louisiana ${election.year} President totals mismatch: ${JSON.stringify({ expected: election.expected, actual })}`);
  }
  return actual;
}

function buildRows(csvText, election) {
  const [header, ...body] = parseCsv(csvText);
  const demIndex = header.findIndex((name) => name.includes(election.demNeedle));
  const repIndex = header.findIndex((name) => name.includes(election.repNeedle));
  if (demIndex === -1 || repIndex === -1) {
    throw new Error(`Louisiana ${election.year} CSV missing expected Democratic or Republican candidate columns`);
  }

  const voteIndexes = header.map((_, index) => index).filter((index) => index > 1);
  return body
    .filter((row) => String(row[1] ?? "").trim())
    .map((row) => {
      const parish = String(row[1] ?? "").trim();
      const dem = integer(row[demIndex]);
      const rep = integer(row[repIndex]);
      const other = voteIndexes.filter((index) => index !== demIndex && index !== repIndex).reduce((sum, index) => sum + integer(row[index]), 0);
      const total = dem + rep + other;
      return {
        state: "LA",
        election_year: election.year,
        jurisdiction_name: `${parish} Parish`,
        jurisdiction_code: "",
        source_id: `la-${election.year}-general-president-by-parish`,
        source_level: "county",
        row_method: "louisianaSosByParishPresidentCsv",
        dem_votes: dem,
        rep_votes: rep,
        other_votes: other,
        total_votes: total,
        source_url: election.staticUrl,
      };
    })
    .sort((left, right) => left.jurisdiction_name.localeCompare(right.jurisdiction_name));
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
for (const election of ELECTIONS) {
  const rawCsv = await downloadCsv(election);
  await writeFile(election.rawOut, rawCsv, "utf8");
  const rows = buildRows(rawCsv, election);
  const actual = assertExpected(rows, election);
  allRows.push(...rows);
  summaries.push({
    year: election.year,
    electionDate: election.electionDate,
    raceId: Number(election.raceId),
    sourceUrl: election.staticUrl,
    blob: election.blob,
    localRawCsv: path.relative(repoRoot, election.rawOut).replaceAll("\\", "/"),
    expected: actual,
  });
}

await writeFile(NORMALIZED_OUT, writeCsv([header, ...allRows.map((row) => header.map((name) => row[name]))]), "utf8");
await writeFile(
  SUMMARY_OUT,
  `${JSON.stringify(
    {
      sourceAuthority: "Louisiana Secretary of State",
      sourceUrls: summaries.map((item) => item.sourceUrl),
      dataBlobs: summaries.map((item) => item.blob),
      localRawCsvs: summaries.map((item) => item.localRawCsv),
      localNormalizedCsv: "data/la-historical-presidential-baseline.csv",
      parserOrNormalizationPath: "scripts/normalize-la-historical-presidential-baseline.mjs",
      reportingGrain: "parish/county-equivalent",
      contests: summaries,
      expected: summarize(allRows),
      caveats: [
        "The CSV blobs are official Louisiana Secretary of State election-results data for the 2016 and 2020 Presidential Electors races.",
        "Rows are parish-level county-equivalent historical baselines for jurisdictionTag flip joins, not 2024 certified-result rows.",
        "Official 2012 Louisiana presidential baselines remain uncollected in this pass.",
      ],
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Wrote ${NORMALIZED_OUT}`);
console.log(`Wrote ${SUMMARY_OUT}`);
for (const election of ELECTIONS) {
  console.log(`Wrote ${election.rawOut}`);
}
