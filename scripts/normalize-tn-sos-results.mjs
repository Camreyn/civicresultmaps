import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const repoRoot = process.cwd();

const precinctPdfPath = path.join(repoRoot, "data", "tn-2024-general-by-precinct.pdf");
const presidentCountyCsvPath = path.join(repoRoot, "data", "tn-2024-general-president-county.csv");
const reviewCsvPath = path.join(repoRoot, "data", "tn-2024-general-president-senate-precinct-review.csv");
const reconciliationPath = path.join(repoRoot, "data", "tn-2024-result-review-reconciliation-summary.json");

const PRECINCT_SOURCE_URL =
  "https://sos-prod.tnsosgovfiles.com/s3fs-public/document/20241105GeneralbyPrecinct.pdf";

const PRESIDENT_TOTALS = {
  trump: 1966865,
  harris: 1056265,
  bowman: 5865,
  deLaCruz: 3457,
  fruit: 988,
  kennedy: 21535,
  stein: 8967,
};

const SENATE_TOTALS = {
  blackburn: 1918743,
  johnson: 1027461,
  chandler: 28444,
  moses: 24682,
  robinson: 8278,
};

function intText(value) {
  return Number(String(value ?? "").replace(/,/g, ""));
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, headers, rows) {
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function extractPdfText(filePath) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function numericTokens(text) {
  return (text.match(/[0-9][0-9,]*/g) ?? []).map(intText);
}

function parseContestRow(line, contest) {
  const parts = line.split(/\t+/);
  const left = parts[0].trim();
  const right = parts.slice(1).join(" ").trim();
  const leftValues = numericTokens(left);

  if (contest === "president") {
    if (leftValues.length === 7 && right) {
      return { values: leftValues, name: right };
    }
    if (leftValues.length === 6 && right) {
      const match = right.match(/^(.*)\s+([0-9,]+)$/);
      if (match) {
        return {
          values: [...leftValues, intText(match[2])],
          name: match[1].trim(),
        };
      }
    }
  }

  if (contest === "senate") {
    if (leftValues.length === 5 && right) {
      return { values: leftValues, name: right };
    }
    if (leftValues.length === 4 && right) {
      const match = right.match(/^(.*)\s+([0-9,]+)$/);
      if (match) {
        return {
          values: [...leftValues, intText(match[2])],
          name: match[1].trim(),
        };
      }
    }
  }

  return null;
}

function emptyTotals(length) {
  return Array.from({ length }, () => 0);
}

function addTotals(target, values) {
  values.forEach((value, index) => {
    target[index] += value;
  });
}

function assertTotals(label, actual, expected) {
  const mismatches = Object.entries(expected)
    .map(([key, expectedValue], index) => ({ key, expectedValue, actualValue: actual[index] }))
    .filter((entry) => entry.expectedValue !== entry.actualValue);
  if (mismatches.length) {
    throw new Error(`${label} totals did not reconcile: ${JSON.stringify(mismatches)}`);
  }
}

function parsePrecinctPdf(text) {
  let contest = null;
  let county = null;
  let inPrecinctBlock = false;

  const presidentRows = new Map();
  const senateRows = new Map();
  const presidentCountyTotals = new Map();
  const senateCountyTotals = new Map();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line === "President and Vice President of the United States") {
      contest = "president";
      county = null;
      inPrecinctBlock = false;
      continue;
    }
    if (line === "United States Senate") {
      contest = "senate";
      county = null;
      inPrecinctBlock = false;
      continue;
    }
    if (line.includes("STATEWIDE TOTALS")) {
      contest = null;
      county = null;
      inPrecinctBlock = false;
      continue;
    }

    const countyMatch = line.match(/^(.+ County)$/);
    if (countyMatch && contest && !/^\d/.test(line) && !rawLine.includes("\t")) {
      county = countyMatch[1].trim();
      inPrecinctBlock = false;
      continue;
    }

    if (line === "Precincts:") {
      inPrecinctBlock = true;
      continue;
    }

    if (!contest || !county || !inPrecinctBlock || !/^\d/.test(line)) {
      continue;
    }

    const parsed = parseContestRow(rawLine, contest);
    if (!parsed) {
      continue;
    }

    if (parsed.name === "County Totals:") {
      if (contest === "president") {
        presidentCountyTotals.set(county, parsed.values);
      } else {
        senateCountyTotals.set(county, parsed.values);
      }
      continue;
    }

    const key = `${county}||${parsed.name}`;
    const target = contest === "president" ? presidentRows : senateRows;
    target.set(key, {
      county,
      localUnit: parsed.name,
      values: parsed.values,
    });
  }

  const missingSenate = [...presidentRows.keys()].filter((key) => !senateRows.has(key));
  const missingPresident = [...senateRows.keys()].filter((key) => !presidentRows.has(key));
  if (missingSenate.length || missingPresident.length) {
    throw new Error(
      `TN precinct President/Senate key mismatch: ${missingSenate.length} missing Senate rows, ` +
        `${missingPresident.length} missing President rows`,
    );
  }

  const presidentTotals = emptyTotals(7);
  for (const row of presidentRows.values()) {
    addTotals(presidentTotals, row.values);
  }
  assertTotals("TN President precinct", presidentTotals, PRESIDENT_TOTALS);

  const senateTotals = emptyTotals(5);
  for (const row of senateRows.values()) {
    addTotals(senateTotals, row.values);
  }
  assertTotals("TN U.S. Senate precinct", senateTotals, SENATE_TOTALS);

  if (presidentCountyTotals.size !== 95 || senateCountyTotals.size !== 95) {
    throw new Error(
      `Expected 95 TN county totals for both contests; got President ${presidentCountyTotals.size}, ` +
        `Senate ${senateCountyTotals.size}`,
    );
  }

  return { presidentRows, senateRows, presidentCountyTotals, senateCountyTotals };
}

