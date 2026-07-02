import { mkdir, readFile, writeFile } from "node:fs/promises";

const state = "IN";
const sourceId = "in-historical-presidential-official-enr";
const output = "data/in-historical-presidential-baseline.csv";
const historicalEndpoint = "https://indianavoters.in.gov/ENRHistorical/GetElectionData";
const historicalPage = "https://indianavoters.in.gov/ENRHistorical/ElectionResults?year=2012";
const counties = [
  "Adams",
  "Allen",
  "Bartholomew",
  "Benton",
  "Blackford",
  "Boone",
  "Brown",
  "Carroll",
  "Cass",
  "Clark",
  "Clay",
  "Clinton",
  "Crawford",
  "Daviess",
  "Dearborn",
  "Decatur",
  "DeKalb",
  "Delaware",
  "Dubois",
  "Elkhart",
  "Fayette",
  "Floyd",
  "Fountain",
  "Franklin",
  "Fulton",
  "Gibson",
  "Grant",
  "Greene",
  "Hamilton",
  "Hancock",
  "Harrison",
  "Hendricks",
  "Henry",
  "Howard",
  "Huntington",
  "Jackson",
  "Jasper",
  "Jay",
  "Jefferson",
  "Jennings",
  "Johnson",
  "Knox",
  "Kosciusko",
  "LaGrange",
  "Lake",
  "LaPorte",
  "Lawrence",
  "Madison",
  "Marion",
  "Marshall",
  "Martin",
  "Miami",
  "Monroe",
  "Montgomery",
  "Morgan",
  "Newton",
  "Noble",
  "Ohio",
  "Orange",
  "Owen",
  "Parke",
  "Perry",
  "Pike",
  "Porter",
  "Posey",
  "Pulaski",
  "Putnam",
  "Randolph",
  "Ripley",
  "Rush",
  "St. Joseph",
  "Scott",
  "Shelby",
  "Spencer",
  "Starke",
  "Steuben",
  "Sullivan",
  "Switzerland",
  "Tippecanoe",
  "Tipton",
  "Union",
  "Vanderburgh",
  "Vermillion",
  "Vigo",
  "Wabash",
  "Warren",
  "Warrick",
  "Washington",
  "Wayne",
  "Wells",
  "White",
  "Whitley",
];

const years = [
  {
    year: 2012,
    sourceUrl: historicalPage,
    localFile: "data/in-2012-official-president-county.json",
    rowMethod: "indianaEnrHistoricalAjaxCountyRows",
    expected: { rows: 92, demVotes: 1152887, repVotes: 1420543, otherVotes: 51104, totalVotes: 2624534 },
  },
  {
    year: 2016,
    sourceUrl: "https://enr.indianavoters.in.gov/archive/2016General/data/OffCatC_1767_A.json",
    localFile: "data/in-2016-official-president-county.json",
    rowMethod: "indianaEnrHistoricalCountyRaceJson",
    expected: { rows: 92, demVotes: 1035956, repVotes: 1556514, otherVotes: 135668, totalVotes: 2728138 },
  },
  {
    year: 2020,
    sourceUrl: "https://enr.indianavoters.in.gov/archive/2020General/data/OffCatC_1019_A.json",
    localFile: "data/in-2020-official-president-county.json",
    rowMethod: "indianaEnrHistoricalCountyRaceJson",
    expected: { rows: 92, demVotes: 1242416, repVotes: 1729519, otherVotes: 61186, totalVotes: 3033121 },
  },
];

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function intValue(value) {
  const normalized = String(value ?? "").replace(/[^0-9-]/g, "");
  return normalized ? Number(normalized) : 0;
}

function countyName(value) {
  const name = String(value ?? "").trim();
  return name ? name.replace(/\s+County$/i, "") + " County" : "";
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function fetch2012CountyRows() {
  const out = [];
  for (const county of counties) {
    let pagesCount = 1;
    for (let pageNumber = 1; pageNumber <= pagesCount; pageNumber += 1) {
      const body = new URLSearchParams({
        year: "2012",
        candidateName: "",
        pageNumber: String(pageNumber),
        sortBy: "",
        sortDir: "",
        electionType: "General",
        county,
        office: "President",
        party: "",
        filterCandidateName: "",
        filterElectionType: "false",
      });
      const response = await fetch(historicalEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "CivicResultMaps Indiana historical baseline collector",
        },
        body,
      });
      if (!response.ok) {
        throw new Error(`Indiana 2012 fetch failed for ${county} page ${pageNumber}: ${response.status}`);
      }
      const rows = await response.json();
      out.push(...rows);
      pagesCount = Number(rows[0]?.pagesCount ?? pagesCount);
    }
  }
  await writeFile(years[0].localFile, JSON.stringify({ sourceUrl: historicalPage, endpoint: historicalEndpoint, rows: out }, null, 2) + "\n", "utf8");
  return { rows: out };
}

