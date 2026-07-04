import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  checkedAt: "2026-07-04",
  dryRun: false,
  matrix: "data/nv-2024-county-source-request-matrix.tsv",
  out: "data/nv-2024-non-clark-county-request-packets.json",
};

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--checked-at") options.checkedAt = argv[++index];
    else if (arg === "--matrix") options.matrix = argv[++index];
    else if (arg === "--out") options.out = argv[++index];
    else if (arg === "--help") {
      console.log("Usage: node scripts/create-nv-county-request-packets.mjs [--checked-at YYYY-MM-DD] [--dry-run]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function readTsv(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  const [headerLine, ...lines] = fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = headerLine.split("\t");
  return lines.map((line) => Object.fromEntries(line.split("\t").map((value, index) => [headers[index], value])));
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function splitFields(value) {
  return String(value ?? "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function packetStatus(row) {
  if (row.jurisdiction === "Eureka County" && row.source_check_status.includes("wave24")) {
    return "official_page_rechecked_wave24_packet_ready_no_loaded_rows";
  }
  if (row.source_check_status.includes("no_parser_ready") || row.source_check_status.includes("no_2024_local_export") || row.source_check_status.includes("no_local_export")) {
    return "packet_ready_no_loaded_rows";
  }
  if (row.source_check_status.includes("public_records_request_path") || row.source_check_status.includes("public_records_request_form")) {
    return "public_records_packet_ready_no_loaded_rows";
  }
  if (row.source_check_status.includes("blocked") || row.source_check_status.includes("not_found")) {
    return "packet_ready_source_access_blocked";
  }
  return "packet_ready_needs_source_recheck";
}

function packetFromRow(row) {
  return {
    packetId: `nv-2024-local-${slug(row.jurisdiction)}`,
    jurisdiction: row.jurisdiction,
    custodian: row.custodian,
    officialSourceUrl: row.official_source_url,
    officialContactPath: row.official_contact_path,
    currentReviewStatus: row.local_review_status,
    sourceCheckStatus: row.source_check_status,
    currentSourceLead: {
      authority: row.custodian,
      url: row.official_source_url,
      status: row.source_check_status,
      finding: row.notes,
    },
    primaryRequest: row.request_path,
    requestedArtifacts: {
      result: splitFields(row.needed_result_artifacts),
      turnout: splitFields(row.needed_turnout_artifacts),
      geometry: splitFields(row.needed_geometry_artifacts),
      administration: splitFields(row.needed_admin_artifacts),
    },
    expectedFields: {
      result: splitFields(row.expected_result_fields),
      turnout: splitFields(row.expected_turnout_fields),
      geometry: splitFields(row.expected_geometry_fields),
      administration: splitFields(row.expected_admin_fields),
    },
    parserOrNormalizationPath: "future Nevada official local SOV/CVR result parser to localComparisonCsv after source totals reconcile",
    status: packetStatus(row),
  };
}

function buildPacketFile({ checkedAt, matrix }) {
  const rows = readTsv(matrix);
  const packets = rows.map(packetFromRow);
  const sourceStatuses = packets.reduce((counts, packet) => {
    counts[packet.status] = (counts[packet.status] ?? 0) + 1;
    return counts;
  }, {});
  return {
    state: "NV",
    stateName: "Nevada",
    electionYear: 2024,
    checkedAt,
    purpose:
      "Operational jurisdiction-by-jurisdiction request packets for Nevada jurisdictions outside the loaded Clark, Washoe, and Humboldt CVR review coverage. These packets are request/source tracking only; they do not load rows, promote production, or allege fraud or misconduct.",
    officialRouting: {
      nevadaSecretaryOfStateCountyClerkContacts:
        "https://www.nvsos.gov/sos/elections/voters/county-clerk-contact-information",
      nevadaSecretaryOfStateElectionResults:
        "https://www.nvsos.gov/SOSelectionPages/results/2024StateWideGeneral/ElectionSummary.aspx",
      silverStateElectionResults: "https://silverstateelection.nv.gov/",
      eurekaCountyElections: "https://www.eurekacountynv.gov/departments/clerk-recorder/elections/",
    },
    requestFields: [
      "official 2024 General Election precinct/local President rows",
      "official same-grain 2024 General Election United States Senator rows",
      "candidate, party, vote, total, blank, overvote, undervote, and none-of-these-candidates fields where available",
      "county, precinct, precinct portion, vote center, mail, early, provisional, and reporting-unit identifiers needed for joins",
      "ballots-cast or voter-participation rows at county or local reporting-unit grain",
      "registered-voter denominator, denominator timing, and active/inactive voter treatment",
      "map-ready precinct or precinct-portion geometry, or an official crosswalk matching result/CVR labels",
      "CVR availability or exports, post-election audit records, L&A test records, tabulator/EMS logs, custody records, incidents, corrections, recounts, and litigation records where public",
    ],
    normalizationRules: [
      "Do not load packet-produced rows until source authority, URL, local artifact path, reporting grain, parser path, expected row count, totals, caveats, and confidence notes are recorded.",
      "Reconcile parsed President and U.S. Senate local rows to the official county totals in data/nv-2024-statewide-general-president.csv and data/nv-2024-statewide-general-senate.csv before changing Nevada review rows.",
      "Treat turnout or registration rows as denominator leads only until ballots-cast semantics, denominator timing, inactive-voter treatment, and statewide totals are reconciled.",
      "Treat county pages that point to Silver State as official routing evidence, not as local review rows, unless a machine-readable local export or records production is retained.",
    ],
    sourceMatrixArtifact: matrix,
    packetCount: packets.length,
    sourceStatuses,
    packets,
  };
}

const options = parseArgs(process.argv);
const packetFile = buildPacketFile(options);

if (!options.dryRun) {
  const outPath = path.join(repoRoot, options.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(packetFile, null, 2)}\n`);
}

console.log(
  JSON.stringify(
    {
      checkedAt: packetFile.checkedAt,
      dryRun: options.dryRun,
      out: options.out,
      packetCount: packetFile.packetCount,
      sourceStatuses: packetFile.sourceStatuses,
    },
    null,
    2,
  ),
);
