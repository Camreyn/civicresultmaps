import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const CENSUS_TOWN_SOURCE_URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/22/query?where=STATE%3D%2709%27&outFields=GEOID,STATE,COUNTY,COUSUB,NAME,BASENAME,COUSUBNS&returnGeometry=true&outSR=4326&f=geojson";
const CENSUS_REGION_SOURCE_URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?where=STATE%3D%2709%27&outFields=NAME,BASENAME,GEOID,STATE,COUNTY&returnGeometry=true&outSR=4326&f=geojson";

const ELECTIONS = [
  {
    year: 2016,
    electionId: "1",
    version: 5603,
    officeId: "1",
    demCandidateId: "677",
    demCandidateName: "Clinton and Kaine",
    repCandidateId: "668",
    repCandidateName: "Trump and Pence",
    sourceId: "ct-2016-ems-election-1-version-5603",
    sourceDirectory: "data/ct-2016-ems-election-1-version-5603",
    expected: { townRows: 169, demVotes: 897572, repVotes: 673215, otherVotes: 74133, totalVotes: 1644920 },
  },
  {
    year: 2020,
    electionId: "54",
    version: 64824,
    officeId: "7970",
    demCandidateId: "18662",
    demCandidateName: "Biden and Harris",
    repCandidateId: "18661",
    repCandidateName: "Trump and Pence",
    sourceId: "ct-2020-ems-election-54-version-64824",
    sourceDirectory: "data/ct-2020-ems-election-54-version-64824",
    expected: { townRows: 169, demVotes: 1080831, repVotes: 714717, otherVotes: 28309, totalVotes: 1823857 },
  },
  {
    year: 2024,
    electionId: "91",
    version: 80741,
    officeId: "16518",
    demCandidateId: "35838",
    demCandidateName: "Harris and Walz",
    repCandidateId: "35839",
    repCandidateName: "Trump and Vance",
    sourceId: "ct-2024-ems-election-91-version-80741",
    sourceDirectory: "data/ct-2024-ems-election-91-version-80741",
    expected: { townRows: 169, demVotes: 992053, repVotes: 736918, otherVotes: 30039, totalVotes: 1759010 },
  },
];