function buildPresidentCountyRows(presidentCountyTotals) {
  return [...presidentCountyTotals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([county, values]) => ({
      state: "TN",
      election_year: 2024,
      jurisdiction_name: county,
      jurisdiction_code: county,
      level: "county",
      trump: values[0],
      harris: values[1],
      bowman: values[2],
      de_la_cruz: values[3],
      fruit: values[4],
      kennedy: values[5],
      stein: values[6],
      other: values.slice(2).reduce((sum, value) => sum + value, 0),
      total: values.reduce((sum, value) => sum + value, 0),
      source_url: PRECINCT_SOURCE_URL,
    }));
}

function buildReviewRows(presidentRows, senateRows) {
  return [...presidentRows.entries()]
    .map(([key, president]) => {
      const senate = senateRows.get(key);
      const presOther = president.values.slice(2).reduce((sum, value) => sum + value, 0);
      const senateOther = senate.values.slice(2).reduce((sum, value) => sum + value, 0);
      return {
        state: "TN",
        election_year: 2024,
        county: president.county,
        local_unit: president.localUnit,
        pres_harris: president.values[1],
        pres_trump: president.values[0],
        pres_other: presOther,
        pres_total: president.values.reduce((sum, value) => sum + value, 0),
        comparison_dem: senate.values[1],
        comparison_rep: senate.values[0],
        comparison_other: senateOther,
        comparison_total: senate.values.reduce((sum, value) => sum + value, 0),
        source_url: PRECINCT_SOURCE_URL,
      };
    })
    .filter((row) => row.pres_total > 0)
    .sort((a, b) => a.county.localeCompare(b.county) || a.local_unit.localeCompare(b.local_unit));
}

async function main() {
  if (!fs.existsSync(precinctPdfPath)) {
    throw new Error(`Missing official TN precinct PDF: ${path.relative(repoRoot, precinctPdfPath)}`);
  }

  const text = await extractPdfText(precinctPdfPath);
  const parsed = parsePrecinctPdf(text);
  const countyRows = buildPresidentCountyRows(parsed.presidentCountyTotals);
  const reviewRows = buildReviewRows(parsed.presidentRows, parsed.senateRows);

  writeCsv(
    presidentCountyCsvPath,
    [
      "state",
      "election_year",
      "jurisdiction_name",
      "jurisdiction_code",
      "level",
      "trump",
      "harris",
      "bowman",
      "de_la_cruz",
      "fruit",
      "kennedy",
      "stein",
      "other",
      "total",
      "source_url",
    ],
    countyRows,
  );

  writeCsv(
    reviewCsvPath,
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
      "source_url",
    ],
    reviewRows,
  );

  const reconciliation = {
    state: "TN",
    electionYear: 2024,
    sourceUrl: PRECINCT_SOURCE_URL,
    checkedAt: "2026-07-03",
    countyRows: countyRows.length,
    precinctReviewRows: reviewRows.length,
    presidentTotals: {
      trump: countyRows.reduce((sum, row) => sum + row.trump, 0),
      harris: countyRows.reduce((sum, row) => sum + row.harris, 0),
      other: countyRows.reduce((sum, row) => sum + row.other, 0),
      total: countyRows.reduce((sum, row) => sum + row.total, 0),
    },
    senateTotals: {
      blackburn: reviewRows.reduce((sum, row) => sum + row.comparison_rep, 0),
      johnson: reviewRows.reduce((sum, row) => sum + row.comparison_dem, 0),
      other: reviewRows.reduce((sum, row) => sum + row.comparison_other, 0),
      total: reviewRows.reduce((sum, row) => sum + row.comparison_total, 0),
    },
    precinctKeyReconciliation: {
      presidentRows: parsed.presidentRows.size,
      senateRows: parsed.senateRows.size,
      missingPresidentRows: 0,
      missingSenateRows: 0,
    },
    caveats: [
      "Rows are extracted from the official Tennessee Secretary of State text-layer precinct PDF.",
      "The presidential PDF layout places the seventh candidate column after the precinct name in many text-extracted rows; the normalizer reconciles parsed precinct totals to the official statewide totals before writing CSV artifacts.",
      "Review rows are precinct-level President-versus-U.S.-Senate comparisons for public-interest screening only, not findings of fraud or misconduct.",
    ],
  };

  fs.writeFileSync(reconciliationPath, `${JSON.stringify(reconciliation, null, 2)}\n`, "utf8");

  console.log(
    `Wrote ${path.relative(repoRoot, presidentCountyCsvPath)} (${countyRows.length} county rows) and ` +
      `${path.relative(repoRoot, reviewCsvPath)} (${reviewRows.length} review rows).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

