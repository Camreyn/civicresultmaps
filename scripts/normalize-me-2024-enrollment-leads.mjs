import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUTPUT = "data/me-2024-registered-enrolled-denominator-leads.csv";
const SUMMARY = "data/me-2024-registered-enrolled-denominator-leads-summary.json";
const PARTY_COLUMNS = ["D", "G", "L", "NL", "R", "U"];
const EXPECTED_HEADERS = ["COUNTY", "MUNICIPALITY", "W/P", "CG", "SS", "SR", "CC", ...PARTY_COLUMNS, "TOTAL"];
const SOURCES = [
  {
    status: "active",
    sourceUrl: "https://www.maine.gov/sos/sites/maine.gov.sos/files/inline-files/Reg%20%26%20Enr%20as%20of%2011-5-24%20txt%20%28A%29.txt",
    localFile: "data/me-official-sources/me-2024-registered-enrolled-active-20241105.txt",
    expected: {
      sha256: "4099ebfdfe5c81b341f6dff4f227e93e7ee7ca23962ee41b629bb5d3bdcb5353",
      bytes: 39325,
      rows: 741,
      total: 1037570,
    },
  },
  {
    status: "inactive",
    sourceUrl: "https://www.maine.gov/sos/sites/maine.gov.sos/files/inline-files/Reg%20%26%20Enr%20as%20of%2011-5-24%20txt%20%28I%29.txt",
    localFile: "data/me-official-sources/me-2024-registered-enrolled-inactive-20241105.txt",
    expected: {
      sha256: "d01421f400bfd7ae5dfc2b22400830ade62434bd966f34e7b7729a31ef04f3c9",
      bytes: 35890,
      rows: 741,
      total: 185622,
    },
  },
];

function fail(message) {
  throw new Error(`Maine enrollment normalizer: ${message}`);
}

function csv(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function integer(value, context) {
  if (!/^\d+$/.test(value)) fail(`${context} must be a non-negative integer, received ${JSON.stringify(value)}`);
  return Number(value);
}

function parseSource(source) {
  const bytes = readFileSync(resolve(ROOT, source.localFile));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== source.expected.bytes || sha256 !== source.expected.sha256) {
    fail(`${source.localFile} source artifact hash/length drifted`);
  }
  const lines = bytes.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const header = lines.shift()?.split("|").filter((value, index, values) => !(index === values.length - 1 && value === ""));
  if (JSON.stringify(header) !== JSON.stringify(EXPECTED_HEADERS)) {
    fail(`${source.localFile} header drifted from the documented Maine SOS layout`);
  }

  const rows = [];
  const identities = new Set();
  for (const [index, line] of lines.entries()) {
    const values = line.split("|").filter((value, valueIndex, all) => !(valueIndex === all.length - 1 && value === ""));
    if (values.length !== EXPECTED_HEADERS.length) fail(`${source.localFile} line ${index + 2} has ${values.length} columns`);
    const raw = Object.fromEntries(EXPECTED_HEADERS.map((headerName, headerIndex) => [headerName, values[headerIndex]]));
    const identity = [raw.COUNTY, raw.MUNICIPALITY, raw["W/P"], raw.CG, raw.SS, raw.SR, raw.CC].join("|");
    if (identities.has(identity)) fail(`${source.localFile} duplicates source identity ${identity}`);
    identities.add(identity);
    const parties = Object.fromEntries(PARTY_COLUMNS.map((party) => [party, integer(raw[party], `${source.localFile} line ${index + 2} ${party}`)]));
    const total = integer(raw.TOTAL, `${source.localFile} line ${index + 2} TOTAL`);
    const partyTotal = Object.values(parties).reduce((sum, value) => sum + value, 0);
    if (partyTotal !== total) fail(`${source.localFile} line ${index + 2} party sum ${partyTotal} does not equal TOTAL ${total}`);
    rows.push({ ...source, ...raw, parties, total });
  }
  const sourceTotal = rows.reduce((sum, row) => sum + row.total, 0);
  if (rows.length !== source.expected.rows || sourceTotal !== source.expected.total) {
    fail(`${source.localFile} row count/total drifted from the reviewed source`);
  }
  return {
    source,
    sha256,
    bytes: bytes.length,
    rows,
  };
}

