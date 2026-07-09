import { mkdir, readFile, writeFile } from "node:fs/promises";

const sourceUrl = "https://results.okelections.gov/OKER/?elecDate=20201103";
const sourcePage =
  "https://oklahoma.gov/elections/elections-results/election-results/2020-election-results/2020-november-general-election.html";
const sourceId = "ok-2020-official-app-president-county-results";
const rawOutput = "data/ok-2020-official-app-president-county-results.csv";
const baselineOutput = "data/ok-historical-presidential-baseline.csv";
const geometryPath = "data/ok-counties.geojson";

// Rows collected from the official Oklahoma Election Results county tables for
// the November 3, 2020 General Election presidential contest.
const officialRows = [
  ["01", "Adair County", 1387, 5585, 136, 7108],
  ["02", "Alfalfa County", 232, 1978, 52, 2262],
  ["03", "Atoka County", 765, 4557, 67, 5389],
  ["04", "Beaver County", 190, 1968, 20, 2178],
  ["05", "Beckham County", 1048, 6767, 133, 7948],
  ["06", "Blaine County", 688, 3136, 77, 3901],
  ["07", "Bryan County", 3323, 12344, 309, 15976],
  ["08", "Caddo County", 2670, 7013, 176, 9859],
  ["09", "Canadian County", 16742, 43550, 1648, 61940],
  ["10", "Carter County", 4470, 14699, 310, 19479],
  ["11", "Cherokee County", 6027, 11223, 464, 17714],
  ["12", "Choctaw County", 1082, 4698, 52, 5832],
  ["13", "Cimarron County", 70, 970, 14, 1054],
  ["14", "Cleveland County", 49827, 66677, 3274, 119778],
  ["15", "Coal County", 374, 2091, 59, 2524],
  ["16", "Comanche County", 13747, 20905, 979, 35631],
  ["17", "Cotton County", 393, 2117, 62, 2572],
  ["18", "Craig County", 1217, 4686, 129, 6032],
  ["19", "Creek County", 6577, 23294, 634, 30505],
  ["20", "Custer County", 2369, 8060, 262, 10691],
  ["21", "Delaware County", 3472, 13557, 216, 17245],
  ["22", "Dewey County", 214, 2124, 21, 2359],
  ["23", "Ellis County", 162, 1688, 23, 1873],
  ["24", "Garfield County", 4919, 16970, 541, 22430],
  ["25", "Garvin County", 1865, 8878, 179, 10922],
  ["26", "Grady County", 4144, 18538, 419, 23101],
  ["27", "Grant County", 280, 1916, 30, 2226],
  ["28", "Greer County", 328, 1605, 40, 1973],
  ["29", "Harmon County", 177, 747, 9, 933],
  ["30", "Harper County", 136, 1327, 24, 1487],
  ["31", "Haskell County", 783, 4165, 66, 5014],
  ["32", "Hughes County", 919, 3875, 63, 4857],
  ["33", "Jackson County", 1646, 6392, 183, 8221],
  ["34", "Jefferson County", 319, 2026, 40, 2385],
  ["35", "Johnston County", 738, 3441, 72, 4251],
  ["36", "Kay County", 4040, 12834, 375, 17249],
  ["37", "Kingfisher County", 854, 5521, 90, 6465],
  ["38", "Kiowa County", 699, 2673, 55, 3427],
  ["39", "Latimer County", 762, 3437, 50, 4249],
  ["40", "LeFlore County", 3299, 15213, 293, 18805],
  ["41", "Lincoln County", 2609, 12013, 266, 14888],
  ["42", "Logan County", 5455, 15608, 511, 21574],
  ["43", "Love County", 711, 3305, 60, 4076],
  ["44", "McClain County", 3582, 15295, 359, 19236],
  ["45", "McCurtain County", 1858, 9485, 124, 11467],
  ["46", "McIntosh County", 2031, 6172, 132, 8335],
  ["47", "Major County", 320, 3084, 63, 3467],
  ["48", "Marshall County", 1100, 4891, 73, 6064],
  ["49", "Mayes County", 3581, 12749, 296, 16626],
  ["50", "Murray County", 1156, 4612, 126, 5894],
  ["51", "Muskogee County", 8027, 16526, 528, 25081],
  ["52", "Noble County", 1003, 3821, 114, 4938],
  ["53", "Nowata County", 712, 3610, 69, 4391],
  ["54", "Okfuskee County", 896, 3058, 84, 4038],
  ["55", "Oklahoma County", 141724, 145050, 7966, 294740],
  ["56", "Okmulgee County", 4357, 9668, 288, 14313],
  ["57", "Osage County", 6002, 14121, 415, 20538],
  ["58", "Ottawa County", 2686, 8545, 207, 11438],
  ["59", "Pawnee County", 1363, 5267, 156, 6786],
  ["60", "Payne County", 10904, 17813, 926, 29643],
  ["61", "Pittsburg County", 3768, 13851, 305, 17924],
  ["62", "Pontotoc County", 4117, 10805, 398, 15320],
  ["63", "Pottawatomie County", 7275, 20240, 670, 28185],
  ["64", "Pushmataha County", 668, 4016, 55, 4739],
  ["65", "Roger Mills County", 168, 1629, 37, 1834],
  ["66", "Rogers County", 9589, 34031, 933, 44553],
  ["67", "Seminole County", 2150, 6011, 176, 8337],
  ["68", "Sequoyah County", 3035, 12113, 238, 15386],
  ["69", "Stephens County", 3154, 15560, 343, 19057],
  ["70", "Texas County", 894, 4505, 122, 5521],
  ["71", "Tillman County", 597, 2076, 35, 2708],
  ["72", "Tulsa County", 108996, 150574, 7108, 266678],
  ["73", "Wagoner County", 8464, 26165, 709, 35338],
  ["74", "Washington County", 5790, 17076, 635, 23501],
  ["75", "Washita County", 598, 4086, 93, 4777],
  ["76", "Woods County", 591, 2993, 94, 3678],
  ["77", "Woodward County", 1005, 6611, 169, 7785],
];

