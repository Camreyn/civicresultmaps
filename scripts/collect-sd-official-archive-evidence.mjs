import { mkdir, writeFile } from "node:fs/promises";
import XLSX from "xlsx";

const serviceRoot = "https://sdresws.azurewebsites.net/ResultsAjax.svc";
const electionID = 684;
const outputPath = "data/sd-2024-official-results-archive-evidence.json";
const statewideExportPath = "data/sd-2024-general-statewide-results.xlsx";

const urls = {
  archivedGeneralShell:
    "https://web.archive.org/web/20241105222716/https://electionresults.sd.gov/",
  statewideExportShell: `https://electionresults.sd.gov/ResultsExport.aspx?eid=${electionID}`,
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

function decodeHtmlAttribute(value) {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function hiddenField(html, name) {
  const escapedName = name.replace(/\$/g, "\\$");
  const match = html.match(new RegExp(`name="${escapedName}"[^>]*value="([^"]*)"`));
  return match ? decodeHtmlAttribute(match[1]) : "";
}

async function fetchStatewideExportWorkbook(url) {
  const shellResponse = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "CivicResultMaps source evidence collector"
    }
  });
  if (!shellResponse.ok) {
    throw new Error(`Request failed ${shellResponse.status} ${shellResponse.statusText}: ${url}`);
  }

  const html = await shellResponse.text();
  const form = new URLSearchParams();
  for (const name of [
    "__VIEWSTATE",
    "__VIEWSTATEGENERATOR",
    "__EVENTVALIDATION",
    "ctl00$hidElectionType",
    "ctl00$hidElectionDate",
    "ctl00$hidPrecinctsReported",
    "ctl00$hidPrecinctsPartial",
    "ctl00$hidPrecinctsNotReported",
    "ctl00$hidVoterTurnout",
    "ctl00$hidVoterTotal"
  ]) {
    form.set(name, hiddenField(html, name));
  }
  form.set("__EVENTTARGET", "ctl00$MainContent$Statewide");
  form.set("__EVENTARGUMENT", "");

  const exportResponse = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "CivicResultMaps source evidence collector"
    },
    body: form
  });
  if (!exportResponse.ok) {
    throw new Error(`Export failed ${exportResponse.status} ${exportResponse.statusText}: ${url}`);
  }

  const bytes = Buffer.from(await exportResponse.arrayBuffer());
  return {
    bytes,
    contentType: exportResponse.headers.get("content-type") ?? "",
    contentDisposition: exportResponse.headers.get("content-disposition") ?? ""
  };
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

function normalizeCountyName(value) {
  return String(value ?? "").replace(/\s*\(Vote Center\)\s*$/i, "").trim();
}

function summarizeOfficialExportWorkbook(path) {
  const workbook = XLSX.readFile(path);
  const presidentSheetName = workbook.SheetNames.find((name) => name.startsWith("12665"));
  const houseSheetName = workbook.SheetNames.find((name) => name.startsWith("11954"));
  if (!presidentSheetName || !houseSheetName) {
    throw new Error(`Expected President and U.S. House sheets in ${path}`);
  }

  const summarizeSheet = (sheetName, candidateColumns) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
    const headerIndex = rows.findIndex((row) => String(row[1] ?? "").trim() === "County");
    if (headerIndex < 0) {
      throw new Error(`Expected County header row in ${sheetName}`);
    }
    const header = rows[headerIndex] ?? [];
    const countyRows = rows.slice(headerIndex + 1).filter((row) => {
      const county = normalizeCountyName(row[1]);
      return county && county.toUpperCase() !== "TOTALS" && String(row[0] ?? "").trim() === "";
    });
    const totalsRow = rows.find((row) => normalizeCountyName(row[1]).toUpperCase() === "TOTALS") ?? [];
    const candidateTotals = candidateColumns.map((item) => ({
      candidate: item.candidate,
      party: item.party,
      sourceHeader: String(header[item.column] ?? "").trim(),
      votes: numberValue(totalsRow[item.column])
    }));

    return {
      sheetName,
      title: rows[0]?.[0] ?? "",
      stateLabel: rows[1]?.[0] ?? "",
      precinctStatus: rows[2]?.[0] ?? "",
      downloadedAtLabel: rows[3]?.[0] ?? "",
      rowCount: countyRows.length,
      countyCount: new Set(countyRows.map((row) => normalizeCountyName(row[1]))).size,
      sourceHeaders: header.map((value) => String(value ?? "").trim()),
      totalVotes: candidateTotals.reduce((sum, row) => sum + row.votes, 0),
      candidateTotals
    };
  };

  return {
    localArtifactPath: path,
    workbookSheets: workbook.SheetNames,
    presidentialElectors: summarizeSheet(presidentSheetName, [
      { column: 2, candidate: "Kamala D. Harris and Tim Walz", party: "Democratic" },
      { column: 3, candidate: "Chase Oliver and Mike ter Maat", party: "Libertarian" },
      { column: 4, candidate: "Donald J. Trump and JD Vance", party: "Republican" },
      { column: 5, candidate: "Robert F. Kennedy, Jr. and Nicole Shanahan", party: "Independent" }
    ]),
    usRepresentative: summarizeSheet(houseSheetName, [
      { column: 2, candidate: "Sheryl Johnson", party: "Democratic" },
      { column: 3, candidate: "Dusty Johnson", party: "Republican" }
    ])
  };
}

