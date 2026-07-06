import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const repoRoot = process.cwd();

const SOURCES = {
  voterStatsZip: "data/nc-2024-voter-stats.zip",
  voterStatsEntry: "voter_stats_20241105.txt",
  voterStatsUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2024_11_05/voter_stats_20241105.zip",
  historyStatsZip: "data/nc-2024-history-stats.zip",
  historyStatsEntry: "history_stats_20241105.txt",
  historyStatsUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2024_11_05/history_stats_20241105.zip",
  turnoutPageUrl: "https://www.ncsbe.gov/results-data/voter-turnout/2024-general-election-turnout",
  eacFallbackCsv: "data/eac-2024-state-turnout/nc-2024-eac-turnout.csv",
};

const outputCsvPath = process.argv[2] ?? path.join(repoRoot, "data", "nc-2024-turnout-denominator-lead.csv");
const outputSummaryPath = process.argv[3] ?? path.join(repoRoot, "data", "nc-2024-turnout-source-review.json");

const expected = {
  ncsbeVoterStatsRegisteredVoters: 7854464,
  ncsbeHistoryStatsVoters: 5705861,
  ncsbeTurnoutPageMethodTotals: {
    C: 18215,
    EC: 185711,
    EV: 4029071,
    M: 298076,
    P: 17149,
    T: 15271,
    V: 1142368,
  },
  eacFallback: {
    rows: 100,
    ballotsCast: 5756106,
    registeredVoters: 7854464,
  },
};

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function parseIntCell(value) {
  const parsed = Number.parseInt(String(value ?? "").replace(/,/g, "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseSimpleCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

async function readZipEntry(zipRelativePath, entryName) {
  const zip = await JSZip.loadAsync(readFileSync(repoPath(zipRelativePath)));
  const entry = zip.file(entryName);
  if (!entry) {
    throw new Error(`Missing ${entryName} in ${zipRelativePath}`);
  }
  return entry.async("string");
}

function countyTitle(countyDesc) {
  const value = String(countyDesc || "").trim();
  if (!value) {
    return "";
  }
  const titled = value.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase());
  return /\bCounty$/i.test(titled) ? titled : `${titled} County`;
}

function addToMap(map, key, amount) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function parseTabDelimitedTotals(text, requiredColumns, onRow) {
  const lines = text.trimEnd().split(/\r?\n/);
  const headers = lines[0].split("\t");
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  const missing = requiredColumns.filter((column) => indexes[column] === undefined);
  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line.trim()) {
      continue;
    }
    const columns = line.split("\t");
    const row = Object.fromEntries(requiredColumns.map((column) => [column, columns[indexes[column]] ?? ""]));
    onRow(row);
  }

  return lines.length - 1;
}

function aggregateVoterStats(text) {
  const byCounty = new Map();
  const precincts = new Set();
  let total = 0;
  const rows = parseTabDelimitedTotals(
    text,
    ["county_desc", "election_date", "stats_type", "precinct_abbrv", "vtd_abbrv", "total_voters"],
    (row) => {
      if (row.election_date !== "11/05/2024" || row.stats_type !== "voter") {
        throw new Error(`Unexpected voter stats row scope: ${JSON.stringify(row)}`);
      }
      const county = countyTitle(row.county_desc);
      const voters = parseIntCell(row.total_voters);
      addToMap(byCounty, county, voters);
      precincts.add(`${county}|${row.precinct_abbrv}|${row.vtd_abbrv}`);
      total += voters;
    },
  );
  return { rows, byCounty, precincts: precincts.size, total };
}

function aggregateHistoryStats(text) {
  const byCounty = new Map();
  const byMethod = new Map();
  const precincts = new Set();
  let total = 0;
  const rows = parseTabDelimitedTotals(
    text,
    ["county_desc", "precinct_abbrv", "vtd_abbrv", "total_voters", "election_date", "stats_type", "voting_method"],
    (row) => {
      if (row.election_date !== "11/05/2024" || row.stats_type !== "history") {
        throw new Error(`Unexpected history stats row scope: ${JSON.stringify(row)}`);
      }
      const county = countyTitle(row.county_desc);
      const voters = parseIntCell(row.total_voters);
      addToMap(byCounty, county, voters);
      addToMap(byMethod, row.voting_method, voters);
      precincts.add(`${county}|${row.precinct_abbrv}|${row.vtd_abbrv}`);
      total += voters;
    },
  );
  return { rows, byCounty, byMethod, precincts: precincts.size, total };
}