function parseHistoricalAjaxEntry(entry, payload) {
  const grouped = new Map();
  for (const row of asArray(payload.rows)) {
    if (row.Office !== "President" || !row.County) continue;
    const county = countyName(row.County);
    const current = grouped.get(county) ?? { dem: 0, other: 0, rep: 0, total: 0 };
    const votes = intValue(row.Votes);
    if (row.Party === "Democratic") current.dem += votes;
    else if (row.Party === "Republican") current.rep += votes;
    else current.other += votes;
    current.total += votes;
    grouped.set(county, current);
  }

  return [...grouped.entries()].map(([county, values]) => ({
    state,
    election_year: entry.year,
    jurisdiction_name: county,
    county,
    local_unit: county,
    source_id: sourceId,
    source_level: "county",
    row_method: entry.rowMethod,
    source_url: entry.sourceUrl,
    dem_votes: values.dem,
    rep_votes: values.rep,
    other_votes: values.other,
    total_votes: values.total,
  })).sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));
}

function parseEntry(entry, payload) {
  if (entry.rowMethod === "indianaEnrHistoricalAjaxCountyRows") {
    const rows = parseHistoricalAjaxEntry(entry, payload);
    validateTotals(entry, rows);
    return rows;
  }

  const regions = asArray(payload?.Root?.OfficeCategory?.Regions?.Region);
  const rows = [];
  for (const region of regions) {
    const county = countyName(region.MAP_JURISDICTION_NAME);
    const race = asArray(region?.Races?.Race)[0];
    const candidates = asArray(race?.Candidates?.Candidate);
    if (!county || candidates.length === 0) continue;

    const values = { dem: 0, other: 0, rep: 0, total: 0 };
    for (const candidate of candidates) {
      const votes = intValue(candidate.TOTAL_VOTES);
      const party = String(candidate.PARTY_ABBREV ?? candidate.PARTY ?? "").trim().toUpperCase();
      if (party === "D") values.dem += votes;
      else if (party === "R") values.rep += votes;
      else values.other += votes;
      values.total += votes;
    }

    if (!values.total) continue;
    rows.push({
      state,
      election_year: entry.year,
      jurisdiction_name: county,
      county,
      local_unit: county,
      source_id: sourceId,
      source_level: "county",
      row_method: entry.rowMethod,
      source_url: entry.sourceUrl,
      dem_votes: values.dem,
      rep_votes: values.rep,
      other_votes: values.other,
      total_votes: values.total,
    });
  }

  validateTotals(entry, rows);

  return rows.sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));
}

function validateTotals(entry, rows) {
  const totals = rows.reduce(
    (sum, row) => ({
      rows: sum.rows + 1,
      demVotes: sum.demVotes + row.dem_votes,
      repVotes: sum.repVotes + row.rep_votes,
      otherVotes: sum.otherVotes + row.other_votes,
      totalVotes: sum.totalVotes + row.total_votes,
    }),
    { rows: 0, demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );

  for (const [key, expectedValue] of Object.entries(entry.expected)) {
    if (totals[key] !== expectedValue) {
      throw new Error(`${entry.year} expected ${key}=${expectedValue}, got ${totals[key]}`);
    }
  }
}

await mkdir("data", { recursive: true });
const rows = [];
for (const entry of years) {
  let payload;
  if (entry.year === 2012) {
    try {
      payload = JSON.parse(await readFile(entry.localFile, "utf8"));
    } catch {
      payload = await fetch2012CountyRows();
    }
  } else {
    payload = JSON.parse(await readFile(entry.localFile, "utf8"));
  }
  rows.push(...parseEntry(entry, payload));
}

const headers = [
  "state",
  "election_year",
  "jurisdiction_name",
  "county",
  "local_unit",
  "source_id",
  "source_level",
  "row_method",
  "source_url",
  "dem_votes",
  "rep_votes",
  "other_votes",
  "total_votes",
];

const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n") + "\n";
await writeFile(output, csv, "utf8");
console.log(JSON.stringify({ rows: rows.length, years: years.map((entry) => entry.year), output }, null, 2));
