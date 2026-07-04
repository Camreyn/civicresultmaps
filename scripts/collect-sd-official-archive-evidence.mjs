import { mkdir, writeFile } from "node:fs/promises";
import XLSX from "xlsx";

const serviceRoot = "https://sdresws.azurewebsites.net/ResultsAjax.svc";
const electionID = 684;
const outputPath = "data/sd-2024-official-results-archive-evidence.json";
const statewideExportPath = "data/sd-2024-general-statewide-results.xlsx";
const sourceRequestPacketPath = "data/sd-2024-official-source-request-packet.json";

const urls = {
  archivedGeneralShell:
    "https://web.archive.org/web/20241105222716/https://electionresults.sd.gov/",
  statewideExportShell: `https://electionresults.sd.gov/ResultsExport.aspx?eid=${electionID}`,
  electionTerminology: `https://electionresults.sd.gov/ElectionTerminology.aspx?eid=${electionID}`,
  officialResultsPage: "https://sdsos.gov/elections-voting/election-resources/election-results/default.aspx",
  postElectionAuditPage:
    "https://sdsos.gov/elections-voting/upcoming-elections/general-information/2024/2024-general-postelection-audit-results.aspx",
  publicRecordsRequest: "https://www.sd.gov/cs?id=sc_cat_item&sys_id=f7f939eddbd4b150b2fb93d4f39619c0",
  countyAuditors: "https://vip.sdsos.gov/CountyAuditors.aspx",
  candidates: `${serviceRoot}/GetCandidates?ElectionType=General&ElectionID=${electionID}`,
  statewideCountyMapData: `${serviceRoot}/GetMapDataArchive?Type=SWR&Category=CTY&RaceID=0&OSN=0&County=0&Party=0&ElectionID=${electionID}`,
  countyTurnout: `${serviceRoot}/GetVoterTurnoutArchive?ElectionID=${electionID}`
};