function readEacBenchmark() {
  const rows = parseSimpleCsv(readFileSync(repoPath(SOURCES.eacFallbackCsv), "utf8"));
  const totals = rows.reduce(
    (accumulator, row) => ({
      ballotsCast: accumulator.ballotsCast + parseIntCell(row.ballots_cast),
      registeredVoters: accumulator.registeredVoters + parseIntCell(row.registered_voters),
    }),
    { ballotsCast: 0, registeredVoters: 0 },
  );
  return { rows: rows.length, ...totals };
}

function assertEqual(actual, expectedValue, label) {
  if (actual !== expectedValue) {
    throw new Error(`${label} mismatch: expected ${expectedValue}, got ${actual}`);
  }
}

function writeTurnoutLeadCsv(voterStats, historyStats) {
  const counties = [...voterStats.byCounty.keys()].sort((a, b) => a.localeCompare(b));
  const missingHistory = counties.filter((county) => !historyStats.byCounty.has(county));
  if (missingHistory.length) {
    throw new Error(`Missing history stats for counties: ${missingHistory.join(", ")}`);
  }
  if (counties.length !== 100) {
    throw new Error(`Expected 100 North Carolina county rows, got ${counties.length}`);
  }

  const headers = [
    "state",
    "election_year",
    "jurisdiction_name",
    "county",
    "local_unit",
    "level",
    "ballots_cast",
    "registered_voters",
    "turnout_pct",
    "denominator_type",
    "denominator_timing",
    "denominator_note",
    "warning_required",
    "source_url",
    "source_title",
    "source_status",
    "notes",
  ];

  const records = counties.map((county) => {
    const ballotsCast = historyStats.byCounty.get(county);
    const registeredVoters = voterStats.byCounty.get(county);
    return {
      state: "NC",
      election_year: 2024,
      jurisdiction_name: county,
      county,
      local_unit: county,
      level: "county",
      ballots_cast: ballotsCast,
      registered_voters: registeredVoters,
      turnout_pct: ((ballotsCast / registeredVoters) * 100).toFixed(4),
      denominator_type: "registeredVoters",
      denominator_timing: "ncsbeElectionTimeVoterStats",
      denominator_note: "NCSBE 2024 General registered-voter stats at election time; turnout numerator is NCSBE voter-history voters who participated, not presidential contest votes.",
      warning_required: "true",
      source_url: `${SOURCES.historyStatsUrl}; ${SOURCES.voterStatsUrl}`,
      source_title: "North Carolina State Board of Elections 2024 General voter history and registered-voter stats ZIPs",
      source_status: "loaded",
      notes: "State-native turnout-denominator lead generated by scripts/normalize-nc-turnout.mjs from official NCSBE grouped stats ZIPs; not active until history-stats voter counts versus ballots-cast semantics are reviewed.",
    };
  });

  const csv = [headers.join(","), ...records.map((record) => headers.map((header) => csvEscape(record[header])).join(","))].join("\n");
  writeFileSync(outputCsvPath, `${csv}\n`);
  return records;
}