const CROSSWALK_OUT = path.join(repoRoot, "data", "ct-current-planning-region-crosswalk.csv");
const HISTORICAL_OUT = path.join(repoRoot, "data", "ct-historical-presidential-baseline.csv");
const SUMMARY_OUT = path.join(repoRoot, "data", "ct-historical-presidential-baseline-summary.json");

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(header, records) {
  const rows = [header, ...records.map((record) => header.map((field) => record[field] ?? ""))];
  return `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

function integer(value) {
  const parsed = Number.parseInt(String(value ?? "0").replaceAll(",", ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function contestTotal(contestRows) {
  return contestRows.reduce(
    (sum, candidateRow) =>
      sum + Object.values(candidateRow).reduce((candidateSum, payload) => candidateSum + integer(payload?.V), 0),
    0,
  );
}

function candidateTotal(contestRows, candidateId) {
  return contestRows.reduce(
    (sum, candidateRow) => sum + integer(candidateRow?.[candidateId]?.V),
    0,
  );
}

function totalsForRows(rows) {
  return rows.reduce(
    (totals, row) => ({
      rows: totals.rows + 1,
      demVotes: totals.demVotes + Number(row.dem_votes),
      repVotes: totals.repVotes + Number(row.rep_votes),
      otherVotes: totals.otherVotes + Number(row.other_votes),
      totalVotes: totals.totalVotes + Number(row.total_votes),
    }),
    { rows: 0, demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );
}

function assertObjectEqual(label, actual, expected) {
  const mismatches = Object.entries(expected).filter(([key, value]) => actual[key] !== value);
  if (mismatches.length) {
    throw new Error(`${label} mismatch: ${JSON.stringify({ expected, actual })}`);
  }
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function readJson(relativePath) {
  const text = await readFile(path.join(repoRoot, relativePath), "utf8");
  return { text, value: JSON.parse(text) };
}

function flattenedOffices(lookup) {
  return lookup.officeList.flatMap((office) =>
    Object.entries(office).map(([id, payload]) => ({ id, ...payload })),
  );
}

function assertElectionMetadata(election, lookup, version) {
  if (String(lookup.election?.ID) !== election.electionId || Number(version.Version) !== election.version) {
    throw new Error(`Connecticut EMS ${election.year} election/version metadata mismatch`);
  }
  const office = flattenedOffices(lookup).find((row) => row.id === election.officeId);
  if (!office || !String(office.NM ?? "").includes("Presidential Electors")) {
    throw new Error(`Connecticut EMS ${election.year} is missing expected President office ${election.officeId}`);
  }
  const demName = lookup.candidateIds?.[election.demCandidateId]?.NM;
  const repName = lookup.candidateIds?.[election.repCandidateId]?.NM;
  if (demName !== election.demCandidateName || repName !== election.repCandidateName) {
    throw new Error(
      `Connecticut EMS ${election.year} candidate metadata mismatch: ${JSON.stringify({ demName, repName })}`,
    );
  }
}

const townGeometry = (await readJson("data/ct-town-mcds.geojson")).value;
const regionGeometry = (await readJson("data/ct-counties.geojson")).value;
const currentLookup = (await readJson(`${ELECTIONS[2].sourceDirectory}/Lookupdata.json`)).value;

const regionsByCode = new Map();
for (const feature of regionGeometry.features ?? []) {
  const properties = feature.properties ?? {};
  const state = String(properties.STATE ?? "09").padStart(2, "0");
  const county = String(properties.COUNTY ?? "").padStart(3, "0");
  const geoid = String(properties.GEOID ?? `${state}${county}`);
  const name = String(properties.NAME ?? "").trim();
  if (state !== "09" || !/^09(?:110|120|130|140|150|160|170|180|190)$/.test(geoid) || !name) {
    continue;
  }
  if (regionsByCode.has(county)) {
    throw new Error(`Duplicate Connecticut planning-region Census COUNTY ${county}`);
  }
  regionsByCode.set(county, { geoid, name });
}
if (regionsByCode.size !== 9) {
  throw new Error(`Expected 9 current Connecticut planning regions, got ${regionsByCode.size}`);
}

const censusTownsByName = new Map();
for (const feature of townGeometry.features ?? []) {
  const properties = feature.properties ?? {};
  if (String(properties.STATE) !== "09" || String(properties.COUSUB) === "00000") {
    continue;
  }
  const name = String(properties.BASENAME ?? "").trim();
  if (!name || censusTownsByName.has(name)) {
    throw new Error(`Missing or duplicate Connecticut Census BASENAME ${name}`);
  }
  const county = String(properties.COUNTY ?? "").padStart(3, "0");
  const region = regionsByCode.get(county);
  if (!region) {
    throw new Error(`Connecticut Census town ${name} references unknown current COUNTY ${county}`);
  }
  censusTownsByName.set(name, { properties, region });
}

const currentTownEntries = Object.entries(currentLookup.townIds ?? {}).sort(
  ([left], [right]) => integer(left) - integer(right),
);
if (currentTownEntries.length !== 169 || censusTownsByName.size !== 169) {
  throw new Error(
    `Connecticut crosswalk row-count mismatch: EMS ${currentTownEntries.length}, Census ${censusTownsByName.size}`,
  );
}

const crosswalkRows = currentTownEntries.map(([townId, rawTownName]) => {
  const townName = String(rawTownName).trim();
  const census = censusTownsByName.get(townName);
  if (!census) {
    throw new Error(`Connecticut EMS town has no exact Census BASENAME match: ${townId} ${townName}`);
  }
  const properties = census.properties;
  const region = census.region;
  return {
    ems_town_id: townId,
    ems_town_name: townName,
    census_town_name: String(properties.NAME),
    census_basename: String(properties.BASENAME),
    census_cousub_geoid: String(properties.GEOID),
    census_cousub_code: String(properties.COUSUB),
    census_county_code: String(properties.COUNTY).padStart(3, "0"),
    planning_region_geoid: region.geoid,
    planning_region_name: region.name,
    jurisdiction_tag: `county:${region.geoid}`,
  };
});

const crosswalkByTownId = new Map(crosswalkRows.map((row) => [row.ems_town_id, row]));
const mappedCensusNames = new Set(crosswalkRows.map((row) => row.census_basename));
if (mappedCensusNames.size !== censusTownsByName.size) {
  throw new Error("Connecticut EMS-to-Census crosswalk did not consume each Census town exactly once");
}

const electionSummaries = [];
const historicalRows = [];
for (const election of ELECTIONS) {
  const [lookupFile, versionFile, townVotesFile, stateVotesFile] = await Promise.all([
    readJson(`${election.sourceDirectory}/Lookupdata.json`),
    readJson(`${election.sourceDirectory}/Version.json`),
    readJson(`${election.sourceDirectory}/townVotes_Electiondata.json`),
    readJson(`${election.sourceDirectory}/stateVotes_Electiondata.json`),
  ]);
  const lookup = lookupFile.value;
  const townVotes = townVotesFile.value;
  const stateVotes = stateVotesFile.value;
  assertElectionMetadata(election, lookup, versionFile.value);

  const historicalTownEntries = Object.entries(lookup.townIds ?? {}).sort(
    ([left], [right]) => integer(left) - integer(right),
  );
  if (historicalTownEntries.length !== 169) {
    throw new Error(`Connecticut EMS ${election.year} expected 169 towns, got ${historicalTownEntries.length}`);
  }
  for (const [townId, townName] of historicalTownEntries) {
    const current = crosswalkByTownId.get(townId);
    if (!current || current.ems_town_name !== String(townName).trim()) {
      throw new Error(
        `Connecticut EMS ${election.year} town ID/name drift: ${townId} ${townName} versus ${current?.ems_town_name}`,
      );
    }
  }

  const regionTotals = new Map(
    [...regionsByCode.values()].map((region) => [region.geoid, { region, dem: 0, rep: 0, other: 0, total: 0, towns: 0 }]),
  );
  for (const [townId] of currentTownEntries) {
    const contestRows = townVotes?.[townId]?.[election.officeId];
    if (!Array.isArray(contestRows) || !contestRows.length) {
      throw new Error(`Connecticut EMS ${election.year} town ${townId} has no President contest rows`);
    }
    const dem = candidateTotal(contestRows, election.demCandidateId);
    const rep = candidateTotal(contestRows, election.repCandidateId);
    const total = contestTotal(contestRows);
    const other = total - dem - rep;
    if (other < 0) {
      throw new Error(`Connecticut EMS ${election.year} town ${townId} has negative Other votes`);
    }
    const crosswalk = crosswalkByTownId.get(townId);
    const region = regionTotals.get(crosswalk.planning_region_geoid);
    region.dem += dem;
    region.rep += rep;
    region.other += other;
    region.total += total;
    region.towns += 1;
  }

  const sourceUrl = `https://ctemspublic.tgstg.net/ng-app/data/election/${election.electionId}/${election.version}/townVotes_Electiondata.json`;
  const regionRows = [...regionTotals.values()]
    .sort((left, right) => left.region.geoid.localeCompare(right.region.geoid))
    .map(({ region, dem, rep, other, total }) => ({
      state: "CT",
      election_year: election.year,
      jurisdiction_name: region.name,
      jurisdiction_code: region.geoid,
      jurisdiction_tag: `county:${region.geoid}`,
      local_unit: region.name,
      source_id: election.sourceId,
      source_level: "county_equivalent",
      row_method: "connecticutEmsTownJsonCurrentPlanningRegionAggregate",
      dem_votes: dem,
      rep_votes: rep,
      other_votes: other,
      total_votes: total,
      source_url: sourceUrl,
    }));

  const actual = totalsForRows(regionRows);
  assertObjectEqual(`Connecticut ${election.year} planning-region totals`, actual, {
    rows: 9,
    demVotes: election.expected.demVotes,
    repVotes: election.expected.repVotes,
    otherVotes: election.expected.otherVotes,
    totalVotes: election.expected.totalVotes,
  });

  const stateContestRows = stateVotes?.[election.officeId];
  const stateActual = {
    demVotes: candidateTotal(stateContestRows, election.demCandidateId),
    repVotes: candidateTotal(stateContestRows, election.repCandidateId),
    totalVotes: contestTotal(stateContestRows),
  };
  stateActual.otherVotes = stateActual.totalVotes - stateActual.demVotes - stateActual.repVotes;
  assertObjectEqual(`Connecticut ${election.year} stateVotes reconciliation`, stateActual, {
    demVotes: election.expected.demVotes,
    repVotes: election.expected.repVotes,
    otherVotes: election.expected.otherVotes,
    totalVotes: election.expected.totalVotes,
  });

  if (election.year < 2024) {
    historicalRows.push(...regionRows);
  }
  electionSummaries.push({
    year: election.year,
    electionId: Number(election.electionId),
    version: election.version,
    presidentOfficeId: election.officeId,
    demCandidate: { id: election.demCandidateId, name: election.demCandidateName },
    repCandidate: { id: election.repCandidateId, name: election.repCandidateName },
    sourceUrl,
    localRawDirectory: election.sourceDirectory,
    rawSha256: {
      lookup: sha256(lookupFile.text),
      townVotes: sha256(townVotesFile.text),
      stateVotes: sha256(stateVotesFile.text),
    },
    townRows: 169,
    planningRegionRows: regionRows.map((row) => ({
      geoid: row.jurisdiction_code,
      jurisdictionTag: row.jurisdiction_tag,
      name: row.jurisdiction_name,
      demVotes: row.dem_votes,
      repVotes: row.rep_votes,
      otherVotes: row.other_votes,
      totalVotes: row.total_votes,
    })),
    totals: actual,
  });
}

