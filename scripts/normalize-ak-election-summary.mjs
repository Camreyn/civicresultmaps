import fs from "fs";
import Module from "module";
import path from "path";
import { createRequire } from "module";

Module._initPaths();
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const repoRoot = process.cwd();
const sourceUrl = "https://www.elections.alaska.gov/results/24GENR/ElectionSummaryReport.pdf";
const paths = {
  sourcePdf: path.join(repoRoot, "data", "ak-2024-general-election-summary-report.pdf"),
  presidentCsv: path.join(repoRoot, "data", "ak-2024-general-president-statewide.csv"),
  houseCsv: path.join(repoRoot, "data", "ak-2024-general-us-house-statewide.csv"),
  inventoryJson: path.join(repoRoot, "data", "ak-2024-data-coverage-inventory.json"),
  requestMatrix: path.join(repoRoot, "data", "ak-2024-source-request-matrix.tsv"),
  officialResultsPageEvidence: path.join(repoRoot, "data", "ak-2024-official-results-page-evidence.json"),
};

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
    throw new Error(`Missing official Alaska PDF: ${pdfPath}`);
  }
  const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function lineVotes(text, pattern, label) {
  const match = text.match(pattern);
  if (!match) {
    throw new Error(`Could not find Alaska summary row: ${label}`);
  }
  return intValue(match[1]);
}

function buildRows(text) {
  const harris = lineVotes(text, /^Harris\/Walz\s+DEM\s+([\d,]+)\s+/m, "Harris/Walz");
  const trump = lineVotes(text, /^Trump\/Vance\s+REP\s+([\d,]+)\s+/m, "Trump/Vance");
  const presidentTotal = lineVotes(text, /West\/Abdullah\s+AUR\s+[\d,]+\s+[\d.]+%\s+Total Votes\s+([\d,]+)/m, "President total");
  const presidentOther = presidentTotal - harris - trump;

  const houseDem =
    lineVotes(text, /^Peltola,\s+Mary S\.\s+DEM\s+([\d,]+)\s+/m, "Peltola") +
    lineVotes(text, /^Hafner,\s+Eric\s+DEM\s+([\d,]+)\s+/m, "Hafner");
  const houseRep = lineVotes(text, /^Begich,\s+Nick\s+REP\s+([\d,]+)\s+/m, "Begich");
  const houseTotal = lineVotes(text, /Write-in\s+[\d,]+\s+[\d.]+%\s+Total Votes\s+([\d,]+)/m, "U.S. House total");
  const houseOther = houseTotal - houseDem - houseRep;

  const turnout = {
    ballotsCast: lineVotes(text, /Times Cast\s+([\d,]+)\s+\/\s+611,078\s+55\.80%/m, "Times Cast ballots"),
    registeredVoters: lineVotes(text, /Times Cast\s+340,981\s+\/\s+([\d,]+)\s+55\.80%/m, "Times Cast registered voters"),
  };

  const presidentRow = {
    state: "AK",
    election_year: 2024,
    jurisdiction_code: "AK-STATE",
    jurisdiction_name: "Alaska",
    level: "statewide",
    trump,
    harris,
    other: presidentOther,
  };
  const houseRow = {
    state: "AK",
    election_year: 2024,
    jurisdiction_name: "Alaska",
    local_unit: "Statewide",
    comparison_dem: houseDem,
    comparison_rep: houseRep,
    comparison_other: houseOther,
  };

  const expected = {
    harris: 140026,
    trump: 184458,
    presidentOther: 13693,
    presidentTotal: 338177,
    houseDem: 156245,
    houseRep: 159550,
    houseOther: 13760,
    houseTotal: 329555,
    ballotsCast: 340981,
    registeredVoters: 611078,
  };
  const actual = {
    harris,
    trump,
    presidentOther,
    presidentTotal,
    houseDem,
    houseRep,
    houseOther,
    houseTotal,
    ballotsCast: turnout.ballotsCast,
    registeredVoters: turnout.registeredVoters,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(`Alaska ${key} mismatch: ${actual[key]} != ${value}`);
    }
  }

  return { actual, houseRow, presidentRow };
}

