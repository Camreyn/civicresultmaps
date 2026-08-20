import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const repoRoot = process.cwd();
const dataDir = path.join(repoRoot, "data");
const outputCsvPath = path.join(dataDir, "hi-historical-presidential-baseline.csv");
const summaryPath = path.join(dataDir, "hi-historical-presidential-baseline-summary.json");

const COUNTY_TAGS = new Map([
  ["Hawaii County", "county:15001"],
  ["Honolulu County", "county:15003"],
  ["Kalawao County", "county:15005"],
  ["Kauai County", "county:15007"],
  ["Maui County", "county:15009"],
]);

const KALAWAO_PRECINCT = "13-09";
const KALAWAO_PRECINCT_SPLIT_ID = "78";
const EVIDENCE_ARTIFACTS_2012 = [
  { localFile: "data/hi-2012-reapportionment-hawaii.pdf", url: "https://files.hawaii.gov/elections/files/maps/reapportionmentmaps/HawaiiUnit_MinorRevision_3_30_2012.pdf", bytes: 3598253, sha256: "f6c297b6401f82b34733bf238bfb531ba246e59cade40c46513db3818c59d691", reportingGrain: "2012 Hawaii County reapportionment map", role: "district_to_county_crosswalk" },
  { localFile: "data/hi-2012-reapportionment-maui-kalawao.pdf", url: "https://files.hawaii.gov/elections/files/maps/reapportionmentmaps/MauiUnit_MinorRevision_3_30_2012.pdf", bytes: 3349603, sha256: "4fa616a5cfc1a3fd51a60e2c6a9a7c10d617bda0a23f1974573db1b9c000829e", reportingGrain: "2012 Maui and Kalawao County reapportionment map", role: "district_to_county_crosswalk" },
  { localFile: "data/hi-2012-reapportionment-kauai.pdf", url: "https://files.hawaii.gov/elections/files/maps/reapportionmentmaps/KauaiUnit_MinorRevision_3_30_2012.pdf", bytes: 2344977, sha256: "ae371ff5408669c935f71c5da46d72687f8512eb5761d7af962f93daf140d955", reportingGrain: "2012 Kauai County reapportionment map", role: "district_to_county_crosswalk" },
  { localFile: "data/hi-2012-reapportionment-honolulu.pdf", url: "https://files.hawaii.gov/elections/files/maps/reapportionmentmaps/OahuUnit_MinorRevision_3_30_2012.pdf", bytes: 3960485, sha256: "c1f2c564089e33f3b39b253b1c953d85f2874fe2dbc60b9cda5947bcd57673a1", reportingGrain: "2012 City and County of Honolulu reapportionment map", role: "district_to_county_crosswalk" },
  { localFile: "data/hi-2012-molokai-election-map-compilation.pdf", url: "https://files.hawaii.gov/elections/files/maps/electionmaps/compilations/County%20of%20Maui%20-%20All.pdf", bytes: 7297433, sha256: "97ccfad4f5a210ac3f28200009ca0964f09a3c39fa9a21a91660fd4f6fd29ad1", reportingGrain: "Office election-map compilation including the May 2012 Molokai map", role: "kalawao_precinct_crosswalk" },
  { localFile: "data/hi-2012-general-hawaii-county-summary.pdf", url: "https://files.hawaii.gov/elections/files/results/2012/general/coh.pdf", bytes: 49582, sha256: "9fc43c0e766ad27fc0408ff9760a75c10653600157eec42e31d5b03c72a69c05", reportingGrain: "2012 Hawaii County certified summary", role: "election_county_reconciliation" },
  { localFile: "data/hi-2012-general-maui-county-summary.pdf", url: "https://files.hawaii.gov/elections/files/results/2012/general/com.pdf", bytes: 49845, sha256: "8a32792536dc85c9c68d12419f53eeff97ea9791d69faaf67b70afc0ed928d2c", reportingGrain: "2012 Maui County certified summary including the Kalawao-administered precinct", role: "election_county_reconciliation" },
  { localFile: "data/hi-2012-general-kauai-county-summary.pdf", url: "https://files.hawaii.gov/elections/files/results/2012/general/cok.pdf", bytes: 46963, sha256: "2a7b9f57d97e34cf1a67eda5a91822ee5eab016f0ad6ce5a3a947bbb5e5d3411", reportingGrain: "2012 Kauai County certified summary", role: "election_county_reconciliation" },
  { localFile: "data/hi-2012-general-honolulu-county-summary.pdf", url: "https://files.hawaii.gov/elections/files/results/2012/general/cch.pdf", bytes: 54516, sha256: "8932961485f4fa5d244690444a84cac7a7e7f7d3a6b31429f1d6104b52f4bf30", reportingGrain: "2012 City and County of Honolulu certified summary", role: "election_county_reconciliation" },
];
const HISTORICAL_DISTRICT_RANGES = new Map([
  [
    2012,
    [
      { min: 1, max: 7, county: "Hawaii County" },
      { min: 8, max: 13, county: "Maui County" },
      { min: 14, max: 16, county: "Kauai County" },
      { min: 17, max: 51, county: "Honolulu County" },
    ],
  ],
  [
    2016,
    [
      { min: 1, max: 7, county: "Hawaii County" },
      { min: 8, max: 13, county: "Maui County" },
      { min: 14, max: 16, county: "Kauai County" },
      { min: 17, max: 51, county: "Honolulu County" },
    ],
  ],
  [
    2020,
    [
      { min: 1, max: 7, county: "Hawaii County" },
      { min: 8, max: 13, county: "Maui County" },
      { min: 14, max: 16, county: "Kauai County" },
      { min: 17, max: 51, county: "Honolulu County" },
    ],
  ],
]);