async function main() {
  const [voterStatsText, historyStatsText] = await Promise.all([
    readZipEntry(SOURCES.voterStatsZip, SOURCES.voterStatsEntry),
    readZipEntry(SOURCES.historyStatsZip, SOURCES.historyStatsEntry),
  ]);

  const voterStats = aggregateVoterStats(voterStatsText);
  const historyStats = aggregateHistoryStats(historyStatsText);
  const eac = readEacBenchmark();

  assertEqual(voterStats.total, expected.ncsbeVoterStatsRegisteredVoters, "NCSBE registered-voter stats total");
  assertEqual(historyStats.total, expected.ncsbeHistoryStatsVoters, "NCSBE history stats voter total");
  for (const [method, value] of Object.entries(expected.ncsbeTurnoutPageMethodTotals)) {
    assertEqual(historyStats.byMethod.get(method) ?? 0, value, `NCSBE history stats ${method} total`);
  }
  assertEqual(eac.rows, expected.eacFallback.rows, "EAC fallback row count");
  assertEqual(eac.ballotsCast, expected.eacFallback.ballotsCast, "EAC fallback ballots cast");
  assertEqual(eac.registeredVoters, expected.eacFallback.registeredVoters, "EAC fallback registered voters");

  const records = writeTurnoutLeadCsv(voterStats, historyStats);
  const summary = {
    state: "NC",
    electionYear: 2024,
    parser: "scripts/normalize-nc-turnout.mjs",
    sourceAuthority: "North Carolina State Board of Elections",
    sourcePages: [
      "https://www.ncsbe.gov/results-data/voter-registration-data",
      "https://www.ncsbe.gov/results-data/voter-history-data",
      SOURCES.turnoutPageUrl,
    ],
    sourceArtifacts: {
      voterStats: {
        sourceUrl: SOURCES.voterStatsUrl,
        localFile: SOURCES.voterStatsZip,
        entry: SOURCES.voterStatsEntry,
        rows: voterStats.rows,
        counties: voterStats.byCounty.size,
        uniqueCountyPrecinctVtdKeys: voterStats.precincts,
        registeredVoters: voterStats.total,
      },
      historyStats: {
        sourceUrl: SOURCES.historyStatsUrl,
        localFile: SOURCES.historyStatsZip,
        entry: SOURCES.historyStatsEntry,
        rows: historyStats.rows,
        counties: historyStats.byCounty.size,
        uniqueCountyPrecinctVtdKeys: historyStats.precincts,
        votersWhoVoted: historyStats.total,
        votingMethodTotals: Object.fromEntries([...historyStats.byMethod.entries()].sort()),
      },
      turnoutDenominatorLead: {
        localFile: path.relative(repoRoot, outputCsvPath).replace(/\\/g, "/"),
        rows: records.length,
        votersWhoVoted: historyStats.total,
        registeredVoters: voterStats.total,
      },
    },
    officialPublicPageChecks: {
      ncsbe2024GeneralElectionTurnoutTotalVoters: expected.ncsbeHistoryStatsVoters,
      ncsbe2024GeneralElectionTurnoutEligibleVoters: 7763502,
      ncsbeVoterTurnoutOverviewBallotsCast: 5723987,
      note: "The lead rows use voter_stats_20241105.zip for registered voters and history_stats_20241105.zip for voter-history participants. The voter_stats denominator matches active EAC registered voters, but it is 90,962 higher than the NCSBE turnout overview's eligible-voter figure.",
    },
    eacBenchmark: {
      localFile: SOURCES.eacFallbackCsv,
      rows: eac.rows,
      ballotsCast: eac.ballotsCast,
      registeredVoters: eac.registeredVoters,
      ncsbeHistoryMinusEacBallotsCast: historyStats.total - eac.ballotsCast,
      ncsbeRegisteredMinusEacRegistered: voterStats.total - eac.registeredVoters,
    },
    replacementDecision: "Do not replace active EAC fallback turnout yet. The NCSBE voter_stats ZIP improves provenance for the registered-voter denominator and matches the active EAC denominator exactly, but the history_stats voter-history total is below both EAC ballots cast and the NCSBE turnout overview's ballots-cast figure. Keep the generated CSV as a state-native turnout-denominator lead until numerator semantics are reviewed.",
    caveats: [
      "NCSBE history_stats_20241105.zip reports voters who participated by county, precinct, voting method, and demographics; it does not contain candidate choices or ballot item results.",
      "NCSBE voter_stats_20241105.zip reports election-time registered-voter demographic counts by county and precinct; it is a denominator source, not a turnout numerator by itself.",
      "The generated lead rows are county aggregates for source review and should not be used as same-grain precinct advisory inputs until precinct geometry/crosswalk and display semantics are reviewed.",
      "The statewide voter-history total is 50,245 below the EAC fallback ballots-cast total and 18,126 below the NCSBE turnout overview page's 2024 ballots-cast figure.",
    ],
  };
  writeFileSync(outputSummaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Wrote ${records.length} North Carolina turnout-denominator lead rows to ${path.relative(repoRoot, outputCsvPath).replace(/\\/g, "/")}`);
  console.log(`Wrote North Carolina turnout source review to ${path.relative(repoRoot, outputSummaryPath).replace(/\\/g, "/")}`);
}

main();
