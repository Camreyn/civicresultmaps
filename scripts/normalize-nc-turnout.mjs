import { createHash } from "node:crypto";
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

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const positionalArgs = args.filter((arg) => arg !== "--check");
if (positionalArgs.some((arg) => arg.startsWith("--"))) {
  throw new Error(`Unknown option: ${positionalArgs.find((arg) => arg.startsWith("--"))}`);
}
const outputCsvPath = path.resolve(repoRoot, positionalArgs[0] ?? path.join(repoRoot, "data", "nc-2024-turnout-denominator-lead.csv"));
const outputSummaryPath = path.resolve(repoRoot, positionalArgs[1] ?? path.join(repoRoot, "data", "nc-2024-turnout-source-review.json"));

const expected = {
  ncsbeVoterStatsRows: 685049,
  ncsbeVoterStatsCounties: 100,
  ncsbeVoterStatsPrecinctKeys: 3250,
  ncsbeVoterStatsUnassignedIdentityRows: 576,
  ncsbeVoterStatsRegisteredVoters: 7854464,
  ncsbeHistoryStatsRows: 987529,
  ncsbeHistoryStatsCounties: 100,
  ncsbeHistoryStatsPrecinctKeys: 3211,
  ncsbeHistoryStatsUnassignedIdentityRows: 142,
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

const pinned = {
  voterStatsZip: {
    byteCount: 6522548,
    sha256: "48685b14b1a58e07417fb8756778a8faf3e4d536228b4a9651d156be4a39fe6c",
  },
  voterStatsEntry: {
    byteCount: 48726474,
    sha256: "a2472e9c4e19504f259a2624eae028c0d3844cd7b986860be36987f40c0cfdfe",
  },
  historyStatsZip: {
    byteCount: 4715895,
    sha256: "56305c7b7c84a2a58702e87e4a5dcd176ce50281f62b894b24af0b162a008085",
  },
  historyStatsEntry: {
    byteCount: 88112050,
    sha256: "9360820ed58a370b767977a7a0e9adcca98cdfdc14ff7b8b8dfd3da18a55c641",
  },
  eacFallbackCsv: {
    byteCount: 28220,
    sha256: "2f6d17734e5e3da0593427943a37ae9667b6a9f956f827f311c01d6b070a99e5",
  },
};

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readPinnedFile(relativePath, expectedPin) {
  const bytes = readFileSync(repoPath(relativePath));
  const actual = { byteCount: bytes.length, sha256: sha256(bytes) };
  if (actual.byteCount !== expectedPin.byteCount || actual.sha256 !== expectedPin.sha256) {
    throw new Error(
      `Pinned source drift for ${relativePath}: expected ${expectedPin.byteCount} bytes/${expectedPin.sha256}, got ${actual.byteCount} bytes/${actual.sha256}`,
    );
  }
  return { bytes, ...actual };
}

function parseIntCell(value, label = "numeric cell") {
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Invalid nonnegative integer for ${label}: ${JSON.stringify(value)}`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Unsafe integer for ${label}: ${JSON.stringify(value)}`);
  }
  return parsed;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && inQuotes) {
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
  if (inQuotes) {
    throw new Error(`Unclosed CSV quote: ${JSON.stringify(line.slice(0, 120))}`);
  }
  values.push(current);
  return values;
}

