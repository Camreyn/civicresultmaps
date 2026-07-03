import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const sourceId = "in-2024-vstop-general-audit-summary";
const sourceUrl = "https://www.in.gov/sos/elections/files/2024-General-Post-Election-Audit-Summary-Report-Final.pdf";
const sourceFile = "data/in-2024-general-post-election-audit-summary-report.pdf";
const csvOutput = "data/in-2024-general-post-election-audit-summary.csv";
const summaryOutput = "data/in-2024-general-post-election-audit-summary.json";

const expectedRows = [
  {
    county: "Switzerland County",
    auditDate: "2024-11-22",
    vendor: "Hart InterCivic",
    auditType: "Ballot Polling",
    ballotsEligible: 4315,
    seed: "77142702147140041362",
    contests: ["President of the United States", "Governor of Indiana", "Switzerland County Commissioner - District 2"],
  },
  {
    county: "Dearborn County",
    auditDate: "2024-11-26",
    vendor: "ES&S",
    auditType: "Ballot Polling",
    ballotsEligible: 26845,
    seed: "85677177223620503925",
    contests: ["United States Senator from Indiana", "Attorney General of Indiana", "Indiana State Representative - District 68"],
  },
  {
    county: "Delaware County",
    auditDate: "2024-12-03",
    vendor: "MicroVote",
    auditType: "Ballot Comparison",
    ballotsEligible: 43192,
    seed: "19892209403440753064",
    contests: ["President of the United States", "Governor of Indiana", "Judge of the 46th Circuit Court No. 2"],
  },
  {
    county: "St. Joseph County",
    auditDate: "2024-12-05",
    vendor: "Unisyn",
    auditType: "Ballot Polling",
    ballotsEligible: 112242,
    seed: "98987571586013188055",
    contests: [
      "Indiana Supreme Court Retention Question - Lorretta H. Rush",
      "Judge of the St. Joseph County Probate Court",
      "St. Joseph County Coroner",
    ],
  },
  {
    county: "Hendricks County",
    auditDate: "2024-12-10",
    vendor: "MicroVote",
    auditType: "Ballot Comparison",
    ballotsEligible: 77740,
    seed: "78901285231020516930",
    contests: ["Governor of Indiana", "Hendricks County Commissioner District 3", "Hendricks County Council"],
  },
  {
    county: "Fountain County",
    auditDate: "2024-12-12",
    vendor: "Hart InterCivic",
    auditType: "Ballot Polling",
    ballotsEligible: 8053,
    seed: "34025523664565879780",
    contests: ["President of the United States", "Governor of Indiana", "Fountain County Commissioner - District 2"],
  },
  {
    county: "DeKalb County",
    auditDate: "2024-12-18",
    vendor: "MicroVote",
    auditType: "Ballot Comparison",
    ballotsEligible: 19060,
    seed: "91587860374018221501",
    contests: [
      "United States Representative from Indiana - District 3",
      "Governor of Indiana",
      "DeKalb County Commissioner - Central District",
    ],
  },
];

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseDate(value) {
  const date = new Date(`${value} UTC`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Could not parse audit date: ${value}`);
  }
  return date.toISOString().slice(0, 10);
}

function parseSection(text, row, nextCounty) {
  const start = text.indexOf(`${row.county} Post-Election Audit`);
  if (start < 0) {
    throw new Error(`Missing section for ${row.county}`);
  }
  const next = nextCounty ? text.indexOf(`${nextCounty} Post-Election Audit`, start + 1) : text.indexOf("In Closing", start + 1);
  if (next < 0) {
    throw new Error(`Missing section end after ${row.county}`);
  }
  const section = text.slice(start, next);
  const compact = normalizeText(section);

  const date = compact.match(/Audit Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/)?.[1];
  const vendorType = compact.match(/Voting System Vendor\s*\/\s*Audit Type:\s*([^/]+?)\s*\/\s*([^•]+)/);
  const ballots = compact.match(/Total Ballots Eligible for Audit:\s*(?:Ballots on VVPAT\s*-\s*)?([\d,]+)/)?.[1];
  const seed = compact.match(/Audit Seed Number:\s*(\d+)/)?.[1];
  const contestBlock = compact.match(/Contests Selected for Audit:\s*(.*?)\s*Results:/)?.[1] ?? "";
  const contests = [...contestBlock.matchAll(/\bo\s+([^•]+?)(?=\s+o\s+|\s+•|$)/g)].map((match) => normalizeText(match[1]));

  return {
    county: row.county,
    auditDate: parseDate(date),
    vendor: normalizeText(vendorType?.[1]),
    auditType: normalizeText(vendorType?.[2]),
    ballotsEligible: Number(String(ballots ?? "").replaceAll(",", "")),
    ballotsEligibleBasis: compact.includes("Ballots on VVPAT") ? "ballots_on_vvpat" : "ballots_eligible_for_audit",
    seed,
    contests,
    federalContests: contests.filter((contest) => /President|United States Senator|United States Representative/.test(contest)),
    outcomeSummary: compact.includes("100 percent match rate")
      ? "Ballot comparison summary reports a 100 percent CVR/VVPAT match rate for inspected ballots and successful completion for selected contests."
      : "Ballot polling summary reports successful completion for selected contests at the stated confidence/risk-limit threshold.",
  };
}

function assertRow(actual, expected) {
  const checks = {
    auditDate: expected.auditDate,
    vendor: expected.vendor,
    auditType: expected.auditType,
    ballotsEligible: expected.ballotsEligible,
    seed: expected.seed,
    contests: expected.contests,
  };
  for (const [field, expectedValue] of Object.entries(checks)) {
    const actualValue = actual[field];
    if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
      throw new Error(`${actual.county} ${field} mismatch: ${JSON.stringify(actualValue)} != ${JSON.stringify(expectedValue)}`);
    }
  }
}

const parser = new PDFParse({ data: await readFile(sourceFile) });
const result = await parser.getText();
await parser.destroy();

const rows = expectedRows.map((row, index) => {
  const actual = parseSection(result.text, row, expectedRows[index + 1]?.county);
  assertRow(actual, row);
  return actual;
});

const headers = [
  "state",
  "election_year",
  "county",
  "audit_date",
  "vendor",
  "audit_type",
  "ballots_eligible",
  "ballots_eligible_basis",
  "audit_seed_number",
  "contests_selected",
  "federal_contests_selected",
  "outcome_summary",
  "source_id",
  "source_url",
  "source_file",
  "caveat",
];

const caveat =
  "Official VSTOP audit summary context only; these rows do not replace certified ENR totals and are not proof of fraud or misconduct.";
const csv = [
  headers.join(","),
  ...rows.map((row) =>
    [
      "IN",
      2024,
      row.county,
      row.auditDate,
      row.vendor,
      row.auditType,
      row.ballotsEligible,
      row.ballotsEligibleBasis,
      row.seed,
      row.contests.join("; "),
      row.federalContests.join("; "),
      row.outcomeSummary,
      sourceId,
      sourceUrl,
      sourceFile,
      caveat,
    ].map(csvCell).join(","),
  ),
].join("\n") + "\n";

const summary = {
  sourceId,
  sourceUrl,
  sourceFile,
  normalizedCsv: csvOutput,
  rowCount: rows.length,
  counties: rows.map((row) => row.county),
  auditTypeCounts: rows.reduce((counts, row) => {
    counts[row.auditType] = (counts[row.auditType] ?? 0) + 1;
    return counts;
  }, {}),
  federalContestCoverage: {
    presidentCountyCount: rows.filter((row) => row.federalContests.some((contest) => /President/.test(contest))).length,
    senateCountyCount: rows.filter((row) => row.federalContests.some((contest) => /United States Senator/.test(contest))).length,
    houseCountyCount: rows.filter((row) => row.federalContests.some((contest) => /United States Representative/.test(contest))).length,
  },
  caveat,
};

await writeFile(csvOutput, csv, "utf8");
await writeFile(summaryOutput, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ rows: rows.length, csvOutput, summaryOutput }, null, 2));
