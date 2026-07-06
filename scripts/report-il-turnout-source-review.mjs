import fs from "node:fs";
import path from "node:path";

const PRESIDENT_CSV =
  "data/il-2024-official-results/66-120-PRESIDENT AND VICE PRESIDENT-2024GE.csv";
const EAC_TURNOUT_CSV = "data/eac-2024-state-turnout/il-2024-eac-turnout.csv";
const OUT = "data/il-2024-turnout-source-review.json";

const NON_CANDIDATE_ROWS = new Set(["Over Votes", "Under Votes", "Blank Ballots"]);

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

function readCsv(file) {
  return parseCsv(fs.readFileSync(file, "utf8"));
}

function intValue(value) {
  return Number.parseInt(String(value ?? "").replace(/,/g, ""), 10) || 0;
}

function normalizeJurisdiction(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+COUNTY$/i, "")
    .toUpperCase();
}

const presidentRows = readCsv(PRESIDENT_CSV);
const eacRows = readCsv(EAC_TURNOUT_CSV);

const precincts = new Map();
const requiredFields = [
  "JurisdictionID",
  "JurisName",
  "CandidateName",
  "ContestName",
  "PrecinctName",
  "Registration",
  "VoteCount",
];

for (const field of requiredFields) {
  if (!Object.hasOwn(presidentRows[0] ?? {}, field)) {
    throw new Error(`Illinois President CSV missing ${field}`);
  }
}

for (const row of presidentRows) {
  const key = [row.JurisdictionID, row.JurisName, row.PrecinctName].join("\t");
  if (!precincts.has(key)) {
    precincts.set(key, {
      jurisdictionId: row.JurisdictionID,
      jurisdictionName: row.JurisName,
      precinctName: row.PrecinctName,
      registration: intValue(row.Registration),
      candidateVotes: 0,
      contestTotalIncludingNonCandidateRows: 0,
      overVotes: 0,
      underVotes: 0,
      blankBallots: 0,
    });
  }

  const precinct = precincts.get(key);
  const votes = intValue(row.VoteCount);
  precinct.contestTotalIncludingNonCandidateRows += votes;

  if (row.CandidateName === "Over Votes") {
    precinct.overVotes += votes;
  } else if (row.CandidateName === "Under Votes") {
    precinct.underVotes += votes;
  } else if (row.CandidateName === "Blank Ballots") {
    precinct.blankBallots += votes;
  } else if (!NON_CANDIDATE_ROWS.has(row.CandidateName)) {
    precinct.candidateVotes += votes;
  }
}

const officialJurisdictions = new Map();
for (const precinct of precincts.values()) {
  const key = normalizeJurisdiction(precinct.jurisdictionName);
  const jurisdiction = officialJurisdictions.get(key) ?? {
    jurisdictionName: precinct.jurisdictionName,
    precincts: 0,
    zeroRegistrationPrecincts: 0,
    registration: 0,
    candidateVotes: 0,
    contestTotalIncludingNonCandidateRows: 0,
  };
  jurisdiction.precincts += 1;
  if (precinct.registration === 0) {
    jurisdiction.zeroRegistrationPrecincts += 1;
  }
  jurisdiction.registration += precinct.registration;
  jurisdiction.candidateVotes += precinct.candidateVotes;
  jurisdiction.contestTotalIncludingNonCandidateRows +=
    precinct.contestTotalIncludingNonCandidateRows;
  officialJurisdictions.set(key, jurisdiction);
}

const eacJurisdictions = new Map(
  eacRows.map((row) => [
    normalizeJurisdiction(row.jurisdiction_name),
    {
      jurisdictionName: row.jurisdiction_name,
      ballotsCast: intValue(row.ballots_cast),
      registeredVoters: intValue(row.registered_voters),
    },
  ]),
);

