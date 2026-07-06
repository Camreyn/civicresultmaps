import fs from "node:fs";
import https from "node:https";
import path from "node:path";

const ELECTION_HISTORY_DOWNLOAD_URL =
  "https://ct.elstats.civera.com/api/download_search.csv";
const DEFAULT_OUT = "data/ct-2024-election-history-source-review.json";

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
}

function searchUrl(search) {
  const url = new URL(ELECTION_HISTORY_DOWNLOAD_URL);
  url.searchParams.set("search", JSON.stringify(search));
  return url;
}

function fetchText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks);
          if (
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            if (redirectCount >= 5) {
              reject(new Error(`GET ${url} exceeded redirect limit`));
              return;
            }
            resolve(fetchText(new URL(response.headers.location, url), redirectCount + 1));
            return;
          }
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              new Error(
                `GET ${url} failed with ${response.statusCode}: ${body
                  .toString("utf8")
                  .slice(0, 500)}`,
              ),
            );
            return;
          }
          resolve(body.toString("utf8"));
        });
      })
      .on("error", reject);
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return [];
  }
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]));
  });
}

function intValue(value) {
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  return normalized ? Number.parseInt(normalized, 10) : 0;
}

function groupSum(rows, key) {
  const totals = new Map();
  for (const row of rows) {
    const name = row[key] || "";
    totals.set(name, (totals.get(name) ?? 0) + intValue(row.votes));
  }
  return [...totals.entries()]
    .map(([name, votes]) => ({ name, votes }))
    .sort((left, right) => right.votes - left.votes || left.name.localeCompare(right.name));
}

function loadEmsTurnoutSummary() {
  const file = path.join(
    "data",
    "ct-2024-ems-election-91-version-80741",
    "voterTurnout_Electiondata.json",
  );
  const records = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Object.values(records).filter((record) => record.NM !== "Total");
  const total = records["170"];
  return {
    localFile: file.replaceAll("\\", "/"),
    rows: rows.length,
    registeredVoters: intValue(total?.EV),
    votersChecked: intValue(total?.VV),
    absenteeReported: intValue(total?.ABC),
    earlyVotingReported: intValue(total?.EBC),
    sameDayRegistrationReported: intValue(total?.EDC),
  };
}

function votingStatsBreakdown(rows) {
  const elections = new Map();
  for (const row of rows) {
    const key = `${row.election_id}|${row.election_date}|${row.election_type}|${row.district_name}`;
    const current = elections.get(key) ?? {
      electionId: row.election_id,
      electionDate: row.election_date,
      electionType: row.election_type,
      districtName: row.district_name,
      rows: 0,
    };
    current.rows += 1;
    elections.set(key, current);
  }
  return [...elections.values()].sort((left, right) =>
    `${left.electionDate} ${left.districtName}`.localeCompare(
      `${right.electionDate} ${right.districtName}`,
    ),
  );
}

