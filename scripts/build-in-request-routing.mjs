import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const jurDir = path.join(repoRoot, "data", "in-2024-enr-jurisdiction-reports");
const csvOutput = path.join(repoRoot, "data", "in-2024-county-request-routing.csv");
const summaryOutput = path.join(repoRoot, "data", "in-2024-county-request-routing-summary.json");

const precinctCountSourceUrl =
  "https://www.in.gov/sos/elections/files/StatewideCountsofPrecincts-and-PrecinctSplits.9.21.23new.pdf";
const precinctCountLocalFile = "data/in-statewide-precinct-counts-2023.pdf";

const counts = [
  ["Adams", 25, 11, 10],
  ["Allen", 278, 5, 3],
  ["Bartholomew", 66, 15, 13],
  ["Benton", 15, 10, 10],
  ["Blackford", 12, 1, 1],
  ["Boone", 53, 45, 27],
  ["Brown", 11, 0, 0],
  ["Carroll", 19, 8, 7],
  ["Cass", 33, 9, 8],
  ["Clark", 74, 38, 27],
  ["Clay", 24, 10, 9],
  ["Clinton", 39, 4, 4],
  ["Crawford", 18, 9, 9],
  ["Daviess", 28, 6, 6],
  ["Dearborn", 45, 0, 0],
  ["Decatur", 22, 3, 2],
  ["DeKalb", 39, 8, 8],
  ["Delaware", 78, 6, 6],
  ["Dubois", 40, 2, 2],
  ["Elkhart", 118, 63, 55],
  ["Fayette", 28, 7, 7],
  ["Floyd", 60, 2, 2],
  ["Fountain", 20, 5, 5],
  ["Franklin", 23, 10, 10],
  ["Fulton", 17, 4, 2],
  ["Gibson", 34, 12, 12],
  ["Grant", 65, 41, 26],
  ["Greene", 32, 32, 17],
  ["Hamilton", 224, 35, 25],
  ["Hancock", 50, 35, 26],
  ["Harrison", 45, 13, 10],
  ["Hendricks", 105, 40, 37],
  ["Henry", 41, 22, 20],
  ["Howard", 80, 6, 4],
  ["Huntington", 37, 9, 9],
  ["Jackson", 32, 8, 6],
  ["Jasper", 29, 17, 11],
  ["Jay", 18, 11, 11],
  ["Jefferson", 26, 16, 10],
  ["Jennings", 25, 2, 2],
  ["Johnson", 140, 60, 46],
  ["Knox", 26, 7, 6],
  ["Kosciusko", 69, 29, 28],
  ["LaGrange", 16, 9, 8],
  ["Lake", 353, 15, 15],
  ["LaPorte", 93, 1, 1],
  ["Lawrence", 40, 0, 0],
  ["Madison", 112, 34, 28],
  ["Marion", 621, 78, 66],
  ["Marshall", 29, 9, 9],
  ["Martin", 18, 0, 0],
  ["Miami", 24, 8, 6],
  ["Monroe", 83, 32, 26],
  ["Montgomery", 27, 21, 17],
  ["Morgan", 46, 21, 13],
  ["Newton", 19, 10, 10],
  ["Noble", 29, 11, 11],
  ["Ohio", 11, 5, 5],
  ["Orange", 22, 24, 14],
  ["Owen", 18, 6, 6],
  ["Parke", 17, 10, 9],
  ["Perry", 19, 2, 1],
  ["Pike", 18, 0, 0],
  ["Porter", 124, 33, 30],
  ["Posey", 34, 11, 11],
  ["Pulaski", 15, 13, 9],
  ["Putnam", 31, 19, 12],
  ["Randolph", 19, 12, 11],
  ["Ripley", 25, 18, 15],
  ["Rush", 17, 2, 2],
  ["St. Joseph", 215, 16, 14],
  ["Scott", 16, 0, 0],
  ["Shelby", 41, 48, 31],
  ["Spencer", 24, 11, 11],
  ["Starke", 21, 7, 7],
  ["Steuben", 23, 11, 9],
  ["Sullivan", 20, 9, 7],
  ["Switzerland", 12, 3, 3],
  ["Tippecanoe", 117, 16, 27],
  ["Tipton", 15, 10, 5],
  ["Union", 10, 0, 0],
  ["Vanderburgh", 139, 6, 5],
  ["Vermillion", 17, 7, 7],
  ["Vigo", 89, 6, 6],
  ["Wabash", 26, 14, 11],
  ["Warren", 13, 6, 6],
  ["Warrick", 53, 17, 13],
  ["Washington", 19, 8, 6],
  ["Wayne", 59, 34, 21],
  ["Wells", 22, 13, 10],
  ["White", 20, 12, 11],
  ["Whitley", 33, 8, 8],
];

function normalizeCountyName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+County$/i, "")
    .replace(/^Dekalb$/i, "DeKalb")
    .replace(/^Lagrange$/i, "LaGrange")
    .replace(/^Laporte$/i, "LaPorte");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function phoneDisplay(value) {
  const cleaned = digits(value);
  if (cleaned.length !== 10) return value ?? "";
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
}

function priorityFor(row) {
  if (row.precinct_count >= 100 || row.precinct_split_count >= 30) return "high_volume_or_split";
  if (row.precinct_split_count > 0) return "split_count_present";
  return "standard";
}

const countByCounty = new Map(
  counts.map(([county, precinct_count, precinct_split_count, precincts_with_splits]) => [
    normalizeCountyName(county),
    { precinct_count, precinct_split_count, precincts_with_splits },
  ]),
);

