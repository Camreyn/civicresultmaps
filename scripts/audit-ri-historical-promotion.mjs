import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { RI_CITY_TOWN_COUNTIES, RI_COUNTY_TAGS } from "./lib/ri-jurisdictions.mjs";

const STATE = "RI";
const YEARS = [2012, 2016, 2020];
const VOTE_FIELDS = ["demVotes", "repVotes", "otherVotes", "totalVotes"];
const FEDERAL_KEY = "nongeo:federal_precincts";
const EXPECTED_STATEWIDE = new Map([
  [2012, { demVotes: 279677, repVotes: 157204, otherVotes: 9168, totalVotes: 446049 }],
  [2016, { demVotes: 252525, repVotes: 180543, otherVotes: 31076, totalVotes: 464144 }],
  [2020, { demVotes: 307486, repVotes: 199922, otherVotes: 10349, totalVotes: 517757 }],
]);

function option(name, fallback) {
  const prefix = `--${name}=`;
  const values = process.argv.slice(2).filter((value) => value.startsWith(prefix));
  if (values.length > 1) throw new Error(`Option ${name} may be provided only once`);
  return values.length ? values[0].slice(prefix.length) : fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sorted(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right)));
}

function voteTotals(rows) {
  return Object.fromEntries(VOTE_FIELDS.map((field) => [
    field,
    rows.reduce((total, row) => total + row[field], 0),
  ]));
}

function assertVoteRows(rows, label) {
  for (const row of rows) {
    for (const field of VOTE_FIELDS) {
      assert(Number.isSafeInteger(row[field]) && row[field] >= 0, `${label} has invalid ${field}`);
    }
    assert(
      row.demVotes + row.repVotes + row.otherVotes === row.totalVotes,
      `${label} has a vote-bucket mismatch for ${row.jurisdictionName}`,
    );
  }
}

function sourceLevelCounts(rows) {
  return Object.fromEntries(sorted(new Set(rows.map((row) => row.sourceLevel))).map((level) => [
    level,
    rows.filter((row) => row.sourceLevel === level).length,
  ]));
}

function rowSummary(rows) {
  return {
    rowCount: rows.length,
    taggedRowCount: rows.filter((row) => row.jurisdictionTag).length,
    distinctTags: sorted(new Set(rows.map((row) => row.jurisdictionTag).filter(Boolean))),
    sourceLevels: sourceLevelCounts(rows),
    rowMethods: sorted(new Set(rows.map((row) => row.rowMethod))),
    statewideTotals: voteTotals(rows),
    displayNames: sorted(rows.map((row) => row.jurisdictionName)),
  };
}

function addVotes(target, source) {
  for (const field of VOTE_FIELDS) target[field] += source[field];
}

function canonicalKey(row, label) {
  if (row.sourceLevel === "federal_precincts") {
    assert(row.jurisdictionName === "Federal Precincts", `${label} has an unexpected federal display name`);
    assert(!row.jurisdictionTag, `${label} must leave Federal Precincts untagged`);
    return FEDERAL_KEY;
  }
  if (row.sourceLevel === "city_town") {
    const countyName = RI_CITY_TOWN_COUNTIES.get(row.jurisdictionName);
    assert(countyName, `${label} has an unmapped Rhode Island municipality: ${row.jurisdictionName}`);
    return RI_COUNTY_TAGS.get(countyName);
  }
  if (row.sourceLevel === "county") {
    const expectedTag = RI_COUNTY_TAGS.get(row.jurisdictionName);
    assert(expectedTag, `${label} has an unexpected Rhode Island county: ${row.jurisdictionName}`);
    assert(row.jurisdictionTag === expectedTag, `${label} has the wrong tag for ${row.jurisdictionName}`);
    return expectedTag;
  }
  throw new Error(`${label} has unsupported source level ${row.sourceLevel}`);
}

function aggregateCanonical(rows, label) {
  const aggregate = new Map();
  for (const row of rows) {
    const key = canonicalKey(row, label);
    const current = aggregate.get(key) ?? Object.fromEntries(VOTE_FIELDS.map((field) => [field, 0]));
    addVotes(current, row);
    aggregate.set(key, current);
  }
  const expectedKeys = [...RI_COUNTY_TAGS.values(), FEDERAL_KEY];
  assert(
    JSON.stringify(sorted(aggregate.keys())) === JSON.stringify(sorted(expectedKeys)),
    `${label} does not reconcile to five counties plus Federal Precincts`,
  );
  return aggregate;
}