async function main() {
  const outPath = argValue("--out", DEFAULT_OUT);
  const checkedAt = argValue("--checked-at", new Date().toISOString().slice(0, 10));

  const eventPresidentSearch = {
    global: { events: [582] },
    contests: {
      candidates: [],
      divisions: [],
      offices: [{ id: 352, name: "President" }],
    },
    specialElectionsOnly: false,
    voterStats: false,
    stages: [],
  };
  const eventVoterStatsSearch = {
    global: { events: [582] },
    specialElectionsOnly: false,
    voterStats: true,
    stages: [],
  };
  const yearVoterStatsSearch = {
    global: { years: { from: 2024, to: 2024 } },
    specialElectionsOnly: false,
    voterStats: true,
    stages: [],
  };

  const [presidentCsv, eventVoterStatsCsv, yearVoterStatsCsv] = await Promise.all([
    fetchText(searchUrl(eventPresidentSearch)),
    fetchText(searchUrl(eventVoterStatsSearch)),
    fetchText(searchUrl(yearVoterStatsSearch)),
  ]);

  const presidentRows = parseCsv(presidentCsv);
  const eventVoterStatsRows = parseCsv(eventVoterStatsCsv);
  const yearVoterStatsRows = parseCsv(yearVoterStatsCsv);
  const presidentTownRows = presidentRows.filter(
    (row) => row.office_name === "President" && row.division_type === "City/Town",
  );
  const candidateTotals = groupSum(presidentTownRows, "candidate_name");
  const voteChannelTotals = groupSum(presidentTownRows, "vote_channel").sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const emsTurnout = loadEmsTurnoutSummary();
  const totalBallotsCastRow =
    candidateTotals.find((row) => row.name === "Total Ballots Cast")?.votes ?? 0;
  const totalVotesCastRow =
    candidateTotals.find((row) => row.name === "Total Votes Cast")?.votes ?? 0;

  const artifact = {
    state: "CT",
    checkedAt,
    sourceAuthority: "Connecticut Secretary of the State Election History",
    sourceUrl: "https://electionhistory.ct.gov/search?",
    downloadEndpoint: ELECTION_HISTORY_DOWNLOAD_URL,
    localArtifactPath: outPath.replaceAll("\\", "/"),
    electionYear: 2024,
    reportingGrainReviewed: "city_town_vote_channel_for_results; voter_statistics_search",
    queries: {
      eventPresidentSearch,
      eventVoterStatsSearch,
      yearVoterStatsSearch,
    },
    event582PresidentReview: {
      electionId: "582",
      electionDate: "2024-11-05T00:00:00Z",
      rows: presidentRows.length,
      cityTownRows: presidentTownRows.length,
      townCount: new Set(presidentTownRows.map((row) => row.division_name)).size,
      voteChannels: [...new Set(presidentTownRows.map((row) => row.vote_channel))].sort(),
      candidateTotals,
      totalBallotsCastRow,
      totalVotesCastRow,
      caveat:
        "Election History exposes Total Ballots Cast and Total Votes Cast as President-contest rows by vote channel. They reconcile to President contest votes, not election-level turnout.",
    },
    event582VoterStatisticsReview: {
      rows: eventVoterStatsRows.length,
      conclusion:
        "No Voting Statistics rows are returned by the voterStats-only download for the November 5, 2024 General Election event.",
    },
    year2024VoterStatisticsReview: {
      rows: yearVoterStatsRows.length,
      elections: votingStatsBreakdown(yearVoterStatsRows),
      statisticNames: groupSum(yearVoterStatsRows, "candidate_name").map((row) => row.name),
      conclusion:
        "The 2024 voterStats-only download returns January 23, 2024 special-election Voting Statistics rows for Bridgeport and West Haven, not November 5, 2024 General Election turnout rows.",
    },
    emsTurnoutComparison: {
      ...emsTurnout,
      presidentContestVotes: totalVotesCastRow,
      electionHistoryPresidentMinusEmsVotersChecked: totalVotesCastRow - emsTurnout.votersChecked,
      hasRegistrationDenominator: false,
    },
    decision: {
      status: "exclude_as_turnout_replacement",
      reason:
        "Election History confirms the 2024 General Election President town/vote-channel totals used by EMS, but it does not provide event-582 voter-statistic rows or a registered-voter denominator. Its President Total Ballots Cast row equals contest votes and is 29,971 below EMS voters checked.",
      activeTurnoutRecommendation:
        "Keep CT active turnout on EMS voterTurnout_Electiondata.json with warningRequired=true. Retain Statement-of-Vote and EAC reconciliation caveats.",
      resultUse:
        "Use Election History as an official result and vote-channel cross-check, not as an active turnout replacement.",
    },
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `Wrote ${outPath}: event582 President rows=${presidentRows.length}, voterStats rows=${eventVoterStatsRows.length}, decision=${artifact.decision.status}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

