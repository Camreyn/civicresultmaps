import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";

const STATE = "RI";

const CURRENT = {
  year: 2024,
  zipPath: "data/ri-2024-general-election-long-format.zip",
  statewideJsonPath: "data/ri-2024-general-election-statewide.json",
  presidentCsvPath: "data/ri-2024-general-president-city-town.csv",
  reviewCsvPath: "data/ri-2024-general-president-senate-review.csv",
  presidentSourceUrl: "https://www.ri.gov/election/results/2024/general_election/data/rigen2024l.zip",
};

const HISTORICAL = [
  {
    year: 2012,
    zipPath: "data/ri-2012-general-election-long-format.zip",
    statewideJsonPath: "data/ri-2012-general-election-statewide.json",
    sourceUrl: "https://www.ri.gov/election/results/2012/general_election/data/rigen2012l.zip",
  },
  {
    year: 2016,
    zipPath: "data/ri-2016-general-election-long-format.zip",
    statewideJsonPath: "data/ri-2016-general-election-statewide.json",
    sourceUrl: "https://www.ri.gov/election/results/2016/general_election/data/rigen2016l.zip",
  },
];

const historicalCsvPath = "data/ri-historical-presidential-baseline.csv";

function intText(value) {
  const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
  return cleaned ? Number.parseInt(cleaned, 10) : 0;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path, rows, columns) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column])).join(","));
  }
  writeFileSync(path, `${lines.join("\n")}\n`);
}

function normalizeContestTitle(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseLongRecord(line) {
  const padded = line.padEnd(263, " ");
  const oldParty = padded.slice(47, 50).trim();
  const newParty = padded.slice(101, 104).trim();
  const usesLegacyLayout = !/^[A-Za-z&]{2,3}$/u.test(newParty) && /^[A-Za-z]{2,3}$/u.test(oldParty);
  if (usesLegacyLayout) {
    return {
      contestNumber: padded.slice(0, 4).trim(),
      candidateNumber: padded.slice(4, 7).trim(),
      precinctCode: padded.slice(7, 11).trim(),
      totalVotes: intText(padded.slice(11, 17)),
      partyCode: oldParty,
      districtTypeId: "",
      districtCode: "",
      contestTitle: normalizeContestTitle(padded.slice(57, 113)),
      candidateName: padded.slice(113, 151).trim(),
      precinctName: padded.slice(151, 181).trim(),
      districtName: padded.slice(181, 206).trim(),
      votesAllowed: intText(padded.slice(206, 208)),
      referendumFlag: padded.slice(208, 209).trim(),
    };
  }
  return {
    contestNumber: padded.slice(0, 4).trim(),
    candidateNumber: padded.slice(4, 7).trim(),
    precinctCode: padded.slice(7, 11).trim(),
    totalVotes: intText(padded.slice(11, 17)),
    partyCode: newParty,
    districtTypeId: padded.slice(104, 107).trim(),
    districtCode: padded.slice(107, 111).trim(),
    contestTitle: normalizeContestTitle(padded.slice(111, 167)),
    candidateName: padded.slice(167, 205).trim(),
    precinctName: padded.slice(205, 235).trim(),
    districtName: padded.slice(235, 260).trim(),
    votesAllowed: intText(padded.slice(260, 262)),
    referendumFlag: padded.slice(262, 263).trim(),
  };
}

function jurisdictionFromPrecinct(precinctName) {
  const name = String(precinctName ?? "").trim();
  if (/^Federal (?:Precinct|District)/i.test(name)) {
    return "Federal Precincts";
  }
  return name
    .replace(/\s+\d{4}$/u, "")
    .replace(/\s+Limited(?:\s+\d+)?$/u, "")
    .replace(/\s+Presidential$/u, "")
    .replace(/\s+President$/u, "")
    .trim();
}

function bucketCandidate(record, contestKind) {
  const party = record.partyCode.toUpperCase();
  const candidate = record.candidateName.toLowerCase();
  if (contestKind === "president") {
    if (party === "DEM") return "dem";
    if (party === "REP") return "rep";
    return "other";
  }
  if (contestKind === "senate") {
    if (party === "DEM" || candidate.includes("whitehouse")) return "dem";
    if (party === "REP" || candidate.includes("morgan")) return "rep";
    return "other";
  }
  return "other";
}

function emptyVotes() {
  return { dem: 0, rep: 0, other: 0, total: 0 };
}

async function readLongRecords(zipPath) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const entry = Object.values(zip.files).find(
    (file) => !file.dir && !file.name.includes("__MACOSX") && /(?:_results\.(?:txt|asc)|l\.asc)$/iu.test(file.name),
  );
  if (!entry) {
    throw new Error(`Could not find long-format results file in ${zipPath}`);
  }
  const text = await entry.async("string");
  return text
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map(parseLongRecord);
}

