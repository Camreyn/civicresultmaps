import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sourceUrl = "https://elections.hawaii.gov/resources/registration-voter-turnout-statistics/";
const sourceHtmlPath = path.join(repoRoot, "data", "hi-2024-registration-turnout-statistics.html");
const eacPath = path.join(repoRoot, "data", "eac-2024-state-turnout", "hi-2024-eac-turnout.csv");
const outputCsvPath = process.argv[2] ?? path.join(repoRoot, "data", "hi-2024-general-turnout.csv");
const outputSummaryPath = process.argv[3] ?? path.join(repoRoot, "data", "hi-2024-turnout-reconciliation-summary.json");

const expectedStatewide = {
  registeredVoters: 860868,
  ballotsCast: 522236,
};

const sections = [
  ["statewide", "Statewide", "Statewide", null],
  ["hawaii", "County of Hawaii", "Hawaii County", "1500100000"],
  ["maui", "County of Maui", "Maui County", "1500900000"],
  ["kauai", "County of Kauai", "Kauai County", "1500700000"],
  ["honolulu", "City &amp; County of Honolulu", "Honolulu County", "1500300000"],
];


function parseIntCell(value) {
  return Number(String(value).replace(/,/g, "").trim());
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseSimpleCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function extract2024Row(sectionHtml) {
  const rowMatch = sectionHtml.match(/<tr[^>]*>\s*<td[^>]*>\s*2024\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<\/tr>/i);
  if (!rowMatch) {
    throw new Error("Could not locate 2024 turnout row in Hawaii Office HTML section.");
  }
  return {
    registeredVoters: parseIntCell(rowMatch[1]),
    ballotsCast: parseIntCell(rowMatch[2]),
    turnoutPct: rowMatch[3].replace("%", "").trim(),
  };
}

function readOfficialRows() {
  const html = readFileSync(sourceHtmlPath, "utf8");
  const generalStart = html.indexOf("General Elections (1959-2024)");
  if (generalStart === -1) {
    throw new Error("Could not locate General Elections section in Hawaii Office HTML.");
  }
  const generalHtml = html.slice(generalStart);
  const markers = sections.map(([key]) => {
    if (key === "statewide") {
      return { key, index: 0 };
    }
    const title = sections.find(([sectionKey]) => sectionKey === key)[1];
    const index = generalHtml.indexOf(title);
    if (index === -1) {
      throw new Error(`Could not locate ${title} in Hawaii Office General Elections section.`);
    }
    return { key, index };
  });

  return markers.map((marker, index) => {
    const nextIndex = markers[index + 1]?.index ?? generalHtml.length;
    const sectionHtml = generalHtml.slice(marker.index, nextIndex);
    const [key, , jurisdictionName, jurisdictionCode] = sections.find(([sectionKey]) => sectionKey === marker.key);
    return {
      key,
      jurisdictionName,
      jurisdictionCode,
      ...extract2024Row(sectionHtml),
    };
  });
}

function readEacRows() {
  return parseSimpleCsv(readFileSync(eacPath, "utf8")).filter((row) => String(row.jurisdiction_name || "").trim());
}

function main() {
  const officialRows = readOfficialRows();
  const statewide = officialRows.find((row) => row.key === "statewide");
  const countyRows = officialRows.filter((row) => row.key !== "statewide");
  const countyTotals = countyRows.reduce(
    (totals, row) => ({
      registeredVoters: totals.registeredVoters + row.registeredVoters,
      ballotsCast: totals.ballotsCast + row.ballotsCast,
    }),
    { registeredVoters: 0, ballotsCast: 0 },
  );

  if (statewide.registeredVoters !== expectedStatewide.registeredVoters || statewide.ballotsCast !== expectedStatewide.ballotsCast) {
    throw new Error(`Unexpected Hawaii statewide turnout totals: ${JSON.stringify(statewide)}`);
  }
  if (countyTotals.registeredVoters !== statewide.registeredVoters || countyTotals.ballotsCast !== statewide.ballotsCast) {
    throw new Error(`Hawaii county turnout rows do not reconcile to statewide: ${JSON.stringify({ statewide, countyTotals })}`);
  }

  const eacRows = readEacRows();
  const eacTotals = eacRows.reduce(
    (totals, row) => ({
      registeredVoters: totals.registeredVoters + Math.max(0, parseIntCell(row.registered_voters || "0")),
      ballotsCast: totals.ballotsCast + Math.max(0, parseIntCell(row.ballots_cast || "0")),
    }),
    { registeredVoters: 0, ballotsCast: 0 },
  );

  const headers = [
    "state",
    "election_year",
    "jurisdiction_code",
    "jurisdiction_name",
    "county",
    "local_unit",
    "level",
    "ballots_cast",
    "registered_voters",
    "turnout_pct",
    "denominator_type",
    "denominator_timing",
    "denominator_note",
    "warning_required",
    "source_url",
    "source_title",
    "source_status",
    "notes",
  ];
  const records = countyRows.map((row) => ({
    state: "HI",
    election_year: 2024,
    jurisdiction_code: row.jurisdictionCode,
    jurisdiction_name: row.jurisdictionName,
    county: row.jurisdictionName,
    local_unit: row.jurisdictionName,
    level: "county",
    ballots_cast: row.ballotsCast,
    registered_voters: row.registeredVoters,
    turnout_pct: row.turnoutPct,
    denominator_type: "registeredVoters",
    denominator_timing: "officialGeneralElectionStatistics",
    denominator_note: "Hawaii Office of Elections 2024 General Election registration and turnout statistics, page last updated December 10, 2024.",
    warning_required: "false",
    source_url: sourceUrl,
    source_title: "Hawaii Office of Elections Registration and Turnout Statistics",
    source_status: "loaded",
    notes: "State-native county turnout row. Kalawao is not a separate Office of Elections election-county row; the four county rows reconcile to the statewide table.",
  }));

  const csv = [headers.join(","), ...records.map((record) => headers.map((header) => csvEscape(record[header])).join(","))].join("\n");
  writeFileSync(outputCsvPath, `${csv}\n`);

  const summary = {
    state: "HI",
    electionYear: 2024,
    sourceUrl,
    localSourceArtifact: "data/hi-2024-registration-turnout-statistics.html",
    normalizedTurnoutArtifact: "data/hi-2024-general-turnout.csv",
    parser: "scripts/normalize-hi-turnout.mjs",
    sourcePageLastUpdated: "December 10, 2024",
    officialRows: {
      statewide: {
        registeredVoters: statewide.registeredVoters,
        ballotsCast: statewide.ballotsCast,
        turnoutPct: Number(statewide.turnoutPct),
      },
      counties: countyRows.length,
      countyRegisteredVoters: countyTotals.registeredVoters,
      countyBallotsCast: countyTotals.ballotsCast,
    },
    eacBenchmark: {
      localFile: "data/eac-2024-state-turnout/hi-2024-eac-turnout.csv",
      rows: eacRows.length,
      registeredVotersExcludingNegativePlaceholders: eacTotals.registeredVoters,
      ballotsCastExcludingNegativePlaceholders: eacTotals.ballotsCast,
      registeredVotersDeltaOfficialMinusEac: statewide.registeredVoters - eacTotals.registeredVoters,
      ballotsCastDeltaOfficialMinusEac: statewide.ballotsCast - eacTotals.ballotsCast,
      kalawaoRowStatus: "EAC fallback contains a warning-required Kalawao placeholder row with negative values; the Hawaii Office table has no separate Kalawao row.",
    },
    caveats: [
      "The Hawaii Office table reports four election-county rows: Hawaii, Maui, Kauai, and Honolulu.",
      "Kalawao remains present in county geometry but is not a separate Hawaii Office result or turnout county row.",
      "Turnout is election-level voter turnout, not presidential contest votes.",
    ],
  };
  writeFileSync(outputSummaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Wrote ${records.length} Hawaii turnout rows to ${path.relative(repoRoot, outputCsvPath)}`);
  console.log(`Wrote Hawaii turnout reconciliation summary to ${path.relative(repoRoot, outputSummaryPath)}`);
}

main();