const SOURCES = [
  {
    year: 2012,
    summaryId: "hi-2012-general-summary",
    detailId: "hi-2012-general-precinct-detail",
    summaryUrl: "https://files.hawaii.gov/elections/files/results/2012/general/summary.txt",
    detailUrl: "https://files.hawaii.gov/elections/files/results/2012/general/media.txt",
    summaryFile: path.join(dataDir, "hi-2012-general-summary.txt"),
    detailFile: path.join(dataDir, "hi-2012-general-precinct-detail.txt"),
    expected: { rowCount: 5, dem: 306266, rep: 120937, other: 7018, total: 434221 },
    expectedSummary: { rowCount: 5, dem: 306658, rep: 121015, other: 7024, total: 434697 },
    expectedSkippedNonGeographicVotes: 476,
    evidenceArtifacts: EVIDENCE_ARTIFACTS_2012,
    crosswalkEvidenceUrls: [
      "https://elections.hawaii.gov/about-us/boards-and-commissions/reapportionment/reapportionment-map/",
      "https://files.hawaii.gov/elections/files/maps/reapportionmentmaps/HawaiiUnit_MinorRevision_3_30_2012.pdf",
      "https://files.hawaii.gov/elections/files/maps/reapportionmentmaps/MauiUnit_MinorRevision_3_30_2012.pdf",
      "https://files.hawaii.gov/elections/files/maps/reapportionmentmaps/KauaiUnit_MinorRevision_3_30_2012.pdf",
      "https://files.hawaii.gov/elections/files/maps/reapportionmentmaps/OahuUnit_MinorRevision_3_30_2012.pdf",
      "https://files.hawaii.gov/elections/files/maps/electionmaps/compilations/County%20of%20Maui%20-%20All.pdf",
    ],
    reconciliationEvidenceUrls: [
      "https://files.hawaii.gov/elections/files/results/2012/general/coh.pdf",
      "https://files.hawaii.gov/elections/files/results/2012/general/com.pdf",
      "https://files.hawaii.gov/elections/files/results/2012/general/cok.pdf",
      "https://files.hawaii.gov/elections/files/results/2012/general/cch.pdf",
    ],
    expectedCountyTotals: {
      "Hawaii County": { dem: 47224, rep: 14753, other: 1477, total: 63454 },
      "Honolulu County": { dem: 204349, rep: 88461, other: 3932, total: 296742 },
      "Kalawao County": { dem: 25, rep: 2, other: 0, total: 27 },
      "Kauai County": { dem: 18641, rep: 6121, other: 610, total: 25372 },
      "Maui County": { dem: 36027, rep: 11600, other: 999, total: 48626 },
    },
    electionCountyMembers: {
      "Hawaii County": ["Hawaii County"],
      "Maui County": ["Maui County", "Kalawao County"],
      "Kauai County": ["Kauai County"],
      "City & County of Honolulu": ["Honolulu County"],
    },
    expectedElectionCountyTotals: {
      "Hawaii County": { dem: 47224, rep: 14753, other: 1477, total: 63454 },
      "Maui County": { dem: 36052, rep: 11602, other: 999, total: 48653 },
      "Kauai County": { dem: 18641, rep: 6121, other: 610, total: 25372 },
      "City & County of Honolulu": { dem: 204349, rep: 88461, other: 3932, total: 296742 },
    },
  },
  {
    year: 2016,
    summaryId: "hi-2016-general-summary",
    detailId: "hi-2016-general-precinct-detail",
    summaryUrl: "https://files.hawaii.gov/elections/files/results/2016/general/summary.txt",
    detailUrl: "https://files.hawaii.gov/elections/files/results/2016/general/media.txt",
    summaryFile: path.join(dataDir, "hi-2016-general-summary.txt"),
    detailFile: path.join(dataDir, "hi-2016-general-precinct-detail.txt"),
    expected: { rowCount: 5, dem: 266891, rep: 128847, other: 33199, total: 428937 },
    expectedCountyTotals: {
      "Hawaii County": { dem: 41259, rep: 17501, other: 6107, total: 64867 },
      "Honolulu County": { dem: 175696, rep: 90326, other: 19768, total: 285790 },
      "Kalawao County": { dem: 14, rep: 1, other: 5, total: 20 },
      "Kauai County": { dem: 16456, rep: 7574, other: 2305, total: 26335 },
      "Maui County": { dem: 33466, rep: 13445, other: 5014, total: 51925 },
    },
  },
  {
    year: 2020,
    summaryId: "hi-2020-general-summary",
    detailId: "hi-2020-general-precinct-detail",
    summaryUrl: "https://files.hawaii.gov/elections/files/results/2020/general/summary.txt",
    detailUrl: "https://files.hawaii.gov/elections/files/results/2020/general/media.txt",
    summaryFile: path.join(dataDir, "hi-2020-general-summary.txt"),
    detailFile: path.join(dataDir, "hi-2020-general-precinct-detail.txt"),
    expected: { rowCount: 5, dem: 366130, rep: 196864, other: 11475, total: 574469 },
    expectedCountyTotals: {
      "Hawaii County": { dem: 58731, rep: 26897, other: 2186, total: 87814 },
      "Honolulu County": { dem: 238869, rep: 136259, other: 6986, total: 382114 },
      "Kalawao County": { dem: 23, rep: 1, other: 0, total: 24 },
      "Kauai County": { dem: 21225, rep: 11582, other: 690, total: 33497 },
      "Maui County": { dem: 47282, rep: 22125, other: 1613, total: 71020 },
    },
  },
];

