import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const stagingArg = process.argv.find((arg) => arg.startsWith("--staging="))?.slice("--staging=".length)
  ?? ".etl/staging/il-2024-staging.json";
const base = process.argv.find((arg) => arg.startsWith("--base="))?.slice("--base=".length)
  ?? "https://www.civicresultmaps.org";
const outputArg = process.argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length)
  ?? "data/il-historical-promotion-reconciliation.json";
const historyUrl = new URL("/api/historical-baselines?state=IL&limit=5000", base).href;
const resultsUrl = new URL("/api/results?state=IL&year=2024&level=county", base).href;
const indicatorsUrl = new URL("/api/indicators?state=IL&year=2024&limit=5000", base).href;

const expectedHashes = {
  live2020: "0b309481c5cdfd626819009e2b73eeda96189abf099a548e08178b1fcc23b3d6",
  staged2016: "77607330cf1cce8285172b71b3e9ec0653170b05feca4c18f49a91c87188b514",
  staged2020: "66a25f4644b1804e2b3b144f87703259b38af1ca3a082e632732845f926428c2",
  staged2024: "341b0c235812737b1f01feaa2a9b5810a298a5a3a9758af175572126fca28586",
};

function fail(message) {
  throw new Error(`Illinois promotion reconciliation failed: ${message}`);
}

function integer(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail(`${label} is not a nonnegative safe integer: ${value}`);
  return number;
}