const [candidatePayload, mapDataPayload, turnoutPayload] = await Promise.all([
  fetchServiceJson(urls.candidates),
  fetchServiceJson(urls.statewideCountyMapData),
  fetchServiceJson(urls.countyTurnout)
]);
const statewideExport = await fetchStatewideExportWorkbook(urls.statewideExportShell);
await mkdir("data", { recursive: true });
await writeFile(statewideExportPath, statewideExport.bytes);

const candidateRows = candidatePayload.d ?? [];
const mapRows = mapDataPayload.d ?? [];
const turnoutRows = turnoutPayload.d ?? [];
const presidentialArchive = summarizeRace(mapRows, "Presidential Electors");
const houseArchive = summarizeRace(mapRows, "United States Representative");
const statewideExportSummary = summarizeOfficialExportWorkbook(statewideExportPath);

const evidence = {
  sourceAuthority: "South Dakota Secretary of State",
  sourceUrls: urls,
  localArtifactPath: outputPath,
  retainedOfficialExportArtifactPath: statewideExportPath,
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
    turnoutLead: summarizeTurnout(turnoutRows),
    statewideExport: {
      contentType: statewideExport.contentType,
      contentDisposition: statewideExport.contentDisposition,
      ...statewideExportSummary
    }
  },
  expectedCertifiedTotals,
  reconciliation: {
    status: "official_archive_and_statewide_export_do_not_reconcile_to_current_certified-style_staging_totals",
    presidentialCertifiedMinusArchive:
      expectedCertifiedTotals.presidentialElectors.totalVotes - presidentialArchive.totalVotes,
    usHouseCertifiedMinusArchive:
      expectedCertifiedTotals.usRepresentative.totalVotes - houseArchive.totalVotes,
    presidentialCertifiedMinusStatewideExport:
      expectedCertifiedTotals.presidentialElectors.totalVotes -
      statewideExportSummary.presidentialElectors.totalVotes,
    usHouseCertifiedMinusStatewideExport:
      expectedCertifiedTotals.usRepresentative.totalVotes -
      statewideExportSummary.usRepresentative.totalVotes
  },
  caveats: [
    "The official archive ElectionID and service family are identified, and the official ElectionID 684 statewide XLSX export is retained locally, but both official app artifacts are labeled unofficial or map/export evidence and do not reconcile to the current certified-style staging totals.",
    "The retained archive payload and statewide export appear to be ENR/app results rather than the official canvass PDF/static export or write-in-inclusive certified county table.",
    "Current active SD result and review rows remain caveated secondary staging rows until an official canvass/export artifact or reconciling official archive payload is collected and parsed.",
    "The official turnout archive is a state-native lead only; keep EAC fallback active until denominator timing and replacement semantics are reviewed."
  ]
};

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
      statewideExportPath,
      statewideExportPresidentialTotal: statewideExportSummary.presidentialElectors.totalVotes,
      statewideExportUsHouseTotal: statewideExportSummary.usRepresentative.totalVotes,
      turnoutRows: turnoutRows.length,
      turnoutBallotsCast: evidence.officialArchiveSummaries.turnoutLead.ballotsCast,
      turnoutRegisteredVoters: evidence.officialArchiveSummaries.turnoutLead.registeredVoters,
      reconciliation: evidence.reconciliation
    },
    null,
    2
  )
);
