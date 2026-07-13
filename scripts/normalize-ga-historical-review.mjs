import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const outputFile = "data/ga-historical-review-rows.csv";
export const geometryFile = "data/ga-counties.geojson";

export const yearSpecs = [
  {
    year: 2016,
    localFile: "data/ga-2016-official-results-export.json",
    sourceId: "ga-2016-official-results",
    sourceUrl: "https://results.sos.ga.gov/cdn/results/Georgia/export-2016NovGen.json",
    presidentialContest: "President of the United States",
    comparisonContest: "United States Senator, Isakson",
    expected: {
      rows: 159,
      presidential: {
        demCandidate: "HILLARY CLINTON (DEM)",
        repCandidate: "DONALD J. TRUMP (REP)",
        demVotes: 1_877_963,
        repVotes: 2_089_104,
        otherVotes: 125_306,
        totalVotes: 4_092_373,
      },
      comparison: {
        demCandidate: "JIM BARKSDALE (DEM)",
        repCandidate: "JOHNNY ISAKSON (I) (REP)",
        demVotes: 1_599_726,
        repVotes: 2_135_806,
        otherVotes: 162_260,
        totalVotes: 3_897_792,
      },
    },
  },
  {
    year: 2020,
    localFile: "data/ga-2020-official-results-export.json",
    sourceId: "ga-2020-official-results",
    sourceUrl: "https://results.sos.ga.gov/cdn/results/Georgia/export-2020NovGen.json",
    presidentialContest: "President of the United States",
    comparisonContest: "US Senate (Perdue)",
    expected: {
      rows: 159,
      presidential: {
        demCandidate: "Joseph R. Biden (Dem)",
        repCandidate: "Donald J. Trump (I) (Rep)",
        demVotes: 2_474_507,
        repVotes: 2_461_837,
        otherVotes: 62_138,
        totalVotes: 4_998_482,
      },
      comparison: {
        demCandidate: "Jon Ossoff (Dem)",
        repCandidate: "David A. Perdue (I) (Rep)",
        demVotes: 2_374_519,
        repVotes: 2_462_617,
        otherVotes: 115_039,
        totalVotes: 4_952_175,
      },
    },
  },
];

export const headers = [
  "state",
  "election_year",
  "county",
  "jurisdiction_tag",
  "local_unit",
  "level",
  "dem_candidate",
  "rep_candidate",
  "dem_votes",
  "rep_votes",
  "other_votes",
  "total_votes",
  "comparison_contest",
  "comparison_dem_candidate",
  "comparison_rep_candidate",
  "comparison_dem_votes",
  "comparison_rep_votes",
  "comparison_other_votes",
  "coverage_mode",
  "source_id",
  "comparison_source_id",
  "source_url",
];