function intText(value) {
  return Number(String(value ?? "").replace(/[^0-9-]/g, "")) || 0;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    const next = clean[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((item) => item !== "")) rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [String(name).trim().replace(/^#/, ""), cells[index] ?? ""])));
}

function readHawaiiRows(file) {
  let text = fs.readFileSync(file, "utf8");
  text = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (text.startsWith("Format#1")) {
    text = text.split(/\r?\n/).slice(1).join("\n");
  }
  return parseCsv(text);
}

function presidentBucket(candidate) {
  const value = String(candidate ?? "").toUpperCase();
  if (value.includes("BIDEN") || value.includes("CLINTON") || value.includes("HARRIS")) return "dem";
  if (value.includes("TRUMP") || value.includes("ROMNEY")) return "rep";
  return "other";
}

function countyForPrecinct(precinctName, year) {
  if (!/^\d{2}-\d{2}$/.test(String(precinctName ?? ""))) return null;
  if (precinctName === KALAWAO_PRECINCT) return "Kalawao County";

  const ranges = HISTORICAL_DISTRICT_RANGES.get(year);
  if (!ranges) {
    throw new Error("No reviewed Hawaii historical county crosswalk for " + year);
  }
  const district = Number(String(precinctName).split("-", 1)[0]);
  return ranges.find((range) => district >= range.min && district <= range.max)?.county ?? null;
}

function voteTotal(row) {
  return (
    intText(row.Absentee_votes) +
    intText(row.Early_votes) +
    intText(row.Election_Votes) +
    intText(row["Mail votes"]) +
    intText(row["In-Person votes"])
  );
}

function summarizeRows(rows) {
  return {
    rowCount: rows.length,
    dem: rows.reduce((sum, row) => sum + Number(row.dem_votes), 0),
    rep: rows.reduce((sum, row) => sum + Number(row.rep_votes), 0),
    other: rows.reduce((sum, row) => sum + Number(row.other_votes), 0),
    total: rows.reduce((sum, row) => sum + Number(row.total_votes), 0),
  };
}

function assertVoteTuple(label, actual, expected) {
  const mismatches = Object.fromEntries(
    ["dem", "rep", "other", "total"]
      .filter((key) => actual[key] !== expected[key])
      .map((key) => [key, { actual: actual[key], expected: expected[key] }]),
  );
  if (Object.keys(mismatches).length) {
    throw new Error(label + " reconciliation failed: " + JSON.stringify(mismatches));
  }
}

function parseSource(source) {
  const evidenceArtifacts = (source.evidenceArtifacts ?? []).map((artifact) => {
    const absolutePath = path.join(repoRoot, artifact.localFile);
    const bytes = fs.readFileSync(absolutePath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== artifact.bytes || sha256 !== artifact.sha256) {
      throw new Error(`${source.year} Hawaii evidence artifact drifted: ${artifact.localFile}`);
    }
    return { authority: "Hawaii Office of Elections; Hawaii Reapportionment Commission", electionYear: source.year, parser: "hashPinnedOfficialPdfEvidence", ...artifact };
  });
  const summaryRows = readHawaiiRows(source.summaryFile).filter((row) => row["Contest ID"] === "1");
  const summaryTotals = { dem: 0, rep: 0, other: 0, total: 0 };
  for (const row of summaryRows) {
    const bucket = presidentBucket(row["Candidate Name"]);
    const votes = intText(row["Total Votes"]);
    summaryTotals[bucket] += votes;
    summaryTotals.total += votes;
  }

  const counties = new Map([...COUNTY_TAGS.keys()].map((county) => [county, { dem: 0, rep: 0, other: 0, total: 0 }]));
  const kalawaoPrecinctSplitIds = new Set();
  let skippedNonGeographicVotes = 0;
  for (const row of readHawaiiRows(source.detailFile)) {
    if (String(row.Contest_id ?? "") !== "1") continue;
    if (row.Precinct_Name === KALAWAO_PRECINCT) {
      kalawaoPrecinctSplitIds.add(String(row.precinct_splitId ?? "").trim());
    }
    const county = countyForPrecinct(row.Precinct_Name, source.year);
    const votes = voteTotal(row);
    if (!county) {
      skippedNonGeographicVotes += votes;
      continue;
    }
    const bucket = presidentBucket(row.Candidate_name);
    const countyTotals = counties.get(county);
    countyTotals[bucket] += votes;
    countyTotals.total += votes;
  }

  const actualKalawaoSplitIds = [...kalawaoPrecinctSplitIds].sort();
  if (JSON.stringify(actualKalawaoSplitIds) !== JSON.stringify([KALAWAO_PRECINCT_SPLIT_ID])) {
    throw new Error(
      source.year + " Kalawao precinct split IDs changed: " + JSON.stringify(actualKalawaoSplitIds)
        + " != " + JSON.stringify([KALAWAO_PRECINCT_SPLIT_ID]),
    );
  }
  const expectedCountyNames = Object.keys(source.expectedCountyTotals).sort();
  const actualCountyNames = [...counties.keys()].sort();
  if (JSON.stringify(actualCountyNames) !== JSON.stringify(expectedCountyNames)) {
    throw new Error(
      source.year + " Hawaii expected county pins changed: "
        + JSON.stringify(actualCountyNames) + " != " + JSON.stringify(expectedCountyNames),
    );
  }
  for (const [county, expected] of Object.entries(source.expectedCountyTotals)) {
    assertVoteTuple(source.year + " " + county, counties.get(county), expected);
  }

  let electionCountyTotals = null;
  if (source.expectedElectionCountyTotals) {
    electionCountyTotals = {};
    for (const [electionCounty, memberCounties] of Object.entries(source.electionCountyMembers)) {
      const actual = memberCounties.reduce(
        (sum, county) => {
          const values = counties.get(county);
          return {
            dem: sum.dem + values.dem,
            rep: sum.rep + values.rep,
            other: sum.other + values.other,
            total: sum.total + values.total,
          };
        },
        { dem: 0, rep: 0, other: 0, total: 0 },
      );
      assertVoteTuple(source.year + " official " + electionCounty + " summary", actual, source.expectedElectionCountyTotals[electionCounty]);
      electionCountyTotals[electionCounty] = actual;
    }
  }

  const rows = [...counties.entries()].map(([county, votes]) => ({
    state: "HI",
    election_year: source.year,
    jurisdiction_name: county,
    jurisdiction_tag: COUNTY_TAGS.get(county),
    source_id: "hi-historical-presidential-baseline",
    source_level: "county",
    row_method: "historicalPresidentialCsv",
    dem_votes: votes.dem,
    rep_votes: votes.rep,
    other_votes: votes.other,
    total_votes: votes.total,
    source_url: `${source.summaryUrl}; ${source.detailUrl}`,
  }));
  const totals = summarizeRows(rows);
  if (JSON.stringify(totals) !== JSON.stringify(source.expected)) {
    throw new Error(`${source.year} Hawaii county totals did not reconcile: ${JSON.stringify(totals)} != ${JSON.stringify(source.expected)}`);
  }
  const summaryComparable = { rowCount: rows.length, ...summaryTotals };
  const expectedSummary = source.expectedSummary ?? source.expected;
  if (JSON.stringify(summaryComparable) !== JSON.stringify(expectedSummary)) {
    throw new Error(`${source.year} Hawaii summary totals did not reconcile: ${JSON.stringify(summaryComparable)} != ${JSON.stringify(expectedSummary)}`);
  }
  const expectedSkippedNonGeographicVotes = source.expectedSkippedNonGeographicVotes ?? 0;
  if (skippedNonGeographicVotes !== expectedSkippedNonGeographicVotes) {
    throw new Error(
      `${source.year} Hawaii non-geographic President votes changed: ${skippedNonGeographicVotes} != ${expectedSkippedNonGeographicVotes}`,
    );
  }
  return {
    rows,
    totals,
    summaryTotals,
    skippedNonGeographicVotes,
    kalawaoPrecinct: {
      precinctName: KALAWAO_PRECINCT,
      precinctSplitIds: actualKalawaoSplitIds,
      jurisdictionTag: COUNTY_TAGS.get("Kalawao County"),
      ...source.expectedCountyTotals["Kalawao County"],
    },
    mauiResidual: { ...counties.get("Maui County") },
    countyTotals: Object.fromEntries(
      [...counties.entries()].map(([county, values]) => [county, { ...values }]),
    ),
    electionCountyTotals,
    crosswalkEvidenceUrls: source.crosswalkEvidenceUrls ?? [],
    reconciliationEvidenceUrls: source.reconciliationEvidenceUrls ?? [],
    evidenceArtifacts,
    districtRanges: HISTORICAL_DISTRICT_RANGES.get(source.year).map((range) => ({
      districts: String(range.min).padStart(2, "0") + "-" + String(range.max).padStart(2, "0"),
      county: range.county,
    })),
  };
}

const outputRows = [];
const summary = {
  authority: "Hawaii Office of Elections",
  parser: "scripts/normalize-hi-historical-presidential-baseline.mjs",
  caveat: "Official Hawaii 2012, 2016, and 2020 statewide summary/detail text exports are normalized with the reviewed pre-reapportionment district ranges for each source year: 01-07 Hawaii, 08-13 Maui, 14-16 Kauai, and 17-51 Honolulu. Precinct 13-09 is split from Maui and pinned to Kalawao County FIPS 15005; all five county tuples, statewide totals, and non-geographic exclusions are asserted before output.",
  sources: [],
};

for (const source of SOURCES) {
  const {
    rows,
    totals,
    summaryTotals,
    skippedNonGeographicVotes,
    kalawaoPrecinct,
    mauiResidual,
    countyTotals,
    electionCountyTotals,
    crosswalkEvidenceUrls,
    reconciliationEvidenceUrls,
    evidenceArtifacts,
    districtRanges,
  } = parseSource(source);
  outputRows.push(...rows);
  summary.sources.push({
    year: source.year,
    sourceIds: [source.summaryId, source.detailId],
    urls: [source.summaryUrl, source.detailUrl],
    localFiles: [
      path.relative(repoRoot, source.summaryFile).replace(/\\/g, "/"),
      path.relative(repoRoot, source.detailFile).replace(/\\/g, "/"),
    ],
    ...totals,
    summaryTotals,
    skippedNonGeographicVotes,
    kalawaoPrecinct,
    mauiResidual,
    countyTotals,
    electionCountyTotals,
    crosswalkEvidenceUrls,
    reconciliationEvidenceUrls,
    evidenceArtifacts,
    districtRanges,
  });
}

const columns = ["state", "election_year", "jurisdiction_name", "jurisdiction_tag", "source_id", "source_level", "row_method", "dem_votes", "rep_votes", "other_votes", "total_votes", "source_url"];
const csv = [
  columns.join(","),
  ...outputRows
    .sort((a, b) => Number(a.election_year) - Number(b.election_year) || String(a.jurisdiction_name).localeCompare(String(b.jurisdiction_name)))
    .map((row) => columns.map((column) => csvCell(row[column])).join(",")),
].join("\n");
fs.writeFileSync(outputCsvPath, `${csv}\n`, "utf8");
summary.output = {
  localFile: path.relative(repoRoot, outputCsvPath).replace(/\\/g, "/"),
  rowCount: outputRows.length,
  years: [2012, 2016, 2020],
};
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary.output));
