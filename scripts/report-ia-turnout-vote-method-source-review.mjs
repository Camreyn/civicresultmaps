import fs from "fs";
import path from "path";
import JSZip from "jszip";

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, "etl", "state-configs", "ia.json");
const reportsDir = path.join(repoRoot, "data", "ia-2024-county-detailxml-reports");
const manifestPath = path.join(reportsDir, "manifest.json");
const outPath = path.join(repoRoot, "data", "ia-2024-turnout-vote-method-source-review.json");

function xmlUnescape(value) {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function attrs(fragment) {
  return Object.fromEntries(
    [...String(fragment ?? "").matchAll(/([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g)].map((match) => [
      match[1],
      xmlUnescape(match[2]),
    ]),
  );
}

function numberAttr(attributes, name) {
  const parsed = Number(attributes[name] ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumObjectValues(record) {
  return Object.values(record).reduce((sum, value) => sum + value, 0);
}

function countyDirName(county) {
  return String(county).replace(/[^A-Za-z0-9._ -]+/g, "").trim();
}

async function readDetailXml(county) {
  const zipPath = path.join(reportsDir, countyDirName(county), "detailxml.zip");
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const entry = zip.file("detail.xml");
  if (!entry) {
    throw new Error(`detail.xml not found in ${zipPath}`);
  }
  return entry.async("text");
}

function inspectCountyXml(xml, county) {
  const turnoutMatch = xml.match(/<VoterTurnout\b([^>]*)>([\s\S]*?)<\/VoterTurnout>/);
  if (!turnoutMatch) {
    throw new Error(`${county} detail.xml missing VoterTurnout`);
  }

  const turnoutAttrs = attrs(turnoutMatch[1]);
  const turnoutBlock = turnoutMatch[2];
  const turnoutPrecinctRows = [...turnoutBlock.matchAll(/<Precinct\b([^>]*)\/>/g)].map((match) => attrs(match[1]));

  let presidentContest = null;
  for (const match of xml.matchAll(/<Contest\b([^>]*)>([\s\S]*?)<\/Contest>/g)) {
    const contestAttrs = attrs(match[1]);
    if (contestAttrs.text === "President and Vice President") {
      presidentContest = { attrs: contestAttrs, body: match[2] };
      break;
    }
  }
  if (!presidentContest) {
    throw new Error(`${county} detail.xml missing President and Vice President contest`);
  }

  const voteTypeTotals = {};
  let presidentCandidateVotes = 0;
  let presidentVoteTypeVotes = 0;
  let presidentVoteTypePrecinctRows = 0;
  const choiceReconciliation = [];

  for (const choiceMatch of presidentContest.body.matchAll(/<Choice\b([^>]*)>([\s\S]*?)<\/Choice>/g)) {
    const choiceAttrs = attrs(choiceMatch[1]);
    const choiceTotalVotes = numberAttr(choiceAttrs, "totalVotes");
    let choiceVoteTypeVotes = 0;

    for (const voteTypeMatch of choiceMatch[2].matchAll(/<VoteType\b([^>]*)>([\s\S]*?)<\/VoteType>/g)) {
      const voteTypeAttrs = attrs(voteTypeMatch[1]);
      const voteTypeName = voteTypeAttrs.name || "Unknown";
      const votes = numberAttr(voteTypeAttrs, "votes");
      voteTypeTotals[voteTypeName] = (voteTypeTotals[voteTypeName] ?? 0) + votes;
      choiceVoteTypeVotes += votes;
      presidentVoteTypeVotes += votes;
      presidentVoteTypePrecinctRows += [...voteTypeMatch[2].matchAll(/<Precinct\b([^>]*)\/>/g)].length;
    }

    presidentCandidateVotes += choiceTotalVotes;
    choiceReconciliation.push({
      choice: choiceAttrs.text,
      party: choiceAttrs.party ?? "",
      totalVotes: choiceTotalVotes,
      voteTypeVotes: choiceVoteTypeVotes,
      delta: choiceVoteTypeVotes - choiceTotalVotes,
    });
  }

  return {
    county,
    presidentCandidateVotes,
    presidentVoteTypeVotes,
    presidentVoteTypePrecinctRows,
    voteTypeTotals,
    choiceReconciliation,
    turnout: {
      ballotsCast: turnoutPrecinctRows.reduce((sum, row) => sum + numberAttr(row, "ballotsCast"), 0),
      precinctRows: turnoutPrecinctRows.length,
      registeredVoters: turnoutPrecinctRows.reduce((sum, row) => sum + numberAttr(row, "totalVoters"), 0),
    },
  };
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const countyReports = [];

for (const countyEntry of manifest.counties) {
  const xml = await readDetailXml(countyEntry.county);
  countyReports.push(inspectCountyXml(xml, countyEntry.county));
}

const voteTypeTotals = {};
for (const report of countyReports) {
  for (const [method, votes] of Object.entries(report.voteTypeTotals)) {
    voteTypeTotals[method] = (voteTypeTotals[method] ?? 0) + votes;
  }
}

const presidentCandidateVotes = countyReports.reduce((sum, report) => sum + report.presidentCandidateVotes, 0);
const presidentVoteTypeVotes = countyReports.reduce((sum, report) => sum + report.presidentVoteTypeVotes, 0);
const activeTurnout = {
  rows: countyReports.reduce((sum, report) => sum + report.turnout.precinctRows, 0),
  ballotsCast: countyReports.reduce((sum, report) => sum + report.turnout.ballotsCast, 0),
  registeredVoters: countyReports.reduce((sum, report) => sum + report.turnout.registeredVoters, 0),
};

const mismatchedChoiceRows = countyReports.flatMap((report) =>
  report.choiceReconciliation
    .filter((row) => row.delta !== 0)
    .map((row) => ({
      county: report.county,
      ...row,
    })),
);

const sampleCounty = manifest.counties[0]?.county ?? "";
const sampleSourceUrlPath = sampleCounty ? path.join(reportsDir, countyDirName(sampleCounty), "source-url.txt") : "";
const sampleSourceUrl = sampleSourceUrlPath && fs.existsSync(sampleSourceUrlPath)
  ? fs.readFileSync(sampleSourceUrlPath, "utf8").trim()
  : "";

const publicVoteMethodPath = path.join(
  repoRoot,
  "data",
  "eac-2024-vote-methods",
  "ia-2024-eac-vote-methods.csv",
);

const report = {
  state: "IA",
  electionYear: 2024,
  checkedAt: "2026-07-05",
  sourceAuthority: "Iowa Secretary of State",
  submittedSourceUrl: "https://sos.iowa.gov/iowans/election-results-statistics",
  clarityResultsUrl: "https://electionresults.iowa.gov/IA/122322/web.345435/",
  localDetailXmlDirectory: "data/ia-2024-county-detailxml-reports",
  decision: "keep_current_clarity_turnout_and_do_not_load_vote_method_rows",
  reason:
    "The current public vote-method contract is EAC participation-method rows. Iowa Clarity VoteType rows are candidate contest-vote splits by method, while the active Iowa turnout source already uses the separate VoterTurnout ballotsCast and totalVoters fields.",
  submittedSourceReview: {
    result:
      "The official Iowa Secretary of State election results/statistics page lists 2024 General Election links for Official Canvass by County, Precinct Results by County - Excel Format, Turnout Report, Statistical Reports, Daily Absentee Statistics, and General Election County Precinct Audits.",
    sourceUse:
      "Use the page as an official SOS index and historical/statistical lead. The active machine-readable county detail XML package remains the source for current result, review, and turnout rows.",
  },
  enrCountySelectionRequirement: {
    result:
      "County detail XML reports are county-selected ENR/Clarity report ZIPs, not a single statewide detail XML file.",
    collector: "scripts/collect-ia-clarity-county-reports.mjs",
    countyManifest: "data/ia-2024-county-detailxml-reports/manifest.json",
    countyReports: manifest.counties.length,
    firstCountyElectionId: manifest.counties[0]?.electionId ?? "",
    lastCountyElectionId: manifest.counties[manifest.counties.length - 1]?.electionId ?? "",
    sampleSourceUrl,
  },
  activeTurnout,
  activeTurnoutMatchesConfig:
    activeTurnout.rows === config.turnout.expected.rowCount &&
    activeTurnout.rows === config.expected.turnoutRows &&
    activeTurnout.ballotsCast === 1672068 &&
    activeTurnout.registeredVoters === 1893715,
  officialClarityPresidentVoteTypeReview: {
    presidentCandidateVotes,
    presidentVoteTypeVotes,
    voteTypeTotals,
    voteTypeGroups: Object.keys(voteTypeTotals).sort(),
    voteTypeTotalsMatchCandidateVotes: presidentVoteTypeVotes === presidentCandidateVotes,
    voteTypeGroupSumMatchesCandidateVotes: sumObjectValues(voteTypeTotals) === presidentCandidateVotes,
    mismatchedChoiceRows,
    presidentVoteTypePrecinctRows: countyReports.reduce((sum, item) => sum + item.presidentVoteTypePrecinctRows, 0),
    deltaPresidentCandidateVotesVsActiveTurnoutBallotsCast: presidentCandidateVotes - activeTurnout.ballotsCast,
  },
  publicVoteMethodContract: {
    loader: "src/lib/vote-methods.ts",
    currentFilePattern: "data/eac-2024-vote-methods/<state>-<year>-eac-vote-methods.csv",
    iowaEacVoteMethodFileExists: fs.existsSync(publicVoteMethodPath),
    contractCaveat:
      "Workspace UI copy describes these rows as participation-method context and explicitly separates them from candidate-by-method data.",
  },
  caveats: [
    "Iowa VoteType rows reconcile to President candidate votes, but they are contest votes by candidate and method, not election-level ballots-cast turnout.",
    "President candidate votes are 8,562 below VoterTurnout ballotsCast, so VoteType rows cannot replace active turnout.",
    "Do not expose Iowa VoteType rows through the current EAC participation-method CSV/API contract unless a separate candidate-by-method contract and UI caveat are added.",
  ],
};

fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);
console.log(
  JSON.stringify(
    {
      decision: report.decision,
      activeTurnout,
      presidentCandidateVotes,
      voteTypeTotals,
      deltaPresidentCandidateVotesVsActiveTurnoutBallotsCast:
        report.officialClarityPresidentVoteTypeReview.deltaPresidentCandidateVotesVsActiveTurnoutBallotsCast,
    },
    null,
    2,
  ),
);