const crosswalkHeader = [
  "ems_town_id",
  "ems_town_name",
  "census_town_name",
  "census_basename",
  "census_cousub_geoid",
  "census_cousub_code",
  "census_county_code",
  "planning_region_geoid",
  "planning_region_name",
  "jurisdiction_tag",
];
const historicalHeader = [
  "state",
  "election_year",
  "jurisdiction_name",
  "jurisdiction_code",
  "jurisdiction_tag",
  "local_unit",
  "source_id",
  "source_level",
  "row_method",
  "dem_votes",
  "rep_votes",
  "other_votes",
  "total_votes",
  "source_url",
];

await writeFile(CROSSWALK_OUT, writeCsv(crosswalkHeader, crosswalkRows), "utf8");
await writeFile(HISTORICAL_OUT, writeCsv(historicalHeader, historicalRows), "utf8");
await writeFile(
  SUMMARY_OUT,
  `${JSON.stringify(
    {
      sourceAuthority: "Connecticut Secretary of the State; U.S. Census Bureau",
      sourceUrls: [
        ...electionSummaries.map((contest) => contest.sourceUrl),
        CENSUS_TOWN_SOURCE_URL,
        CENSUS_REGION_SOURCE_URL,
      ],
      localArtifacts: {
        emsPackages: ELECTIONS.map((election) => election.sourceDirectory),
        censusTownGeometry: "data/ct-town-mcds.geojson",
        censusPlanningRegionGeometry: "data/ct-counties.geojson",
        townPlanningRegionCrosswalk: "data/ct-current-planning-region-crosswalk.csv",
        historicalBaseline: "data/ct-historical-presidential-baseline.csv",
      },
      parserOrNormalizationPath: "scripts/normalize-ct-historical-presidential-baseline.mjs",
      reportingGrain: "current Census planning region/county-equivalent",
      crosswalk: {
        sourceTownRows: 169,
        outputRows: crosswalkRows.length,
        planningRegions: [...regionsByCode.values()]
          .sort((left, right) => left.geoid.localeCompare(right.geoid))
          .map((region) => ({
            geoid: region.geoid,
            jurisdictionTag: `county:${region.geoid}`,
            name: region.name,
            townRows: crosswalkRows.filter((row) => row.planning_region_geoid === region.geoid).length,
          })),
        joinRule: "Exact Connecticut EMS town name equals Census BASENAME; EMS town ID/name equality is required across 2016, 2020, and 2024 before aggregation.",
      },
      contests: electionSummaries,
      historicalExpected: totalsForRows(historicalRows),
      caveats: [
        "The 2016, 2020, and 2024 town vote packages are official Connecticut Secretary of the State EMS static JSON and reconcile exactly to their corresponding EMS stateVotes President totals.",
        "Current nine-region county-equivalent assignments are derived from official current Census county-subdivision COUNTY/GEOID fields and exact EMS-to-Census BASENAME matches, not from Connecticut's retired eight-county reporting labels.",
        "The 2016 and 2020 rows are contextual current-geography aggregates for jurisdictionTag flip comparisons; the planning regions did not serve as election reporting units in those elections.",
        "The 2024 EMS totals are retained for town-ID/crosswalk source QA; active 2024 President result and review values use the separately normalized certified Statement of Vote rows, which exceed EMS version 80741 by 265 votes.",
        "Official 2012 Connecticut presidential baselines remain uncollected in this pass.",
      ],
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Wrote ${CROSSWALK_OUT}`);
console.log(`Wrote ${HISTORICAL_OUT}`);
console.log(`Wrote ${SUMMARY_OUT}`);