function parseEac() {
  const localFile = "data/eac-2024-state-turnout/me-2024-eac-turnout.csv";
  const lines = readFileSync(resolve(ROOT, localFile), "utf8").trim().split(/\r?\n/);
  const header = lines.shift().split(",");
  const positions = Object.fromEntries(header.map((name, index) => [name, index]));
  const rows = lines.map((line) => line.split(","));
  const usableRegistration = rows.filter((row) => Number(row[positions.registered_voters]) >= 0);
  const usableBallots = rows.filter((row) => Number(row[positions.ballots_cast]) >= 0);
  const rawBallotsCastSum = rows.reduce((sum, row) => sum + Number(row[positions.ballots_cast]), 0);
  const rawRegisteredVotersSum = rows.reduce((sum, row) => sum + Number(row[positions.registered_voters]), 0);
  return {
    localFile,
    rows: rows.length,
    usableRegistrationRows: usableRegistration.length,
    usableBallotsCastRows: usableBallots.length,
    negativeRegistrationRows: rows.length - usableRegistration.length,
    negativeBallotsCastRows: rows.length - usableBallots.length,
    rawBallotsCastSum,
    rawRegisteredVotersSum,
    ballotsCast: usableBallots.reduce((sum, row) => sum + Number(row[positions.ballots_cast]), 0),
    registeredVoters: usableRegistration.reduce((sum, row) => sum + Number(row[positions.registered_voters]), 0),
  };
}

function build() {
  const parsed = SOURCES.map(parseSource);
  const identitiesByStatus = Object.fromEntries(parsed.map(({ source, rows }) => [
    source.status,
    rows.map((row) => [row.COUNTY, row.MUNICIPALITY, row["W/P"], row.CG, row.SS, row.SR, row.CC].join("|")).sort(),
  ]));
  if (JSON.stringify(identitiesByStatus.active) !== JSON.stringify(identitiesByStatus.inactive)) {
    fail("active and inactive source identity sets do not match");
  }
  const outputRows = parsed.flatMap(({ source, rows }) => rows.map((row) => [
    "ME", "2024", "2024-11-05", source.status, row.COUNTY, row.MUNICIPALITY, row["W/P"], row.CG, row.SS, row.SR, row.CC,
    ...PARTY_COLUMNS.map((party) => row.parties[party]), row.total, source.localFile, source.sourceUrl,
  ]));
  const csvText = [
    "state,election_year,as_of_date,enrollment_status,county_code,municipality,ward_or_precinct,cg,ss,sr,cc,party_d,party_g,party_l,party_nl,party_r,party_u,total_enrolled,source_file,source_url",
    ...outputRows.map((row) => row.map(csv).join(",")),
    "",
  ].join("\n");
  const eac = parseEac();
  const totals = Object.fromEntries(parsed.map(({ source, rows }) => {
    const partyTotals = Object.fromEntries(PARTY_COLUMNS.map((party) => [party, rows.reduce((sum, row) => sum + row.parties[party], 0)]));
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    return [source.status, { rows: rows.length, partyTotals, total }];
  }));
  const active = totals.active.total;
  const inactive = totals.inactive.total;
  const summary = {
    state: "ME",
    electionYear: 2024,
    asOfDate: "2024-11-05",
    authority: "Maine Secretary of State",
    sourceTitle: "Maine SOS previous enrollment data for the November 5, 2024 General/Referendum Election",
    normalizer: "scripts/normalize-me-2024-enrollment-leads.mjs",
    normalizedArtifact: OUTPUT,
    sourceLayout: {
      rawHeader: EXPECTED_HEADERS,
      preservedKeys: ["COUNTY", "MUNICIPALITY", "W/P", "CG", "SS", "SR", "CC"],
      partyColumns: PARTY_COLUMNS,
      caveat: "CG, SS, SR, and CC are preserved using the SOS source-header labels; this normalizer does not expand or infer their meanings.",
    },
    inputs: parsed.map(({ source, sha256, bytes, rows }) => ({ ...source, sha256, bytes, rows: rows.length })),
    totals,
    eacFallbackReconciliation: {
      eac,
      activeEnrollmentMinusEacRegisteredVoters: active - eac.registeredVoters,
      activePlusInactiveEnrollmentMinusEacRegisteredVoters: active + inactive - eac.registeredVoters,
      caveat: "This is a statewide denominator comparison only. Maine SOS enrollment counts are not election-level ballots cast or voter participation, and their municipality/ward-or-precinct rows are not joined to EAC jurisdiction rows. The active EAC turnout package remains configured until compatible official ballots-cast or voter-participation data is collected and reconciled.",
    },
    caveats: [
      "Active and inactive enrollment files are separate Maine SOS denominator leads, not turnout rows.",
      "No ballots-cast, voter-history, or voter-participation field is present in these source files.",
      "These records are not map geometry and are not joined to local-reporting-unit geometry or certified result rows.",
    ],
  };
  return { csvText, summaryText: `${JSON.stringify(summary, null, 2)}\n` };
}

const { csvText, summaryText } = build();
if (process.argv.includes("--check")) {
  if (readFileSync(resolve(ROOT, OUTPUT), "utf8") !== csvText || readFileSync(resolve(ROOT, SUMMARY), "utf8") !== summaryText) fail("generated artifacts are not current; rerun this normalizer");
  process.stdout.write("Maine enrollment denominator leads are current.\n");
} else {
  writeFileSync(resolve(ROOT, OUTPUT), csvText);
  writeFileSync(resolve(ROOT, SUMMARY), summaryText);
  process.stdout.write(`Wrote ${OUTPUT} and ${SUMMARY}.\n`);
}
