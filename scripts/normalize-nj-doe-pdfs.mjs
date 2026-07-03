import fs from "fs";
import Module from "module";
import path from "path";
import { createRequire } from "module";

Module._initPaths();
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const repoRoot = process.cwd();

const sourceUrls = {
  president: "https://www.nj.gov/state/elections/assets/pdf/election-results/2024/2024-official-general-results-president.pdf",
  senate: "https://www.nj.gov/state/elections/assets/pdf/election-results/2024/2024-official-general-results-us-senate.pdf",
  turnout: "https://www.nj.gov/state/elections/assets/pdf/election-results/2024/2024-official-general-voter-turnout.pdf",
};

const paths = {
  presidentPdf: path.join(repoRoot, "data", "nj-2024-official-general-results-president.pdf"),
  senatePdf: path.join(repoRoot, "data", "nj-2024-official-general-results-us-senate.pdf"),
  turnoutPdf: path.join(repoRoot, "data", "nj-2024-official-general-voter-turnout.pdf"),
  presidentCsv: path.join(repoRoot, "data", "nj-2024-general-president-county.csv"),
  senateCsv: path.join(repoRoot, "data", "nj-2024-general-senate-county.csv"),
  turnoutCsv: path.join(repoRoot, "data", "nj-2024-official-turnout-county.csv"),
  turnoutSummary: path.join(repoRoot, "data", "nj-2024-turnout-reconciliation-summary.json"),
};

const counties = [
  "ATLANTIC",
  "BERGEN",
  "BURLINGTON",
  "CAMDEN",
  "CAPE MAY",
  "CUMBERLAND",
  "ESSEX",
  "GLOUCESTER",
  "HUDSON",
  "HUNTERDON",
  "MERCER",
  "MIDDLESEX",
  "MONMOUTH",
  "MORRIS",
  "OCEAN",
  "PASSAIC",
  "SALEM",
  "SOMERSET",
  "SUSSEX",
  "UNION",
  "WARREN",
];

