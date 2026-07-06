import fs from "fs";
import path from "path";

const repoRoot = process.cwd();
const exportPath = path.join(repoRoot, "data", "ga-2024-official-results-export.json");
const eacPath = path.join(repoRoot, "data", "eac-2024-state-turnout", "ga-2024-eac-turnout.csv");
const historicalFiles = [
  "ga-2012-official-results-export.json",
  "ga-2016-official-results-export.json",
  "ga-2020-official-results-export.json",
];
const outPath = path.join(repoRoot, "data", "ga-2024-turnout-vote-method-source-review.json");

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function sumField(rows, field) {
  return rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
}

function includesAnyRegistrationLikeField(value) {
  const text = JSON.stringify(value).toLowerCase();
  return ["registration", "registered", "turnout", "qualified voter", "active voter", "inactive voter"].some((needle) => text.includes(needle));
}

const mediaExport = JSON.parse(fs.readFileSync(exportPath, "utf8"));
const eacRows = parseCsv(fs.readFileSync(eacPath, "utf8"));
const president = mediaExport.results.ballotItems.find((item) => item.name === "President of the US");
if (!president) throw new Error("President of the US contest not found in Georgia media export");

const voteMethodTotals = {};
for (const option of president.ballotOptions) {
  for (const group of option.groupResults ?? []) {
    voteMethodTotals[group.groupName] = (voteMethodTotals[group.groupName] ?? 0) + Number(group.voteCount ?? 0);
  }
}

const presidentCandidateVotes = president.ballotOptions.reduce((sum, option) => sum + Number(option.voteCount ?? 0), 0);
const groupTotal = Object.values(voteMethodTotals).reduce((sum, value) => sum + value, 0);
const eacBallotsCast = sumField(eacRows, "ballots_cast");
const eacRegisteredVoters = sumField(eacRows, "registered_voters");
const historicalFieldScan = historicalFiles.map((file) => {
  const data = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", file), "utf8"));
  return {
    file: `data/${file}`,
    hasRegistrationLikeField: includesAnyRegistrationLikeField(data),
    topLevelKeys: Object.keys(data),
  };
});

const report = {
  state: "GA",
  electionYear: 2024,
  checkedAt: "2026-07-05",
  sourceAuthority: "Georgia Secretary of State",
  sourceUrl: "https://results.sos.ga.gov/results/public/Georgia",
  localExport: "data/ga-2024-official-results-export.json",
  decision: "keep_eac_fallback",
  reason: "The official Georgia SOS media export provides candidate result rows and vote-method candidate splits, but it does not expose registered-voter denominator or election-level ballots-cast fields. Historical SOS media exports likewise do not contain registration-like fields.",
  activeTurnoutSource: "data/eac-2024-state-turnout/ga-2024-eac-turnout.csv",
  eacFallback: {
    rows: eacRows.length,
    ballotsCast: eacBallotsCast,
    registeredVoters: eacRegisteredVoters,
  },
  officialMediaExport: {
    electionDate: mediaExport.electionDate,
    electionName: mediaExport.electionName,
    createdAt: mediaExport.createdAt,
    presidentCandidateVotes,
    presidentGroupResultVotes: groupTotal,
    voteMethodTotals,
    groupTotalsMatchCandidateVotes: groupTotal === presidentCandidateVotes,
    deltaPresidentVotesVsEacBallotsCast: presidentCandidateVotes - eacBallotsCast,
    exposesRegistrationLikeField: includesAnyRegistrationLikeField(mediaExport),
  },
  historicalMediaExportFieldScan: historicalFieldScan,
  caveats: [
    "Georgia groupResults are candidate votes by method for a contest, not all-ballot turnout by method.",
    "President candidate votes are 47,453 below EAC ballots cast, so they cannot replace election-level ballots-cast turnout.",
    "No registered-voter denominator or denominator timing field was found in the loaded 2024, 2020, 2016, or 2012 SOS media exports.",
  ],
};

fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);
console.log(JSON.stringify({ decision: report.decision, presidentCandidateVotes, eacBallotsCast, eacRegisteredVoters, voteMethodTotals }, null, 2));