const rows = [];
for (const fileName of (await readdir(jurDir)).filter((file) => /^JurR_\d+_B\.json$/i.test(file)).sort()) {
  const payload = JSON.parse((await readFile(path.join(jurDir, fileName), "utf8")).replace(/^\uFEFF/, ""));
  const region = payload.Root?.Region ?? {};
  const office = region.Office_Info ?? {};
  const countyName = normalizeCountyName(region.JURISDICTION_NAME);
  const count = countByCounty.get(countyName);
  if (!count) {
    throw new Error(`Missing precinct count row for ${countyName}`);
  }

  const row = {
    state: "IN",
    election_year: 2024,
    county: `${countyName} County`,
    county_fips: String(region.FIPS ?? ""),
    jurisdiction_id: String(region.JURISDICTIONID ?? ""),
    office_name: String(office.GENERAL_OFFICE_NAME ?? ""),
    office_type: String(office.GENERAL_OFFICE_TYPE ?? ""),
    address_line_1: String(office.FULL_ADDRESS ?? ""),
    address_line_2: String(office.FULL_ADDRESS_LINE2 ?? ""),
    city: String(office.CITY ?? ""),
    state_abbrev: String(office.STATE ?? ""),
    zip: String(office.ZIP ?? ""),
    phone: phoneDisplay(office.PHONE),
    precinct_count: count.precinct_count,
    precinct_split_count: count.precinct_split_count,
    precincts_with_splits: count.precincts_with_splits,
    routing_priority: "",
    statewide_request_status: "statewide_request_first",
    county_followup_status: "county_followup_if_state_confirms_no_statewide_export",
    result_records_needed:
      "President and U.S. Senate rows at the same precinct, precinct-split, vote-center, or reporting-unit grain; candidate; party; votes; contest and office IDs; county/FIPS; certification/finality status; reconciliation to official ENR county totals",
    turnout_records_needed:
      "ballots cast or voters voting; registered-voter denominator and timing; absentee/election-day/provisional fields if available",
    geometry_records_needed:
      "precinct, split, ward, township, vote-center, or reporting-unit geometry/crosswalk effective for the 2024 General Election",
    admin_records_needed:
      "audit-unit workpapers; CVR availability/export rules; recount, incident, correction, litigation, and amended-canvass records if applicable",
    jur_source_file: `data/in-2024-enr-jurisdiction-reports/${fileName}`,
    jur_source_url: `https://web.archive.org/web/20241106000950id_/https://enr.indianavoters.in.gov/site/data/${fileName}`,
    precinct_count_source_url: precinctCountSourceUrl,
    precinct_count_local_file: precinctCountLocalFile,
    notes:
      "JurR supplies county custodian office/contact metadata only; it contains no President or U.S. Senate candidate result rows.",
  };
  row.routing_priority = priorityFor(row);
  rows.push(row);
}

const totals = rows.reduce(
  (sum, row) => ({
    counties: sum.counties + 1,
    precincts: sum.precincts + row.precinct_count,
    precinctSplits: sum.precinctSplits + row.precinct_split_count,
    precinctsWithSplits: sum.precinctsWithSplits + row.precincts_with_splits,
    highPriorityCounties: sum.highPriorityCounties + (row.routing_priority === "high_volume_or_split" ? 1 : 0),
    splitCounties: sum.splitCounties + (row.precinct_split_count > 0 ? 1 : 0),
  }),
  { counties: 0, precincts: 0, precinctSplits: 0, precinctsWithSplits: 0, highPriorityCounties: 0, splitCounties: 0 },
);

if (totals.counties !== 92 || totals.precincts !== 5147 || totals.precinctSplits !== 1342 || totals.precinctsWithSplits !== 1092) {
  throw new Error(`Indiana request routing totals failed validation: ${JSON.stringify(totals)}`);
}

const headers = Object.keys(rows[0]);
const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n") + "\n";

const summary = {
  state: "IN",
  electionYear: 2024,
  generatedAt: process.env.CHECKED_AT ?? "2026-07-03",
  purpose:
    "Machine-readable county custodian routing and request tracking scaffold for Indiana official 2024 precinct/subcounty President and U.S. Senate follow-through.",
  sourceAuthorities: [
    "Indiana Election Division ENR JurR county jurisdiction JSON captures",
    "Indiana Election Division statewide county precinct/split count PDF",
  ],
  localArtifacts: {
    routingCsv: "data/in-2024-county-request-routing.csv",
    routingSummary: "data/in-2024-county-request-routing-summary.json",
    jurisdictionReports: "data/in-2024-enr-jurisdiction-reports",
    precinctCountPdf: precinctCountLocalFile,
  },
  sourceUrls: {
    precinctCountPdf: precinctCountSourceUrl,
    jurisdictionReportsCdx:
      "https://web.archive.org/cdx?url=enr.indianavoters.in.gov/site/data/JurR_*_B.json&from=20241101&to=20250131&output=json",
  },
  totals,
  routingPolicy: [
    "Ask the Indiana Election Division for a statewide machine-readable export first.",
    "Use county rows only as custodian follow-up if the state confirms no statewide export exists.",
    "Treat counties with at least 100 precincts or at least 30 precinct splits as high-volume/split follow-up priorities.",
  ],
  caveat:
    "This is an operational request tracker only. It does not contain candidate result rows and does not replace official ENR county results or supplemental review caveats.",
};

await writeFile(csvOutput, csv, "utf8");
await writeFile(summaryOutput, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ csv: path.relative(repoRoot, csvOutput), summary: path.relative(repoRoot, summaryOutput), totals }, null, 2));