const countyDisplay = new Map(counties.map((county) => [county, `${titleCase(county)} County`]));
const countyPattern = new RegExp(`^(${counties.map(escapeRegex).sort((a, b) => b.length - a.length).join("|")})\\s+.+?\\s+([\\d,]+)$`);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(value) {
  return value
    .toLowerCase()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function intValue(value) {
  return Number(String(value ?? "0").replace(/,/g, ""));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, headers, rows) {
  const body = [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n");
  fs.writeFileSync(filePath, `${body}\n`, "utf8");
}

async function extractText(pdfPath) {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Missing official New Jersey PDF: ${pdfPath}`);
  }
  const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function candidateBucket(line, contest) {
  if (contest === "president") {
    if (/^KAMALA D\. HARRIS\b/.test(line)) return "harris";
    if (/^DONALD J\. TRUMP\b/.test(line)) return "trump";
    if (/^(JILL STEIN|ROBERT F\. KENNEDY JR\.|CHASE OLIVER|CLAUDIA DE LA CRUZ|RANDALL A\. TERRY|JOSEPH KISHORE|RACHELE FRUIT)\b/.test(line)) {
      return "other";
    }
  }
  if (contest === "senate") {
    if (/^ANDY KIM\b/.test(line)) return "comparison_dem";
    if (/^CURTIS BASHAW\b/.test(line)) return "comparison_rep";
    if (/^(CHRISTINA KHALIL|KENNETH R\. KAPLAN|PATRICIA G\. MOONEYHAM|JOANNE KUNIANSKY)\b/.test(line)) {
      return "comparison_other";
    }
  }
  return null;
}

function emptyRows(keys) {
  return new Map(
    counties.map((county) => [
      county,
      Object.fromEntries(keys.map((key) => [key, 0])),
    ]),
  );
}

function parseContestCountyRows(text, contest, keys, expectedTotals) {
  const rowsByCounty = emptyRows(keys);
  let bucket = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const nextBucket = candidateBucket(line, contest);
    if (nextBucket) {
      bucket = nextBucket;
      continue;
    }

    const match = line.match(countyPattern);
    if (!match) {
      continue;
    }
    if (!bucket) {
      throw new Error(`County tally encountered before candidate bucket in ${contest}: ${line}`);
    }
    const county = match[1];
    rowsByCounty.get(county)[bucket] += intValue(match[2]);
  }

  const totals = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const values of rowsByCounty.values()) {
    for (const key of keys) totals[key] += values[key];
  }
  for (const [key, expected] of Object.entries(expectedTotals)) {
    if (totals[key] !== expected) {
      throw new Error(`New Jersey ${contest} ${key} total mismatch: ${totals[key]} != ${expected}`);
    }
  }

  return counties.map((county) => ({
    state: "NJ",
    election_year: 2024,
    jurisdiction_name: countyDisplay.get(county),
    ...rowsByCounty.get(county),
  }));
}

function parseTurnoutRows(text) {
  const rowPattern = /^(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+(\d+)%\s+([\d,]+)$/;
  const rowsByCounty = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const match = line.match(rowPattern);
    if (!match || match[1].toUpperCase() === "TOTAL") {
      continue;
    }
    const countyKey = match[1].toUpperCase();
    if (!counties.includes(countyKey)) {
      continue;
    }
    rowsByCounty.set(countyKey, {
      state: "NJ",
      election_year: 2024,
      jurisdiction_code: `NJ-${String(counties.indexOf(countyKey) + 1).padStart(3, "0")}`,
      jurisdiction_name: countyDisplay.get(countyKey),
      county: countyDisplay.get(countyKey),
      local_unit: countyDisplay.get(countyKey),
      level: "county",
      ballots_cast: intValue(match[3]),
      registered_voters: intValue(match[2]),
      turnout_pct: Number(match[5]).toFixed(2),
      denominator_type: "registeredVoters",
      denominator_timing: "doeOfficialGeneralTurnout",
      denominator_note: "New Jersey DOE official General Election voter-turnout PDF county registered-voter denominator.",
      warning_required: "false",
      source_url: sourceUrls.turnout,
      source_title: "New Jersey DOE 2024 General Election voter turnout",
      source_status: "loaded",
      ballots_rejected: intValue(match[4]),
      election_districts: intValue(match[6]),
    });
  }

  const missing = counties.filter((county) => !rowsByCounty.has(county));
  if (missing.length) {
    throw new Error(`New Jersey turnout PDF missing counties: ${missing.join(", ")}`);
  }

  const rows = counties.map((county) => rowsByCounty.get(county));
  const totals = rows.reduce(
    (acc, row) => ({
      registeredVoters: acc.registeredVoters + row.registered_voters,
      ballotsCast: acc.ballotsCast + row.ballots_cast,
      ballotsRejected: acc.ballotsRejected + row.ballots_rejected,
      electionDistricts: acc.electionDistricts + row.election_districts,
    }),
    { registeredVoters: 0, ballotsCast: 0, ballotsRejected: 0, electionDistricts: 0 },
  );
  const expected = { registeredVoters: 6682699, ballotsCast: 4321921, ballotsRejected: 26600, electionDistricts: 6402 };
  for (const [key, value] of Object.entries(expected)) {
    if (totals[key] !== value) {
      throw new Error(`New Jersey turnout ${key} total mismatch: ${totals[key]} != ${value}`);
    }
  }
  return { rows, totals };
}

async function main() {
  const presidentText = await extractText(paths.presidentPdf);
  const senateText = await extractText(paths.senatePdf);
  const turnoutText = await extractText(paths.turnoutPdf);

  const presidentRows = parseContestCountyRows(
    presidentText,
    "president",
    ["trump", "harris", "other"],
    { trump: 1968215, harris: 2220713, other: 83797 },
  );
  const senateRows = parseContestCountyRows(
    senateText,
    "senate",
    ["comparison_rep", "comparison_dem", "comparison_other"],
    { comparison_rep: 1773589, comparison_dem: 2161491, comparison_other: 96715 },
  );
  const turnout = parseTurnoutRows(turnoutText);

  writeCsv(paths.presidentCsv, ["state", "election_year", "jurisdiction_name", "trump", "harris", "other"], presidentRows);
  writeCsv(paths.senateCsv, ["state", "election_year", "jurisdiction_name", "comparison_rep", "comparison_dem", "comparison_other"], senateRows);
  writeCsv(
    paths.turnoutCsv,
    [
      "state",
      "election_year",
      "jurisdiction_code",
      "jurisdiction_name",
      "county",
      "local_unit",
      "level",
      "ballots_cast",
      "registered_voters",
      "turnout_pct",
      "denominator_type",
      "denominator_timing",
      "denominator_note",
      "warning_required",
      "source_url",
      "source_title",
      "source_status",
      "ballots_rejected",
      "election_districts",
    ],
    turnout.rows,
  );

  const summary = {
    state: "NJ",
    electionYear: 2024,
    sourceAuthority: "New Jersey Department of State, Division of Elections",
    sourceUrl: sourceUrls.turnout,
    localArtifact: "data/nj-2024-official-turnout-county.csv",
    parser: "scripts/normalize-nj-doe-pdfs.mjs",
    reportingGrain: "county",
    officialDoeTotals: turnout.totals,
    eacFallbackTotals: {
      registeredVoters: 6630364,
      ballotsCast: 4321921,
    },
    deltasDoeMinusEac: {
      registeredVoters: turnout.totals.registeredVoters - 6630364,
      ballotsCast: turnout.totals.ballotsCast - 4321921,
    },
    caveat:
      "The official DOE county turnout PDF matches EAC fallback ballots cast but reports 52,335 more registered voters. Active NJ staging uses the DOE denominator with this reconciliation retained for review.",
  };
  fs.writeFileSync(paths.turnoutSummary, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        presidentRows: presidentRows.length,
        senateRows: senateRows.length,
        turnoutRows: turnout.rows.length,
        presidentTotal: 1968215 + 2220713 + 83797,
        senateTotal: 1773589 + 2161491 + 96715,
        turnoutTotals: turnout.totals,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