const candidateCanvassUrls = [
  "https://sdsos.gov/elections-voting/upcoming-elections/general-information/2024/Assets/Election%20Information/State%20Canvass%20and%20Certificate.pdf",
  "https://sdsos.gov/elections-voting/upcoming-elections/general-information/2024/Assets/State%20Canvass%20and%20Certificate.pdf",
  "https://sdsos.gov/elections-voting/upcoming-elections/general-information/2024/Assets/Election%20Information/2024%20General%20Election%20State%20Canvass%20and%20Certificate.pdf",
  "https://sdsos.gov/elections-voting/upcoming-elections/general-information/2024/Assets/Election%20Information/2024%20General%20State%20Canvass%20and%20Certificate.pdf",
  "https://sdsos.gov/elections-voting/upcoming-elections/general-information/2024/Assets/Election%20Information/2024%20State%20Canvass%20and%20Certificate.pdf"
];

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

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "CivicResultMaps source evidence collector"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${response.statusText}: ${url}`);
  }

  return response.text();
}

async function probeUrl(url) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        accept: "*/*",
        "user-agent": "CivicResultMaps source evidence collector"
      }
    });

    return {
      url,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type") ?? "",
      finalUrl: response.url
    };
  } catch (error) {
    return {
      url,
      status: null,
      statusText: "request_failed",
      error: String(error?.message ?? error)
    };
  }
}

function decodeHtmlAttribute(value) {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
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

function stripHtml(value) {
  return decodeHtmlAttribute(
    String(value ?? "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(baseUrl, href) {
  return new URL(decodeHtmlAttribute(href), baseUrl).toString();
}

function parseLinks(html, baseUrl) {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    href: absoluteUrl(baseUrl, match[1]),
    text: stripHtml(match[2])
  }));
}

function parseOfficialResultsNote(html) {
  const text = stripHtml(html);
  const match = text.match(/Unofficial vs Official results\s+(.+?)(?:Vote Center Counties|Tied Recount|POST-ELECTION AUDITS)/i);
  return match ? match[1].trim() : "";
}

function parsePostElectionAuditPage(html, baseUrl) {
  const rowMatches = [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)];
  const countyRows = [];

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[0];
    const cells = [...rowHtml.matchAll(/<td\b[\s\S]*?<\/td>/gi)].map((cell) => cell[0]);
    if (cells.length < 3) continue;

    const county = stripHtml(cells[0]).replace(/\s+County$/i, "");
    if (!county || /^county$/i.test(county)) continue;

    const status = stripHtml(cells[1]);
    const links = parseLinks(cells[2], baseUrl)
      .filter((link) => /post.?election|audit|certificate|pea|precinct/i.test(`${link.text} ${link.href}`))
      .map((link) => ({
        label: link.text,
        url: link.href
      }));

    countyRows.push({
      county,
      status: status || "status_not_listed_on_summary_page",
      certificateCount: links.length,
      certificateUrls: links
    });
  }

  const linkedCertificateCount = countyRows.reduce((sum, row) => sum + row.certificateCount, 0);
  const discrepancyRows = countyRows.filter((row) => {
    if (!row.status) return false;
    if (/^no discrepancies$/i.test(row.status)) return false;
    if (/status_not_listed/i.test(row.status)) return false;
    return /discrep|off by|waiting|accurate first|human error|hesitation|too light|wrong precinct/i.test(row.status);
  });

  return {
    sourceUrl: baseUrl,
    rowCount: countyRows.length,
    linkedCertificateCount,
    discrepancySummaryCounties: discrepancyRows.map((row) => row.county),
    discrepancySummaryCount: discrepancyRows.length,
    countiesWithoutLinkedCertificate: countyRows
      .filter((row) => row.certificateCount === 0)
      .map((row) => ({ county: row.county, status: row.status })),
    countyRows
  };
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

const [
  candidatePayload,
  mapDataPayload,
  turnoutPayload,
  electionTerminologyHtml,
  postElectionAuditHtml,
  canvassUrlProbes
] = await Promise.all([
  fetchServiceJson(urls.candidates),
  fetchServiceJson(urls.statewideCountyMapData),
  fetchServiceJson(urls.countyTurnout),
  fetchText(urls.electionTerminology),
  fetchText(urls.postElectionAuditPage),
  Promise.all(candidateCanvassUrls.map((url) => probeUrl(url)))
]);
const statewideExport = await fetchStatewideExportWorkbook(urls.statewideExportShell);
await mkdir("data", { recursive: true });
try {
  await writeFile(statewideExportPath, statewideExport.bytes);
} catch (error) {
  if (error?.code !== "EPERM") {
    throw error;
  }
  console.warn(`Could not overwrite retained ${statewideExportPath}; reusing the existing workbook artifact.`);
}

const candidateRows = candidatePayload.d ?? [];
const mapRows = mapDataPayload.d ?? [];
const turnoutRows = turnoutPayload.d ?? [];
const presidentialArchive = summarizeRace(mapRows, "Presidential Electors");
const houseArchive = summarizeRace(mapRows, "United States Representative");
const statewideExportSummary = summarizeOfficialExportWorkbook(statewideExportPath);
const postElectionAuditSummary = parsePostElectionAuditPage(postElectionAuditHtml, urls.postElectionAuditPage);
const officialResultsNote = parseOfficialResultsNote(electionTerminologyHtml);

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
  checkedAt: "2026-07-04",
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
  officialResultsAvailabilityNote: officialResultsNote,
  postElectionAuditSummary: {
    sourceUrl: postElectionAuditSummary.sourceUrl,
    rowCount: postElectionAuditSummary.rowCount,
    linkedCertificateCount: postElectionAuditSummary.linkedCertificateCount,
    discrepancySummaryCount: postElectionAuditSummary.discrepancySummaryCount,
    discrepancySummaryCounties: postElectionAuditSummary.discrepancySummaryCounties,
    countiesWithoutLinkedCertificate: postElectionAuditSummary.countiesWithoutLinkedCertificate
  },
  canvassUrlProbes,
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

const requestPacket = {
  sourceAuthority: "South Dakota Secretary of State",
  localArtifactPath: sourceRequestPacketPath,
  sourceUrl: urls.officialResultsPage,
  electionYear: 2024,
  reportingGrain: "county",
  parserOrNormalizationPath: "scripts/collect-sd-official-archive-evidence.mjs",
  checkedAt: "2026-07-04",
  status: "official_certified_reconciliation_request_packet",
  blocker:
    "The official ElectionID 684 results app and statewide XLSX export remain labeled unofficial and total 194 President votes and 184 U.S. House votes below the current certified-style county staging rows. The certifying PDF/static export has not been found at the tested SOS paths.",
  requestTargets: [
    {
      target: "South Dakota Secretary of State Elections Division",
      url: urls.officialResultsPage,
      requestPath: urls.publicRecordsRequest,
      ask: "Provide the official 2024 General Election State Canvass and Certificate PDF/static export or a machine-readable county-level certified-result table for President and United States Representative."
    },
    {
      target: "South Dakota county auditors",
      url: urls.countyAuditors,
      ask: "If the state cannot provide a reconciled county export, request county canvass certificates or county-level certified abstracts for President and United States Representative."
    }
  ],
  requestedFields: [
    "county",
    "contest",
    "candidate",
    "party",
    "certified_votes",
    "write_in_or_canvass_adjustment_votes_if_separate",
    "certification_date",
    "source_document_url"
  ],
  evidenceToAttach: [
    {
      artifact: outputPath,
      summary:
        "ElectionID 684 app/export evidence identifies the correct 2024 General federal contests but remains lower than the certified-style totals and is labeled unofficial."
    },
    {
      artifact: statewideExportPath,
      summary: "Official ResultsExport.aspx?eid=684 workbook retained locally as Statewide Results.xlsx."
    },
    {
      artifact: urls.electionTerminology,
      summary:
        officialResultsNote ||
        "Election results FAQ distinguishes Election Night unofficial results from official certified results on the SOS Elections site."
    },
    {
      artifact: urls.postElectionAuditPage,
      summary: `Official 2024 General post-election audit page lists ${postElectionAuditSummary.rowCount} county rows and ${postElectionAuditSummary.linkedCertificateCount} linked audit certificates; useful administration context but not a certified-result replacement.`
    }
  ],
  officialPostElectionAuditContext: postElectionAuditSummary,
  canvassUrlProbes,
  reconciliationDeltas: evidence.reconciliation,
  caveats: [
    "This packet is a source-evidence and request artifact only; it is not a replacement result source.",
    "Audit certificates document post-election audit context and selected discrepancies, but they do not provide complete certified county President and U.S. House totals.",
    "Continue using the caveated secondary staging rows until the official certified canvass/export or a reconciling official payload is retained."
  ]
};

await writeFile(sourceRequestPacketPath, `${JSON.stringify(requestPacket, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      wrote: outputPath,
      requestPacket: sourceRequestPacketPath,
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
      auditCountyRows: postElectionAuditSummary.rowCount,
      auditLinkedCertificateCount: postElectionAuditSummary.linkedCertificateCount,
      auditDiscrepancySummaryCount: postElectionAuditSummary.discrepancySummaryCount,
      reconciliation: evidence.reconciliation
    },
    null,
    2
  )
);
