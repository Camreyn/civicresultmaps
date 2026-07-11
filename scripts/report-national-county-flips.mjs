import { jurisdictionTagForRow } from "../src/lib/jurisdiction-tags.ts";
import { loadStagingJurisdictionReportSource } from "./lib/staging-jurisdiction-report-source.mjs";

const baseArg = process.argv.find((arg) => arg.startsWith("--base="));
const stagingDir = process.argv.find((arg) => arg.startsWith("--staging-dir="))?.slice("--staging-dir=".length);
const overlayStatesArg = process.argv.find((arg) => arg.startsWith("--overlay-states="))?.slice("--overlay-states=".length);
const base = baseArg?.slice("--base=".length) ?? "https://www.civicresultmaps.org";
const fromYear = Number(process.argv.find((arg) => arg.startsWith("--from="))?.slice("--from=".length) ?? 2020);
const toYear = Number(process.argv.find((arg) => arg.startsWith("--to="))?.slice("--to=".length) ?? 2024);

const overlayStates = new Set((overlayStatesArg ?? "").split(",").map((state) => state.trim().toUpperCase()).filter(Boolean));
const invalidOverlayState = Array.from(overlayStates).find((state) => !/^[A-Z]{2}$/.test(state));

if (
  !Number.isInteger(fromYear)
  || !Number.isInteger(toYear)
  || fromYear >= toYear
  || (baseArg && stagingDir && !overlayStates.size)
  || (overlayStatesArg != null && (!stagingDir || !overlayStates.size || invalidOverlayState))
) {
  throw new Error("Usage: report-national-county-flips.mjs [--from=2016] [--to=2024] [--base=https://...] [--staging-dir=.etl/staging [--overlay-states=CO,LA]]");
}

const stagingSource = stagingDir ? await loadStagingJurisdictionReportSource(stagingDir) : null;
for (const state of overlayStates) {
  if (!stagingSource.states.includes(state)) {
    throw new Error(`No staging artifact found for overlay state ${state}`);
  }
}
const useStagingForState = (state) => stagingSource && (!overlayStates.size || overlayStates.has(state));

async function api(route) {
  const response = await fetch(`${base}${route}`);
  if (!response.ok) {
    throw new Error(`${route} returned ${response.status}`);
  }
  return response.json();
}

function tagFor(row, state, levelField = "level") {
  return row.jurisdictionTag ?? jurisdictionTagForRow({
    state,
    jurisdictionCode: row.jurisdictionCode,
    jurisdictionName: row.jurisdictionName,
    level: row[levelField],
  });
}

function colorForResultRow(row) {
  if (["Harris", "Biden", "Clinton", "Obama"].includes(row.winner)) return "blue";
  if (["Trump", "Romney", "McCain"].includes(row.winner)) return "red";

  const votes = row.votes ?? {};
  const demVotes = votes.Harris ?? votes.Biden ?? votes.Clinton ?? votes.Obama;
  const repVotes = votes.Trump ?? votes.Romney ?? votes.McCain;
  if (demVotes == null || repVotes == null || demVotes === repVotes) {
    return null;
  }
  return demVotes > repVotes ? "blue" : "red";
}

function colorForHistoricalRow(row) {
  if (row.demVotes == null || row.repVotes == null || row.demVotes === row.repVotes) {
    return null;
  }
  return row.demVotes > row.repVotes ? "blue" : "red";
}

async function comparableRowsForState(state, year) {
  if (useStagingForState(state)) {
    const family = year === 2024 ? "results" : "historical";
    return {
      family,
      rows: stagingSource.rowsForState(state, family, year),
      levelField: family === "results" ? "level" : "sourceLevel",
      colorForRow: family === "results" ? colorForResultRow : colorForHistoricalRow,
    };
  }

  if (year === 2024) {
    const results = await api(`/api/results?state=${state}&year=2024&level=county`);
    return {
      family: "results",
      rows: results.data,
      levelField: "level",
      colorForRow: colorForResultRow,
    };
  }

  const history = await api(`/api/historical-baselines?state=${state}&year=${year}&limit=5000`);
  return {
    family: "historical",
    rows: history.data,
    levelField: "sourceLevel",
    colorForRow: colorForHistoricalRow,
  };
}

function summaryKey(prefix, year) {
  return `${prefix}${year}`;
}

function totalsFor(summaries, key) {
  return summaries.reduce((sum, row) => sum + row[key], 0);
}

function comparableLabel(year, family) {
  return `${year}${family === "results" ? " result" : " historical"}`;
}

const states = stagingSource && !overlayStates.size
  ? stagingSource.states
  : (await api("/api/states")).data.map((state) => state.code);
const flips = [];
const summaries = [];