function intValue(value) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Expected a nonnegative integer vote count, got ${JSON.stringify(value)}`);
  }
  return number;
}

function party(value) {
  return String(value ?? "").trim().toUpperCase();
}

function contestSummary(contest, context) {
  if (!contest) throw new Error(`Missing ${context}`);
  const options = contest.ballotOptions ?? [];
  const demOptions = options.filter((option) => party(option.politicalParty) === "DEM");
  const repOptions = options.filter((option) => party(option.politicalParty) === "REP");
  if (demOptions.length !== 1 || repOptions.length !== 1) {
    throw new Error(`${context} must have exactly one DEM and one REP option`);
  }

  const demOption = demOptions[0];
  const repOption = repOptions[0];
  const demVotes = intValue(demOption.voteCount);
  const repVotes = intValue(repOption.voteCount);
  const otherVotes = options
    .filter((option) => option !== demOption && option !== repOption)
    .reduce((sum, option) => sum + intValue(option.voteCount), 0);
  return {
    demCandidate: String(demOption.name ?? "").trim(),
    repCandidate: String(repOption.name ?? "").trim(),
    demVotes,
    repVotes,
    otherVotes,
    totalVotes: demVotes + repVotes + otherVotes,
    precinctResultRows: options.reduce(
      (sum, option) => sum + (Array.isArray(option.precinctResults) ? option.precinctResults.length : 0),
      0,
    ),
  };
}

function assertSummary(actual, expected, context) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (actual[key] !== expectedValue) {
      throw new Error(`${context} expected ${key}=${JSON.stringify(expectedValue)}, got ${JSON.stringify(actual[key])}`);
    }
  }
}

function aggregateRows(rows, prefix) {
  const totals = rows.reduce(
    (totals, row) => ({
      demVotes: totals.demVotes + row[`${prefix}dem_votes`],
      repVotes: totals.repVotes + row[`${prefix}rep_votes`],
      otherVotes: totals.otherVotes + row[`${prefix}other_votes`],
      totalVotes: totals.totalVotes + (
        prefix
          ? row[`${prefix}dem_votes`] + row[`${prefix}rep_votes`] + row[`${prefix}other_votes`]
          : row.total_votes
      ),
    }),
    { demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );
  return {
    demCandidate: rows[0]?.[`${prefix}dem_candidate`] ?? "",
    repCandidate: rows[0]?.[`${prefix}rep_candidate`] ?? "",
    ...totals,
  };
}

function countyTags(geometry) {
  const tags = new Map();
  for (const feature of geometry?.features ?? []) {
    const name = String(feature?.properties?.NAME ?? "").trim();
    const geoid = String(feature?.properties?.GEOID ?? "").trim();
    if (!name || !/^13\d{3}$/.test(geoid)) {
      throw new Error(`Invalid Georgia county geometry feature: ${JSON.stringify(feature?.properties ?? {})}`);
    }
    if (tags.has(name)) throw new Error(`Duplicate Georgia county geometry name: ${name}`);
    tags.set(name, `county:${geoid}`);
  }
  if (tags.size !== 159) throw new Error(`Expected 159 Georgia county geometry features, got ${tags.size}`);
  return tags;
}

export function normalizeGeorgiaYear(spec, payload, geometry) {
  const tags = countyTags(geometry);
  const statewidePresident = contestSummary(
    payload?.results?.ballotItems?.find((contest) => contest.name === spec.presidentialContest),
    `${spec.year} statewide ${spec.presidentialContest}`,
  );
  const statewideComparison = contestSummary(
    payload?.results?.ballotItems?.find((contest) => contest.name === spec.comparisonContest),
    `${spec.year} statewide ${spec.comparisonContest}`,
  );
  assertSummary(statewidePresident, spec.expected.presidential, `${spec.year} statewide President`);
  assertSummary(statewideComparison, spec.expected.comparison, `${spec.year} statewide Senate`);

  const rows = [];
  let selectedPrecinctResultRows = 0;
  for (const local of payload.localResults ?? []) {
    const county = String(local.name ?? "").trim();
    const jurisdictionTag = tags.get(county);
    if (!jurisdictionTag) throw new Error(`${spec.year} county is missing a canonical GEOID: ${county}`);
    const president = contestSummary(
      local.ballotItems?.find((contest) => contest.name === spec.presidentialContest),
      `${spec.year} ${county} ${spec.presidentialContest}`,
    );
    const comparison = contestSummary(
      local.ballotItems?.find((contest) => contest.name === spec.comparisonContest),
      `${spec.year} ${county} ${spec.comparisonContest}`,
    );
    selectedPrecinctResultRows += president.precinctResultRows + comparison.precinctResultRows;

    rows.push({
      state: "GA",
      election_year: spec.year,
      county,
      jurisdiction_tag: jurisdictionTag,
      local_unit: county,
      level: "county",
      dem_candidate: president.demCandidate,
      rep_candidate: president.repCandidate,
      dem_votes: president.demVotes,
      rep_votes: president.repVotes,
      other_votes: president.otherVotes,
      total_votes: president.totalVotes,
      comparison_contest: spec.comparisonContest,
      comparison_dem_candidate: comparison.demCandidate,
      comparison_rep_candidate: comparison.repCandidate,
      comparison_dem_votes: comparison.demVotes,
      comparison_rep_votes: comparison.repVotes,
      comparison_other_votes: comparison.otherVotes,
      coverage_mode: "presidentVsSenate",
      source_id: spec.sourceId,
      comparison_source_id: spec.sourceId,
      source_url: spec.sourceUrl,
    });
  }

  rows.sort((left, right) => left.county.localeCompare(right.county, "en-US"));
  if (rows.length !== spec.expected.rows) {
    throw new Error(`${spec.year} expected ${spec.expected.rows} county rows, got ${rows.length}`);
  }
  const distinctTags = new Set(rows.map((row) => row.jurisdiction_tag));
  if (distinctTags.size !== spec.expected.rows) {
    throw new Error(`${spec.year} expected ${spec.expected.rows} unique county tags, got ${distinctTags.size}`);
  }
  if (selectedPrecinctResultRows !== 0) {
    throw new Error(`${spec.year} selected county contest options unexpectedly contain ${selectedPrecinctResultRows} precinct rows`);
  }

  assertSummary(aggregateRows(rows, ""), spec.expected.presidential, `${spec.year} county President reconciliation`);
  assertSummary(aggregateRows(rows, "comparison_"), spec.expected.comparison, `${spec.year} county Senate reconciliation`);
  return {
    rows,
    summary: {
      year: spec.year,
      rows: rows.length,
      comparisonContest: spec.comparisonContest,
      selectedPrecinctResultRows,
      presidential: statewidePresident,
      comparison: statewideComparison,
    },
  };
}

export async function buildGeorgiaHistoricalReviewRows() {
  const geometry = JSON.parse(await readFile(geometryFile, "utf8"));
  const rows = [];
  const summaries = [];
  for (const spec of yearSpecs) {
    const payload = JSON.parse(await readFile(spec.localFile, "utf8"));
    const normalized = normalizeGeorgiaYear(spec, payload, geometry);
    rows.push(...normalized.rows);
    summaries.push(normalized.summary);
  }
  if (rows.length !== 318) throw new Error(`Expected 318 Georgia historical review rows, got ${rows.length}`);
  return { rows, summaries };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeGeorgiaHistoricalReviewRows(rows) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n") + "\n";
}

export async function main() {
  const { rows, summaries } = await buildGeorgiaHistoricalReviewRows();
  await writeFile(outputFile, serializeGeorgiaHistoricalReviewRows(rows), "utf8");
  console.log(JSON.stringify({ output: outputFile, rows: rows.length, years: summaries }, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
