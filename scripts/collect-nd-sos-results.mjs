import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "data";
const SERVICE_URL = "https://resultsws.sos.nd.gov/ResultsAjax.svc/GetMapData";
const DASHBOARD_URL = "https://results.sos.nd.gov/ResultsSW.aspx?text=Race&type=SW&map=CTY";
const TURNOUT_URL = "https://results.sos.nd.gov/VoterTurnoutDetails.aspx";
const PRESIDENT = {
  raceID: "19893",
  officeSeqNo: "100",
  label: "President & Vice-President of the United States",
};
const SENATE = {
  raceID: "19847",
  officeSeqNo: "110",
  label: "United States Senator",
};

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function csvLine(values) {
  return values.map(csvEscape).join(",");
}

function bucketFor(row) {
  if (row.PartyCode === "DEM") {
    return "dem";
  }
  if (row.PartyCode === "REP") {
    return "rep";
  }
  return "other";
}

function endpoint({ category, raceID, officeSeqNo, county = "0" }) {
  const params = new URLSearchParams({
    type: "SW",
    category,
    raceID,
    osn: officeSeqNo,
    county,
    party: "0",
  });
  return `${SERVICE_URL}?${params}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "CivicResultMaps source collector",
    },
  });
  if (!response.ok) {
    throw new Error(`North Dakota SOS endpoint returned ${response.status}: ${url}`);
  }
  return response.json();
}

function aggregateByCounty(rows) {
  const counties = new Map();
  for (const row of rows) {
    const key = `${row.CountyID}|${row.CountyName}`;
    const bucket = counties.get(key) ?? {
      countyID: row.CountyID,
      countyName: row.CountyName,
      dem: 0,
      rep: 0,
      other: 0,
    };
    bucket[bucketFor(row)] += Number(row.calcCandidateVotes ?? 0);
    counties.set(key, bucket);
  }
  return [...counties.values()].sort((a, b) => a.countyID.localeCompare(b.countyID));
}

function aggregateByPrecinct(rows) {
  const precincts = new Map();
  for (const row of rows) {
    const key = `${row.CountyID}|${row.CountyName}|${row.StatePrecinctID}|${row.PrecinctName}`;
    const bucket = precincts.get(key) ?? {
      countyID: row.CountyID,
      countyName: row.CountyName,
      precinctID: row.StatePrecinctID,
      precinctName: row.PrecinctName,
      dem: 0,
      rep: 0,
      other: 0,
    };
    bucket[bucketFor(row)] += Number(row.calcCandidateVotes ?? 0);
    precincts.set(key, bucket);
  }
  return precincts;
}

function totalOf(row) {
  return row.dem + row.rep + row.other;
}

async function collect() {
  const presidentCountyUrl = endpoint({ category: "CTY", ...PRESIDENT });
  const senateCountyUrl = endpoint({ category: "CTY", ...SENATE });
  const presidentCountyRows = await fetchJson(presidentCountyUrl);
  const senateCountyRows = await fetchJson(senateCountyUrl);
  const countyIDs = [...new Set(presidentCountyRows.map((row) => row.CountyID))].sort();

  const presidentPrecinctRows = [];
  const senatePrecinctRows = [];
  const precinctEndpoints = [];
  for (const countyID of countyIDs) {
    const presidentUrl = endpoint({ category: "PREC", county: countyID, ...PRESIDENT });
    const senateUrl = endpoint({ category: "PREC", county: countyID, ...SENATE });
    presidentPrecinctRows.push(...await fetchJson(presidentUrl));
    senatePrecinctRows.push(...await fetchJson(senateUrl));
    precinctEndpoints.push({ countyID, presidentUrl, senateUrl });
  }

  const counties = aggregateByCounty(presidentCountyRows);
  const senateCounties = aggregateByCounty(senateCountyRows);
  const presidentPrecincts = aggregateByPrecinct(presidentPrecinctRows);
  const senatePrecincts = aggregateByPrecinct(senatePrecinctRows);
  const reviewRows = [];
  const zeroVotePrecincts = [];

  for (const key of [...presidentPrecincts.keys()].sort()) {
    const president = presidentPrecincts.get(key);
    const senate = senatePrecincts.get(key);
    if (!senate) {
      throw new Error(`Missing same-grain U.S. Senate row for ${key}`);
    }
    if (totalOf(president) === 0) {
      zeroVotePrecincts.push(key);
      continue;
    }
    if (totalOf(senate) === 0) {
      throw new Error(`Zero U.S. Senate comparison total for nonzero President precinct ${key}`);
    }
    reviewRows.push({
      ...president,
      comparisonDem: senate.dem,
      comparisonRep: senate.rep,
      comparisonOther: senate.other,
    });
  }

  const presidentTotals = counties.reduce(
    (total, row) => ({
      harris: total.harris + row.dem,
      trump: total.trump + row.rep,
      other: total.other + row.other,
      total: total.total + totalOf(row),
    }),
    { harris: 0, trump: 0, other: 0, total: 0 },
  );
  const senateTotals = senateCounties.reduce(
    (total, row) => ({
      dem: total.dem + row.dem,
      rep: total.rep + row.rep,
      other: total.other + row.other,
      total: total.total + totalOf(row),
    }),
    { dem: 0, rep: 0, other: 0, total: 0 },
  );

  if (presidentTotals.total !== 368155 || presidentTotals.trump !== 246505 || presidentTotals.harris !== 112327) {
    throw new Error(`Unexpected North Dakota President totals: ${JSON.stringify(presidentTotals)}`);
  }
  if (senateTotals.total !== 364327 || senateTotals.rep !== 241569 || senateTotals.dem !== 121602) {
    throw new Error(`Unexpected North Dakota U.S. Senate totals: ${JSON.stringify(senateTotals)}`);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const countyCsv = [
    csvLine(["state", "election_year", "jurisdiction_name", "jurisdiction_code", "level", "harris", "trump", "other", "total_votes", "source_url"]),
    ...counties.map((row) => csvLine([
      "ND",
      "2024",
      row.countyName,
      row.countyID,
      "county",
      row.dem,
      row.rep,
      row.other,
      totalOf(row),
      DASHBOARD_URL,
    ])),
  ].join("\n") + "\n";

  const reviewCsv = [
    csvLine([
      "state",
      "election_year",
      "county",
      "local_unit",
      "precinct_code",
      "pres_harris",
      "pres_trump",
      "pres_other",
      "pres_total",
      "comparison_dem",
      "comparison_rep",
      "comparison_other",
      "comparison_total",
      "source_url",
    ]),
    ...reviewRows.map((row) => csvLine([
      "ND",
      "2024",
      row.countyName,
      row.precinctName,
      String(row.precinctID).padStart(6, "0"),
      row.dem,
      row.rep,
      row.other,
      totalOf(row),
      row.comparisonDem,
      row.comparisonRep,
      row.comparisonOther,
      row.comparisonDem + row.comparisonRep + row.comparisonOther,
      DASHBOARD_URL,
    ])),
  ].join("\n") + "\n";

  const manifest = {
    state: "ND",
    electionYear: 2024,
    sourceAuthority: "North Dakota Secretary of State",
    collectedAt: "2026-07-03",
    dashboardUrl: DASHBOARD_URL,
    turnoutUrl: TURNOUT_URL,
    serviceUrl: SERVICE_URL,
    contests: {
      president: {
        ...PRESIDENT,
        countyUrl: presidentCountyUrl,
        expectedTotals: presidentTotals,
      },
      usSenate: {
        ...SENATE,
        countyUrl: senateCountyUrl,
        expectedTotals: senateTotals,
      },
    },
    precinctEndpoints,
    rowCounts: {
      presidentCountyRawRows: presidentCountyRows.length,
      senateCountyRawRows: senateCountyRows.length,
      counties: counties.length,
      presidentPrecinctRawRows: presidentPrecinctRows.length,
      senatePrecinctRawRows: senatePrecinctRows.length,
      precinctKeys: presidentPrecincts.size,
      reviewRows: reviewRows.length,
      zeroVotePrecincts: zeroVotePrecincts.length,
    },
    zeroVotePrecincts,
    caveats: [
      "Rows are from the official North Dakota Secretary of State ResultsAjax GetMapData JSON endpoint behind the 2024 results dashboard.",
      "Review rows pair President and U.S. Senate at the same county-scoped precinct key and exclude two zero-vote precinct keys.",
      "Turnout remains EAC fallback until SOS eligible-voter denominator fields are normalized and the one-ballot dashboard/EAC difference is reviewed.",
    ],
  };

  await writeFile(path.join(OUT_DIR, "nd-2024-sos-president-county.csv"), countyCsv, "utf8");
  await writeFile(path.join(OUT_DIR, "nd-2024-sos-president-senate-precinct-review.csv"), reviewCsv, "utf8");
  await writeFile(path.join(OUT_DIR, "nd-2024-sos-results-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(manifest.rowCounts, null, 2));
}

collect().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