function extractContest(records, contestKind) {
  const titleNeedle = contestKind === "president" ? "Presidential Electors For:" : "Senator in Congress";
  const byReportingUnit = new Map();
  const byJurisdiction = new Map();

  for (const record of records) {
    if (record.contestTitle.toLowerCase() !== titleNeedle.toLowerCase()) continue;
    const jurisdiction = jurisdictionFromPrecinct(record.precinctName);
    if (!jurisdiction) continue;
    const key = `${record.precinctCode}|${record.precinctName}`;
    const bucket = bucketCandidate(record, contestKind);
    const unit = byReportingUnit.get(key) ?? {
      jurisdiction,
      localUnit: record.precinctName,
      precinctCode: record.precinctCode,
      votes: emptyVotes(),
    };
    unit.votes[bucket] += record.totalVotes;
    unit.votes.total += record.totalVotes;
    byReportingUnit.set(key, unit);

    const jurisdictionVotes = byJurisdiction.get(jurisdiction) ?? emptyVotes();
    jurisdictionVotes[bucket] += record.totalVotes;
    jurisdictionVotes.total += record.totalVotes;
    byJurisdiction.set(jurisdiction, jurisdictionVotes);
  }

  return { byReportingUnit, byJurisdiction };
}

function readStatewideBuckets(jsonPath, contestName) {
  const payload = JSON.parse(readFileSync(jsonPath, "utf8"));
  const contest = payload.contests.find((entry) => String(entry.name ?? "").toLowerCase() === contestName.toLowerCase());
  if (!contest) {
    throw new Error(`Missing ${contestName} in ${jsonPath}`);
  }
  const votes = emptyVotes();
  for (const candidate of contest.candidates) {
    const party = String(candidate.party_code ?? "").toUpperCase();
    const name = String(candidate.name ?? "").toLowerCase();
    const bucket = party === "DEM" || name.includes("whitehouse") ? "dem" : party === "REP" ? "rep" : "other";
    const value = intText(candidate.votes);
    votes[bucket] += value;
    votes.total += value;
  }
  return votes;
}

function totalsForJurisdictions(byJurisdiction) {
  const totals = emptyVotes();
  for (const votes of byJurisdiction.values()) {
    totals.dem += votes.dem;
    totals.rep += votes.rep;
    totals.other += votes.other;
    totals.total += votes.total;
  }
  return totals;
}

function reconcileJurisdictionTotals(byJurisdiction, parsedTotals, postedTotals) {
  const delta = {
    dem: postedTotals.dem - parsedTotals.dem,
    rep: postedTotals.rep - parsedTotals.rep,
    other: postedTotals.other - parsedTotals.other,
    total: postedTotals.total - parsedTotals.total,
  };
  if (delta.total || delta.dem || delta.rep || delta.other) {
    byJurisdiction.set("Statewide Reconciliation Delta", delta);
  }
  return delta;
}

function levelForJurisdiction(jurisdiction) {
  if (jurisdiction === "Statewide Reconciliation Delta") return "non_geographic_reconciliation";
  if (jurisdiction === "Federal Precincts") return "federal_precincts";
  return "city_town";
}

function sortedEntries(map) {
  return [...map.entries()].sort(([left], [right]) => left.localeCompare(right));
}

