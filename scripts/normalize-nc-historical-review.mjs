import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";

export const source2020 = {
  electionYear: 2020,
  localFile: "data/nc-2020-results-precinct.zip",
  entry: "results_pct_20201103.txt",
  sourceId: "nc-2020-results-precinct-zip",
  sourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2020_11_03/results_pct_20201103.zip",
};

export const source2016 = {
  electionYear: 2016,
  localFile: "data/nc-2016-results-precinct.zip",
  entry: "results_pct_20161108.txt",
  sourceId: "nc-2016-results-precinct-zip",
  sourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2016_11_08/results_pct_20161108.zip",
};

export const geometryFile = "data/nc-counties.geojson";
export const historicalBaselineFile = "data/nc-historical-presidential-baseline.csv";
export const outputFile = "data/nc-historical-review-rows.csv";

export const expected = {
  county2016: {
    rowCount: 100,
    reportingKeys: 3_209,
    signedAdjustmentRows: 1,
    signedAdjustmentVotes: -4,
    signedAdjustment: {
      county: "Rutherford County",
      localUnit: "ABSENTEE",
      contest: "US PRESIDENT",
      candidate: "Write-In (Miscellaneous)",
      votes: -4,
    },
    presidential: {
      demCandidate: "Hillary Clinton",
      repCandidate: "Donald J. Trump",
      demVotes: 2_189_316,
      repVotes: 2_362_631,
      otherVotes: 189_617,
      totalVotes: 4_741_564,
    },
    comparison: {
      contest: "US SENATE",
      demCandidate: "Deborah K. Ross",
      repCandidate: "Richard Burr",
      demVotes: 2_128_165,
      repVotes: 2_395_376,
      otherVotes: 167_592,
      totalVotes: 4_691_133,
    },
  },
  sourceKeys: 3_065,
  includedRealPrecinctKeys: 2_662,
  excludedAdministrativeKeys: 403,
  countyTags: 100,
  presidential: {
    demCandidate: "Joseph R. Biden",
    repCandidate: "Donald J. Trump",
    included: { demVotes: 1_354_907, repVotes: 1_796_371, otherVotes: 50_433, totalVotes: 3_201_711 },
    excluded: { demVotes: 1_329_385, repVotes: 962_402, otherVotes: 31_304, totalVotes: 2_323_091 },
    source: { demVotes: 2_684_292, repVotes: 2_758_773, otherVotes: 81_737, totalVotes: 5_524_802 },
  },
  comparison: {
    contest: "US SENATE",
    demCandidate: "Cal Cunningham",
    repCandidate: "Thom Tillis",
    included: { demVotes: 1_303_306, repVotes: 1_719_501, otherVotes: 149_209, totalVotes: 3_172_016 },
    excluded: { demVotes: 1_266_659, repVotes: 946_097, otherVotes: 90_180, totalVotes: 2_302_936 },
    source: { demVotes: 2_569_965, repVotes: 2_665_598, otherVotes: 239_389, totalVotes: 5_474_952 },
  },
};

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

