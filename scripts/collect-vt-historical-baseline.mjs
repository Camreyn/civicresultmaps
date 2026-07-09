import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const state = "VT";
const sourceId = "vt-historical-presidential-baseline";
const sourceUrl = "https://electionarchive.vermont.gov/elections/download/144513/precincts_include:0/";
const sourceTitle = "Vermont Secretary of State VT Elections Database 2020 President municipality export";
const rawFile = "data/vt-2020-president-municipality-results.xls";
const manifestFile = "data/vt-2024-official-sources/2024-general-manifest.json";
const countiesFile = "data/vt-counties.geojson";
const outputFile = "data/vt-historical-presidential-baseline.csv";

const expected = {
  counties: 14,
  towns: 246,
  demVotes: 242820,
  repVotes: 112704,
  otherVotes: 11904,
  totalVotes: 367428,
};

const townAliases = new Map([
  ["E HAVEN", "EAST HAVEN"],
  ["E MONTPELIER", "EAST MONTPELIER"],
  ["ESSEX", "ESSEX TOWN"],
  ["N HERO", "NORTH HERO"],
  ["S BURLINGTON", "SOUTH BURLINGTON"],
  ["S HERO", "SOUTH HERO"],
  ["W FAIRLEE", "WEST FAIRLEE"],
  ["W HAVEN", "WEST HAVEN"],
  ["W RUTLAND", "WEST RUTLAND"],
  ["W WINDSOR", "WEST WINDSOR"],
]);

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function intValue(value) {
  const normalized = String(value ?? "").replace(/[^0-9-]/g, "");
  return normalized ? Number(normalized) : 0;
}

function normalizeName(value) {
  const normalized = String(value ?? "")
    .toUpperCase()
    .replace(/\bST\.?\b/g, "SAINT")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  return townAliases.get(normalized) ?? normalized;
}

function titleCounty(value) {
  return `${String(value ?? "")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase())} County`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
  }

  const [header, partyRow, ...body] = rows;
  if (!header?.length || !partyRow) {
    throw new Error("Vermont historical export is missing its two header rows");
  }
  return body.map((values) => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])));
}

async function ensureRawArtifact() {
  try {
    return await readFile(rawFile, "utf8");
  } catch {
    const response = await fetch(sourceUrl, {
      headers: {
        accept: "text/csv,application/vnd.ms-excel,text/plain,*/*",
        "user-agent": "CivicResultMaps Vermont historical baseline collector",
      },
    });
    if (!response.ok) {
      throw new Error(`${sourceUrl} failed: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    await mkdir(path.dirname(rawFile), { recursive: true });
    await writeFile(rawFile, text, "utf8");
    return text;
  }
}

async function buildCountyCrosswalk() {
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  const countyByTown = new Map();
  for (const district of manifest.townDistricts ?? []) {
    const town = normalizeName(district.townName);
    const county = titleCounty(district.countyName);
    const previous = countyByTown.get(town);
    if (previous && previous !== county) {
      throw new Error(`Town ${town} maps to multiple counties: ${previous}; ${county}`);
    }
    countyByTown.set(town, county);
  }
  return countyByTown;
}

async function buildCountyTags() {
  const geojson = JSON.parse(await readFile(countiesFile, "utf8"));
  return new Map(
    (geojson.features ?? []).map((feature) => {
      const props = feature.properties ?? {};
      return [String(props.NAME), `county:${props.GEOID}`];
    }),
  );
}

function blankCountyTotals() {
  return { dem: 0, other: 0, rep: 0, total: 0 };
}

function assertExpected(rows, townCount) {
  const totals = rows.reduce(
    (acc, row) => ({
      demVotes: acc.demVotes + row.dem_votes,
      otherVotes: acc.otherVotes + row.other_votes,
      repVotes: acc.repVotes + row.rep_votes,
      totalVotes: acc.totalVotes + row.total_votes,
    }),
    { demVotes: 0, otherVotes: 0, repVotes: 0, totalVotes: 0 },
  );
  const mismatches = {};
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = key === "counties" ? rows.length : key === "towns" ? townCount : totals[key];
    if (actual !== expectedValue) mismatches[key] = { actual, expected: expectedValue };
  }
  if (Object.keys(mismatches).length) {
    throw new Error(`Vermont 2020 historical reconciliation failed: ${JSON.stringify(mismatches)}`);
  }
}

async function main() {
  const [rawText, countyByTown, countyTags] = await Promise.all([
    ensureRawArtifact(),
    buildCountyCrosswalk(),
    buildCountyTags(),
  ]);

  const grouped = new Map();
  let townCount = 0;
  for (const row of parseCsv(rawText)) {
    const townName = String(row["City/Town"] ?? "").trim();
    if (!townName || townName.toUpperCase() === "TOTALS") continue;

    const townKey = normalizeName(townName);
    const county = countyByTown.get(townKey);
    if (!county) {
      throw new Error(`No official manifest county mapping for Vermont 2020 municipality row: ${townName}`);
    }

    const dem = intValue(row["Joseph R. Biden"]);
    const rep = intValue(row["Donald J. Trump"]);
    const totalVotesCast = intValue(row["Total Votes Cast"]);
    const blanks = intValue(row.Blanks);
    const spoiled = intValue(row.Spoiled);
    const other = totalVotesCast - dem - rep - blanks - spoiled;
    if (other < 0) {
      throw new Error(`Negative other-vote calculation for Vermont 2020 municipality row: ${townName}`);
    }

    const current = grouped.get(county) ?? blankCountyTotals();
    current.dem += dem;
    current.rep += rep;
    current.other += other;
    current.total += dem + rep + other;
    grouped.set(county, current);
    townCount += 1;
  }

  const rows = [...grouped.entries()]
    .map(([county, values]) => ({
      state,
      election_year: 2020,
      jurisdiction_name: county,
      county,
      local_unit: county,
      jurisdiction_tag: countyTags.get(county),
      source_id: sourceId,
      source_level: "county_aggregate_from_official_municipality_rows",
      row_method: "vermontElectionArchiveMunicipalityCsvCountyAggregate",
      source_url: sourceUrl,
      source_title: sourceTitle,
      dem_votes: values.dem,
      rep_votes: values.rep,
      other_votes: values.other,
      total_votes: values.total,
    }))
    .sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));

  const missingTags = rows.filter((row) => !row.jurisdiction_tag).map((row) => row.jurisdiction_name);
  if (missingTags.length) {
    throw new Error(`Missing Vermont county jurisdiction tags: ${missingTags.join(", ")}`);
  }

  assertExpected(rows, townCount);

  const header = [
    "state",
    "election_year",
    "jurisdiction_name",
    "county",
    "local_unit",
    "jurisdiction_tag",
    "source_id",
    "source_level",
    "row_method",
    "source_url",
    "source_title",
    "dem_votes",
    "rep_votes",
    "other_votes",
    "total_votes",
  ];
  await writeFile(
    outputFile,
    `${header.join(",")}\n${rows.map((row) => header.map((key) => csvCell(row[key])).join(",")).join("\n")}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify(
      {
        outputFile,
        rows: rows.length,
        townRowsAggregated: townCount,
        years: [2020],
        totals: expected,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