const jurisdictionComparisons = Array.from(officialJurisdictions.entries()).map(
  ([key, official]) => {
    const eac = eacJurisdictions.get(key);
    return {
      jurisdictionName: official.jurisdictionName,
      precincts: official.precincts,
      zeroRegistrationPrecincts: official.zeroRegistrationPrecincts,
      officialRegistration: official.registration,
      eacRegisteredVoters: eac?.registeredVoters ?? null,
      registrationDeltaVsEac:
        eac === undefined ? null : official.registration - eac.registeredVoters,
      officialContestTotalIncludingNonCandidateRows:
        official.contestTotalIncludingNonCandidateRows,
      eacBallotsCast: eac?.ballotsCast ?? null,
      contestTotalDeltaVsEac:
        eac === undefined
          ? null
          : official.contestTotalIncludingNonCandidateRows - eac.ballotsCast,
    };
  },
);

const totals = Array.from(precincts.values()).reduce(
  (acc, precinct) => {
    acc.precinctRows += 1;
    acc.registration += precinct.registration;
    acc.candidateVotes += precinct.candidateVotes;
    acc.contestTotalIncludingNonCandidateRows +=
      precinct.contestTotalIncludingNonCandidateRows;
    acc.overVotes += precinct.overVotes;
    acc.underVotes += precinct.underVotes;
    acc.blankBallots += precinct.blankBallots;
    if (precinct.registration === 0) {
      acc.zeroRegistrationPrecincts += 1;
    }
    return acc;
  },
  {
    precinctRows: 0,
    registration: 0,
    candidateVotes: 0,
    contestTotalIncludingNonCandidateRows: 0,
    overVotes: 0,
    underVotes: 0,
    blankBallots: 0,
    zeroRegistrationPrecincts: 0,
  },
);

const eacTotals = eacRows.reduce(
  (acc, row) => {
    acc.rows += 1;
    acc.ballotsCast += intValue(row.ballots_cast);
    acc.registeredVoters += intValue(row.registered_voters);
    return acc;
  },
  { rows: 0, ballotsCast: 0, registeredVoters: 0 },
);

const largestRegistrationDeltas = jurisdictionComparisons
  .filter((row) => row.registrationDeltaVsEac !== null)
  .sort(
    (left, right) =>
      Math.abs(right.registrationDeltaVsEac) - Math.abs(left.registrationDeltaVsEac),
  )
  .slice(0, 12);

const review = {
  state: "IL",
  electionYear: 2024,
  sourceAuthority: "Illinois State Board of Elections",
  sourceUrl: "https://www.elections.il.gov/ElectionOperations/ElectionVoteTotals.aspx?ID=66",
  directDownloadPattern:
    "https://elections.il.gov/Downloads/ElectionOperations/ElectionResults/ByOffice/66/<office-csv>",
  localArtifactPath: PRESIDENT_CSV,
  eacBenchmarkPath: EAC_TURNOUT_CSV,
  reportingGrain: "precinct_by_office_result_rows",
  parserOrNormalizationPath: "scripts/report-il-turnout-source-review.mjs",
  generatedAt: "2026-07-05",
  fieldsReviewed: requiredFields,
  officialPresidentCsvTotals: totals,
  eacFallbackTotals: eacTotals,
  deltasVsEacFallback: {
    registration: totals.registration - eacTotals.registeredVoters,
    contestTotalIncludingNonCandidateRows:
      totals.contestTotalIncludingNonCandidateRows - eacTotals.ballotsCast,
    candidateVotes: totals.candidateVotes - eacTotals.ballotsCast,
  },
  largestRegistrationDeltas,
  decision: "keep_eac_fallback",
  caveats: [
    "The official by-office precinct CSV includes a Registration field, but it sums to 7,210,422 statewide versus 8,970,541 registered voters in the active EAC fallback.",
    "The President CSV has 2,260 precinct keys with zero Registration, including whole election-authority groups such as Will, Peoria, Williamson, Grundy, and Iroquois in this artifact.",
    "The by-office CSV does not include an election-level ballots-cast field. Summing President candidate, over-vote, under-vote, and blank-ballot rows gives 5,702,776, which is 14,371 below the active EAC ballots-cast total of 5,717,147.",
    "Use the by-office CSV for official result and review rows only. Keep EAC fallback turnout active until Illinois publishes or confirms a turnout/voter-participation artifact with ballots-cast and denominator timing.",
  ],
  confidence: "reviewed_not_valid_turnout_replacement",
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(review, null, 2)}\n`);
console.log(`Wrote ${OUT}`);