async function api(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url, { headers: { "user-agent": "CivicResultMaps Illinois promotion reconciler" }, signal: controller.signal });
    if (!response.ok) fail(`${url} returned ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.data)) fail(`${url} did not return a data array`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function key(value) {
  return String(value ?? "").normalize("NFKD").replace(/\bCOUNTY\b/gi, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function historicalTuple(row) {
  return [
    String(row.jurisdictionTag),
    integer(row.demVotes, `${row.jurisdictionTag} Democratic votes`),
    integer(row.repVotes, `${row.jurisdictionTag} Republican votes`),
    integer(row.otherVotes, `${row.jurisdictionTag} other votes`),
    integer(row.totalVotes, `${row.jurisdictionTag} total votes`),
  ];
}

function resultTuple(tag, row) {
  return [
    tag,
    integer(row.votes?.Harris, `${tag} Harris votes`),
    integer(row.votes?.Trump, `${tag} Trump votes`),
    integer(row.votes?.Other, `${tag} Other votes`),
    integer(row.totalVotes, `${tag} total votes`),
  ];
}

function tupleHash(tuples) {
  const ordered = tuples.map((tuple) => [...tuple]).sort((left, right) => left[0].localeCompare(right[0]));
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

function totals(tuples) {
  return tuples.reduce((sum, tuple) => ({
    dem: sum.dem + tuple[1],
    rep: sum.rep + tuple[2],
    other: sum.other + tuple[3],
    total: sum.total + tuple[4],
  }), { dem: 0, rep: 0, other: 0, total: 0 });
}

function winner(tuple) {
  if (tuple[1] === tuple[2]) return "tie";
  return tuple[1] > tuple[2] ? "blue" : "red";
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

function byTag(tuples, label) {
  const result = new Map();
  for (const tuple of tuples) {
    if (!/^county:17\d{3}$/.test(tuple[0])) fail(`${label} has invalid tag ${tuple[0]}`);
    if (tuple[4] !== tuple[1] + tuple[2] + tuple[3]) fail(`${label} total does not reconcile for ${tuple[0]}`);
    if (result.has(tuple[0])) fail(`${label} has duplicate tag ${tuple[0]}`);
    result.set(tuple[0], tuple);
  }
  return result;
}

function flips(from, to) {
  const rows = [];
  for (const [tag, fromTuple] of from) {
    const toTuple = to.get(tag);
    if (!toTuple) continue;
    const fromWinner = winner(fromTuple);
    const toWinner = winner(toTuple);
    if (fromWinner !== toWinner && fromWinner !== "tie" && toWinner !== "tie") {
      rows.push({ jurisdictionTag: tag, fromWinner, toWinner });
    }
  }
  rows.sort((left, right) => left.jurisdictionTag.localeCompare(right.jurisdictionTag));
  return {
    redToBlue: rows.filter((row) => row.fromWinner === "red").length,
    blueToRed: rows.filter((row) => row.fromWinner === "blue").length,
    rows,
  };
}

const stagingPath = path.resolve(root, stagingArg);
const artifact = JSON.parse(fs.readFileSync(stagingPath, "utf8"));
if (artifact.state?.code !== "IL" || artifact.election?.year !== 2024) fail(`${stagingArg} is not an Illinois 2024 staging artifact`);
const stagedHistory = artifact.native?.historicalRows;
const stagedResults = artifact.native?.resultRows;
if (!Array.isArray(stagedHistory) || !Array.isArray(stagedResults)) fail(`${stagingArg} is missing native history/results arrays`);

const geometryPayload = JSON.parse(fs.readFileSync(path.join(root, "data/il-counties.geojson"), "utf8"));
const countyTags = new Map();
for (const feature of geometryPayload.features ?? []) {
  const name = feature.properties?.NAME;
  const geoid = String(feature.properties?.GEOID ?? "");
  if (!name || !/^17\d{3}$/.test(geoid) || countyTags.has(key(name))) fail(`invalid or duplicate county geometry ${name}/${geoid}`);
  countyTags.set(key(name), `county:${geoid}`);
}
if (countyTags.size !== 102) fail(`county geometry has ${countyTags.size} features, expected 102`);

const [liveHistoryPayload, liveResultsPayload, liveIndicatorsPayload] = await Promise.all([api(historyUrl), api(resultsUrl), api(indicatorsUrl)]);
const liveRows = liveHistoryPayload.data.map((row) => {
  if (row.state !== "IL" || !Number.isInteger(row.electionYear)) fail(`invalid live history row ${JSON.stringify(row)}`);
  const tuple = historicalTuple(row);
  return {
    electionYear: row.electionYear,
    jurisdictionName: String(row.jurisdictionName),
    jurisdictionTag: tuple[0],
    demVotes: tuple[1],
    repVotes: tuple[2],
    otherVotes: tuple[3],
    totalVotes: tuple[4],
  };
}).sort((left, right) => left.electionYear - right.electionYear || left.jurisdictionTag.localeCompare(right.jurisdictionTag));
const liveYearCounts = Object.fromEntries([...new Set(liveRows.map((row) => row.electionYear))].sort().map((year) => [year, liveRows.filter((row) => row.electionYear === year).length]));
assertEqual(liveYearCounts, { 2020: 102 }, "live historical year/row set");

const stagedYearCounts = Object.fromEntries([...new Set(stagedHistory.map((row) => row.electionYear))].sort().map((year) => [year, stagedHistory.filter((row) => row.electionYear === year).length]));
assertEqual(stagedYearCounts, { 2016: 102, 2020: 102 }, "staged historical year/row set");
const live2020Tuples = liveRows.map(historicalTuple);
const staged2016Tuples = stagedHistory.filter((row) => row.electionYear === 2016).map(historicalTuple);
const staged2020Tuples = stagedHistory.filter((row) => row.electionYear === 2020).map(historicalTuple);
const live2020 = byTag(live2020Tuples, "live 2020 history");
const staged2016 = byTag(staged2016Tuples, "staged 2016 history");
const staged2020 = byTag(staged2020Tuples, "staged 2020 history");
assertEqual([...live2020.keys()].sort(), [...staged2020.keys()].sort(), "live/staged 2020 tag sets");

const hashes = {
  live2020: tupleHash(live2020Tuples),
  staged2016: tupleHash(staged2016Tuples),
  staged2020: tupleHash(staged2020Tuples),
};
for (const [name, expected] of Object.entries(expectedHashes).filter(([name]) => name !== "staged2024")) {
  assertEqual(hashes[name], expected, `${name} tuple hash`);
}

const fields = ["dem", "rep", "other", "total"];
const fieldChangeCounts = Object.fromEntries(fields.map((field) => [field, 0]));
const stagedMinusLive = Object.fromEntries(fields.map((field) => [field, 0]));
const differentTags = [];
const unchangedTags = [];
const winnerChanges = [];
for (const [tag, stagedTuple] of staged2020) {
  const liveTuple = live2020.get(tag);
  const changed = fields.filter((field, index) => liveTuple[index + 1] !== stagedTuple[index + 1]);
  (changed.length ? differentTags : unchangedTags).push(tag);
  for (const field of changed) {
    const index = fields.indexOf(field) + 1;
    fieldChangeCounts[field] += 1;
    stagedMinusLive[field] += stagedTuple[index] - liveTuple[index];
  }
  if (winner(liveTuple) !== winner(stagedTuple)) {
    winnerChanges.push({
      jurisdictionTag: tag,
      liveWinner: winner(liveTuple),
      stagedWinner: winner(stagedTuple),
      liveDemVotes: liveTuple[1],
      liveRepVotes: liveTuple[2],
      stagedDemVotes: stagedTuple[1],
      stagedRepVotes: stagedTuple[2],
    });
  }
}
differentTags.sort();
unchangedTags.sort();
winnerChanges.sort((left, right) => left.jurisdictionTag.localeCompare(right.jurisdictionTag));
assertEqual([differentTags.length, unchangedTags.length], [100, 2], "changed/unchanged 2020 row counts");
assertEqual(unchangedTags, ["county:17001", "county:17069"], "unchanged 2020 tags");
assertEqual(fieldChangeCounts, { dem: 6, rep: 6, other: 100, total: 100 }, "2020 field-change counts");
assertEqual(stagedMinusLive, { dem: 1020260, rep: 227894, other: 9257, total: 1257411 }, "2020 staged-minus-live totals");
assertEqual(winnerChanges.map((row) => [row.jurisdictionTag, row.liveWinner, row.stagedWinner]), [
  ["county:17113", "red", "blue"],
  ["county:17201", "red", "blue"],
], "2020 winner corrections");

const cityParentTags = {
  "City of Bloomington": "county:17113",
  "City of Chicago": "county:17031",
  "City of Danville": "county:17183",
  "City of East St. Louis": "county:17163",
  "City of Galesburg": "county:17095",
  "City of Rockford": "county:17201",
};
const live2024Aggregated = new Map();
for (const row of liveResultsPayload.data) {
  const tag = row.jurisdictionTag ?? cityParentTags[row.jurisdictionName] ?? countyTags.get(key(row.jurisdictionName));
  if (!tag) fail(`could not map live 2024 row ${row.jurisdictionName}`);
  const tuple = resultTuple(tag, row);
  const aggregate = live2024Aggregated.get(tag) ?? [tag, 0, 0, 0, 0];
  for (let index = 1; index < tuple.length; index += 1) aggregate[index] += tuple[index];
  live2024Aggregated.set(tag, aggregate);
}
const staged2024Tuples = stagedResults.map((row) => {
  const tag = row.jurisdictionTag ?? countyTags.get(key(row.jurisdictionName));
  if (!tag) fail(`could not map staged 2024 row ${row.jurisdictionName}`);
  return resultTuple(tag, row);
});
const staged2024 = byTag(staged2024Tuples, "staged 2024 results");
const live2024 = byTag([...live2024Aggregated.values()], "aggregated live 2024 results");
assertEqual(liveResultsPayload.data.length, 108, "raw live 2024 row count");
assertEqual(live2024.size, 102, "aggregated live 2024 tag count");
assertEqual(staged2024.size, 102, "staged 2024 tag count");
assertEqual([...live2024.values()].sort((left, right) => left[0].localeCompare(right[0])), [...staged2024.values()].sort((left, right) => left[0].localeCompare(right[0])), "aggregated live/staged 2024 vote tuples");
assertEqual(tupleHash(staged2024Tuples), expectedHashes.staged2024, "staged 2024 tuple hash");

const flipEffects = {
  live2020ToStaged2024: flips(live2020, staged2024),
  staged2016ToStaged2020: flips(staged2016, staged2020),
  staged2016ToStaged2024: flips(staged2016, staged2024),
  staged2020ToStaged2024: flips(staged2020, staged2024),
};
assertEqual(flipEffects.live2020ToStaged2024.rows.map((row) => row.jurisdictionTag), ["county:17113", "county:17201"], "live 2020 to staged 2024 flips");
assertEqual(flipEffects.staged2016ToStaged2020.rows.map((row) => row.jurisdictionTag), ["county:17093", "county:17113"], "staged 2016 to 2020 flips");
assertEqual(flipEffects.staged2016ToStaged2024.rows.map((row) => row.jurisdictionTag), ["county:17093", "county:17113"], "staged 2016 to 2024 flips");
assertEqual(flipEffects.staged2020ToStaged2024.rows, [], "staged 2020 to 2024 flips");

const stagedIndicatorSummary = {
  reviewRows: artifact.native.reviewRows.length,
  indicatorRows: 90,
  uniqueFlaggedJurisdictions: 60,
  flaggedAreas: 60,
  byType: { vote_share_pattern: 57, average_down_ballot_difference: 33 },
};
assertEqual(stagedIndicatorSummary.reviewRows, 6655, "staged advisory review-row count");
const liveIndicatorTypes = {};
const liveIndicatorNames = new Set();
const liveIndicatorTags = new Set();
for (const row of liveIndicatorsPayload.data) {
  liveIndicatorTypes[row.type] = (liveIndicatorTypes[row.type] ?? 0) + 1;
  if (row.jurisdictionName) liveIndicatorNames.add(row.jurisdictionName);
  if (row.jurisdictionTag) liveIndicatorTags.add(row.jurisdictionTag);
}
const liveIndicatorSummary = {
  indicatorRows: liveIndicatorsPayload.data.length,
  uniqueNames: liveIndicatorNames.size,
  uniqueTags: liveIndicatorTags.size,
  byType: Object.fromEntries(Object.entries(liveIndicatorTypes).sort(([left], [right]) => left.localeCompare(right))),
};
assertEqual(liveIndicatorSummary, {
  indicatorRows: 99,
  uniqueNames: 66,
  uniqueTags: 60,
  byType: { average_down_ballot_difference: 36, vote_share_pattern: 63 },
}, "live advisory indicator summary");

const output = {
  capturedAt: new Date().toISOString(),
  status: "accepted_pre_promotion_snapshot",
  scope: "Illinois historical-baseline and 2024 county-rollup promotion acceptance",
  authority: "CivicResultMaps production API reconciled to official Illinois State Board of Elections artifacts",
  sources: {
    liveHistorical: { url: historyUrl, generatedAt: liveHistoryPayload.meta?.generatedAt ?? null, mode: liveHistoryPayload.meta?.source ?? null },
    liveResults2024: { url: resultsUrl, generatedAt: liveResultsPayload.meta?.generatedAt ?? null, mode: liveResultsPayload.meta?.source ?? null },
    liveIndicators2024: { url: indicatorsUrl, generatedAt: liveIndicatorsPayload.meta?.generatedAt ?? null, mode: liveIndicatorsPayload.meta?.source ?? null },
    stagedArtifact: path.relative(root, stagingPath).replace(/\\/g, "/"),
    officialHistoricalSummary: "data/il-historical-presidential-baseline-summary.json",
  },
  parser: "scripts/reconcile-il-historical-promotion.mjs",
  reportingGrain: "county",
  caveat: "The production snapshot is reconciliation evidence, not an election-authority source. Official historical workbooks exclude blank, undervote, and overvote records. Six parent counties gain candidate votes previously kept in separate city election-authority result rows.",
  liveHistorical: {
    yearCounts: liveYearCounts,
    tupleSha256: hashes.live2020,
    totals2020: totals(live2020Tuples),
    rows: liveRows,
  },
  stagedHistorical: {
    yearCounts: stagedYearCounts,
    tupleSha256: { 2016: hashes.staged2016, 2020: hashes.staged2020 },
    totals: { 2016: totals(staged2016Tuples), 2020: totals(staged2020Tuples) },
  },
  comparison2020: {
    matchedTags: staged2020.size,
    differentRows: differentTags.length,
    unchangedRows: unchangedTags.length,
    unchangedTags,
    fieldChangeCounts,
    stagedMinusLive,
    winnerChanges,
  },
  comparison2024: {
    liveRawRows: liveResultsPayload.data.length,
    liveCityElectionAuthorityRows: Object.entries(cityParentTags).map(([jurisdictionName, parentTag]) => ({ jurisdictionName, parentTag })),
    liveAggregatedTags: live2024.size,
    stagedRows: staged2024.size,
    mismatchedVoteTuples: 0,
    tupleSha256: expectedHashes.staged2024,
    totals: totals(staged2024Tuples),
  },
  flipEffects,
  advisoryIndicatorReview: {
    stagedReportCommand: "npm.cmd run native:report-indicators -- .etl/staging",
    live: liveIndicatorSummary,
    staged: {
      reviewRows: stagedIndicatorSummary.reviewRows,
      indicatorRows: stagedIndicatorSummary.indicatorRows,
      uniqueFlaggedJurisdictions: stagedIndicatorSummary.uniqueFlaggedJurisdictions,
      flaggedAreas: stagedIndicatorSummary.flaggedAreas,
      byType: stagedIndicatorSummary.byType,
    },
    expectedReplacement: "The canonical county rollup merges six city election authorities into their parent counties, so promotion is expected to replace 99 pre-rollup stored indicators with 90 staged indicators. This is a calculation-scope change, not an election-integrity finding.",
  },
  acceptance: {
    decision: "accept",
    rationale: "Staging preserves all 102 live 2020 tags, adds 102 official 2016 rows, replaces the 100 nonmatching 2020 tuples with official candidate/write-in totals, and preserves exact 2024 votes while rolling six city election authorities into their parent counties.",
    promotionAuthorizedByThisArtifact: false,
  },
};
const outputPath = path.resolve(root, outputArg);
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, outputPath).replace(/\\/g, "/"), status: output.status, comparison2020: output.comparison2020, comparison2024: output.comparison2024, flipEffects }));