function nonnegativeInteger(value, context) {
  const parsed = Number.parseInt(String(value ?? "").replace(/,/g, "").trim(), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${context} must be a nonnegative integer; got ${JSON.stringify(value)}`);
  }
  return parsed;
}

function signedInteger(value, context) {
  const parsed = Number.parseInt(String(value ?? "").replace(/,/g, "").trim(), 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(context + " must be an integer; got " + JSON.stringify(value));
  }
  return parsed;
}

function parseTsv(text, source) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerLine = lines.shift() ?? "";
  const fieldnames = headerLine.split("\t").map((value) => value.trim());
  const indexes = Object.fromEntries(fieldnames.map((field, index) => [field, index]));
  const required = ["County", "Precinct", "Contest Name", "Choice", "Choice Party", "Total Votes"];
  const missing = required.filter((field) => indexes[field] === undefined);
  if (missing.length) throw new Error(`${source.localFile} is missing columns: ${missing.join(", ")}`);
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split("\t");
    rows.push(Object.fromEntries(fieldnames.map((field, index) => [field, cells[index] ?? ""])));
  }
  return { fieldnames, rows };
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (quoted) throw new Error("Historical baseline CSV has an unterminated quoted cell");
  cells.push(current);
  return cells;
}

function parseCsv(text, sourcePath) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const headers = splitCsvLine(lines.shift() ?? "");
  if (!headers.length) throw new Error(sourcePath + " has no CSV header");
  return lines.map((line, index) => {
    const cells = splitCsvLine(line);
    if (cells.length !== headers.length) {
      throw new Error(sourcePath + " row " + (index + 2) + " has " + cells.length + " cells; expected " + headers.length);
    }
    return Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]]));
  });
}

async function readZipSource(source) {
  const archive = await JSZip.loadAsync(await readFile(source.localFile));
  const entry = archive.file(source.entry);
  if (!entry) throw new Error(`${source.localFile} does not contain ${source.entry}`);
  return parseTsv(await entry.async("string"), source);
}

function canonicalCounties(geometry) {
  const counties = new Map();
  for (const feature of geometry?.features ?? []) {
    const properties = feature?.properties ?? {};
    const basename = String(properties.BASENAME ?? "").trim();
    const county = String(properties.NAME ?? "").trim();
    const geoid = String(properties.GEOID ?? "").trim();
    if (!basename || !county || !/^37\d{3}$/.test(geoid)) {
      throw new Error(`Invalid North Carolina county geometry feature: ${JSON.stringify(properties)}`);
    }
    const key = basename.toUpperCase();
    if (counties.has(key)) throw new Error(`Duplicate North Carolina county geometry basename: ${basename}`);
    counties.set(key, { county, jurisdictionTag: `county:${geoid}` });
  }
  if (counties.size !== expected.countyTags) {
    throw new Error(`Expected ${expected.countyTags} North Carolina county tags, got ${counties.size}`);
  }
  return counties;
}

function emptyContest() {
  return {
    demCandidate: "",
    demVotes: 0,
    otherVotes: 0,
    realPrecinct: "",
    repCandidate: "",
    repVotes: 0,
    rowCount: 0,
    totalVotes: 0,
  };
}

function addContestRow(contest, row, context) {
  const realPrecinct = String(row["Real Precinct"] ?? "").trim().toUpperCase();
  if (!new Set(["Y", "N"]).has(realPrecinct)) {
    throw new Error(`${context} has unexpected Real Precinct value ${JSON.stringify(row["Real Precinct"])}`);
  }
  if (contest.realPrecinct && contest.realPrecinct !== realPrecinct) {
    throw new Error(`${context} has inconsistent Real Precinct values`);
  }
  contest.realPrecinct = realPrecinct;
  contest.rowCount += 1;

  const candidate = String(row.Choice ?? "").trim();
  const party = String(row["Choice Party"] ?? "").trim().toUpperCase();
  const votes = nonnegativeInteger(row["Total Votes"], `${context} ${candidate || "unnamed candidate"} votes`);
  if (party === "DEM") {
    if (contest.demCandidate && contest.demCandidate !== candidate) {
      throw new Error(`${context} has multiple Democratic candidates: ${contest.demCandidate}; ${candidate}`);
    }
    contest.demCandidate = candidate;
    contest.demVotes += votes;
  } else if (party === "REP") {
    if (contest.repCandidate && contest.repCandidate !== candidate) {
      throw new Error(`${context} has multiple Republican candidates: ${contest.repCandidate}; ${candidate}`);
    }
    contest.repCandidate = candidate;
    contest.repVotes += votes;
  } else {
    contest.otherVotes += votes;
  }
  contest.totalVotes += votes;
}

function addCountyContestRow(contest, row, context) {
  contest.rowCount += 1;
  const candidate = String(row.Choice ?? "").trim();
  const party = String(row["Choice Party"] ?? "").trim().toUpperCase();
  const votes = signedInteger(row["Total Votes"], context + " " + (candidate || "unnamed candidate") + " votes");
  if (party === "DEM") {
    if (contest.demCandidate && contest.demCandidate !== candidate) {
      throw new Error(context + " has multiple Democratic candidates: " + contest.demCandidate + "; " + candidate);
    }
    contest.demCandidate = candidate;
    contest.demVotes += votes;
  } else if (party === "REP") {
    if (contest.repCandidate && contest.repCandidate !== candidate) {
      throw new Error(context + " has multiple Republican candidates: " + contest.repCandidate + "; " + candidate);
    }
    contest.repCandidate = candidate;
    contest.repVotes += votes;
  } else {
    contest.otherVotes += votes;
  }
  contest.totalVotes += votes;
  return votes;
}

function sumRows(rows, prefix = "") {
  return rows.reduce(
    (totals, row) => {
      const demVotes = row[`${prefix}dem_votes`];
      const repVotes = row[`${prefix}rep_votes`];
      const otherVotes = row[`${prefix}other_votes`];
      totals.demVotes += demVotes;
      totals.repVotes += repVotes;
      totals.otherVotes += otherVotes;
      totals.totalVotes += prefix ? demVotes + repVotes + otherVotes : row.total_votes;
      return totals;
    },
    { demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );
}

function sumKeys(keys, contestName) {
  return keys.reduce(
    (totals, key) => {
      const contest = key.contests[contestName];
      totals.demVotes += contest.demVotes;
      totals.repVotes += contest.repVotes;
      totals.otherVotes += contest.otherVotes;
      totals.totalVotes += contest.totalVotes;
      return totals;
    },
    { demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );
}

function assertObject(actual, expectedObject, context) {
  for (const [field, expectedValue] of Object.entries(expectedObject)) {
    if (actual[field] !== expectedValue) {
      throw new Error(`${context} expected ${field}=${expectedValue}, got ${actual[field]}`);
    }
  }
}

export function normalizeNorthCarolina2020(parsed, geometry) {
  if (!parsed.fieldnames.includes("Real Precinct")) {
    throw new Error("The official 2020 NCSBE export is missing the required Real Precinct column");
  }
  const counties = canonicalCounties(geometry);
  const keys = new Map();
  for (const row of parsed.rows) {
    const contestName = String(row["Contest Name"] ?? "").trim().toUpperCase();
    if (contestName !== "US PRESIDENT" && contestName !== expected.comparison.contest) continue;
    const sourceCounty = String(row.County ?? "").trim().toUpperCase();
    const canonical = counties.get(sourceCounty);
    if (!canonical) throw new Error(`NCSBE county is missing a canonical GEOID: ${row.County}`);
    const localUnit = String(row.Precinct ?? "").trim();
    if (!localUnit) throw new Error(`${canonical.county} has an empty precinct identifier`);
    const keyText = `${canonical.jurisdictionTag}\u001f${localUnit}`;
    const key = keys.get(keyText) ?? {
      county: canonical.county,
      jurisdictionTag: canonical.jurisdictionTag,
      localUnit,
      contests: { "US PRESIDENT": emptyContest(), "US SENATE": emptyContest() },
    };
    addContestRow(key.contests[contestName], row, `${canonical.county} / ${localUnit} / ${contestName}`);
    keys.set(keyText, key);
  }

  if (keys.size !== expected.sourceKeys) {
    throw new Error(`Expected ${expected.sourceKeys} President/Senate reporting keys, got ${keys.size}`);
  }

  const includedKeys = [];
  const excludedAdminKeys = [];
  for (const key of keys.values()) {
    const president = key.contests["US PRESIDENT"];
    const comparison = key.contests[expected.comparison.contest];
    if (!president.rowCount || !comparison.rowCount) {
      throw new Error(`${key.county} / ${key.localUnit} is missing President or U.S. Senate rows`);
    }
    if (president.realPrecinct !== comparison.realPrecinct) {
      throw new Error(`${key.county} / ${key.localUnit} has inconsistent contest-level Real Precinct flags`);
    }
    if (president.demCandidate !== expected.presidential.demCandidate || president.repCandidate !== expected.presidential.repCandidate) {
      throw new Error(`${key.county} / ${key.localUnit} has unexpected presidential major-candidate labels`);
    }
    if (comparison.demCandidate !== expected.comparison.demCandidate || comparison.repCandidate !== expected.comparison.repCandidate) {
      throw new Error(`${key.county} / ${key.localUnit} has unexpected U.S. Senate major-candidate labels`);
    }
    if (president.realPrecinct === "Y") includedKeys.push(key);
    else excludedAdminKeys.push(key);
  }

  includedKeys.sort((left, right) =>
    left.jurisdictionTag.localeCompare(right.jurisdictionTag, "en-US") ||
    left.localUnit.localeCompare(right.localUnit, "en-US", { numeric: true }),
  );
  excludedAdminKeys.sort((left, right) =>
    left.jurisdictionTag.localeCompare(right.jurisdictionTag, "en-US") ||
    left.localUnit.localeCompare(right.localUnit, "en-US", { numeric: true }),
  );

  if (includedKeys.length !== expected.includedRealPrecinctKeys) {
    throw new Error(`Expected ${expected.includedRealPrecinctKeys} Real Precinct=Y keys, got ${includedKeys.length}`);
  }
  if (excludedAdminKeys.length !== expected.excludedAdministrativeKeys) {
    throw new Error(`Expected ${expected.excludedAdministrativeKeys} Real Precinct=N administrative keys, got ${excludedAdminKeys.length}`);
  }

  const rows = includedKeys.map((key) => {
    const president = key.contests["US PRESIDENT"];
    const comparison = key.contests[expected.comparison.contest];
    return {
      state: "NC",
      election_year: source2020.electionYear,
      county: key.county,
      jurisdiction_tag: key.jurisdictionTag,
      local_unit: key.localUnit,
      level: "precinct",
      dem_candidate: president.demCandidate,
      rep_candidate: president.repCandidate,
      dem_votes: president.demVotes,
      rep_votes: president.repVotes,
      other_votes: president.otherVotes,
      total_votes: president.totalVotes,
      comparison_contest: expected.comparison.contest,
      comparison_dem_candidate: comparison.demCandidate,
      comparison_rep_candidate: comparison.repCandidate,
      comparison_dem_votes: comparison.demVotes,
      comparison_rep_votes: comparison.repVotes,
      comparison_other_votes: comparison.otherVotes,
      coverage_mode: "presidentVsSenate",
      source_id: source2020.sourceId,
      comparison_source_id: source2020.sourceId,
      source_url: source2020.sourceUrl,
    };
  });

  const includedPresident = sumRows(rows);
  const includedComparison = sumRows(rows, "comparison_");
  const excludedPresident = sumKeys(excludedAdminKeys, "US PRESIDENT");
  const excludedComparison = sumKeys(excludedAdminKeys, expected.comparison.contest);
  const sourcePresident = sumKeys([...keys.values()], "US PRESIDENT");
  const sourceComparison = sumKeys([...keys.values()], expected.comparison.contest);
  assertObject(includedPresident, expected.presidential.included, "Included Real Precinct President reconciliation");
  assertObject(excludedPresident, expected.presidential.excluded, "Excluded administrative President reconciliation");
  assertObject(sourcePresident, expected.presidential.source, "Full-source President reconciliation");
  assertObject(includedComparison, expected.comparison.included, "Included Real Precinct Senate reconciliation");
  assertObject(excludedComparison, expected.comparison.excluded, "Excluded administrative Senate reconciliation");
  assertObject(sourceComparison, expected.comparison.source, "Full-source Senate reconciliation");

  const distinctTags = new Set(rows.map((row) => row.jurisdiction_tag));
  if (distinctTags.size !== expected.countyTags) {
    throw new Error(`Expected review rows in ${expected.countyTags} county tags, got ${distinctTags.size}`);
  }

  return {
    rows,
    excludedAdminKeys: excludedAdminKeys.map((key) => ({
      county: key.county,
      jurisdictionTag: key.jurisdictionTag,
      localUnit: key.localUnit,
      realPrecinct: "N",
      presidentialVotes: key.contests["US PRESIDENT"].totalVotes,
      comparisonVotes: key.contests[expected.comparison.contest].totalVotes,
    })),
    summary: {
      electionYear: source2020.electionYear,
      evaluated: true,
      eligibilityRule: "Official NCSBE Real Precinct=Y only",
      includedRealPrecinctKeys: includedKeys.length,
      excludedAdministrativeKeys: excludedAdminKeys.length,
      countyTags: distinctTags.size,
      presidential: { included: includedPresident, excluded: excludedPresident, source: sourcePresident },
      comparison: { contest: expected.comparison.contest, included: includedComparison, excluded: excludedComparison, source: sourceComparison },
    },
  };
}

export function normalizeNorthCarolina2016(parsed, geometry, historicalBaselineRows) {
  if (parsed.fieldnames.includes("Real Precinct")) {
    throw new Error("The tracked 2016 NCSBE export unexpectedly contains Real Precinct; the reviewed county aggregation contract must be rechecked");
  }
  const counties = canonicalCounties(geometry);
  const countyContests = new Map();
  const reportingKeys = new Set();
  let signedAdjustmentRows = 0;
  let signedAdjustmentVotes = 0;

  for (const row of parsed.rows) {
    const contestName = String(row["Contest Name"] ?? "").trim().toUpperCase();
    if (contestName !== "US PRESIDENT" && contestName !== expected.county2016.comparison.contest) continue;
    const sourceCounty = String(row.County ?? "").trim().toUpperCase();
    const canonical = counties.get(sourceCounty);
    if (!canonical) throw new Error("NCSBE 2016 county is missing a canonical GEOID: " + row.County);
    const localUnit = String(row.Precinct ?? "").trim();
    if (!localUnit) throw new Error(canonical.county + " has an empty 2016 reporting-unit identifier");
    reportingKeys.add(canonical.jurisdictionTag + "\u001f" + localUnit);

    const key = countyContests.get(canonical.jurisdictionTag) ?? {
      county: canonical.county,
      jurisdictionTag: canonical.jurisdictionTag,
      contests: { "US PRESIDENT": emptyContest(), "US SENATE": emptyContest() },
    };
    const votes = addCountyContestRow(key.contests[contestName], row, canonical.county + " / " + contestName);
    if (votes < 0) {
      const expectedAdjustment = expected.county2016.signedAdjustment;
      if (
        canonical.county !== expectedAdjustment.county
        || localUnit !== expectedAdjustment.localUnit
        || contestName !== expectedAdjustment.contest
        || String(row.Choice ?? "").trim() !== expectedAdjustment.candidate
        || votes !== expectedAdjustment.votes
      ) {
        throw new Error("Unexpected signed 2016 source adjustment at " + canonical.county + " / " + localUnit + " / " + contestName);
      }
      signedAdjustmentRows += 1;
      signedAdjustmentVotes += votes;
    }
    countyContests.set(canonical.jurisdictionTag, key);
  }

  if (reportingKeys.size !== expected.county2016.reportingKeys) {
    throw new Error("Expected " + expected.county2016.reportingKeys + " 2016 reporting keys, got " + reportingKeys.size);
  }
  if (countyContests.size !== expected.county2016.rowCount) {
    throw new Error("Expected " + expected.county2016.rowCount + " 2016 county rows, got " + countyContests.size);
  }
  if (
    signedAdjustmentRows !== expected.county2016.signedAdjustmentRows
    || signedAdjustmentVotes !== expected.county2016.signedAdjustmentVotes
  ) {
    throw new Error("Unexpected 2016 signed source adjustments: rows=" + signedAdjustmentRows + ", votes=" + signedAdjustmentVotes);
  }

  const rows = [...countyContests.values()]
    .sort((left, right) => left.jurisdictionTag.localeCompare(right.jurisdictionTag, "en-US"))
    .map((key) => {
      const president = key.contests["US PRESIDENT"];
      const comparison = key.contests[expected.county2016.comparison.contest];
      if (!president.rowCount || !comparison.rowCount) {
        throw new Error(key.county + " is missing 2016 President or U.S. Senate rows");
      }
      if (
        president.demCandidate !== expected.county2016.presidential.demCandidate
        || president.repCandidate !== expected.county2016.presidential.repCandidate
      ) {
        throw new Error(key.county + " has unexpected 2016 presidential major-candidate labels");
      }
      if (
        comparison.demCandidate !== expected.county2016.comparison.demCandidate
        || comparison.repCandidate !== expected.county2016.comparison.repCandidate
      ) {
        throw new Error(key.county + " has unexpected 2016 U.S. Senate major-candidate labels");
      }
      for (const [contestName, contest] of [["US PRESIDENT", president], ["US SENATE", comparison]]) {
        for (const field of ["demVotes", "repVotes", "otherVotes", "totalVotes"]) {
          if (!Number.isSafeInteger(contest[field]) || contest[field] < 0) {
            throw new Error(key.county + " has invalid final 2016 " + contestName + " " + field);
          }
        }
      }
      return {
        state: "NC",
        election_year: source2016.electionYear,
        county: key.county,
        jurisdiction_tag: key.jurisdictionTag,
        local_unit: key.county,
        level: "county",
        dem_candidate: president.demCandidate,
        rep_candidate: president.repCandidate,
        dem_votes: president.demVotes,
        rep_votes: president.repVotes,
        other_votes: president.otherVotes,
        total_votes: president.totalVotes,
        comparison_contest: expected.county2016.comparison.contest,
        comparison_dem_candidate: comparison.demCandidate,
        comparison_rep_candidate: comparison.repCandidate,
        comparison_dem_votes: comparison.demVotes,
        comparison_rep_votes: comparison.repVotes,
        comparison_other_votes: comparison.otherVotes,
        coverage_mode: "presidentVsUSSenateCounty",
        source_id: source2016.sourceId,
        comparison_source_id: source2016.sourceId,
        source_url: source2016.sourceUrl,
      };
    });

  const presidential = sumRows(rows);
  const comparison = sumRows(rows, "comparison_");
  assertObject(presidential, {
    demVotes: expected.county2016.presidential.demVotes,
    repVotes: expected.county2016.presidential.repVotes,
    otherVotes: expected.county2016.presidential.otherVotes,
    totalVotes: expected.county2016.presidential.totalVotes,
  }, "2016 county President reconciliation");
  assertObject(comparison, {
    demVotes: expected.county2016.comparison.demVotes,
    repVotes: expected.county2016.comparison.repVotes,
    otherVotes: expected.county2016.comparison.otherVotes,
    totalVotes: expected.county2016.comparison.totalVotes,
  }, "2016 county U.S. Senate reconciliation");

  const baseline2016 = historicalBaselineRows.filter(
    (row) => String(row.state).trim().toUpperCase() === "NC" && Number(row.election_year) === 2016,
  );
  if (baseline2016.length !== expected.county2016.rowCount) {
    throw new Error("Expected " + expected.county2016.rowCount + " official 2016 baseline rows, got " + baseline2016.length);
  }
  const baselineByCounty = new Map();
  for (const row of baseline2016) {
    const countyKey = String(row.county ?? row.jurisdiction_name ?? "").replace(/\s+County$/i, "").trim().toUpperCase();
    if (!countyKey || baselineByCounty.has(countyKey)) {
      throw new Error("Duplicate or empty 2016 baseline county: " + row.county);
    }
    baselineByCounty.set(countyKey, row);
  }
  for (const row of rows) {
    const countyKey = row.county.replace(/\s+County$/i, "").trim().toUpperCase();
    const baseline = baselineByCounty.get(countyKey);
    if (!baseline) throw new Error(row.county + " is missing from the official 2016 presidential baseline");
    for (const field of ["dem_votes", "rep_votes", "other_votes", "total_votes"]) {
      if (row[field] !== nonnegativeInteger(baseline[field], row.county + " baseline " + field)) {
        throw new Error(row.county + " 2016 " + field + " does not match the official presidential baseline");
      }
    }
  }

  return {
    rows,
    summary: {
      electionYear: source2016.electionYear,
      evaluated: true,
      eligibilityRule: "Aggregate every official reporting row by the explicit County field; no precinct-label inference",
      reportingKeys: reportingKeys.size,
      signedAdjustmentRows,
      signedAdjustmentVotes,
      countyTags: new Set(rows.map((row) => row.jurisdiction_tag)).size,
      presidential,
      comparison: { contest: expected.county2016.comparison.contest, ...comparison },
      baselineCountyMatches: rows.length,
    },
  };
}

export async function buildNorthCarolinaHistoricalReviewRows() {
  const [parsed2020, parsed2016, geometry, historicalBaselineRows] = await Promise.all([
    readZipSource(source2020),
    readZipSource(source2016),
    readFile(geometryFile, "utf8").then(JSON.parse),
    readFile(historicalBaselineFile, "utf8").then((text) => parseCsv(text, historicalBaselineFile)),
  ]);
  const normalized2020 = normalizeNorthCarolina2020(parsed2020, geometry);
  const normalized2016 = normalizeNorthCarolina2016(parsed2016, geometry, historicalBaselineRows);
  return {
    rows: [...normalized2016.rows, ...normalized2020.rows],
    rows2016: normalized2016.rows,
    rows2020: normalized2020.rows,
    excludedAdminKeys2020: normalized2020.excludedAdminKeys,
    summaries: {
      "2016": normalized2016.summary,
      "2020": normalized2020.summary,
    },
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeNorthCarolinaHistoricalReviewRows(rows) {
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n") + "\n";
}

export async function main() {
  const result = await buildNorthCarolinaHistoricalReviewRows();
  await writeFile(outputFile, serializeNorthCarolinaHistoricalReviewRows(result.rows), "utf8");
  console.log(JSON.stringify({
    output: outputFile,
    rows: result.rows.length,
    rowsByYear: { "2016": result.rows2016.length, "2020": result.rows2020.length },
    summaries: result.summaries,
    excludedAdministrativeKeys2020: result.excludedAdminKeys2020.length,
  }, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
