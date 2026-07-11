import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const JURISDICTION = {
  state: "DC",
  name: "District of Columbia",
  geoid: "11001",
  tag: "county:11001",
  level: "county",
};

const SOURCES = [
  {
    year: 2016,
    id: "dc-2016-general-election-certified-results",
    url: "https://electionresults.dcboe.org/Downloads/Reports/November_8_2016_General_Election_Certified_Results.csv",
    localFile: "data/dc-2016-general-election-certified-results.csv",
    sha256: "2d18520c7be0f01fc5682935e7269230aed193ed8c9df8b4b0aa695e3f1893da",
    expected: {
      sourceRows: 8724,
      presidentRows: 1001,
      reportingUnits: 143,
      dem: 282830,
      rep: 12723,
      other: 15715,
      total: 311268,
      overvotes: 243,
      undervotes: 1064,
    },
  },
  {
    year: 2020,
    id: "dc-2020-general-election-certified-results",
    url: "https://electionresults.dcboe.org/Downloads/Reports/November_3_2020_General_Election_Certified_Results.csv",
    localFile: "data/dc-2020-general-election-certified-results.csv",
    sha256: "fe4d855fa5fe5b2b73155a58f0c7874d0e6dfe93d8f6e105bd9cfa6ff09b130e",
    expected: {
      sourceRows: 10502,
      presidentRows: 1008,
      reportingUnits: 144,
      dem: 317323,
      rep: 18586,
      other: 8447,
      total: 344356,
      overvotes: 0,
      undervotes: 0,
    },
  },
  {
    year: 2024,
    id: "dc-2024-general-election-certified-results",
    url: "https://electionresults.dcboe.org/Downloads/Reports/November_5_2024_General_Election_Certified_Results.csv",
    localFile: "data/dc-2024-general-election-certified-results.csv",
    sha256: "0156d194d452b5688cee45cae5d18316f26e20e6493c2dddd0c8b63b4c64fa4a",
    expected: {
      sourceRows: 9272,
      presidentRows: 864,
      reportingUnits: 144,
      dem: 294185,
      rep: 21076,
      other: 10608,
      total: 325869,
      overvotes: 460,
      undervotes: 2075,
    },
  },
];