function parseSimpleCsv(text) {
  const normalizedText = String(text).replace(/^\uFEFF/, "").trimEnd();
  if (!normalizedText) {
    throw new Error("CSV source is empty");
  }
  const [headerLine, ...lines] = normalizedText.split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error("CSV source has empty or duplicate headers");
  }
  return lines.map((line, lineIndex) => {
    if (!line.trim()) {
      throw new Error(`CSV source has an empty row at line ${lineIndex + 2}`);
    }
    const values = parseCsvLine(line);
    if (values.length !== headers.length) {
      throw new Error(`CSV source row ${lineIndex + 2} has ${values.length} columns; expected ${headers.length}`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

async function readZipEntry(zipRelativePath, entryName, archivePin, entryPin) {
  const archive = readPinnedFile(zipRelativePath, archivePin);
  const zip = await JSZip.loadAsync(archive.bytes);
  const entry = zip.file(entryName);
  if (!entry) {
    throw new Error(`Missing ${entryName} in ${zipRelativePath}`);
  }
  const bytes = await entry.async("nodebuffer");
  const actualEntry = { byteCount: bytes.length, sha256: sha256(bytes) };
  if (actualEntry.byteCount !== entryPin.byteCount || actualEntry.sha256 !== entryPin.sha256) {
    throw new Error(
      `Pinned ZIP entry drift for ${zipRelativePath}!${entryName}: expected ${entryPin.byteCount} bytes/${entryPin.sha256}, got ${actualEntry.byteCount} bytes/${actualEntry.sha256}`,
    );
  }
  return {
    text: bytes.toString("utf8"),
    archive,
    entry: actualEntry,
  };
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
  const normalizedText = String(text).replace(/^\uFEFF/, "").trimEnd();
  if (!normalizedText) {
    throw new Error("Tab-delimited source is empty");
  }
  const lines = normalizedText.split(/\r?\n/);
  const headers = lines[0].split("\t").map((header) => header.replace(/\r$/, ""));
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error("Tab-delimited source has empty or duplicate headers");
  }
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  const missing = requiredColumns.filter((column) => indexes[column] === undefined);
  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  let rowCount = 0;
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line.trim()) {
      continue;
    }
    const columns = line.split("\t").map((column) => column.replace(/\r$/, ""));
    if (columns.length !== headers.length) {
      throw new Error(`Tab-delimited row ${lineIndex + 1} has ${columns.length} columns; expected ${headers.length}`);
    }
    const row = Object.fromEntries(requiredColumns.map((column) => [column, columns[indexes[column]] ?? ""]));
    onRow(row);
    rowCount += 1;
  }

  return rowCount;
}

function aggregateVoterStats(text) {
  const byCounty = new Map();
  const precincts = new Set();
  let unassignedIdentityRows = 0;
  let total = 0;
  const rows = parseTabDelimitedTotals(
    text,
    ["county_desc", "election_date", "stats_type", "precinct_abbrv", "vtd_abbrv", "total_voters"],
    (row) => {
      if (row.election_date !== "11/05/2024" || row.stats_type !== "voter") {
        throw new Error(`Unexpected voter stats row scope: ${JSON.stringify(row)}`);
      }
      const county = countyTitle(row.county_desc);
      const precinct = row.precinct_abbrv.trim();
      const vtd = row.vtd_abbrv.trim();
      if (!county || (precinct && !vtd) || (!precinct && vtd)) {
        throw new Error(`Invalid voter stats identity: ${JSON.stringify(row)}`);
      }
      if (!precinct && !vtd) {
        unassignedIdentityRows += 1;
      }
      const voters = parseIntCell(row.total_voters, `voter stats ${county}/${precinct || "<county-total>"}/${vtd || "<county-total>"}`);
      addToMap(byCounty, county, voters);
      precincts.add(`${county}|${precinct || "<county-total>"}|${vtd || "<county-total>"}`);
      total += voters;
    },
  );
  return { rows, byCounty, precincts: precincts.size, unassignedIdentityRows, total };
}

function aggregateHistoryStats(text) {
  const byCounty = new Map();
  const byMethod = new Map();
  const precincts = new Set();
  let unassignedIdentityRows = 0;
  let total = 0;
  const rows = parseTabDelimitedTotals(
    text,
    ["county_desc", "precinct_abbrv", "vtd_abbrv", "total_voters", "election_date", "stats_type", "voting_method"],
    (row) => {
      if (row.election_date !== "11/05/2024" || row.stats_type !== "history") {
        throw new Error(`Unexpected history stats row scope: ${JSON.stringify(row)}`);
      }
      const county = countyTitle(row.county_desc);
      const precinct = row.precinct_abbrv.trim();
      const vtd = row.vtd_abbrv.trim();
      if (!county || (precinct && !vtd) || (!precinct && vtd) || !row.voting_method.trim()) {
        throw new Error(`Invalid history stats identity: ${JSON.stringify(row)}`);
      }
      if (!precinct && !vtd) {
        unassignedIdentityRows += 1;
      }
      const voters = parseIntCell(row.total_voters, `history stats ${county}/${precinct || "<county-total>"}/${vtd || "<county-total>"}`);
      addToMap(byCounty, county, voters);
      addToMap(byMethod, row.voting_method, voters);
      precincts.add(`${county}|${precinct || "<county-total>"}|${vtd || "<county-total>"}`);
      total += voters;
    },
  );
  return { rows, byCounty, byMethod, precincts: precincts.size, unassignedIdentityRows, total };
}

function readEacBenchmark() {
  const rawArtifact = readPinnedFile(SOURCES.eacFallbackCsv, pinned.eacFallbackCsv);
  const rows = parseSimpleCsv(rawArtifact.bytes.toString("utf8"));
  const totals = rows.reduce(
    (accumulator, row, index) => {
      if (row.state !== "NC") {
        throw new Error(`Unexpected EAC fallback state at row ${index + 2}: ${row.state}`);
      }
      return {
        ballotsCast: accumulator.ballotsCast + parseIntCell(row.ballots_cast, `EAC ballots_cast row ${index + 2}`),
        registeredVoters: accumulator.registeredVoters + parseIntCell(row.registered_voters, `EAC registered_voters row ${index + 2}`),
      };
    },
    { ballotsCast: 0, registeredVoters: 0 },
  );
  return { rows: rows.length, ...totals, rawArtifact };
}

function assertEqual(actual, expectedValue, label) {
  if (actual !== expectedValue) {
    throw new Error(`${label} mismatch: expected ${expectedValue}, got ${actual}`);
  }
}

function assertSameSet(actual, expectedSet, label) {
  const actualSet = actual instanceof Set ? actual : new Set(actual);
  const expectedValues = expectedSet instanceof Set ? expectedSet : new Set(expectedSet);
  const missing = [...expectedValues].filter((value) => !actualSet.has(value));
  const extra = [...actualSet].filter((value) => !expectedValues.has(value));
  if (missing.length || extra.length) {
    throw new Error(`${label} mismatch: missing=${missing.join(", ") || "none"}; extra=${extra.join(", ") || "none"}`);
  }
}

function buildTurnoutLeadCsv(voterStats, historyStats) {
  const counties = [...voterStats.byCounty.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  assertSameSet(historyStats.byCounty.keys(), voterStats.byCounty.keys(), "Voter/history county sets");
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
    if (registeredVoters <= 0) {
      throw new Error(`Non-positive registered-voter denominator for ${county}: ${registeredVoters}`);
    }
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

  const csv = [headers.join(","), ...records.map((record) => headers.map((header) => csvEscape(record[header])).join(","))].join("\r\n");
  return { records, csv: `${csv}\r\n` };
}

function outputArtifact(filePath, text) {
  const bytes = Buffer.from(text, "utf8");
  return {
    localFile: path.relative(repoRoot, filePath).replace(/\\/g, "/"),
    byteCount: bytes.length,
    sha256: sha256(bytes),
  };
}

function assertFileMatches(filePath, expectedText, label) {
  let actualText;
  try {
    actualText = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Replay check could not read ${label} ${filePath}: ${error.message}`);
  }
  const normalizeNewlines = (value) => value.replace(/\r\n/g, "\n");
  if (normalizeNewlines(actualText) !== normalizeNewlines(expectedText)) {
    throw new Error(`Replay check mismatch for ${label}: ${filePath}`);
  }
}

async function main() {
  const [voterStatsSource, historyStatsSource] = await Promise.all([
    readZipEntry(SOURCES.voterStatsZip, SOURCES.voterStatsEntry, pinned.voterStatsZip, pinned.voterStatsEntry),
    readZipEntry(SOURCES.historyStatsZip, SOURCES.historyStatsEntry, pinned.historyStatsZip, pinned.historyStatsEntry),
  ]);

  const voterStats = aggregateVoterStats(voterStatsSource.text);
  const historyStats = aggregateHistoryStats(historyStatsSource.text);
  const eac = readEacBenchmark();

  assertEqual(voterStats.rows, expected.ncsbeVoterStatsRows, "NCSBE voter stats row count");
  assertEqual(voterStats.byCounty.size, expected.ncsbeVoterStatsCounties, "NCSBE voter stats county count");
  assertEqual(voterStats.precincts, expected.ncsbeVoterStatsPrecinctKeys, "NCSBE voter stats county/precinct/VTD key count");
  assertEqual(voterStats.unassignedIdentityRows, expected.ncsbeVoterStatsUnassignedIdentityRows, "NCSBE voter stats unassigned identity row count");
  assertEqual(voterStats.total, expected.ncsbeVoterStatsRegisteredVoters, "NCSBE registered-voter stats total");
  assertEqual(historyStats.rows, expected.ncsbeHistoryStatsRows, "NCSBE history stats row count");
  assertEqual(historyStats.byCounty.size, expected.ncsbeHistoryStatsCounties, "NCSBE history stats county count");
  assertEqual(historyStats.precincts, expected.ncsbeHistoryStatsPrecinctKeys, "NCSBE history stats county/precinct/VTD key count");
  assertEqual(historyStats.unassignedIdentityRows, expected.ncsbeHistoryStatsUnassignedIdentityRows, "NCSBE history stats unassigned identity row count");
  assertEqual(historyStats.total, expected.ncsbeHistoryStatsVoters, "NCSBE history stats voter total");
  for (const [method, value] of Object.entries(expected.ncsbeTurnoutPageMethodTotals)) {
    assertEqual(historyStats.byMethod.get(method) ?? 0, value, `NCSBE history stats ${method} total`);
  }
  assertEqual(eac.rows, expected.eacFallback.rows, "EAC fallback row count");
  assertEqual(eac.ballotsCast, expected.eacFallback.ballotsCast, "EAC fallback ballots cast");
  assertEqual(eac.registeredVoters, expected.eacFallback.registeredVoters, "EAC fallback registered voters");

  const { records, csv } = buildTurnoutLeadCsv(voterStats, historyStats);
  const csvArtifact = outputArtifact(outputCsvPath, csv);
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
        byteCount: voterStatsSource.archive.byteCount,
        sha256: voterStatsSource.archive.sha256,
        entryByteCount: voterStatsSource.entry.byteCount,
        entrySha256: voterStatsSource.entry.sha256,
        rows: voterStats.rows,
        counties: voterStats.byCounty.size,
        uniqueCountyPrecinctVtdKeys: voterStats.precincts,
        unassignedIdentityRows: voterStats.unassignedIdentityRows,
        registeredVoters: voterStats.total,
      },
      historyStats: {
        sourceUrl: SOURCES.historyStatsUrl,
        localFile: SOURCES.historyStatsZip,
        entry: SOURCES.historyStatsEntry,
        byteCount: historyStatsSource.archive.byteCount,
        sha256: historyStatsSource.archive.sha256,
        entryByteCount: historyStatsSource.entry.byteCount,
        entrySha256: historyStatsSource.entry.sha256,
        rows: historyStats.rows,
        counties: historyStats.byCounty.size,
        uniqueCountyPrecinctVtdKeys: historyStats.precincts,
        unassignedIdentityRows: historyStats.unassignedIdentityRows,
        votersWhoVoted: historyStats.total,
        votingMethodTotals: Object.fromEntries([...historyStats.byMethod.entries()].sort()),
      },
      turnoutDenominatorLead: {
        localFile: path.relative(repoRoot, outputCsvPath).replace(/\\/g, "/"),
        rows: records.length,
        votersWhoVoted: historyStats.total,
        registeredVoters: voterStats.total,
        byteCount: csvArtifact.byteCount,
        sha256: csvArtifact.sha256,
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
      byteCount: eac.rawArtifact.byteCount,
      sha256: eac.rawArtifact.sha256,
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
      "The retained source files include 576 voter_stats rows and 142 history_stats rows with blank precinct/VTD identities; these are kept in their county aggregates under an explicit county-total sentinel and are never assigned to a precinct.",
      "The generated lead rows are county aggregates for source review and should not be used as same-grain precinct advisory inputs until precinct geometry/crosswalk and display semantics are reviewed.",
      "The statewide voter-history total is 50,245 below the EAC fallback ballots-cast total and 18,126 below the NCSBE turnout overview page's 2024 ballots-cast figure.",
    ],
    replay: {
      command: "node scripts/normalize-nc-turnout.mjs --check",
      inputArtifactsHashPinned: true,
      outputArtifactsHashChecked: true,
    },
  };
  const summaryText = `${JSON.stringify(summary, null, 2)}\n`;
  if (checkOnly) {
    assertFileMatches(outputCsvPath, csv, "turnout lead CSV");
    assertFileMatches(outputSummaryPath, summaryText, "turnout source review");
    console.log(`Replay check passed for ${records.length} North Carolina turnout-denominator lead rows.`);
    return;
  }
  writeFileSync(outputCsvPath, csv);
  writeFileSync(outputSummaryPath, summaryText);
  console.log(`Wrote ${records.length} North Carolina turnout-denominator lead rows to ${path.relative(repoRoot, outputCsvPath).replace(/\\/g, "/")}`);
  console.log(`Wrote North Carolina turnout source review to ${path.relative(repoRoot, outputSummaryPath).replace(/\\/g, "/")}`);
}

main();
