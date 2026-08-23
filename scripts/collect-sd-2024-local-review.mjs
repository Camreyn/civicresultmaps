import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseCsv, toCsv } from "./normalize-eac-turnout.mjs";

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const collect = args.has("--collect");
const check = args.has("--check");

if (collect && check) {
  throw new Error("Use either --collect or --check, not both.");
}

const SERVICE_ROOT = "https://sdresws.azurewebsites.net/ResultsAjax.svc";
const ELECTION_ID = 684;
const REVIEWED_AT = "2026-08-23";
const PATHS = {
  presidentRaw: "data/sd-2024-general-president-precinct-enr.json",
  houseRaw: "data/sd-2024-general-us-house-precinct-enr.json",
  turnoutRaw: "data/sd-2024-general-turnout-enr.json",
  reviewCsv: "data/sd-2024-general-president-us-house-precinct-review.csv",
  reconciliation: "data/sd-2024-precinct-review-reconciliation.json",
  turnoutSemantics: "data/sd-2024-turnout-semantics.json",
  certifiedPresident: "data/sd-2024-general-president-county.csv",
  certifiedHouse: "data/sd-2024-general-us-house-county.csv",
  eacTurnout: "data/eac-2024-state-turnout/sd-2024-eac-turnout.csv",
  officialTurnout: "data/sd-2024-official-active-voter-turnout.csv",
  certifiedCanvass: "data/sd-2024-general-canvass-certificate.pdf",
};
const URLS = {
  presidentPrecinct:
    `${SERVICE_ROOT}/GetMapDataArchive?Type=SWR&Category=PREC&RaceID=12665&OSN=0&County=0&Party=0&ElectionID=${ELECTION_ID}`,
  housePrecinct:
    `${SERVICE_ROOT}/GetMapDataArchive?Type=SWR&Category=PREC&RaceID=11954&OSN=0&County=0&Party=0&ElectionID=${ELECTION_ID}`,
  turnout: `${SERVICE_ROOT}/GetVoterTurnoutArchive?ElectionID=${ELECTION_ID}`,
  exportPage: `https://electionresults.sd.gov/ResultsExport.aspx?eid=${ELECTION_ID}`,
  turnoutPage: `https://electionresults.sd.gov/VoterTurnoutDetails.aspx?eid=${ELECTION_ID}&map=TURN`,
  terminology: `https://electionresults.sd.gov/ElectionTerminology.aspx?eid=${ELECTION_ID}`,
  certifiedCanvass:
    "https://sdsos.gov/elections-voting/assets/Archive/2024%20Assets/Recount-Canvass-and-Canvass-Docs-General/2024GeneralElectionCanvassWithCert.pdf",
  officialReturns:
    "https://sdsos.gov/elections-voting/assets/Archive/2024%20Assets/Post-Election-Audit-General/ElectionReturns2024.pdf",
};
const EXPECTED = {
  counties: 66,
  reportingUnits: 691,
  presidentCandidateRows: 2764,
  houseCandidateRows: 1382,
  turnoutRows: 66,
  presidentEnr: {
    harris: 146811,
    trump: 271938,
    other: 9979,
    total: 428728,
  },
  houseEnr: {
    dem: 117785,
    rep: 303479,
    other: 0,
    total: 421264,
  },
  presidentCertified: {
    harris: 146859,
    trump: 272081,
    other: 9982,
    total: 428922,
  },
  houseCertified: {
    dem: 117818,
    rep: 303630,
    other: 0,
    total: 421448,
  },
  turnoutEnr: {
    ballotsCast: 436478,
    voters: 625192,
  },
  turnoutEac: {
    ballotsCast: 435739,
    registeredVoters: 690306,
  },
  turnoutOfficial: {
    ballotsCast: 436478,
    activeVoters: 624175,
  },
};

const abs = (relative) => path.join(ROOT, relative);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function integer(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a nonnegative integer; got ${value}.`);
  }
  return parsed;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}.`);
  }
}