for (const state of states) {
  const [fromComparable, toComparable] = await Promise.all([
    comparableRowsForState(state, fromYear),
    comparableRowsForState(state, toYear),
  ]);

  const fromByTag = new Map();
  let taggedFromRows = 0;
  let votableFromRows = 0;
  for (const row of fromComparable.rows) {
    const tag = tagFor(row, state, fromComparable.levelField);
    if (!tag) {
      continue;
    }
    taggedFromRows += 1;
    const fromColor = fromComparable.colorForRow(row);
    if (!fromColor) {
      continue;
    }
    votableFromRows += 1;
    fromByTag.set(tag, row);
  }

  let taggedToRows = 0;
  let votableToRows = 0;
  let matched = 0;
  let redToBlue = 0;
  let blueToRed = 0;
  for (const row of toComparable.rows) {
    const tag = tagFor(row, state, toComparable.levelField);
    if (!tag) {
      continue;
    }
    taggedToRows += 1;
    const toColor = toComparable.colorForRow(row);
    if (!toColor) {
      continue;
    }
    votableToRows += 1;
    const fromRow = fromByTag.get(tag);
    if (!fromRow) {
      continue;
    }
    const fromColor = fromComparable.colorForRow(fromRow);
    if (!fromColor) {
      continue;
    }
    matched += 1;
    if (fromColor === "red" && toColor === "blue") {
      redToBlue += 1;
      flips.push({ direction: "red_to_blue", state, tag, county: row.jurisdictionName });
    }
    if (fromColor === "blue" && toColor === "red") {
      blueToRed += 1;
      flips.push({ direction: "blue_to_red", state, tag, county: row.jurisdictionName });
    }
  }

  summaries.push({
    state,
    [summaryKey("rows", fromYear)]: fromComparable.rows.length,
    [summaryKey("taggedRows", fromYear)]: taggedFromRows,
    [summaryKey("votableRows", fromYear)]: votableFromRows,
    [summaryKey("rows", toYear)]: toComparable.rows.length,
    [summaryKey("taggedRows", toYear)]: taggedToRows,
    [summaryKey("votableRows", toYear)]: votableToRows,
    matchedRows: matched,
    missingComparisonRows: Math.max(taggedToRows - matched, 0),
    untaggedFromRows: fromComparable.rows.length - taggedFromRows,
    untaggedToRows: toComparable.rows.length - taggedToRows,
    redToBlue,
    blueToRed,
  });
}

const output = {
  base: stagingSource && !overlayStates.size ? stagingSource.base : base,
  ...(overlayStates.size ? { stagingOverlay: { directory: stagingSource.base, states: Array.from(overlayStates).sort() } } : {}),
  generatedAt: new Date().toISOString(),
  fromYear,
  toYear,
  comparison: `${fromYear}-to-${toYear}`,
  fromFamily: fromYear === 2024 ? "results" : "historical",
  toFamily: toYear === 2024 ? "results" : "historical",
  redToBlue: flips.filter((flip) => flip.direction === "red_to_blue").length,
  blueToRed: flips.filter((flip) => flip.direction === "blue_to_red").length,
  coverage: {
    [summaryKey("rows", fromYear)]: totalsFor(summaries, summaryKey("rows", fromYear)),
    [summaryKey("taggedRows", fromYear)]: totalsFor(summaries, summaryKey("taggedRows", fromYear)),
    [summaryKey("votableRows", fromYear)]: totalsFor(summaries, summaryKey("votableRows", fromYear)),
    [summaryKey("rows", toYear)]: totalsFor(summaries, summaryKey("rows", toYear)),
    [summaryKey("taggedRows", toYear)]: totalsFor(summaries, summaryKey("taggedRows", toYear)),
    [summaryKey("votableRows", toYear)]: totalsFor(summaries, summaryKey("votableRows", toYear)),
    matchedRows: totalsFor(summaries, "matchedRows"),
    missingComparisonRows: totalsFor(summaries, "missingComparisonRows"),
    untaggedFromRows: totalsFor(summaries, "untaggedFromRows"),
    untaggedToRows: totalsFor(summaries, "untaggedToRows"),
  },
  labels: {
    from: comparableLabel(fromYear, fromYear === 2024 ? "results" : "historical"),
    to: comparableLabel(toYear, toYear === 2024 ? "results" : "historical"),
  },
  stateSummaries: summaries.filter((row) => row.redToBlue || row.blueToRed || row.missingComparisonRows || row.untaggedFromRows || row.untaggedToRows),
  flips: flips.sort((left, right) => `${left.direction}:${left.state}:${left.county}`.localeCompare(`${right.direction}:${right.state}:${right.county}`)),
};

console.log(JSON.stringify(output, null, 2));
