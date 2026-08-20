import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import XLSX from "xlsx";

const repoRoot = process.cwd();

const sources = {
  currentZip: "data/al-2024-general-precinct-level-results.zip",
  historical2020Zip: "data/al-2020-general-precinct-results.zip",
  historical2016Zip: "data/al-2016-general-precinct-level.zip",
  historical2012Workbook: "data/al-president-general-1976-2012.xls",
  activeVotersWorkbook: "data/al-2024-registered-voters.xlsx",
};

const outputs = {
  president: "data/al-2024-general-president.csv",
  review: "data/al-2024-local-review.csv",
  historical: "data/al-historical-presidential-baseline.csv",
  turnoutLead: "data/al-2024-turnout-denominator-lead.csv",
};

const urls = {
  currentZip:
    "https://www.sos.alabama.gov/sites/default/files/election-data/2024-12/2024-General%20Precinct%20Level%20Results.zip",
  historical2020Zip:
    "https://www.sos.alabama.gov/sites/default/files/election-data/2020-12/2020%20General%20Precinct%20Results.zip",
  historical2016Zip:
    "https://www.sos.alabama.gov/sites/default/files/election-data/2017-06/2016-General-PrecinctLevel.zip",
  historical2012Workbook:
    "https://www.sos.alabama.gov/sites/default/files/election-data/2017-06/eapresidentgeneral1976-2012_0.xls",
  activeVotersWorkbook: "https://www.sos.alabama.gov/sites/default/files/election-data/2025-01/ALVR-2024.xlsx",
};

