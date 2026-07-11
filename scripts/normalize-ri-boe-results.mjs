import { readFileSync, writeFileSync } from "node:fs";
import { readFinalizedRootEntry } from "./lib/ri-finalized-zip.mjs";
import { RI_CITY_TOWN_COUNTIES, RI_COUNTY_TAGS } from "./lib/ri-jurisdictions.mjs";

const STATE = "RI";

const CURRENT = {
  year: 2024,
  zipPath: "data/ri-2024-general-election-long-format.zip",
  finalizedEntryName: "rigen2024l.txt",
  statewideJsonPath: "data/ri-2024-general-election-statewide.json",
  presidentCsvPath: "data/ri-2024-general-president-city-town.csv",
  reviewCsvPath: "data/ri-2024-general-president-senate-review.csv",
  presidentSourceUrl: "https://www.ri.gov/election/results/2024/general_election/data/rigen2024l.zip",
};

const HISTORICAL = [
  {
    year: 2012,
    zipPath: "data/ri-2012-general-election-long-format.zip",
    finalizedEntryName: "rigen2012l.asc",
    statewideJsonPath: "data/ri-2012-general-election-statewide.json",
    sourceUrl: "https://www.ri.gov/election/results/2012/general_election/data/rigen2012l.zip",
  },
  {
    year: 2016,
    zipPath: "data/ri-2016-general-election-long-format.zip",
    finalizedEntryName: "rigen2016l.asc",
    statewideJsonPath: "data/ri-2016-general-election-statewide.json",
    sourceUrl: "https://www.ri.gov/election/results/2016/general_election/data/rigen2016l.zip",
  },
  {
    year: 2020,
    zipPath: "data/ri-2020-general-election-long-format.zip",
    finalizedEntryName: "rigen2020l.asc",
    statewideJsonPath: "data/ri-2020-general-election-statewide.json",
    sourceUrl: "https://www.ri.gov/election/results/2020/general_election/data/rigen2020l.zip",
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

async function readLongRecords(zipPath, finalizedEntryName) {
  const text = await readFinalizedRootEntry(readFileSync(zipPath), finalizedEntryName, zipPath);
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

function assertExactTotals(label, parsedTotals, postedTotals) {
  const delta = {
    dem: postedTotals.dem - parsedTotals.dem,
    rep: postedTotals.rep - parsedTotals.rep,
    other: postedTotals.other - parsedTotals.other,
    total: postedTotals.total - parsedTotals.total,
  };
  if (delta.total || delta.dem || delta.rep || delta.other) {
    throw new Error(`${label} finalized-root totals do not match posted statewide totals: ${JSON.stringify(delta)}`);
  }
  return delta;
}

function levelForJurisdiction(jurisdiction) {
  if (jurisdiction === "Federal Precincts") return "federal_precincts";
  return "city_town";
}

function sortedEntries(map) {
  return [...map.entries()].sort(([left], [right]) => left.localeCompare(right));
}

async function normalizeCurrent() {
  const records = await readLongRecords(CURRENT.zipPath, CURRENT.finalizedEntryName);
  const president = extractContest(records, "president");
  const senate = extractContest(records, "senate");
  const presidentParsedTotals = totalsForJurisdictions(president.byJurisdiction);
  const senateParsedTotals = totalsForJurisdictions(senate.byJurisdiction);
  const presidentPostedTotals = readStatewideBuckets(CURRENT.statewideJsonPath, "Presidential Electors For:");
  const senatePostedTotals = readStatewideBuckets(CURRENT.statewideJsonPath, "Senator in Congress");
  const presidentDelta = assertExactTotals(
    "2024 RI President",
    presidentParsedTotals,
    presidentPostedTotals,
  );
  const senateDelta = assertExactTotals(
    "2024 RI Senate",
    senateParsedTotals,
    senatePostedTotals,
  );

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
    presidentTotal: presidentParsedTotals.total,
    senateZipTotal: senateParsedTotals.total,
    senatePostedTotal: senatePostedTotals.total,
    presidentDelta,
    senateDelta,
    presidentialOnlyRows: presidentReportingEntries.filter(([key, unit]) => !senate.byReportingUnit.has(key) && unit.votes.total > 0)
      .length,
    zeroVoteSameKeyRows: presidentReportingEntries.filter(([key, unit]) => senate.byReportingUnit.has(key) && unit.votes.total === 0)
      .length,
  };
}

async function normalizeHistorical() {
  const rows = [];
  for (const source of HISTORICAL) {
    const records = await readLongRecords(source.zipPath, source.finalizedEntryName);
    const president = extractContest(records, "president");
    const parsedTotals = totalsForJurisdictions(president.byJurisdiction);
    const postedTotals = readStatewideBuckets(source.statewideJsonPath, "Presidential Electors For:");
    assertExactTotals(`${source.year} RI President`, parsedTotals, postedTotals);

    const byCounty = new Map([...RI_COUNTY_TAGS.keys()].map((county) => [county, emptyVotes()]));
    const nonGeographic = [];
    for (const [jurisdiction, votes] of sortedEntries(president.byJurisdiction)) {
      if (jurisdiction === "Federal Precincts") {
        nonGeographic.push({ jurisdiction, votes, level: "federal_precincts" });
        continue;
      }
      const county = RI_CITY_TOWN_COUNTIES.get(jurisdiction);
      if (!county) {
        throw new Error(`${source.year} RI historical city/town row did not map to a county: ${jurisdiction}`);
      }
      const target = byCounty.get(county);
      target.dem += votes.dem;
      target.rep += votes.rep;
      target.other += votes.other;
      target.total += votes.total;
    }

    for (const [county, votes] of sortedEntries(byCounty)) {
      rows.push({
        state: STATE,
        election_year: source.year,
        jurisdiction_name: county,
        jurisdiction_tag: RI_COUNTY_TAGS.get(county),
        source_id: "ri-historical-presidential-baseline",
        source_level: "county",
        row_method: "rhodeIslandBoeLongFormatZipCountyAggregation",
        dem_votes: votes.dem,
        rep_votes: votes.rep,
        other_votes: votes.other,
        total_votes: votes.total,
        source_url: source.sourceUrl,
        local_unit: county,
        notes: "County presidential baseline row aggregated from official RI BOE city/town long-format ZIP rows.",
      });
    }
    for (const { jurisdiction, votes, level } of nonGeographic) {
      rows.push({
        state: STATE,
        election_year: source.year,
        jurisdiction_name: jurisdiction,
        jurisdiction_tag: "",
        source_id: "ri-historical-presidential-baseline",
        source_level: level,
        row_method: "rhodeIslandBoeLongFormatZipNonGeographic",
        dem_votes: votes.dem,
        rep_votes: votes.rep,
        other_votes: votes.other,
        total_votes: votes.total,
        source_url: source.sourceUrl,
        local_unit: jurisdiction,
        notes: "Non-geographic federal precinct rows retained from the official RI BOE long-format ZIP and left unforced for county FIPS joins.",
      });
    }
  }
  writeCsv(historicalCsvPath, rows, [
    "state",
    "election_year",
    "jurisdiction_name",
    "jurisdiction_tag",
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