function writeInventory(summary) {
  const inventory = {
    state: "AK",
    stateName: "Alaska",
    electionYear: 2024,
    checkedAt: "2026-07-03",
    authority: "Alaska Division of Elections; U.S. Election Assistance Commission; U.S. Census Bureau; Verified Voting",
    completionDecision: {
      decision: "remain_in_source_discovery_queue",
      reason:
        "AK has official statewide President and same-grain statewide U.S. House rows parsed from the Alaska Division of Elections summary report. Wave 21 confirmed the official results page links the 2024 General Election to an All Details route and describes Statement of Votes Cast PDFs as district/precinct reports for contests that did not require ranked-choice tabulation, but no retained official lower-grain federal artifact with same-grain President plus U.S. Representative first-choice rows is loaded. The staged review row is statewide only, so district/precinct advisory coverage, map joins, state-native turnout replacement, historical baselines, and normalized administration-context rows remain source-coverage gaps.",
    },
    loadedArtifacts: [
      {
        id: "ak-2024-general-election-summary-report",
        sourceTitle: "State of Alaska 2024 General Election Election Summary Report, official results",
        sourceUrl,
        localArtifact: "data/ak-2024-general-election-summary-report.pdf",
        parser: "scripts/normalize-ak-election-summary.mjs",
        reportingGrain: "statewide",
        expectedCounts: {
          presidentRows: 1,
          presidentTotalVotes: summary.presidentTotal,
          trump: summary.trump,
          harris: summary.harris,
          other: summary.presidentOther,
          comparisonRows: 1,
          comparisonContest: "U.S. Representative first-choice votes",
          comparisonDem: summary.houseDem,
          comparisonRep: summary.houseRep,
          comparisonOther: summary.houseOther,
          ballotsCast: summary.ballotsCast,
          registeredVoters: summary.registeredVoters,
        },
        caveat:
          "The official summary report exposes statewide federal contest totals and Times Cast turnout, but this pass did not confirm a script-readable official House-district or precinct President plus U.S. House result export. U.S. House is a ranked-choice statewide contest; the comparison row uses first-choice candidate totals by party and is statewide review context only.",
      },
      {
        id: "ak-2024-eac-turnout",
        sourceTitle: "U.S. EAC Election Administration and Voting Survey 2024 V2 turnout fallback",
        sourceUrl: "https://www.eac.gov/research-and-data/studies-and-reports",
        localArtifact: "data/eac-2024-state-turnout/ak-2024-eac-turnout.csv",
        parser: "eacTurnoutCsv",
        reportingGrain: "jurisdiction",
        expectedCounts: {
          turnoutRows: 1,
          ballotsCast: 340981,
          registeredVoters: 611078,
        },
        caveat:
          "EAC fallback turnout matches the Alaska summary report statewide Times Cast and registered-voter figures, but no lower-grain state-native turnout denominator package is loaded.",
      },
      {
        id: "ak-2024-official-results-page-evidence",
        sourceTitle: "Alaska Division of Elections official results page and 2024 General All Details/SOVC source-discovery evidence",
        sourceUrl: "https://www.elections.alaska.gov/election-results/",
        localArtifact: "data/ak-2024-official-results-page-evidence.json",
        parser: "coverageInventoryJson",
        reportingGrain: "source_discovery",
        expectedCounts: {
          loadedLowerGrainFederalRows: 0,
        },
        caveat:
          "The official results page confirms a 2024 General All Details route and describes Statements of Votes Cast as district/precinct reports, but the lower-grain SOVC/source files were not retained in this repo and U.S. Representative first-choice same-grain availability remains unconfirmed.",
      },
    ],
    sourceNeeds: [
      {
        id: "ak-house-district-or-precinct-results",
        neededArtifact:
          "Official House-district, precinct, or equivalent local reporting-unit rows for President and a same-grain comparison contest, preferably U.S. Representative first-choice votes.",
        blocker:
          "The official results page confirms a 2024 General All Details route and a Statement of Votes Cast follow-up path for district/precinct reports, but the retained official artifact is still the statewide Election Summary Report. Direct results/24GENR directory listing returned 403 Forbidden in this worker environment, and no official lower-grain President plus same-grain U.S. Representative first-choice artifact is loaded.",
      },
      {
        id: "ak-state-native-turnout-local-denominator",
        neededArtifact:
          "Official Alaska turnout and registration denominator rows at House-district, precinct, or another documented reporting grain with denominator timing.",
        blocker:
          "Only statewide Times Cast/registered-voter values were confirmed in the official summary report; active ETL keeps EAC fallback turnout rows.",
      },
      {
        id: "ak-historical-baselines",
        neededArtifact: "Official 2012, 2016, and 2020 Alaska presidential baseline rows at statewide and preferably House-district/local grain.",
        blocker:
          "Historical official source paths were not normalized in this pass; do not substitute secondary borough estimates for official Alaska Division of Elections rows.",
      },
      {
        id: "ak-admin-context",
        neededArtifact:
          "Official post-election audit, CVR availability, recount, incident, correction, litigation, and public-records request artifacts.",
        blocker:
          "Verified Voting equipment context is loaded, but Alaska audit/CVR/incident/correction/litigation records are not normalized.",
      },
    ],
    displayCaveats: [
      "Official Alaska result-page evidence now narrows the next request to the 2024 General All Details/SOVC district-precinct files, with explicit verification of whether U.S. Representative first-choice rows are available at the same grain as President.",
      "Current AK certified result and review rows are statewide only; the existing House District geometry cannot be joined to the staged result row.",
      "The statewide U.S. House comparison row is a ranked-choice first-choice contest summary, not a precinct or district scatter plot.",
      "Advisory indicators are source-review signals only and are not findings of fraud or misconduct.",
    ],
  };
  fs.writeFileSync(paths.inventoryJson, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
}

function writeRequestMatrix() {
  const rows = [
    [
      "id",
      "state",
      "priority",
      "needed_artifact",
      "official_source_or_request_path",
      "local_artifact_status",
      "blocker_or_caveat",
    ],
    [
      "ak-district-precinct-results",
      "AK",
      "high",
      "Official 2024 General All Details/SOVC House-district or precinct President plus U.S. House first-choice rows",
      "https://www.elections.alaska.gov/election-results/e/?id=24genr",
      "not_collected",
      "Election Summary Report is loaded, and the official All Details/SOVC route is documented, but no retained official district/precinct federal results artifact with same-grain U.S. Representative first-choice rows is loaded.",
    ],
    [
      "ak-local-turnout-denominator",
      "AK",
      "high",
      "Official local turnout/registration denominator rows with denominator timing",
      "https://www.elections.alaska.gov/election-results/e/?id=24genr",
      "not_collected",
      "Only statewide Times Cast and registered voters were confirmed from the official summary report; collect lower-grain turnout or registration rows from the All Details/SOVC path or records request before replacing EAC fallback.",
    ],
    [
      "ak-historical-baselines",
      "AK",
      "medium",
      "Official 2012/2016/2020 presidential baseline rows",
      "https://www.elections.alaska.gov/election-results/",
      "not_collected",
      "Historical source paths need collection and normalization before baseline rows are enabled.",
    ],
    [
      "ak-admin-context",
      "AK",
      "medium",
      "Audit, CVR availability, recount, incident, correction, litigation, and request-path records",
      "https://www.elections.alaska.gov/",
      "equipment_context_only",
      "Verified Voting equipment context is loaded; official Alaska administration-context rows are not normalized.",
    ],
  ];
  fs.writeFileSync(paths.requestMatrix, `${rows.map((row) => row.join("\t")).join("\n")}\n`, "utf8");
}

function writeOfficialResultsPageEvidence() {
  const evidence = {
    state: "AK",
    stateName: "Alaska",
    electionYear: 2024,
    checkedAt: "2026-07-03",
    sourceAuthority: "Alaska Division of Elections",
    sourceUrls: [
      "https://www.elections.alaska.gov/election-results/",
      "https://www.elections.alaska.gov/election-results/e/?id=24genr",
      sourceUrl,
    ],
    localArtifact: "data/ak-2024-official-results-page-evidence.json",
    reportingGrain: "source_discovery",
    parserOrNormalizationPath: "coverageInventoryJson",
    observations: [
      "The Alaska Division of Elections Election Results page says election-night results are posted until certification and directs users to Search Official Election Results for certified results.",
      "The official results page lists the 2024 General Election dated November 5, 2024 and links it to /election-results/e/?id=24genr.",
      "The election detail template describes Statements of Votes Cast PDFs as district and precinct reports for contests that did not require ranked-choice tabulation. This is a follow-up path for lower-grain President/local rows, but it is not proof that same-grain U.S. Representative first-choice rows are available.",
      "Direct access to https://www.elections.alaska.gov/results/24GENR/ returned 403 Forbidden in this worker environment, so companion files could not be enumerated by directory listing.",
      "The retained official Election Summary Report PDF remains the only loaded Alaska 2024 federal result source artifact in the repo and supports only statewide President and statewide U.S. Representative first-choice comparison rows.",
    ],
    expectedCounts: {
      loadedPresidentRows: 1,
      loadedReviewRows: 1,
      loadedTurnoutRows: 1,
      loadedLowerGrainFederalRows: 0,
    },
    caveats: [
      "Do not load secondary House-district tables as official Alaska Division of Elections rows without retaining the underlying official district or precinct SOVC/source artifact.",
      "Alaska U.S. Representative used ranked-choice voting in 2024, so any future lower-grain comparison package must document whether it contains first-choice rows and whether those rows are same-grain with President.",
      "This evidence artifact documents source-discovery state only; it is not a parser input for vote totals, turnout denominators, or advisory indicators.",
    ],
    confidence: "official_page_checked_lower_grain_artifact_not_collected",
  };
  fs.writeFileSync(paths.officialResultsPageEvidence, JSON.stringify(evidence, null, 2) + "\n", "utf8");
}

async function main() {
  const text = await extractText(paths.sourcePdf);
  const { actual, houseRow, presidentRow } = buildRows(text);

  writeCsv(paths.presidentCsv, ["state", "election_year", "jurisdiction_code", "jurisdiction_name", "level", "trump", "harris", "other"], [
    presidentRow,
  ]);
  writeCsv(paths.houseCsv, ["state", "election_year", "jurisdiction_name", "local_unit", "comparison_dem", "comparison_rep", "comparison_other"], [
    houseRow,
  ]);
  writeInventory(actual);
  writeRequestMatrix();
  writeOfficialResultsPageEvidence();

  console.log(
    JSON.stringify(
      {
        presidentRows: 1,
        houseRows: 1,
        presidentTotal: actual.presidentTotal,
        houseTotal: actual.houseTotal,
        ballotsCast: actual.ballotsCast,
        registeredVoters: actual.registeredVoters,
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