function resolveRepo(file) {
  return path.resolve(repoRoot, file);
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function number(value) {
  if (typeof value === "number") return Math.trunc(value);
  const cleaned = String(value ?? "").replace(/[^0-9-]/g, "");
  return cleaned ? Number.parseInt(cleaned, 10) : 0;
}

function countyFromArchiveName(name) {
  return normalizeCountyName(
    path
      .basename(name)
      .replace(/^\d{4}-General-/i, "")
      .replace(/\.(xls|xlsx)$/i, "")
      .trim(),
  );
}

function normalizeCountyName(name) {
  const county = text(name);
  return ["ST CLAIR", "STCLAIR", "ST. CLAIR"].includes(county.toUpperCase()) ? "St. Clair" : county;
}

export function countyLookupKey(name) {
  return text(name).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function positiveInteger(value, label) {
  const normalized = typeof value === "number" ? value : text(value).replace(/,/g, "");
  const parsed = typeof normalized === "number" ? normalized : /^\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer; received ${JSON.stringify(value)}`);
  }
  return parsed;
}

function csvCell(value) {
  const stringValue = String(value ?? "");
  return /[",\n\r]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

function writeCsv(file, headers, rows) {
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
  fs.writeFileSync(resolveRepo(file), `${csv}\n`, "utf8");
}

function classifyParty(party, candidate) {
  const partyText = text(party).toUpperCase();
  const candidateText = text(candidate).toUpperCase();
  if (!candidateText || candidateText === "OVER VOTES" || candidateText === "UNDER VOTES") return null;
  if (partyText === "DEM") return "dem";
  if (partyText === "REP") return "rep";
  return "other";
}

function addVote(target, partyKey, votes) {
  if (!partyKey) return;
  target[partyKey] += votes;
}

async function workbookRowsFromZip(zip, name) {
  const buffer = await zip.files[name].async("nodebuffer");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames.includes("Precinct Results") ? "Precinct Results" : workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
}

async function parseMatrixZip(zipFile, year) {
  const zip = await JSZip.loadAsync(fs.readFileSync(resolveRepo(zipFile)));
  const names = Object.keys(zip.files)
    .filter((name) => /\.(xls|xlsx)$/i.test(name))
    .sort((a, b) => countyFromArchiveName(a).localeCompare(countyFromArchiveName(b)));
  const counties = [];

  for (const name of names) {
    const rows = await workbookRowsFromZip(zip, name);
    const header = rows[0] ?? [];
    const columns = header.slice(3).map((value, index) => ({ index: index + 3, name: text(value) }));
    const county = countyFromArchiveName(name);
    const president = { dem: 0, rep: 0, other: 0 };
    const ballotsCastByColumn = new Map(columns.map((column) => [column.index, 0]));
    const reviewByColumn = new Map(
      columns.map((column) => [
        column.index,
        {
          county,
          local_unit: column.name,
          pres_harris: 0,
          pres_trump: 0,
          pres_other: 0,
          comparison_dem: 0,
          comparison_rep: 0,
          comparison_other: 0,
        },
      ]),
    );

    for (const row of rows.slice(1)) {
      const contest = text(row[0]).toUpperCase();
      const partyKey = classifyParty(row[1], row[2]);
      const isPresident = contest === "PRESIDENT AND VICE PRESIDENT OF THE UNITED STATES";
      const isHouse = contest.startsWith("UNITED STATES REPRESENTATIVE");
      const isBallotsCast = contest === "BALLOTS CAST - TOTAL";

      for (const column of columns) {
        const votes = number(row[column.index]);
        if (isBallotsCast) {
          ballotsCastByColumn.set(column.index, votes);
        }
        if (!partyKey || !votes) continue;
        const review = reviewByColumn.get(column.index);
        if (isPresident) {
          addVote(president, partyKey, votes);
          if (partyKey === "dem") review.pres_harris += votes;
          else if (partyKey === "rep") review.pres_trump += votes;
          else review.pres_other += votes;
        } else if (isHouse) {
          if (partyKey === "dem") review.comparison_dem += votes;
          else if (partyKey === "rep") review.comparison_rep += votes;
          else review.comparison_other += votes;
        }
      }
    }

    const reviewRows = [...reviewByColumn.values()]
      .map((row) => ({
        ...row,
        pres_total: row.pres_harris + row.pres_trump + row.pres_other,
        comparison_total: row.comparison_dem + row.comparison_rep + row.comparison_other,
      }))
      .filter((row) => row.local_unit && row.pres_total > 0 && row.comparison_total > 0);

    counties.push({
      county,
      president,
      reviewRows,
      ballotsCast: [...ballotsCastByColumn.values()].reduce((sum, votes) => sum + votes, 0),
    });
  }

  return {
    year,
    counties,
    metrics: {
      counties: counties.length,
      trump: counties.reduce((sum, row) => sum + row.president.rep, 0),
      harris: counties.reduce((sum, row) => sum + row.president.dem, 0),
      other: counties.reduce((sum, row) => sum + row.president.other, 0),
      reviewRows: counties.reduce((sum, row) => sum + row.reviewRows.length, 0),
      ballotsCast: counties.reduce((sum, row) => sum + row.ballotsCast, 0),
    },
  };
}

function parse2012HistoricalRows(allowedCounties) {
  const workbook = XLSX.readFile(resolveRepo(sources.historical2012Workbook));
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets["2012"], { header: 1, defval: "" });
  return rows
    .slice(5)
    .map((row) => ({ row, county: normalizeCountyName(row[0]) }))
    .filter(({ county }) => allowedCounties.has(county))
    .map(({ row, county }) => {
      const dem = number(row[1]);
      const rep = number(row[2]);
      const other = number(row[3]) + number(row[4]) + number(row[5]) + number(row[6]);
      return {
        state: "AL",
        election_year: 2012,
        jurisdiction_name: county,
        source_id: "al-2012-president-general-county-workbook",
        source_level: "county",
        row_method: "official_county_workbook",
        dem_votes: dem,
        rep_votes: rep,
        other_votes: other,
        total_votes: dem + rep + other,
        source_url: urls.historical2012Workbook,
      };
    });
}

function historicalRowsFromMatrix(parsed, sourceId, sourceUrl) {
  return parsed.counties.map((row) => ({
    state: "AL",
    election_year: parsed.year,
    jurisdiction_name: row.county,
    source_id: sourceId,
    source_level: "county",
    row_method: "official_precinct_matrix_zip_county_aggregate",
    dem_votes: row.president.dem,
    rep_votes: row.president.rep,
    other_votes: row.president.other,
    total_votes: row.president.dem + row.president.rep + row.president.other,
    source_url: sourceUrl,
  }));
}

export function activeVotersByCountyFromRows(rows) {
  const output = new Map();
  for (const row of rows.slice(3)) {
    const county = text(row[0]);
    if (!county || county.toUpperCase() === "TOTAL") continue;
    const key = countyLookupKey(county);
    if (output.has(key)) throw new Error(`Duplicate ALVR county key after normalization: ${county}`);
    output.set(key, positiveInteger(row[1], `November ALVR active-voter value for ${county}`));
  }
  return output;
}

function parseActiveVotersByCounty(sheetName = "November") {
  const workbook = XLSX.readFile(resolveRepo(sources.activeVotersWorkbook));
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
  return activeVotersByCountyFromRows(rows);
}

export function buildTurnoutLeadRows(counties, activeVoters) {
  const rows = counties.map((row) => ({
    state: "AL",
    election_year: 2024,
    jurisdiction_name: row.county,
    ballots_cast_from_precinct_zip: row.ballotsCast,
    november_active_registered_voters: activeVoters.get(countyLookupKey(row.county)) ?? "",
    source_month: "November 2024",
    ballots_source_url: urls.currentZip,
    denominator_source_url: urls.activeVotersWorkbook,
    notes:
      "State-native turnout lead only; active ETL keeps EAC fallback until SOS Total Ballots Cast PDF and ALVR denominator timing are reconciled.",
  }));
  const missingActiveVoterCounties = rows
    .filter((row) => row.november_active_registered_voters === "")
    .map((row) => row.jurisdiction_name);
  if (missingActiveVoterCounties.length) {
    throw new Error(`Missing November ALVR active-voter values for: ${missingActiveVoterCounties.join(", ")}`);
  }
  return rows;
}

async function main() {
  const current = await parseMatrixZip(sources.currentZip, 2024);
  const historical2020 = await parseMatrixZip(sources.historical2020Zip, 2020);
  const historical2016 = await parseMatrixZip(sources.historical2016Zip, 2016);
  const allowedCounties = new Set(current.counties.map((row) => row.county));
  const historical2012 = parse2012HistoricalRows(allowedCounties);
  const activeVoters = parseActiveVotersByCounty("November");

  writeCsv(
    outputs.president,
    ["state", "election_year", "jurisdiction_name", "trump", "harris", "other"],
    current.counties.map((row) => ({
      state: "AL",
      election_year: 2024,
      jurisdiction_name: row.county,
      trump: row.president.rep,
      harris: row.president.dem,
      other: row.president.other,
    })),
  );

  writeCsv(
    outputs.review,
    [
      "state",
      "election_year",
      "county",
      "local_unit",
      "pres_harris",
      "pres_trump",
      "pres_other",
      "pres_total",
      "comparison_dem",
      "comparison_rep",
      "comparison_other",
      "comparison_total",
    ],
    current.counties.flatMap((row) =>
      row.reviewRows.map((review) => ({
        state: "AL",
        election_year: 2024,
        ...review,
      })),
    ),
  );

  const historical = [
    ...historical2012,
    ...historicalRowsFromMatrix(historical2016, "al-2016-general-precinct-level", urls.historical2016Zip),
    ...historicalRowsFromMatrix(historical2020, "al-2020-general-precinct-results", urls.historical2020Zip),
  ];
  writeCsv(
    outputs.historical,
    [
      "state",
      "election_year",
      "jurisdiction_name",
      "source_id",
      "source_level",
      "row_method",
      "dem_votes",
      "rep_votes",
      "other_votes",
      "total_votes",
      "source_url",
    ],
    historical.sort((a, b) => a.election_year - b.election_year || a.jurisdiction_name.localeCompare(b.jurisdiction_name)),
  );

  const turnoutLeadRows = buildTurnoutLeadRows(current.counties, activeVoters);

  writeCsv(
    outputs.turnoutLead,
    [
      "state",
      "election_year",
      "jurisdiction_name",
      "ballots_cast_from_precinct_zip",
      "november_active_registered_voters",
      "source_month",
      "ballots_source_url",
      "denominator_source_url",
      "notes",
    ],
    turnoutLeadRows,
  );

  const summary = {
    presidentRows: current.counties.length,
    reviewRows: current.metrics.reviewRows,
    turnoutLeadRows: current.counties.length,
    turnoutLeadMetrics: {
      ballotsCast: turnoutLeadRows.reduce((sum, row) => sum + row.ballots_cast_from_precinct_zip, 0),
      novemberActiveRegisteredVoters: turnoutLeadRows.reduce(
        (sum, row) => sum + row.november_active_registered_voters,
        0,
      ),
    },
    historicalRows: historical.length,
    currentMetrics: current.metrics,
    historicalMetrics: {
      2012: {
        rows: historical2012.length,
        total: historical2012.reduce((sum, row) => sum + row.total_votes, 0),
      },
      2016: historical2016.metrics,
      2020: historical2020.metrics,
    },
  };
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