function csvObjects(relative) {
  const [header, ...records] = parseCsv(readFileSync(abs(relative), "utf8"));
  if (!header) throw new Error(`${relative} is empty.`);
  return records.map((record) =>
    Object.fromEntries(header.map((column, index) => [column, record[index] ?? ""])),
  );
}

function countyKey(value) {
  return String(value ?? "")
    .replace(/\s*\(Vote Center\)\s*$/i, "")
    .replace(/\s+County$/i, "")
    .trim()
    .toUpperCase();
}

function sourceCountyName(value) {
  return String(value ?? "").replace(/\s*\(Vote Center\)\s*$/i, "").trim();
}

async function fetchOfficialJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      "user-agent": "CivicResultMaps public-source acquisition (CivicResultMaps.org)",
    },
  });
  if (!response.ok) {
    throw new Error(`Official source retrieval failed (${response.status}): ${url}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!/json|javascript/i.test(contentType)) {
    throw new Error(`Unexpected official response content type ${contentType}: ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error(`Official source returned an empty body: ${url}`);
  return bytes;
}

async function sourceBytes(relative, url) {
  if (!collect) {
    if (!existsSync(abs(relative))) {
      throw new Error(`Missing retained source ${relative}; run this script with --collect.`);
    }
    return readFileSync(abs(relative));
  }
  return fetchOfficialJson(url);
}

function serviceRows(bytes, relative, raceId, expectedCount) {
  const payload = JSON.parse(bytes.toString("utf8"));
  const rows = payload?.d;
  if (!Array.isArray(rows)) throw new Error(`${relative} does not contain a ResultsAjax d array.`);
  assertEqual(rows.length, expectedCount, `${relative} row count`);
  for (const [index, row] of rows.entries()) {
    assertEqual(Number(row.RaceID), raceId, `${relative} row ${index + 1} RaceID`);
    assertEqual(Number(row.TotalPrecincts), EXPECTED.reportingUnits, `${relative} TotalPrecincts`);
    assertEqual(Number(row.PrecinctsReporting), EXPECTED.reportingUnits, `${relative} PrecinctsReporting`);
    if (
      row.IsReported !== true
      || !String(row.CountyID ?? "").trim()
      || !String(row.CountyName ?? "").trim()
      || !String(row.StatePrecinctID ?? "").trim()
      || !String(row.PrecinctName ?? "").trim()
      || !String(row.CandidateID ?? "").trim()
      || !String(row.PartyCode ?? "").trim()
    ) {
      throw new Error(`${relative} row ${index + 1} has an unexpected official-source shape.`);
    }
    integer(row.calcCandidateVotes, `${relative} row ${index + 1} calcCandidateVotes`);
  }
  return rows;
}

function turnoutRows(bytes) {
  const payload = JSON.parse(bytes.toString("utf8"));
  const rows = payload?.d;
  if (!Array.isArray(rows)) throw new Error(`${PATHS.turnoutRaw} does not contain a ResultsAjax d array.`);
  assertEqual(rows.length, EXPECTED.turnoutRows, "South Dakota ENR turnout row count");
  for (const [index, row] of rows.entries()) {
    if (!String(row.CountyName ?? "").trim()) {
      throw new Error(`${PATHS.turnoutRaw} row ${index + 1} is missing CountyName.`);
    }
    integer(row.Voters, `${PATHS.turnoutRaw} row ${index + 1} Voters`);
    integer(row.calcVoterTurnout, `${PATHS.turnoutRaw} row ${index + 1} calcVoterTurnout`);
  }
  return rows;
}

function groupRace(rows, candidateCount, label) {
  const units = new Map();
  for (const row of rows) {
    const key = `${String(row.CountyID).trim()}|${String(row.StatePrecinctID).trim()}`;
    const existing = units.get(key) ?? [];
    existing.push(row);
    units.set(key, existing);
  }
  assertEqual(units.size, EXPECTED.reportingUnits, `${label} reporting-unit count`);
  for (const [key, values] of units) {
    const countyNames = new Set(values.map((row) => String(row.CountyName).trim()));
    const precinctNames = new Set(values.map((row) => String(row.PrecinctName).trim()));
    const candidateIds = new Set(values.map((row) => String(row.CandidateID).trim()));
    if (
      values.length !== candidateCount
      || countyNames.size !== 1
      || precinctNames.size !== 1
      || candidateIds.size !== candidateCount
    ) {
      throw new Error(`${label} reporting unit ${key} has inconsistent candidate rows.`);
    }
  }
  return units;
}

function emptyReviewRow(source) {
  const county = sourceCountyName(source.CountyName);
  const sourceUnitId = String(source.StatePrecinctID).trim();
  const sourceName = String(source.PrecinctName).trim();
  return {
    state: "SD",
    election_year: 2024,
    county,
    local_unit: `${sourceUnitId} ${sourceName}`,
    source_county_id: String(source.CountyID).trim(),
    source_unit_id: sourceUnitId,
    source_unit_name: sourceName,
    pres_harris: 0,
    pres_trump: 0,
    pres_other: 0,
    pres_total: 0,
    comparison_dem: 0,
    comparison_rep: 0,
    comparison_other: 0,
    comparison_total: 0,
  };
}

function bucket(row, contest) {
  const party = String(row.PartyCode).trim().toUpperCase();
  if (contest === "president") {
    if (party === "DEM") return "pres_harris";
    if (party === "REP") return "pres_trump";
    return "pres_other";
  }
  if (party === "DEM") return "comparison_dem";
  if (party === "REP") return "comparison_rep";
  return "comparison_other";
}

function buildReviewRows(presidentUnits, houseUnits) {
  const rows = [];
  for (const [key, president] of presidentUnits) {
    const house = houseUnits.get(key);
    if (!house) throw new Error(`U.S. House source is missing official reporting unit ${key}.`);
    const row = emptyReviewRow(president[0]);
    if (
      sourceCountyName(house[0].CountyName) !== row.county
      || String(house[0].PrecinctName).trim() !== row.source_unit_name
    ) {
      throw new Error(`President and U.S. House labels differ for official reporting unit ${key}.`);
    }
    for (const source of president) {
      const field = bucket(source, "president");
      const votes = integer(source.calcCandidateVotes, `${key} ${field}`);
      row[field] += votes;
      row.pres_total += votes;
    }
    for (const source of house) {
      const field = bucket(source, "house");
      const votes = integer(source.calcCandidateVotes, `${key} ${field}`);
      row[field] += votes;
      row.comparison_total += votes;
    }
    rows.push(row);
  }
  rows.sort(
    (left, right) =>
      left.county.localeCompare(right.county, "en")
      || left.source_unit_id.localeCompare(right.source_unit_id, "en")
      || left.source_unit_name.localeCompare(right.source_unit_name, "en"),
  );
  assertEqual(new Set(rows.map((row) => countyKey(row.county))).size, EXPECTED.counties, "review county count");
  assertEqual(new Set(rows.map((row) => `${countyKey(row.county)}|${row.source_unit_id}`)).size, EXPECTED.reportingUnits, "review key count");
  return rows;
}

function sumReview(rows) {
  return rows.reduce(
    (totals, row) => {
      for (const field of Object.keys(totals)) totals[field] += row[field];
      return totals;
    },
    {
      pres_harris: 0,
      pres_trump: 0,
      pres_other: 0,
      pres_total: 0,
      comparison_dem: 0,
      comparison_rep: 0,
      comparison_other: 0,
      comparison_total: 0,
    },
  );
}

function assertReviewTotals(totals) {
  const comparisons = {
    pres_harris: EXPECTED.presidentEnr.harris,
    pres_trump: EXPECTED.presidentEnr.trump,
    pres_other: EXPECTED.presidentEnr.other,
    pres_total: EXPECTED.presidentEnr.total,
    comparison_dem: EXPECTED.houseEnr.dem,
    comparison_rep: EXPECTED.houseEnr.rep,
    comparison_other: EXPECTED.houseEnr.other,
    comparison_total: EXPECTED.houseEnr.total,
  };
  for (const [field, expected] of Object.entries(comparisons)) {
    assertEqual(totals[field], expected, `review ${field}`);
  }
}

function certifiedCountyRows(relative, fields) {
  const rows = csvObjects(relative);
  assertEqual(rows.length, EXPECTED.counties, `${relative} county row count`);
  return new Map(
    rows.map((row) => [
      countyKey(row.jurisdiction_name),
      Object.fromEntries(fields.map((field) => [field, integer(row[field], `${relative} ${row.jurisdiction_name} ${field}`)])),
    ]),
  );
}

function countyReconciliation(reviewRows) {
  const certifiedPresident = certifiedCountyRows(PATHS.certifiedPresident, ["harris", "trump", "other"]);
  const certifiedHouse = certifiedCountyRows(PATHS.certifiedHouse, ["comparison_dem", "comparison_rep", "comparison_other"]);
  const counties = new Map();
  for (const row of reviewRows) {
    const key = countyKey(row.county);
    const current = counties.get(key) ?? {
      county: row.county,
      reportingUnits: 0,
      presidentEnr: 0,
      presidentCertified: 0,
      presidentCertifiedMinusEnr: 0,
      houseEnr: 0,
      houseCertified: 0,
      houseCertifiedMinusEnr: 0,
    };
    current.reportingUnits += 1;
    current.presidentEnr += row.pres_total;
    current.houseEnr += row.comparison_total;
    counties.set(key, current);
  }
  for (const [key, row] of counties) {
    const president = certifiedPresident.get(key);
    const house = certifiedHouse.get(key);
    if (!president || !house) throw new Error(`Certified county rows are missing ${row.county}.`);
    row.presidentCertified = president.harris + president.trump + president.other;
    row.presidentCertifiedMinusEnr = row.presidentCertified - row.presidentEnr;
    row.houseCertified = house.comparison_dem + house.comparison_rep + house.comparison_other;
    row.houseCertifiedMinusEnr = row.houseCertified - row.houseEnr;
  }
  assertEqual(counties.size, EXPECTED.counties, "county reconciliation count");
  return [...counties.values()].sort((left, right) => left.county.localeCompare(right.county, "en"));
}

function turnoutReconciliation(enrRows) {
  const eacRows = csvObjects(PATHS.eacTurnout);
  assertEqual(eacRows.length, EXPECTED.counties, "EAC turnout county row count");
  const eac = new Map(eacRows.map((row) => [countyKey(row.jurisdiction_name), row]));
  const rows = enrRows
    .map((row) => {
      const county = sourceCountyName(row.CountyName);
      const eacRow = eac.get(countyKey(county));
      if (!eacRow) throw new Error(`EAC turnout is missing ${county}.`);
      const enrBallotsCast = integer(row.calcVoterTurnout, `${county} calcVoterTurnout`);
      const enrVoters = integer(row.Voters, `${county} Voters`);
      const eacBallotsCast = integer(eacRow.ballots_cast, `${county} EAC ballots_cast`);
      const eacRegisteredVoters = integer(eacRow.registered_voters, `${county} EAC registered_voters`);
      return {
        county,
        enrBallotsCast,
        eacBallotsCast,
        ballotsCastDelta: enrBallotsCast - eacBallotsCast,
        enrVoters,
        eacRegisteredVoters,
        voterDenominatorDelta: enrVoters - eacRegisteredVoters,
      };
    })
    .sort((left, right) => left.county.localeCompare(right.county, "en"));
  assertEqual(new Set(rows.map((row) => countyKey(row.county))).size, EXPECTED.counties, "ENR turnout county count");
  const totals = rows.reduce(
    (sum, row) => {
      for (const field of ["enrBallotsCast", "eacBallotsCast", "ballotsCastDelta", "enrVoters", "eacRegisteredVoters", "voterDenominatorDelta"]) {
        sum[field] += row[field];
      }
      return sum;
    },
    { enrBallotsCast: 0, eacBallotsCast: 0, ballotsCastDelta: 0, enrVoters: 0, eacRegisteredVoters: 0, voterDenominatorDelta: 0 },
  );
  assertEqual(totals.enrBallotsCast, EXPECTED.turnoutEnr.ballotsCast, "ENR turnout ballots");
  assertEqual(totals.enrVoters, EXPECTED.turnoutEnr.voters, "ENR turnout Voters");
  assertEqual(totals.eacBallotsCast, EXPECTED.turnoutEac.ballotsCast, "EAC turnout ballots");
  assertEqual(totals.eacRegisteredVoters, EXPECTED.turnoutEac.registeredVoters, "EAC registered voters");
  return { rows, totals };
}

function sourceArtifact(relative, url, bytes) {
  return {
    sourceAuthority: "South Dakota Secretary of State election-results application",
    sourceUrl: url,
    localArtifactPath: relative,
    electionYear: 2024,
    reportingGrain: relative === PATHS.turnoutRaw ? "county turnout summary" : "county-qualified reporting unit",
    byteCount: bytes.length,
    sha256: sha256(bytes),
  };
}

function outputOrCheck(relative, bytes) {
  const target = abs(relative);
  if (check) {
    if (!existsSync(target)) throw new Error(`Missing generated artifact ${relative}.`);
    const retained = readFileSync(target);
    if (!retained.equals(bytes)) throw new Error(`${relative} is stale; regenerate it without --check.`);
    return;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

const [presidentBytes, houseBytes, turnoutBytes] = await Promise.all([
  sourceBytes(PATHS.presidentRaw, URLS.presidentPrecinct),
  sourceBytes(PATHS.houseRaw, URLS.housePrecinct),
  sourceBytes(PATHS.turnoutRaw, URLS.turnout),
]);
const presidentRows = serviceRows(
  presidentBytes,
  PATHS.presidentRaw,
  12665,
  EXPECTED.presidentCandidateRows,
);
const houseRows = serviceRows(houseBytes, PATHS.houseRaw, 11954, EXPECTED.houseCandidateRows);
const enrTurnoutRows = turnoutRows(turnoutBytes);
const reviewRows = buildReviewRows(groupRace(presidentRows, 4, "President"), groupRace(houseRows, 2, "U.S. House"));
const reviewTotals = sumReview(reviewRows);
assertReviewTotals(reviewTotals);
const countyRows = countyReconciliation(reviewRows);
const turnout = turnoutReconciliation(enrTurnoutRows);
const idClasses = reviewRows.reduce(
  (counts, row) => {
    if (/^\d{4}$/.test(row.source_unit_id)) counts.fourDigit += 1;
    else if (/^C\d{3}$/i.test(row.source_unit_id) && /^Absentee Precinct$/i.test(row.source_unit_name)) counts.absentee += 1;
    else if (/^C\d{3}$/i.test(row.source_unit_id)) counts.otherCPrefixed += 1;
    else throw new Error(`Unreviewed StatePrecinctID format ${row.source_unit_id}.`);
    return counts;
  },
  { fourDigit: 0, absentee: 0, otherCPrefixed: 0 },
);
assertEqual(idClasses.fourDigit, 632, "four-digit reporting units");
assertEqual(idClasses.absentee, 9, "absentee reporting units");
assertEqual(idClasses.otherCPrefixed, 50, "other C-prefixed reporting units");

const columns = [
  "state",
  "election_year",
  "county",
  "local_unit",
  "source_county_id",
  "source_unit_id",
  "source_unit_name",
  "pres_harris",
  "pres_trump",
  "pres_other",
  "pres_total",
  "comparison_dem",
  "comparison_rep",
  "comparison_other",
  "comparison_total",
];
const reviewCsvBytes = Buffer.from(
  toCsv([columns, ...reviewRows.map((row) => columns.map((column) => row[column] ?? ""))]),
);
const rawArtifacts = [
  sourceArtifact(PATHS.presidentRaw, URLS.presidentPrecinct, presidentBytes),
  sourceArtifact(PATHS.houseRaw, URLS.housePrecinct, houseBytes),
  sourceArtifact(PATHS.turnoutRaw, URLS.turnout, turnoutBytes),
];
const reconciliation = {
  schemaVersion: 1,
  state: "SD",
  electionId: "2024-11-05-general",
  reviewedAt: REVIEWED_AT,
  sourceAuthority: "South Dakota Secretary of State",
  parserOrNormalizationPath: "scripts/collect-sd-2024-local-review.mjs",
  certificationStatus: "unofficial_enr_context_only",
  rawArtifacts: rawArtifacts.slice(0, 2),
  normalizedArtifact: {
    localArtifactPath: PATHS.reviewCsv,
    rowCount: reviewRows.length,
    byteCount: reviewCsvBytes.length,
    sha256: sha256(reviewCsvBytes),
  },
  reportingUnits: {
    rows: reviewRows.length,
    counties: EXPECTED.counties,
    sourceIdentity: "CountyID + StatePrecinctID",
    fourDigitGeographicCandidates: idClasses.fourDigit,
    cPrefixedAdministrativeUnits: idClasses.absentee + idClasses.otherCPrefixed,
    cPrefixedAbsenteeUnits: idClasses.absentee,
    cPrefixedOtherUnits: idClasses.otherCPrefixed,
    geometryDecision: "No reporting unit is assigned to geometry by this review-row package.",
  },
  officialEnrTotals: {
    president: {
      candidateRows: presidentRows.length,
      reportingUnits: reviewRows.length,
      harris: reviewTotals.pres_harris,
      trump: reviewTotals.pres_trump,
      other: reviewTotals.pres_other,
      total: reviewTotals.pres_total,
    },
    usHouse: {
      candidateRows: houseRows.length,
      reportingUnits: reviewRows.length,
      democratic: reviewTotals.comparison_dem,
      republican: reviewTotals.comparison_rep,
      other: reviewTotals.comparison_other,
      total: reviewTotals.comparison_total,
    },
  },
  certifiedCanvass: {
    sourceUrl: URLS.certifiedCanvass,
    localArtifactPath: PATHS.certifiedCanvass,
    sha256: sha256(readFileSync(abs(PATHS.certifiedCanvass))),
    president: EXPECTED.presidentCertified,
    usHouse: EXPECTED.houseCertified,
  },
  reconciliation: {
    presidentCertifiedMinusEnr: EXPECTED.presidentCertified.total - reviewTotals.pres_total,
    usHouseCertifiedMinusEnr: EXPECTED.houseCertified.total - reviewTotals.comparison_total,
    countiesWithPresidentDelta: countyRows.filter((row) => row.presidentCertifiedMinusEnr !== 0).length,
    countiesWithUsHouseDelta: countyRows.filter((row) => row.houseCertifiedMinusEnr !== 0).length,
    countyRows,
  },
  activationDecision: {
    reviewCharts: "activate_as_official_source_unofficial_enr_context",
    certifiedResults: "retain_certificate_validated_county_rows",
    geometry: "not_activated",
    reason:
      "The two official ENR endpoints expose the same complete 691-unit universe and support same-grain review. They remain explicitly unofficial and cannot receive the 194 certified President votes or 184 certified U.S. House votes without an official local canvass allocation.",
  },
  caveats: [
    "ElectionID 684 is labeled Unofficial Results by the South Dakota Secretary of State election-results application.",
    "The local ENR totals are 194 President votes and 184 U.S. House votes below the certified State Board of Canvassers totals.",
    "The certified-minus-ENR deltas are retained at county grain only and are never allocated to reporting units.",
    "The 59 C-prefixed administrative reporting units are included in review charts but are not treated as polygon precincts.",
  ],
};
assertEqual(reconciliation.reconciliation.presidentCertifiedMinusEnr, 194, "President certified-minus-ENR delta");
assertEqual(reconciliation.reconciliation.usHouseCertifiedMinusEnr, 184, "U.S. House certified-minus-ENR delta");

const turnoutSemantics = {
  schemaVersion: 1,
  state: "SD",
  electionId: "2024-11-05-general",
  reviewedAt: REVIEWED_AT,
  sourceAuthority: "South Dakota Secretary of State",
  sourceUrls: {
    service: URLS.turnout,
    display: URLS.turnoutPage,
    export: URLS.exportPage,
    terminology: URLS.terminology,
    officialReturns: URLS.officialReturns,
  },
  sourceArtifact: rawArtifacts[2],
  parserOrNormalizationPath: "scripts/collect-sd-2024-local-review.mjs",
  observedFields: {
    county: "CountyName",
    displayedBallotsCast: "calcVoterTurnout",
    displayedVoterDenominator: "Voters",
    reportingStatus: ["PrecinctsReporting", "TotalPrecincts"],
  },
  totals: turnout.totals,
  countyRows: turnout.rows,
  eacFallbackProvenance: {
    source: "EAC 2024 EAVS V2 jurisdiction fallback",
    localArtifactPath: PATHS.eacTurnout,
    rowCount: EXPECTED.counties,
    ballotsCast: EXPECTED.turnoutEac.ballotsCast,
    registeredVoters: EXPECTED.turnoutEac.registeredVoters,
  },
  activeOfficialTurnout: {
    sourceId: "sd-2024-official-active-voter-turnout",
    localArtifactPath: PATHS.officialTurnout,
    sourceUrl: URLS.officialReturns,
    rowCount: EXPECTED.counties,
    ballotsCast: EXPECTED.turnoutOfficial.ballotsCast,
    activeVoters: EXPECTED.turnoutOfficial.activeVoters,
    denominatorTiming: "November 5, 2024",
  },
  replacementDecision: {
    decision: "superseded_by_official_returns_active_voter_table",
    activeTurnoutSourceId: "sd-2024-official-active-voter-turnout",
    reason:
      "The official Election Returns and Registration Figures report supplies a dated county table whose 624,175 denominator is identified as active voters as of November 5, 2024. Its 436,478 ballots-cast total matches calcVoterTurnout in every ENR county, while the untimestamped ENR Voters field totals 1,017 higher and is not substituted for the official table.",
    confirmationNeeded:
      "Optional clarification of the untimestamped ElectionID 684 Voters field and its county-level differences from the dated official active-voter table.",
  },
  caveats: [
    "This report preserves the ENR-versus-EAC comparison; active turnout comes from the separately hash-pinned official Election Returns and Registration Figures report.",
    "No county percentage should mix ElectionID 684 calcVoterTurnout with the EAC total-registration denominator.",
    "The 739-ballot difference from EAC is a cross-source reporting difference, not an error or misconduct claim.",
  ],
};
assertEqual(turnout.totals.ballotsCastDelta, 739, "ENR-minus-EAC ballot delta");
assertEqual(turnout.totals.voterDenominatorDelta, -65114, "ENR-minus-EAC voter denominator delta");

if (collect) {
  outputOrCheck(PATHS.presidentRaw, presidentBytes);
  outputOrCheck(PATHS.houseRaw, houseBytes);
  outputOrCheck(PATHS.turnoutRaw, turnoutBytes);
}
outputOrCheck(PATHS.reviewCsv, reviewCsvBytes);
outputOrCheck(PATHS.reconciliation, jsonBytes(reconciliation));
outputOrCheck(PATHS.turnoutSemantics, jsonBytes(turnoutSemantics));

console.log(
  JSON.stringify(
    {
      mode: check ? "check" : collect ? "collect" : "normalize",
      reviewRows: reviewRows.length,
      reviewTotals,
      reportingUnitClasses: idClasses,
      presidentCertifiedMinusEnr: reconciliation.reconciliation.presidentCertifiedMinusEnr,
      usHouseCertifiedMinusEnr: reconciliation.reconciliation.usHouseCertifiedMinusEnr,
      turnoutTotals: turnout.totals,
      outputs: [PATHS.reviewCsv, PATHS.reconciliation, PATHS.turnoutSemantics],
    },
    null,
    2,
  ),
);