function assertExactObject(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function rowsForYear(rows, year) {
  return rows.filter((row) => row.electionYear === year);
}

function detectLiveProfile(liveRows) {
  const counts = Object.fromEntries(YEARS.map((year) => [year, rowsForYear(liveRows, year).length]));
  if (counts[2012] === 40 && counts[2016] === 40 && counts[2020] === 6) {
    return "legacy_municipal_2012_2016_county_2020";
  }
  if (counts[2012] === 6 && counts[2016] === 6 && counts[2020] === 6) {
    return "canonical_county_all_years";
  }
  throw new Error(`Unrecognized live Rhode Island historical profile: ${JSON.stringify(counts)}`);
}

function assertLiveTagProfile(summary, profile, year) {
  const legacyTags = ["county:44001", "county:44005", "county:44007"];
  const canonicalTags = sorted(RI_COUNTY_TAGS.values());
  const expected = profile === "legacy_municipal_2012_2016_county_2020" && year < 2020
    ? legacyTags
    : canonicalTags;
  assertExactObject(summary.distinctTags, expected, `Unexpected live ${year} jurisdiction tags`);
}

function delta(left, right) {
  return Object.fromEntries(VOTE_FIELDS.map((field) => [field, left[field] - right[field]]));
}

const base = option("base", "https://www.civicresultmaps.org").replace(/\/$/u, "");
const stagingPath = option("staging", ".etl/staging/ri-2024-staging.json");
const outPath = option("out", "data/ri-historical-promotion-reconciliation.json");
const liveApiUrl = `${base}/api/historical-baselines?state=RI&limit=5000&includeMetrics=true`;

const response = await fetch(liveApiUrl, {
  headers: { "user-agent": "CivicResultMaps Rhode Island historical promotion audit" },
  signal: AbortSignal.timeout(30_000),
});
assert(response.ok, `Live Rhode Island historical API returned HTTP ${response.status}`);
const livePayload = await response.json();
assert(Array.isArray(livePayload.data), "Live Rhode Island historical API did not return a data array");
assert(livePayload.meta?.source === "database", "Live Rhode Island historical API did not report database source");

const stagingArtifact = JSON.parse(readFileSync(stagingPath, "utf8"));
const liveRows = livePayload.data;
const stagedRows = stagingArtifact?.native?.historicalRows;
assert(Array.isArray(stagedRows), `${stagingPath} does not contain native historicalRows`);
assert(liveRows.every((row) => row.state === STATE), "Live API returned a non-RI historical row");
assert(stagedRows.every((row) => row.state == null || row.state === STATE), "Staging contains a non-RI historical row");
assertVoteRows(liveRows, "Live Rhode Island history");
assertVoteRows(stagedRows, "Staged Rhode Island history");
assertExactObject(sorted(new Set(liveRows.map((row) => row.electionYear))), YEARS, "Unexpected live years");
assertExactObject(sorted(new Set(stagedRows.map((row) => row.electionYear))), YEARS, "Unexpected staged years");

const liveProfile = detectLiveProfile(liveRows);
const yearReports = [];
const stagedCanonicalByYear = new Map();
for (const year of YEARS) {
  const live = rowsForYear(liveRows, year);
  const staged = rowsForYear(stagedRows, year);
  const liveSummary = rowSummary(live);
  const stagedSummary = rowSummary(staged);
  const expectedStatewide = EXPECTED_STATEWIDE.get(year);
  assertExactObject(liveSummary.statewideTotals, expectedStatewide, `Live ${year} statewide totals changed`);
  assertExactObject(stagedSummary.statewideTotals, expectedStatewide, `Staged ${year} statewide totals changed`);
  assert(staged.length === 6, `Staged ${year} must contain five county rows plus Federal Precincts`);
  assert(stagedSummary.taggedRowCount === 5, `Staged ${year} must contain five tagged county rows`);
  assertExactObject(stagedSummary.distinctTags, sorted(RI_COUNTY_TAGS.values()), `Staged ${year} county tags changed`);
  assertLiveTagProfile(liveSummary, liveProfile, year);

  const liveCanonical = aggregateCanonical(live, `Live ${year}`);
  const stagedCanonical = aggregateCanonical(staged, `Staged ${year}`);
  stagedCanonicalByYear.set(year, stagedCanonical);
  const canonicalReconciliation = sorted(liveCanonical.keys()).map((key) => {
    const liveTotals = liveCanonical.get(key);
    const stagedTotals = stagedCanonical.get(key);
    const voteDelta = delta(stagedTotals, liveTotals);
    assertExactObject(voteDelta, { demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 }, `${year} ${key} vote delta`);
    const countyEntry = [...RI_COUNTY_TAGS.entries()].find(([, tag]) => tag === key);
    return {
      jurisdictionName: key === FEDERAL_KEY ? "Federal Precincts" : countyEntry[0],
      jurisdictionTag: key === FEDERAL_KEY ? null : key,
      liveAggregatedTotals: liveTotals,
      stagedTotals,
      delta: voteDelta,
    };
  });

  yearReports.push({
    year,
    live: liveSummary,
    staged: stagedSummary,
    difference: {
      rowCount: stagedSummary.rowCount - liveSummary.rowCount,
      taggedRowCount: stagedSummary.taggedRowCount - liveSummary.taggedRowCount,
      statewideTotals: delta(stagedSummary.statewideTotals, liveSummary.statewideTotals),
    },
    canonicalReconciliation,
  });
}

function winner(votes) {
  if (votes.demVotes === votes.repVotes) return "tie";
  return votes.demVotes > votes.repVotes ? "dem" : "rep";
}

function flipSummary(fromRows, toRows, label) {
  const flips = [];
  for (const [countyName, tag] of RI_COUNTY_TAGS) {
    const fromWinner = winner(fromRows.get(tag));
    const toWinner = winner(toRows.get(tag));
    if (fromWinner !== toWinner) {
      flips.push({
        county: countyName,
        direction: `${fromWinner}_to_${toWinner}`,
        tag,
      });
    }
  }
  return { label, matchedCountyTags: 5, flips };
}

const staged2024 = new Map();
for (const row of stagingArtifact?.native?.resultRows ?? []) {
  if (row.level !== "county") continue;
  const tag = RI_COUNTY_TAGS.get(row.jurisdictionName);
  assert(tag, `Staged 2024 has an unexpected Rhode Island county: ${row.jurisdictionName}`);
  assert(!staged2024.has(tag), `Staged 2024 duplicates ${tag}`);
  const votes = {
    demVotes: row.votes?.Harris,
    repVotes: row.votes?.Trump,
    otherVotes: row.votes?.Other,
    totalVotes: row.totalVotes,
  };
  assertVoteRows([{ ...row, ...votes }], `Staged 2024 ${row.jurisdictionName}`);
  staged2024.set(tag, votes);
}
assert(staged2024.size === 5, "Staged 2024 must contain five Rhode Island county result rows");
const canonicalFlipImpact = [
  flipSummary(stagedCanonicalByYear.get(2016), stagedCanonicalByYear.get(2020), "2016-to-2020"),
  flipSummary(stagedCanonicalByYear.get(2016), staged2024, "2016-to-2024"),
  flipSummary(stagedCanonicalByYear.get(2020), staged2024, "2020-to-2024"),
];
assertExactObject(canonicalFlipImpact[0].flips, [{ county: "Kent County", direction: "rep_to_dem", tag: "county:44003" }], "RI 2016-to-2020 flip impact changed");
assertExactObject(canonicalFlipImpact[1].flips, [{ county: "Kent County", direction: "rep_to_dem", tag: "county:44003" }], "RI 2016-to-2024 flip impact changed");
assertExactObject(canonicalFlipImpact[2].flips, [], "RI 2020-to-2024 flip impact changed");

const legacyMunicipalNames = sorted(RI_CITY_TOWN_COUNTIES.keys());
const canonicalCountyNames = sorted(RI_COUNTY_TAGS.keys());
const rowReduction = liveRows.length - stagedRows.length;
const report = {
  state: STATE,
  audit: "historical_promotion_granularity_reconciliation",
  decision: "accepted",
  promotionSafe: true,
  sourceAuthority: "Rhode Island Board of Elections; CivicResultMaps production API",
  liveApiUrl,
  liveApiSource: livePayload.meta.source,
  stagingArtifact: stagingPath.replaceAll("\\", "/"),
  liveProfile,
  acceptedReplacement: {
    prePromotionLiveProfile: "legacy_municipal_2012_2016_county_2020",
    prePromotionLiveRows: 86,
    canonicalStagedRows: 18,
    acceptedRowReduction: 68,
    prePromotionRowsByYear: { "2012": 40, "2016": 40, "2020": 6 },
    canonicalRowsByYear: { "2012": 6, "2016": 6, "2020": 6 },
  },
  summary: {
    liveRows: liveRows.length,
    stagedRows: stagedRows.length,
    rowReduction,
    yearsPreserved: YEARS,
    liveTaggedRows: liveRows.filter((row) => row.jurisdictionTag).length,
    stagedTaggedRows: stagedRows.filter((row) => row.jurisdictionTag).length,
    stagedCanonicalCountyTags: sorted(new Set(stagedRows.map((row) => row.jurisdictionTag).filter(Boolean))),
    nonGeographicFederalRowsPreserved: YEARS.length,
    statewideVoteDeltaAcrossAllYears: delta(voteTotals(stagedRows), voteTotals(liveRows)),
  },
  years: yearReports,
  canonicalFlipImpact,
  displayPathChanges: {
    apiRoute: "/api/historical-baselines?state=RI",
    frontendPath: "The Historical tab groups County Movement by jurisdictionName, draws per-row fingerprint/diagnostic panels, reports row counts, and exports the same API rows.",
    years2012And2016: {
      before: "39 city/town display rows plus Federal Precincts per year",
      after: "five county display rows plus Federal Precincts per year",
      removedMunicipalityDisplayNames: legacyMunicipalNames,
      addedCountyDisplayNames: canonicalCountyNames,
      retainedNonGeographicDisplayNames: ["Federal Precincts"],
    },
    year2020: "The six display names and vote totals are unchanged; only row-method provenance text becomes explicit county aggregation/non-geographic provenance.",
  },
  acceptanceChecks: [
    { id: "recognized-live-profile", passed: true, evidence: liveProfile },
    { id: "all-years-preserved", passed: true, evidence: "2012, 2016, and 2020 exist in both live and staging." },
    { id: "official-statewide-totals-preserved", passed: true, evidence: "Democratic, Republican, Other, and total votes match pinned official totals in every year." },
    { id: "every-canonical-row-reconciles", passed: true, evidence: "All five county aggregates and Federal Precincts have zero vote delta in every year." },
    { id: "canonical-county-tags-complete", passed: true, evidence: "Staging contains county:44001, 44003, 44005, 44007, and 44009 exactly once per year." },
    { id: "canonical-flip-impact-reviewed", passed: true, evidence: "Kent County is the sole RI red-to-blue flip for 2016-to-2020 and 2016-to-2024; RI has no 2020-to-2024 county flip." },
    { id: "non-geographic-row-unforced", passed: true, evidence: "Federal Precincts remains present and has no county FIPS tag in every year." },
  ],
  caveats: [
    "Acceptance is limited to replacing historical display/reporting grain; it does not authorize production promotion.",
    "Municipal detail for 2012 and 2016 will no longer be displayed by the historical API after promotion, but all municipal votes are preserved in reviewed county aggregates.",
    "The legacy 2012 and 2016 API associated Bristol, Newport, and Providence municipality rows with same-named county tags; staging replaces those partial-county tag matches with complete county totals.",
    "Federal Precincts is non-geographic and remains intentionally unforced for county flip joins.",
  ],
};

assert(
  JSON.stringify(report.summary.statewideVoteDeltaAcrossAllYears) === JSON.stringify({ demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 }),
  "All-year live/staged vote totals differ",
);
if (liveProfile === "legacy_municipal_2012_2016_county_2020") {
  assert(rowReduction === 68, `Expected a 68-row legacy reduction, got ${rowReduction}`);
} else {
  assert(rowReduction === 0, `Expected no row reduction for canonical live history, got ${rowReduction}`);
}

const temporaryPath = `${outPath}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`);
renameSync(temporaryPath, outPath);
console.log(JSON.stringify({ outPath, decision: report.decision, liveProfile, summary: report.summary }, null, 2));
