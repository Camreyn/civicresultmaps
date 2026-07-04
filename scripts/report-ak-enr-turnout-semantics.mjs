import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseCsv } from "./normalize-eac-turnout.mjs";

const repoRoot = process.cwd();
const sourceUrl = "https://www.elections.alaska.gov/results/24GENR/ENRbyPrecinct.csv";
const inputPath = path.join(repoRoot, "data", "ak-2024-general-enr-by-precinct.csv");
const outputPath = path.join(repoRoot, "data", "ak-2024-enr-turnout-semantics.json");

const EXPECTED = {
  reportingUnits: 523,
  registeredVoters: 611078,
  totalBallots: 340981,
};

function intValue(value) {
  const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
  return cleaned ? Number.parseInt(cleaned, 10) : 0;
}

function rowObjects(csvText) {
  const [header, ...records] = parseCsv(csvText);
  return records.map((record) => Object.fromEntries(header.map((column, index) => [column, record[index] ?? ""])));
}

function reportingUnitKey(row) {
  const precinctId = String(row.Pct_Id ?? "").trim();
  const precinctName = String(row.Precinct_name ?? "").trim();
  return `${precinctId}::${precinctName}`;
}

function reportingUnitCategory(row) {
  const name = String(row.Precinct_name ?? "").trim();
  if (/HD99|Fed Overseas/i.test(name)) {
    return "federal_overseas_absentee";
  }
  if (/ - Absentee$/i.test(name)) {
    return "district_absentee";
  }
  if (/ - Early Voting$/i.test(name)) {
    return "district_early_voting";
  }
  if (/ - Question$/i.test(name)) {
    return "district_question";
  }
  if (/ - Remote$/i.test(name)) {
    return "district_remote";
  }
  return "election_day_precinct";
}

function summarize() {
  const sourceRows = rowObjects(readFileSync(inputPath, "utf8"));
  const reportingUnits = new Map();

  for (const row of sourceRows) {
    const key = reportingUnitKey(row);
    if (!reportingUnits.has(key)) {
      reportingUnits.set(key, {
        precinctId: String(row.Pct_Id ?? "").trim(),
        precinctName: String(row.Precinct_name ?? "").trim(),
        category: reportingUnitCategory(row),
        registeredVoters: intValue(row.Reg_voters),
        totalBallots: intValue(row.total_ballots),
      });
    }
  }

  const categories = {};
  for (const unit of reportingUnits.values()) {
    categories[unit.category] ??= {
      reportingUnits: 0,
      registeredVoters: 0,
      totalBallots: 0,
    };
    categories[unit.category].reportingUnits += 1;
    categories[unit.category].registeredVoters += unit.registeredVoters;
    categories[unit.category].totalBallots += unit.totalBallots;
  }

  const totals = [...reportingUnits.values()].reduce(
    (summary, unit) => {
      summary.reportingUnits += 1;
      summary.registeredVoters += unit.registeredVoters;
      summary.totalBallots += unit.totalBallots;
      return summary;
    },
    { reportingUnits: 0, registeredVoters: 0, totalBallots: 0 },
  );

  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (totals[key] !== expected) {
      throw new Error(`AK ENR turnout ${key} mismatch: ${totals[key]} != ${expected}`);
    }
  }

  return {
    state: "AK",
    stateName: "Alaska",
    electionYear: 2024,
    checkedAt: "2026-07-04",
    sourceAuthority: "Alaska Division of Elections",
    sourceUrl,
    localArtifact: "data/ak-2024-enr-turnout-semantics.json",
    sourceArtifact: "data/ak-2024-general-enr-by-precinct.csv",
    parserOrNormalizationPath: "scripts/report-ak-enr-turnout-semantics.mjs",
    reportingGrain: "precinct_or_reporting_unit",
    fieldSemanticsObserved: {
      registeredVotersField: "Reg_voters",
      totalBallotsField: "total_ballots",
      observation:
        "The fields repeat on candidate/contest rows and reconcile after de-duplicating to one record per precinct/reporting unit.",
    },
    totals,
    categories,
    reconciliation: {
      matchesActiveEacFallbackRegisteredVoters: totals.registeredVoters === 611078,
      matchesActiveEacFallbackBallotsCast: totals.totalBallots === 340981,
      matchesOfficialSummaryTimesCast: true,
    },
    caveats: [
      "This artifact documents ENR field behavior only; it does not activate ENR turnout rows in ETL.",
      "District absentee, early-voting, and question reporting units carry ballots with zero registered voters, while election-day precinct rows carry nearly all registered voters.",
      "Use a Division of Elections interpretation or records response before replacing the active EAC fallback turnout package or using these rows for same-grain turnout screening.",
      "Rows are mixed reporting units and should not be joined directly to precinct polygons without a reviewed crosswalk.",
    ],
    confidence: "official_enr_fields_reconcile_statewide_replacement_semantics_pending",
  };
}

const summary = summarize();
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary.totals, null, 2));
