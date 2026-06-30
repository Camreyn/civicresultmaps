import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const sourcePage = "https://vrems.scvotes.sc.gov/Statistics/VoterHistoryResults";
const participatingUrl =
  "https://vrems.scvotes.sc.gov/Statistics/GetVoterHistoryResultsByCounty?dataType=VOT&year=2024&electionType=GEN";
const registeredUrl =
  "https://vrems.scvotes.sc.gov/Statistics/GetVoterHistoryResultsByCounty?dataType=REG&year=2024&electionType=GEN";
const outputFile = path.join("data", "sc-2024-vrems-turnout.csv");

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": "CivicResultMaps source collector",
    },
  });
  if (!response.ok) {
    throw new Error(`SC VREMS request failed ${response.status}: ${url}`);
  }
  return response.json();
}

function resultRows(payload) {
  const rows = payload?.voterHistoryResults?.countyPrecinctResults;
  if (!Array.isArray(rows)) {
    throw new Error("SC VREMS response did not include countyPrecinctResults");
  }
  return rows;
}

function countyRows(payload) {
  return resultRows(payload).filter((row) => row.isSummary !== 1 && row.county);
}

function summaryRow(payload) {
  return resultRows(payload).find((row) => row.isSummary === 1 && row.county === "Totals");
}

function countyName(value) {
  return `${String(value)
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())} County`;
}

const [participatingPayload, registeredPayload] = await Promise.all([
  fetchJson(participatingUrl),
  fetchJson(registeredUrl),
]);

const participatingRows = countyRows(participatingPayload);
const registeredByCounty = new Map(countyRows(registeredPayload).map((row) => [row.county, row]));
if (participatingRows.length !== 46 || registeredByCounty.size !== 46) {
  throw new Error(
    `Expected 46 South Carolina county rows, got ${participatingRows.length} participating and ${registeredByCounty.size} registered`,
  );
}

const denominatorNote =
  "SC VREMS voter-history registered count for printed registration lists; source notes these include active voters plus some inactive voters printed for the selected election.";
const headers = [
  "state",
  "election_year",
  "jurisdiction_name",
  "level",
  "ballots_cast",
  "registered_voters",
  "denominator_note",
  "warning_required",
  "source_url",
  "county",
  "local_unit",
  "turnout_pct",
  "denominator_type",
  "denominator_timing",
  "source_title",
  "source_status",
  "notes",
];

const csvRows = [headers];
for (const row of participatingRows) {
  const registeredRow = registeredByCounty.get(row.county);
  if (!registeredRow) {
    throw new Error(`Missing registered row for ${row.county}`);
  }
  if (Number(row.totalRegistered) !== Number(registeredRow.totalRegistered)) {
    throw new Error(
      `Registered total mismatch for ${row.county}: ${row.totalRegistered} != ${registeredRow.totalRegistered}`,
    );
  }

  const name = countyName(row.county);
  csvRows.push([
    "SC",
    "2024",
    name,
    "county",
    row.totalVoting,
    row.totalRegistered,
    denominatorNote,
    "true",
    sourcePage,
    name,
    name,
    row.percentVoting,
    "printedRegistrationListVoters",
    "voterHistoryElectionList",
    "South Carolina VREMS 2024 General Election voter history county statistics",
    "loaded",
    "Generated from official SC VREMS 2024 General Election VOT endpoint and cross-checked against the REG endpoint.",
  ]);
}

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, "utf8");

const participatingSummary = summaryRow(participatingPayload);
const normalizedTotals = {
  rows: participatingRows.length,
  registeredVoters: participatingRows.reduce((sum, row) => sum + Number(row.totalRegistered ?? 0), 0),
  ballotsCast: participatingRows.reduce((sum, row) => sum + Number(row.totalVoting ?? 0), 0),
};
console.log(
  JSON.stringify(
    {
      outputFile,
      normalizedTotals,
      sourceSummary: participatingSummary
        ? {
            registeredVoters: participatingSummary.totalRegistered,
            ballotsCast: participatingSummary.totalVoting,
          }
        : null,
      sourceSummaryIncludesUnassignedRow:
        participatingSummary &&
        (Number(participatingSummary.totalRegistered) !== normalizedTotals.registeredVoters ||
          Number(participatingSummary.totalVoting) !== normalizedTotals.ballotsCast),
    },
    null,
    2,
  ),
);
