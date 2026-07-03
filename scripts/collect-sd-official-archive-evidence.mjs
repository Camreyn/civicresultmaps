import { mkdir, writeFile } from "node:fs/promises";

const serviceRoot = "https://sdresws.azurewebsites.net/ResultsAjax.svc";
const electionID = 684;
const outputPath = "data/sd-2024-official-results-archive-evidence.json";

const urls = {
  archivedGeneralShell:
    "https://web.archive.org/web/20241105222716/https://electionresults.sd.gov/",
  candidates: `${serviceRoot}/GetCandidates?ElectionType=General&ElectionID=${electionID}`,
  statewideCountyMapData: `${serviceRoot}/GetMapDataArchive?Type=SWR&Category=CTY&RaceID=0&OSN=0&County=0&Party=0&ElectionID=${electionID}`,
  countyTurnout: `${serviceRoot}/GetVoterTurnoutArchive?ElectionID=${electionID}`
};

const expectedCertifiedTotals = {
  presidentialElectors: {
    totalVotes: 428922,
    DonaldTrump: 272081,
    KamalaHarris: 146859,
    other: 9982
  },
  usRepresentative: {
    totalVotes: 421448,
    republican: 303630,
    democratic: 117818,
    other: 0
  }
};

async function fetchServiceJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      "user-agent": "CivicResultMaps source evidence collector"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${response.statusText}: ${url}`);
  }

  return response.json();
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  return Number(value);
}

function summarizeRace(rows, raceName) {
  const raceRows = rows.filter((row) => row.RaceName === raceName);
  const byCandidate = new Map();
  const counties = new Set();
  const raceIDs = new Set();

  for (const row of raceRows) {
    const candidate = String(row.calcCandidate ?? row.CandidateName ?? "").trim();
    const party = String(row.PartyName ?? "").trim();
    const key = `${candidate}|${party}`;
    const votes = numberValue(row.calcCandidateVotes ?? row.CandidateVotes);
    const current = byCandidate.get(key) ?? {
      candidate,
      party,
      votes: 0
    };
    current.votes += votes;
    byCandidate.set(key, current);
    counties.add(String(row.CountyName ?? "").trim());
    raceIDs.add(numberValue(row.RaceID));
  }

  return {
    raceName,
    rowCount: raceRows.length,
    countyCount: counties.size,
    raceIDs: [...raceIDs].sort((a, b) => a - b),
    totalVotes: [...byCandidate.values()].reduce((sum, row) => sum + row.votes, 0),
    candidateTotals: [...byCandidate.values()].sort((a, b) => b.votes - a.votes)
  };
}

function summarizeTurnout(rows) {
  const counties = new Set();
  let registeredVoters = 0;
  let ballotsCast = 0;
  let precinctsReporting = 0;
  let totalPrecincts = 0;

  for (const row of rows) {
    counties.add(String(row.CountyName ?? "").trim());
    registeredVoters += numberValue(row.Voters);
    ballotsCast += numberValue(row.calcVoterTurnout);
    precinctsReporting += numberValue(row.PrecinctsReporting);
    totalPrecincts += numberValue(row.TotalPrecincts);
  }

  return {
    rowCount: rows.length,
    countyCount: counties.size,
    registeredVoters,
    ballotsCast,
    precinctsReporting,
    totalPrecincts
  };
}

function selectFederalCandidates(rows) {
  const contestNames = new Set(["Presidential Electors", "United States Representative"]);
  return rows
    .filter((row) => contestNames.has(row.desc))
    .map((row) => ({
      candidateListRaceID: numberValue(row.ID),
      office: row.desc,
      party: row.PartyName ?? row.Party ?? "",
      label: row.label,
      candidateName: row.name
    }))
    .sort((a, b) => a.office.localeCompare(b.office) || a.party.localeCompare(b.party));
}

const [candidatePayload, mapDataPayload, turnoutPayload] = await Promise.all([
  fetchServiceJson(urls.candidates),
  fetchServiceJson(urls.statewideCountyMapData),
  fetchServiceJson(urls.countyTurnout)
]);

const candidateRows = candidatePayload.d ?? [];
const mapRows = mapDataPayload.d ?? [];
const turnoutRows = turnoutPayload.d ?? [];
const presidentialArchive = summarizeRace(mapRows, "Presidential Electors");
const houseArchive = summarizeRace(mapRows, "United States Representative");

const evidence = {
  sourceAuthority: "South Dakota Secretary of State",
  sourceUrls: urls,
  localArtifactPath: outputPath,
  electionYear: 2024,
  electionType: "General",
  electionDate: "2024-11-05",
  reportingGrain: "county",
  parserOrNormalizationPath: "scripts/collect-sd-official-archive-evidence.mjs",
  checkedAt: "2026-07-03",
  archiveEvidence: {
    serviceRoot,
    electionID,
    candidateListRaceIDs: {
      presidentialElectors: 19833,
      usRepresentative: 19835
    },
    mapDataRaceIDs: {
      presidentialElectors: presidentialArchive.raceIDs,
      usRepresentative: houseArchive.raceIDs
    }
  },
  federalCandidates: selectFederalCandidates(candidateRows),
  officialArchiveSummaries: {
    allStatewideCountyMapRows: mapRows.length,
    presidentialElectors: presidentialArchive,
    usRepresentative: houseArchive,
    turnoutLead: summarizeTurnout(turnoutRows)
  },
  expectedCertifiedTotals,
  reconciliation: {
    status: "does_not_reconcile_to_current_certified-style_staging_totals",
    presidentialCertifiedMinusArchive:
      expectedCertifiedTotals.presidentialElectors.totalVotes - presidentialArchive.totalVotes,
    usHouseCertifiedMinusArchive:
      expectedCertifiedTotals.usRepresentative.totalVotes - houseArchive.totalVotes
  },
  caveats: [
    "The official archive ElectionID and service family are identified, but the map-data candidate totals do not reconcile to the current certified-style staging totals.",
    "The retained archive payload appears to be an ENR/map-data source rather than the official canvass PDF/static export or write-in-inclusive certified county table.",
    "Current active SD result and review rows remain caveated secondary staging rows until an official canvass/export artifact or reconciling official archive payload is collected and parsed.",
    "The official turnout archive is a state-native lead only; keep EAC fallback active until denominator timing and replacement semantics are reviewed."
  ]
};

await mkdir("data", { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      wrote: outputPath,
      electionID,
      presidentialRows: presidentialArchive.rowCount,
      presidentialTotal: presidentialArchive.totalVotes,
      usHouseRows: houseArchive.rowCount,
      usHouseTotal: houseArchive.totalVotes,
      turnoutRows: turnoutRows.length,
      turnoutBallotsCast: evidence.officialArchiveSummaries.turnoutLead.ballotsCast,
      turnoutRegisteredVoters: evidence.officialArchiveSummaries.turnoutLead.registeredVoters,
      reconciliation: evidence.reconciliation
    },
    null,
    2
  )
);
