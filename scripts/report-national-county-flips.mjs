import { jurisdictionTagForRow } from "../src/lib/jurisdiction-tags.ts";

const base = process.argv.find((arg) => arg.startsWith("--base="))?.slice("--base=".length) ?? "https://www.civicresultmaps.org";

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

function color2024(row) {
  if (row.winner === "Harris") return "blue";
  if (row.winner === "Trump") return "red";
  return null;
}

const states = (await api("/api/states")).data.map((state) => state.code);
const flips = [];
const summaries = [];

for (const state of states) {
  const [results, history] = await Promise.all([
    api(`/api/results?state=${state}&year=2024&level=county`),
    api(`/api/historical-baselines?state=${state}&year=2020&limit=5000`),
  ]);

  const historicalByTag = new Map();
  let taggedHistorical = 0;
  for (const row of history.data) {
    const tag = tagFor(row, state, "sourceLevel");
    if (!tag || row.demVotes == null || row.repVotes == null || row.demVotes === row.repVotes) {
      continue;
    }
    taggedHistorical += 1;
    historicalByTag.set(tag, row);
  }

  let tagged2024 = 0;
  let matched = 0;
  let redToBlue = 0;
  let blueToRed = 0;
  for (const row of results.data) {
    const tag = tagFor(row, state);
    if (!tag) {
      continue;
    }
    tagged2024 += 1;
    const historical = historicalByTag.get(tag);
    if (!historical) {
      continue;
    }
    const winner2024 = color2024(row);
    if (!winner2024) {
      continue;
    }
    const winner2020 = historical.demVotes > historical.repVotes ? "blue" : "red";
    matched += 1;
    if (winner2020 === "red" && winner2024 === "blue") {
      redToBlue += 1;
      flips.push({ direction: "red_to_blue", state, tag, county: row.jurisdictionName });
    }
    if (winner2020 === "blue" && winner2024 === "red") {
      blueToRed += 1;
      flips.push({ direction: "blue_to_red", state, tag, county: row.jurisdictionName });
    }
  }

  summaries.push({
    state,
    resultRows2024: results.data.length,
    taggedRows2024: tagged2024,
    historicalRows2020: history.data.length,
    taggedHistoricalRows2020: taggedHistorical,
    matchedRows: matched,
    missingHistoricalRows: Math.max(tagged2024 - matched, 0),
    redToBlue,
    blueToRed,
  });
}

const output = {
  base,
  generatedAt: new Date().toISOString(),
  redToBlue: flips.filter((flip) => flip.direction === "red_to_blue").length,
  blueToRed: flips.filter((flip) => flip.direction === "blue_to_red").length,
  coverage: {
    resultRows2024: summaries.reduce((sum, row) => sum + row.resultRows2024, 0),
    taggedRows2024: summaries.reduce((sum, row) => sum + row.taggedRows2024, 0),
    historicalRows2020: summaries.reduce((sum, row) => sum + row.historicalRows2020, 0),
    taggedHistoricalRows2020: summaries.reduce((sum, row) => sum + row.taggedHistoricalRows2020, 0),
    matchedRows: summaries.reduce((sum, row) => sum + row.matchedRows, 0),
    missingHistoricalRows: summaries.reduce((sum, row) => sum + row.missingHistoricalRows, 0),
  },
  stateSummaries: summaries.filter((row) => row.redToBlue || row.blueToRed || row.missingHistoricalRows),
  flips: flips.sort((left, right) => `${left.direction}:${left.state}:${left.county}`.localeCompare(`${right.direction}:${right.state}:${right.county}`)),
};

console.log(JSON.stringify(output, null, 2));