const expected = {
  rows: 77,
  demVotes: 503890,
  repVotes: 1020280,
  otherVotes: 36529,
  totalVotes: 1560699,
};

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function totals(rows) {
  return rows.reduce(
    (sum, row) => ({
      rows: sum.rows + 1,
      demVotes: sum.demVotes + row.dem_votes,
      repVotes: sum.repVotes + row.rep_votes,
      otherVotes: sum.otherVotes + row.other_votes,
      totalVotes: sum.totalVotes + row.total_votes,
    }),
    { rows: 0, demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );
}

function countyKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const countyGeojson = JSON.parse(await readFile(geometryPath, "utf8"));
const geoidByCounty = new Map(
  (countyGeojson.features ?? []).map((feature) => {
    const properties = feature.properties ?? {};
    const name = String(properties.NAME ?? properties.BASENAME ?? "").trim();
    const county = name.endsWith(" County") ? name : `${name} County`;
    return [countyKey(county), String(properties.GEOID ?? "")];
  }),
);

const rawRows = officialRows.map(([county_code, county, biden_votes, trump_votes, other_votes, total_votes]) => ({
  state: "OK",
  election_year: 2020,
  county_code,
  county,
  biden_votes,
  trump_votes,
  other_votes,
  total_votes,
  jurisdiction_tag: "county:" + (geoidByCounty.get(countyKey(county)) ?? ""),
  source_url: sourceUrl,
  source_page: sourcePage,
}));

const baselineRows = rawRows.map((row) => ({
  state: row.state,
  election_year: row.election_year,
  jurisdiction_name: row.county,
  county: row.county,
  local_unit: row.county,
  jurisdiction_tag: row.jurisdiction_tag,
  source_id: sourceId,
  source_level: "county",
  row_method: "oklahomaOfficialResultsAppCountyTable2020",
  source_url: row.source_url,
  dem_votes: row.biden_votes,
  rep_votes: row.trump_votes,
  other_votes: row.other_votes,
  total_votes: row.total_votes,
}));

for (const row of rawRows) {
  if (!/^county:40\d{3}$/.test(row.jurisdiction_tag)) {
    throw new Error(`Missing Oklahoma county jurisdiction tag for ${row.county}`);
  }
}

const actual = totals(baselineRows);
for (const [key, value] of Object.entries(expected)) {
  if (actual[key] !== value) {
    throw new Error(`Oklahoma 2020 historical ${key} mismatch: expected ${value}, got ${actual[key]}`);
  }
}

const rawHeaders = [
  "state",
  "election_year",
  "county_code",
  "county",
  "biden_votes",
  "trump_votes",
  "other_votes",
  "total_votes",
  "jurisdiction_tag",
  "source_url",
  "source_page",
];
const baselineHeaders = [
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
  "dem_votes",
  "rep_votes",
  "other_votes",
  "total_votes",
];

function writeCsv(headers, rows) {
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n") + "\n";
}

await mkdir("data", { recursive: true });
await writeFile(rawOutput, writeCsv(rawHeaders, rawRows), "utf8");
await writeFile(baselineOutput, writeCsv(baselineHeaders, baselineRows), "utf8");

console.log(
  JSON.stringify(
    {
      rawOutput,
      baselineOutput,
      rows: actual.rows,
      years: [2020],
      demVotes: actual.demVotes,
      repVotes: actual.repVotes,
      otherVotes: actual.otherVotes,
      totalVotes: actual.totalVotes,
    },
    null,
    2,
  ),
);
