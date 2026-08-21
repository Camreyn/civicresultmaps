import { mkdir, writeFile } from "node:fs/promises";
import {
  FLORIDA_PRECINCT_YEAR_SPECS,
  FLORIDA_RAW_SOURCE_PINS,
  FLORIDA_REVIEWED_2016_PAL_DUPLICATE_IDS,
  parseFloridaOfficialResults,
  verifyFloridaRawSources,
} from "./lib/fl-precinct-geometry.mjs";

const root = process.cwd();
const output = "data/fl-historical-presidential-baseline.csv";
const reviewOutput = "data/fl-historical-precinct-source-review.json";
const sourceId = "fl-historical-presidential-dos-precinct-zips";

const EXPECTED = Object.freeze({
  2012: { countyRows: 67, sourceUnits: 6319, presidentSourceRows: 73925, duplicateCandidateRows: 0, dem: 4236647, rep: 4162600, other: 93089, total: 8492336 },
  2016: { countyRows: 67, sourceUnits: 5870, presidentSourceRows: 51337, duplicateCandidateRows: 107, dem: 4504403, rep: 4617476, other: 376214, total: 9498093 },
  2020: { countyRows: 67, sourceUnits: 6097, presidentSourceRows: 60970, duplicateCandidateRows: 0, dem: 5297036, rep: 5668716, other: 125092, total: 11090844 },
});

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function countyName(name) {
  return / County$/i.test(name) ? name : `${name} County`;
}

function assertExpected(year, parsed) {
  const expected = EXPECTED[year];
  const observed = {
    countyRows: new Set(parsed.rows.map((row) => row.parentGeoid)).size,
    sourceUnits: parsed.sourceUnitCount,
    presidentSourceRows: parsed.presidentSourceRows,
    duplicateCandidateRows: parsed.duplicateCandidateRows,
    dem: parsed.totals.democratic,
    rep: parsed.totals.republican,
    other: parsed.totals.other,
    total: parsed.totals.total,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (observed[field] !== value) throw new Error(`Florida ${year} ${field} expected ${value}, got ${observed[field]}`);
  }
  if (parsed.rows.some((row) => row.democratic + row.republican + row.other !== row.total)) {
    throw new Error(`Florida ${year} county aggregation has a component-total mismatch`);
  }
  return observed;
}