async function normalizeCurrent() {
  const records = await readLongRecords(CURRENT.zipPath);
  const president = extractContest(records, "president");
  const senate = extractContest(records, "senate");
  const presidentParsedTotals = totalsForJurisdictions(president.byJurisdiction);
  const senateParsedTotals = totalsForJurisdictions(senate.byJurisdiction);
  const presidentPostedTotals = readStatewideBuckets(CURRENT.statewideJsonPath, "Presidential Electors For:");
  const senatePostedTotals = readStatewideBuckets(CURRENT.statewideJsonPath, "Senator in Congress");
  const presidentDelta = reconcileJurisdictionTotals(
    president.byJurisdiction,
    presidentParsedTotals,
    presidentPostedTotals,
  );
  const reconciledPresidentTotals = totalsForJurisdictions(president.byJurisdiction);
  if (reconciledPresidentTotals.total !== presidentPostedTotals.total) {
    throw new Error("2024 RI President reconciliation failed");
  }

  const presidentRows = sortedEntries(president.byJurisdiction).map(([jurisdiction, votes]) => ({
    state: STATE,
    election_year: CURRENT.year,
    jurisdiction_name: jurisdiction,
    jurisdiction_code: jurisdiction.toUpperCase().replace(/[^A-Z0-9]+/gu, "_").replace(/^_|_$/gu, ""),
    level: levelForJurisdiction(jurisdiction),
    harris: votes.dem,
    trump: votes.rep,
    other: votes.other,
    total_votes: votes.total,
    source_url: CURRENT.presidentSourceUrl,
  }));
  writeCsv(CURRENT.presidentCsvPath, presidentRows, [
    "state",
    "election_year",
    "jurisdiction_name",
    "jurisdiction_code",
    "level",
    "harris",
    "trump",
    "other",
    "total_votes",
    "source_url",
  ]);

  const presidentReportingEntries = sortedEntries(president.byReportingUnit);
  const reviewRows = presidentReportingEntries
    .filter(([key, unit]) => senate.byReportingUnit.has(key) && unit.votes.total > 0)
    .map(([key, unit]) => {
      const comparison = senate.byReportingUnit.get(key).votes;
      return {
        state: STATE,
        election_year: CURRENT.year,
        county: unit.jurisdiction,
        local_unit: unit.localUnit,
        precinct_code: unit.precinctCode,
        pres_harris: unit.votes.dem,
        pres_trump: unit.votes.rep,
        pres_other: unit.votes.other,
        pres_total: unit.votes.total,
        comparison_dem: comparison.dem,
        comparison_rep: comparison.rep,
        comparison_other: comparison.other,
        comparison_total: comparison.total,
        source_url: CURRENT.presidentSourceUrl,
      };
    });
  writeCsv(CURRENT.reviewCsvPath, reviewRows, [
    "state",
    "election_year",
    "county",
    "local_unit",
    "precinct_code",
    "pres_harris",
    "pres_trump",
    "pres_other",
    "pres_total",
    "comparison_dem",
    "comparison_rep",
    "comparison_other",
    "comparison_total",
    "source_url",
  ]);

  return {
    presidentRows: presidentRows.length,
    reviewRows: reviewRows.length,
    presidentTotal: reconciledPresidentTotals.total,
    senateZipTotal: senateParsedTotals.total,
    senatePostedTotal: senatePostedTotals.total,
    presidentDelta,
    senateDelta: {
      dem: senatePostedTotals.dem - senateParsedTotals.dem,
      rep: senatePostedTotals.rep - senateParsedTotals.rep,
      other: senatePostedTotals.other - senateParsedTotals.other,
      total: senatePostedTotals.total - senateParsedTotals.total,
    },
    presidentialOnlyRows: presidentReportingEntries.filter(([key, unit]) => !senate.byReportingUnit.has(key) && unit.votes.total > 0)
      .length,
    zeroVoteSameKeyRows: presidentReportingEntries.filter(([key, unit]) => senate.byReportingUnit.has(key) && unit.votes.total === 0)
      .length,
  };
}

async function normalizeHistorical() {
  const rows = [];
  for (const source of HISTORICAL) {
    const records = await readLongRecords(source.zipPath);
    const president = extractContest(records, "president");
    const parsedTotals = totalsForJurisdictions(president.byJurisdiction);
    const postedTotals = readStatewideBuckets(source.statewideJsonPath, "Presidential Electors For:");
    reconcileJurisdictionTotals(president.byJurisdiction, parsedTotals, postedTotals);
    const reconciledTotals = totalsForJurisdictions(president.byJurisdiction);
    if (reconciledTotals.total !== postedTotals.total) {
      throw new Error(`${source.year} RI President reconciliation failed`);
    }
    for (const [jurisdiction, votes] of sortedEntries(president.byJurisdiction)) {
      rows.push({
        state: STATE,
        election_year: source.year,
        jurisdiction_name: jurisdiction,
        source_id: "ri-historical-presidential-baseline",
        source_level: levelForJurisdiction(jurisdiction),
        row_method: "rhodeIslandBoeLongFormatZip",
        dem_votes: votes.dem,
        rep_votes: votes.rep,
        other_votes: votes.other,
        total_votes: votes.total,
        source_url: source.sourceUrl,
        local_unit: jurisdiction,
        notes:
          jurisdiction === "Federal Precincts"
            ? "Non-geographic federal precinct rows retained from the official RI BOE long-format ZIP."
            : jurisdiction === "Statewide Reconciliation Delta"
              ? "Posted statewide JSON total minus long-format ZIP row total; retained as a non-geographic reconciliation row."
              : "City/town presidential baseline row normalized from the official RI BOE long-format ZIP.",
      });
    }
  }
  writeCsv(historicalCsvPath, rows, [
    "state",
    "election_year",
    "jurisdiction_name",
    "source_id",
    "source_level",
    "row_method",
    "dem_votes",
    "rep_votes",
    "other_votes",
    "total_votes",
    "source_url",
    "local_unit",
    "notes",
  ]);
  return { historicalRows: rows.length };
}

const current = await normalizeCurrent();
const historical = await normalizeHistorical();
console.log(JSON.stringify({ current, historical }, null, 2));