const CURRENT_OUTPUT = "data/dc-2024-general-president-county-equivalent.csv";
const HISTORICAL_OUTPUT = "data/dc-historical-presidential-baseline.csv";
const SUMMARY_OUTPUT = "data/dc-presidential-normalization-summary.json";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseCsv(text) {
  const input = String(text).replace(/^\uFEFF/u, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("D.C. certified CSV ended inside a quoted field");
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

function headerKey(value) {
  return String(value ?? "").replace(/[^a-z0-9]/giu, "").toLowerCase();
}

function readRecords(bytes, localFile) {
  const [header, ...rows] = parseCsv(bytes.toString("utf8"));
  if (!header) throw new Error(`${localFile} is empty`);
  const keys = header.map(headerKey);
  const required = ["contestname", "precinctnumber", "candidate", "party", "votes"];
  const missing = required.filter((key) => !keys.includes(key));
  if (missing.length) throw new Error(`${localFile} is missing columns: ${missing.join(", ")}`);

  return rows.map((values, rowIndex) => {
    if (values.length !== keys.length) {
      throw new Error(`${localFile} row ${rowIndex + 2} has ${values.length} cells; expected ${keys.length}`);
    }
    return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
  });
}

function intText(value) {
  const cleaned = String(value ?? "").replace(/[^\d-]/gu, "");
  const number = Number.parseInt(cleaned || "0", 10);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`Invalid vote value: ${value}`);
  return number;
}

function cleanLabel(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function assertExpected(label, actual, expected) {
  const mismatches = Object.fromEntries(
    Object.entries(expected)
      .filter(([key, value]) => actual[key] !== value)
      .map(([key, value]) => [key, { actual: actual[key], expected: value }]),
  );
  if (Object.keys(mismatches).length) {
    throw new Error(`${label} reconciliation failed: ${JSON.stringify(mismatches)}`);
  }
}

function normalizeSource(source) {
  const bytes = readFileSync(source.localFile);
  const sourceSha256 = sha256(bytes);
  if (sourceSha256 !== source.sha256) {
    throw new Error(`${source.localFile} SHA-256 ${sourceSha256} does not match reviewed hash ${source.sha256}`);
  }

  const records = readRecords(bytes, source.localFile);
  const presidentRows = records.filter((row) => /ELECTORS OF PRESIDENT/iu.test(cleanLabel(row.contestname)));
  const reportingUnits = new Set(presidentRows.map((row) => cleanLabel(row.precinctnumber)).filter(Boolean));
  const totals = { dem: 0, rep: 0, other: 0, total: 0, overvotes: 0, undervotes: 0 };

  for (const row of presidentRows) {
    const candidate = cleanLabel(row.candidate);
    const candidateKey = candidate.toUpperCase();
    const votes = intText(row.votes);
    if (candidateKey === "OVER VOTES" || candidateKey === "OVERVOTES") {
      totals.overvotes += votes;
      continue;
    }
    if (candidateKey === "UNDER VOTES" || candidateKey === "UNDERVOTES") {
      totals.undervotes += votes;
      continue;
    }
    if (!candidate) throw new Error(`${source.localFile} has a blank presidential candidate row`);

    const party = cleanLabel(row.party).toUpperCase();
    const bucket = party === "DEM" ? "dem" : party === "REP" ? "rep" : "other";
    totals[bucket] += votes;
    totals.total += votes;
  }

  const actual = {
    sourceRows: records.length,
    presidentRows: presidentRows.length,
    reportingUnits: reportingUnits.size,
    ...totals,
  };
  assertExpected(`${source.year} D.C. certified presidential totals`, actual, source.expected);
  return { source, sourceSha256, ...actual };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path, columns, rows) {
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvEscape(row[column])).join(","));
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

const normalized = SOURCES.map(normalizeSource);
const current = normalized.find((entry) => entry.source.year === 2024);
if (!current) throw new Error("Missing D.C. 2024 certified result source");

writeCsv(
  CURRENT_OUTPUT,
  ["state", "election_year", "jurisdiction_name", "jurisdiction_code", "level", "trump", "harris", "other"],
  [
    {
      state: JURISDICTION.state,
      election_year: 2024,
      jurisdiction_name: JURISDICTION.name,
      jurisdiction_code: JURISDICTION.geoid,
      level: JURISDICTION.level,
      trump: current.rep,
      harris: current.dem,
      other: current.other,
    },
  ],
);

writeCsv(
  HISTORICAL_OUTPUT,
  [
    "state",
    "election_year",
    "jurisdiction_name",
    "jurisdiction_geoid",
    "jurisdiction_tag",
    "source_id",
    "source_level",
    "row_method",
    "dem_votes",
    "rep_votes",
    "other_votes",
    "total_votes",
    "source_url",
    "source_display_name",
    "source_jurisdiction_name",
  ],
  normalized
    .filter((entry) => entry.source.year !== 2024)
    .map((entry) => ({
      state: JURISDICTION.state,
      election_year: entry.source.year,
      jurisdiction_name: JURISDICTION.name,
      jurisdiction_geoid: JURISDICTION.geoid,
      jurisdiction_tag: JURISDICTION.tag,
      source_id: "dc-historical-presidential-baseline",
      source_level: JURISDICTION.level,
      row_method: "dcBoeCertifiedPrecinctCsvCountyEquivalentAggregate",
      dem_votes: entry.dem,
      rep_votes: entry.rep,
      other_votes: entry.other,
      total_votes: entry.total,
      source_url: entry.source.url,
      source_display_name: JURISDICTION.name,
      source_jurisdiction_name: JURISDICTION.name,
    })),
);

const summary = {
  state: JURISDICTION.state,
  authority: "District of Columbia Board of Elections",
  parser: "scripts/normalize-dc-certified-results.mjs",
  reportingGrain: "official precinct rows aggregated to the single Census county-equivalent",
  jurisdiction: JURISDICTION,
  sources: normalized.map((entry) => ({
    year: entry.source.year,
    id: entry.source.id,
    url: entry.source.url,
    localFile: entry.source.localFile,
    sha256: entry.sourceSha256,
    sourceRows: entry.sourceRows,
    presidentRows: entry.presidentRows,
    reportingUnits: entry.reportingUnits,
    candidateVotes: { dem: entry.dem, rep: entry.rep, other: entry.other, total: entry.total },
    excludedNonCandidateMarks: { overvotes: entry.overvotes, undervotes: entry.undervotes },
  })),
  outputs: {
    current: { localFile: CURRENT_OUTPUT, rowCount: 1, sha256: sha256(readFileSync(CURRENT_OUTPUT)) },
    historical: { localFile: HISTORICAL_OUTPUT, rowCount: 2, years: [2016, 2020], sha256: sha256(readFileSync(HISTORICAL_OUTPUT)) },
  },
  caveats: [
    "D.C. is a single Census county-equivalent (GEOID 11001); precinct rows are aggregated without inventing sub-county FIPS codes.",
    "Overvotes and undervotes are retained in reconciliation metrics but excluded from candidate-vote totals.",
    "Historical rows are contextual presidential baselines for canonical jurisdictionTag joins.",
  ],
};

writeFileSync(SUMMARY_OUTPUT, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ current: summary.outputs.current, historical: summary.outputs.historical }));