const rows = [];
const sourceReview = [];
for (const year of [2012, 2016, 2020]) {
  const spec = FLORIDA_PRECINCT_YEAR_SPECS[year];
  verifyFloridaRawSources(root, year);
  const parsed = await parseFloridaOfficialResults(root, spec);
  const expected = assertExpected(year, parsed);
  const registrationValues = parsed.rows.map((row) => row.registeredVoters);
  const ambiguousRegistrationUnits = registrationValues.filter((values) => values.length !== 1).length;
  const registrationTotal = ambiguousRegistrationUnits === 0
    ? registrationValues.reduce((sum, values) => sum + values[0], 0)
    : null;

  const counties = new Map();
  for (const row of parsed.rows) {
    const county = counties.get(row.parentGeoid) ?? {
      countyName: row.countyName,
      parentGeoid: row.parentGeoid,
      democratic: 0,
      republican: 0,
      other: 0,
      total: 0,
    };
    if (county.countyName !== row.countyName) throw new Error(`Florida ${year} county GEOID resolves to multiple names: ${row.parentGeoid}`);
    county.democratic += row.democratic;
    county.republican += row.republican;
    county.other += row.other;
    county.total += row.total;
    counties.set(row.parentGeoid, county);
  }
  if (counties.size !== expected.countyRows) throw new Error(`Florida ${year} expected ${expected.countyRows} county aggregates, got ${counties.size}`);

  for (const county of counties.values()) {
    rows.push({
      state: "FL",
      election_year: year,
      jurisdiction_name: countyName(county.countyName),
      county: countyName(county.countyName),
      local_unit: countyName(county.countyName),
      source_id: sourceId,
      source_level: "county",
      row_method: "floridaDosPrecinctZipCountyAggregate",
      source_url: spec.resultSourceUrl,
      source_jurisdiction_name: county.countyName,
      jurisdiction_geoid: county.parentGeoid,
      dem_votes: county.democratic,
      rep_votes: county.republican,
      other_votes: county.other,
      total_votes: county.total,
    });
  }
  sourceReview.push({
    year,
    sourceUrl: spec.resultSourceUrl,
    localFile: spec.resultPath,
    sourcePin: {
      bytes: FLORIDA_RAW_SOURCE_PINS[spec.resultPath][0],
      sha256: FLORIDA_RAW_SOURCE_PINS[spec.resultPath][1],
    },
    archiveRule: "All county result members are parsed; recount-named members contain no presidential-contest rows and are retained but contribute no baseline votes.",
    duplicateCandidateRule: year === 2016 ? {
      countyCode: "PAL",
      sourceUnitIds: FLORIDA_REVIEWED_2016_PAL_DUPLICATE_IDS,
      sourceUnitCount: FLORIDA_REVIEWED_2016_PAL_DUPLICATE_IDS.length,
      discardedRowCount: expected.duplicateCandidateRows,
      criterion: "For these reviewed Palm Beach source identities only, a repeated row is discarded only when its candidate/category and vote value exactly match the row already retained under the alternate polling-location label.",
      rationale: "The official 2016 archive repeats the same candidate rows for 21 Palm Beach precinct identities under two polling-location labels; counting both would duplicate votes.",
    } : null,
    schema: {
      delimiter: "tab",
      fieldCount: 19,
      countyCode: 0,
      countyName: 1,
      precinct: 5,
      registeredVoters: 7,
      contestName: 11,
      candidateName: 14,
      candidateParty: 15,
      candidateVotes: 18,
    },
    expected,
    registrationContext: {
      sourceField: "registeredVoters",
      aggregate: registrationTotal,
      ambiguousSourceUnitCount: ambiguousRegistrationUnits,
      caveat: "Registration is retained only as an election-date precinct-export field. These ZIPs do not supply compatible election-level ballots-cast semantics, so this context does not replace active EAC turnout rows.",
    },
    independentCertifiedReconciliation: {
      status: "not_performed_no_separate_artifact_retained",
      caveat: "These totals are self-consistent exact aggregates of the hash-pinned official DOS precinct ZIP. They have not been independently reconciled against a separately retained certified historical county or statewide canvass artifact.",
    },
  });
}

if (rows.length !== 201) throw new Error(`Florida historical baseline expected 201 county rows, got ${rows.length}`);
rows.sort((left, right) => left.election_year - right.election_year || left.jurisdiction_name.localeCompare(right.jurisdiction_name));
const headers = [
  "state", "election_year", "jurisdiction_name", "county", "local_unit", "source_id", "source_level", "row_method", "source_url", "source_jurisdiction_name", "jurisdiction_geoid", "dem_votes", "rep_votes", "other_votes", "total_votes",
];
await mkdir("data", { recursive: true });
await writeFile(output, `${[headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n")}\n`, "utf8");
await writeFile(reviewOutput, `${JSON.stringify({
  generatedBy: "scripts/normalize-fl-historical-presidential-baseline.mjs",
  sourceId,
  sourceAuthority: "Florida Department of State, Division of Elections",
  rowCount: rows.length,
  sources: sourceReview,
  caveat: "County historical rows are exact aggregates of the retained official precinct ZIP candidate rows. They have not been independently reconciled against a separately retained certified historical county or statewide canvass artifact. They are historical context, not replacements for Florida's 2024 certified county-detail result source. Precinct geometry remains outside this baseline package.",
}, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, reviewOutput, rows: rows.length, expected: EXPECTED }, null, 2));
