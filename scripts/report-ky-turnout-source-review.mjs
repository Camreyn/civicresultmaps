import fs from "node:fs";
import path from "node:path";

const OUT = "data/ky-2024-turnout-source-review.json";
const RECONCILIATION_SUMMARY = "data/ky-2024-turnout-registration-reconciliation-summary.json";
const RECAP_PDF_DIR = "data/ky-2024-general-recap-sheets";
const RECAP_TEXT_DIR = "data/ky-2024-general-recap-text";
const EAC_TURNOUT_CSV = "data/eac-2024-state-turnout/ky-2024-eac-turnout.csv";

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

function countFiles(dir, extension) {
  return fs.readdirSync(dir).filter((file) => file.toLowerCase().endsWith(extension)).length;
}

const reconciliation = JSON.parse(fs.readFileSync(RECONCILIATION_SUMMARY, "utf8"));
const eacRows = parseCsv(fs.readFileSync(EAC_TURNOUT_CSV, "utf8"));
const eacTotals = eacRows.reduce(
  (acc, row) => {
    acc.rows += 1;
    acc.ballotsCast += intValue(row.ballots_cast);
    acc.registeredVoters += intValue(row.registered_voters);
    return acc;
  },
  { rows: 0, ballotsCast: 0, registeredVoters: 0 },
);

const recapPdfCount = countFiles(RECAP_PDF_DIR, ".pdf");
const recapTextCount = countFiles(RECAP_TEXT_DIR, ".txt");

const expected = {
  counties: 120,
  stateBoardNumberVoting: 2086320,
  eacBallotsCast: 2086090,
  registeredVoters: 3548136,
  stateBoardMinusEacBallotsCastDelta: 230,
};

const mismatches = [
  ["recapPdfCount", recapPdfCount, expected.counties],
  ["recapTextCount", recapTextCount, expected.counties],
  ["reconciliation.rowCount", reconciliation.rowCount, expected.counties],
  [
    "reconciliation.stateBoardTurnoutTotals.numberVoting",
    reconciliation.stateBoardTurnoutTotals.numberVoting,
    expected.stateBoardNumberVoting,
  ],
  ["eacTotals.rows", eacTotals.rows, expected.counties],
  ["eacTotals.ballotsCast", eacTotals.ballotsCast, expected.eacBallotsCast],
  ["eacTotals.registeredVoters", eacTotals.registeredVoters, expected.registeredVoters],
  [
    "reconciliation.deltas.ballotsCastStateBoardMinusEac",
    reconciliation.deltas.ballotsCastStateBoardMinusEac,
    expected.stateBoardMinusEacBallotsCastDelta,
  ],
].filter(([, actual, wanted]) => actual !== wanted);

if (mismatches.length) {
  throw new Error(`Kentucky turnout source review totals mismatch: ${JSON.stringify(mismatches)}`);
}

const review = {
  state: "KY",
  electionYear: 2024,
  generatedAt: "2026-07-06",
  sourceAuthority: "Kentucky State Board of Elections; U.S. Election Assistance Commission",
  submittedResultsSourceUrl: "https://elect.ky.gov/results/Pages/default.aspx",
  officialRecapSheetsUrl:
    "https://elect.ky.gov/results/2020-2029/Pages/2024General-Recap-Sheets.aspx",
  turnoutPageUrl: reconciliation.turnoutPageUrl,
  registrationPageUrl: reconciliation.registrationPageUrl,
  localArtifactsReviewed: [
    "data/ky-2024-general-recap-sheets.html",
    RECAP_PDF_DIR,
    RECAP_TEXT_DIR,
    "data/ky-2024-general-turnout-by-county.pdf",
    "data/ky-2024-general-turnout-by-precinct.pdf",
    "data/ky-2024-general-registration-by-county.pdf",
    "data/ky-2024-general-registration-by-precinct.pdf",
    "data/ky-2024-turnout-registration-reconciliation.csv",
    RECONCILIATION_SUMMARY,
    EAC_TURNOUT_CSV,
  ],
  reportingGrainReviewed: {
    certifiedResults: "county_and_precinct_recap_pdf_rows",
    turnoutReplacementCandidate: "county_turnout_and_registration_pdf_rows",
    activeTurnout: "county_jurisdiction_eac_fallback",
  },
  countyResultDownloads: {
    recapPdfCount,
    recapTextCount,
    canReplaceEacFallbackTurnout: false,
    reason:
      "The county recap downloads are official result/review artifacts. They do not provide election-level ballots-cast turnout or registered-voter denominator fields, so they cannot replace the active EAC turnout package.",
  },
  turnoutRegistrationPdfReconciliation: {
    rowCount: reconciliation.rowCount,
    stateBoardNumberVoting: reconciliation.stateBoardTurnoutTotals.numberVoting,
    stateBoardRegisteredVoters: reconciliation.stateBoardTurnoutTotals.registeredVoters,
    registrationPdfPrecinctCount: reconciliation.registrationPdfTotals.precinctCount,
    eacBallotsCast: reconciliation.eacTotals.ballotsCast,
    eacRegisteredVoters: reconciliation.eacTotals.registeredVoters,
    ballotsCastStateBoardMinusEac: reconciliation.deltas.ballotsCastStateBoardMinusEac,
    registeredVotersStateBoardMinusEac:
      reconciliation.deltas.registeredVotersStateBoardMinusEac,
    rowsWithBallotDelta: reconciliation.deltas.rowsWithBallotDelta,
  },
  eacFallbackTotals: eacTotals,
  decision: "keep_eac_fallback",
  caveats: [
    "The Kentucky results archive points users to certified/amended certification and official county recap sheets, while the page dashboard itself is labeled unofficial.",
    "County recap PDFs are valid official result and review artifacts, but they are not turnout or registration denominator artifacts.",
    "The State Board county turnout and registration PDFs reconcile to the same 3,548,136 registered-voter denominator as EAC, but the State Board voter total is 230 higher than EAC ballots cast across 85 counties.",
    "The State Board turnout page says turnout reports are unofficial and may differ from election results because they are run after voter-registration rolls reopen.",
    "County-clerk official turnout documentation or source-side replacement semantics are still needed before changing etl/state-configs/ky.json away from eacTurnoutCsv.",
  ],
  nextAction:
    "Keep EAC fallback active. Use Kentucky county clerks or State Board source-side documentation to confirm official turnout replacement semantics before adding a state-native active turnout parser.",
  confidence: "reviewed_not_valid_turnout_replacement",
};

fs.writeFileSync(OUT, `${JSON.stringify(review, null, 2)}\n`, "utf8");
console.log(`Wrote ${OUT}`);
console.log(
  JSON.stringify(
    {
      decision: review.decision,
      recapPdfCount,
      stateBoardNumberVoting: review.turnoutRegistrationPdfReconciliation.stateBoardNumberVoting,
      eacBallotsCast: review.turnoutRegistrationPdfReconciliation.eacBallotsCast,
      ballotsCastStateBoardMinusEac:
        review.turnoutRegistrationPdfReconciliation.ballotsCastStateBoardMinusEac,
    },
    null,
    2,
  ),
);
