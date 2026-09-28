import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { PDFParse } from "pdf-parse";

const reportPageUrl = "https://elections.wi.gov/resources/reports/2024-post-election-voting-equipment-audit-report";
const reportPdfUrl =
  "https://elections.wi.gov/sites/default/files/documents/2024%20Post-Election%20Voting%20Equipment%20Audit%20Final%20Report.pdf";
const outDir = "data/wi-2024-audit";
const pdfPath = `${outDir}/2024-post-election-voting-equipment-audit-final-report.pdf`;
const textPath = `${outDir}/2024-post-election-voting-equipment-audit-final-report.txt`;
const selectionsPath = "data/wi-2024-audit-selections.csv";
const summaryPath = "data/wi-2024-audit-summary.json";

const expectedRows = 373;
const expectedCounties = 72;
const expectedZeroBallotRows = 12;
const expectedBallotsAudited = 327230;
const expectedBallotPositions = 5604670;
const expectedReportedPotentialIssueErrors = 5;
const expectedPotentialIssueMunicipalities = 3;
const expectedPdfSha256 = "b9df76b2e9779dcb4ec29fcd6fc637c9efc73bdd6cf4f424d52341e48fc232bf";
const checkOnly = process.argv.includes("--check");

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function csv(rows, columns) {
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n") + "\n";
}

function clean(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s+\/\s+/g, "/")
    .trim();
}

function skipAppendixLine(line) {
  return (
    line === "---PAGE---" ||
    line === "2024 Post-Election Voting Equipment Audit Final Report" ||
    line.startsWith("For the March") ||
    /^Page \d+$/.test(line) ||
    line === "Appendix B: Reporting Units Selected for Audit" ||
    line === "County  | Municipality  | Reporting Unit  | Auditable" ||
    line === "County | Municipality | Reporting Unit | Auditable" ||
    line === "Equipment" ||
    line === "Ballots Audited" ||
    /^_{5,}$/.test(line)
  );
}

function isNumberLine(line) {
  return /^[\d,]+$/.test(line);
}

function startsEquipmentText(line) {
  return /^(ES&S|Dominion Voting|Clear Ballot|DS\d|ImageCast|\(ICE\)|VVPAT|Voting -)/.test(line);
}

function parseAuditSelections(text) {
  const start = text.indexOf("Appendix B: Reporting Units Selected for Audit");
  if (start < 0) {
    throw new Error("Appendix B heading was not found in the WEC audit report text.");
  }

  const lines = text
    .slice(start)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = [];
  const errors = [];
  let current = null;

  function finish(ballots) {
    if (!current) {
      errors.push(`Ballot count without active row: ${ballots}`);
      return;
    }
    if (!current.equipmentParts.length) {
      errors.push(`Missing equipment before ballot count: ${JSON.stringify(current)}`);
    }
    rows.push({
      state: "WI",
      electionYear: 2024,
      auditName: "2024 Post-Election Voting Equipment Audit",
      county: clean(current.county),
      municipality: clean(current.municipality),
      reportingUnit: clean(current.reportingParts.join(" ")),
      auditableEquipment: clean(current.equipmentParts.join(" ")),
      ballotsAudited: Number(String(ballots).replace(/,/g, "")),
      sourceDocumentId: "wi-2024-post-election-voting-equipment-audit-final-report",
      sourceUrl: reportPdfUrl,
    });
    current = null;
  }

  for (const line of lines) {
    if (skipAppendixLine(line)) {
      continue;
    }

    const parts = line.split(/\s+\|\s+/);
    if (parts.length >= 3 && !current) {
      if (parts.length >= 5 && isNumberLine(parts.at(-1))) {
        rows.push({
          state: "WI",
          electionYear: 2024,
          auditName: "2024 Post-Election Voting Equipment Audit",
          county: clean(parts[0]),
          municipality: clean(parts[1]),
          reportingUnit: clean(parts[2]),
          auditableEquipment: clean(parts.slice(3, -1).join(" | ")),
          ballotsAudited: Number(parts.at(-1).replace(/,/g, "")),
          sourceDocumentId: "wi-2024-post-election-voting-equipment-audit-final-report",
          sourceUrl: reportPdfUrl,
        });
      } else if (parts.length === 4) {
        current = {
          county: parts[0],
          municipality: parts[1],
          reportingParts: [parts[2]],
          equipmentParts: [parts[3]],
        };
      } else if (parts.length === 3) {
        current = {
          county: parts[0],
          municipality: parts[1],
          reportingParts: [parts[2]],
          equipmentParts: [],
        };
      } else {
        errors.push(`Unhandled row start: ${line}`);
      }
      continue;
    }

    if (!current) {
      errors.push(`Orphan appendix line: ${line}`);
      continue;
    }

    if (isNumberLine(line)) {
      finish(line);
      continue;
    }

    const continuationParts = line.split(/\s+\|\s+/);
    if (continuationParts.length === 2 && isNumberLine(continuationParts[1])) {
      current.equipmentParts.push(continuationParts[0]);
      finish(continuationParts[1]);
      continue;
    }

    if (continuationParts.length > 1) {
      errors.push(`Unhandled pipe continuation: ${line}`);
      continue;
    }

    if (current.equipmentParts.length || startsEquipmentText(line)) {
      current.equipmentParts.push(line);
    } else {
      current.reportingParts.push(line);
    }
  }

  if (current) {
    errors.push(`Unfinished appendix row: ${JSON.stringify(current)}`);
  }
  if (errors.length) {
    throw new Error(`Unable to parse Appendix B:\n${errors.join("\n")}`);
  }

  return rows;
}

async function ensurePdf() {
  if (checkOnly) {
    if (!existsSync(pdfPath)) throw new Error("Retained WEC audit PDF is required for --check.");
    return;
  }
  await mkdir(outDir, { recursive: true });
  if (existsSync(pdfPath) && !process.argv.includes("--fetch")) {
    return;
  }
  const response = await fetch(reportPdfUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch WEC audit PDF: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(pdfPath, buffer);
}

async function extractText() {
  const data = await readFile(pdfPath);
  if (createHash("sha256").update(data).digest("hex") !== expectedPdfSha256) {
    throw new Error("WEC audit PDF differs from the reviewed source. Review its arithmetic before regenerating the summary.");
  }
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText({
      lineThreshold: 2,
      cellSeparator: " | ",
      pageJoiner: "\n\n---PAGE---\n\n",
    });
    return result.text;
  } finally {
    await parser.destroy?.();
  }
}

function validate(rows) {
  const countyCount = new Set(rows.map((row) => row.county)).size;
  const zeroBallotRows = rows.filter((row) => row.ballotsAudited === 0).length;
  const ballotsAudited = rows.reduce((total, row) => total + row.ballotsAudited, 0);
  const errors = [];

  if (rows.length !== expectedRows) {
    errors.push(`Expected ${expectedRows} audit rows; parsed ${rows.length}.`);
  }
  if (countyCount !== expectedCounties) {
    errors.push(`Expected ${expectedCounties} counties; parsed ${countyCount}.`);
  }
  if (zeroBallotRows !== expectedZeroBallotRows) {
    errors.push(`Expected ${expectedZeroBallotRows} zero-ballot selected rows; parsed ${zeroBallotRows}.`);
  }
  if (ballotsAudited !== expectedBallotsAudited) {
    errors.push(`Expected ${expectedBallotsAudited} audited ballots; parsed ${ballotsAudited}.`);
  }

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }

  return { countyCount, zeroBallotRows, ballotsAudited };
}

function parseAggregateAuditResults(text) {
  const normalizedText = text.replace(/\s+/g, " ");
  const requiredSnippets = [
    "staff found no reported errors that would be solely attributable to the electronic voting system",
    "A total of 327,230 ballots were counted by hand",
    "staff identified five errors in three municipalities",
    "The total number of ballot positions on all audited ballots was 5,604,670",
    "Error rate with five reported errors: 0.0000009%",
    "Error rate without five reported errors: 0%",
    "1 in 500,000 ballot positions or 0.00002%",
    "ballot positions (0.000002%)",
    "In total, 593 human errors were recorded",
    "Human Error Rate: 0.011%",
    "errors in the audit process, and errors in election administration on Election Day",
    "President and Vice President (top-of-ballot contest included by default)",
    "Representative in Congress",
    "Representative to the Assembly",
    "District Attorney",
  ];
  const missing = requiredSnippets.filter((snippet) => !normalizedText.includes(snippet));
  if (missing.length) {
    throw new Error(`Unable to verify aggregate Wisconsin audit result text:\n${missing.join("\n")}`);
  }

  return {
    auditedBallots: expectedBallotsAudited,
    auditedBallotShareOfAllBallots: "approximately 9.6%",
    ballotPositions: expectedBallotPositions,
    locallyReportedPotentialEquipmentIssueErrors: expectedReportedPotentialIssueErrors,
    municipalitiesWithReportedPotentialIssues: expectedPotentialIssueMunicipalities,
    finalEquipmentErrorRate: "0%",
    // Retained verbatim for provenance/backward compatibility, not a validated percentage.
    errorRateWithFiveReportedErrors: "0.0000009%",
    percentageCorrection: {
      status: "source_report_percentage_errors",
      authority: "Civic Result Maps independent arithmetic check; not a WEC-issued correction",
      fiveErrors: {
        sourcePage: 10,
        reportedPercent: "0.0000009%",
        formula: "(5 / 5,604,670) × 100",
        recalculatedPercent: (expectedReportedPotentialIssueErrors / expectedBallotPositions) * 100,
        recalculatedDisplay: `${((expectedReportedPotentialIssueErrors / expectedBallotPositions) * 100).toFixed(7)}%`,
      },
      benchmark: {
        description: "The report's stated one error in 500,000 ballot positions benchmark",
        reportedPercentByPage: [
          { page: 9, percent: "0.00002%" },
          { page: 10, percent: "0.000002%" },
        ],
        formula: "(1 / 500,000) × 100",
        recalculatedPercent: (1 / 500000) * 100,
        recalculatedDisplay: `${((1 / 500000) * 100).toFixed(4)}%`,
      },
      note: "The WEC report's printed percentages are incorrect conversions of its stated ratios. The corrected five-case percentage is about 100 times the printed value and remains below the report's stated one-in-500,000 benchmark. This is a reporting/math-label error, not a newly discovered candidate-vote error; it does not change WEC's separately defined equipment-only rate of 0%.",
    },
    humanErrorCount: 593,
    humanErrorRateAsPrinted: "0.011%",
    humanErrorSourcePages: [11, 12],
    humanErrorCaveat: "WEC's human-error category includes audit-process mistakes and election-administration issues. The 593 count is not a count of incorrectly tabulated presidential votes.",
    auditedContests: ["President and Vice President", "U.S. House", "Wisconsin Assembly", "District Attorney"],
    auditedContestsSourcePage: 5,
    comparisonContestCaveat: "U.S. Senate was not one of the four selected audit contests. This audit does not directly validate Civic Result Maps' President-versus-Senate advisory comparisons.",
    perUnitOutcomeStatus: "not_published_in_final_report",
    summary:
      "WEC staff identified five locally reported errors in three municipalities that could potentially be attributed to tabulation equipment, but determined the errors were partially or completely attributable to human factors and did not recommend including them in the final equipment error rate.",
  };
}

await ensurePdf();
const text = await extractText();
const selections = parseAuditSelections(text);
const summaryCounts = validate(selections);
const aggregateAuditResults = parseAggregateAuditResults(text);
const equipmentSummary = Object.entries(
  selections.reduce((groups, row) => {
    groups[row.auditableEquipment] ??= { rows: 0, ballotsAudited: 0 };
    groups[row.auditableEquipment].rows += 1;
    groups[row.auditableEquipment].ballotsAudited += row.ballotsAudited;
    return groups;
  }, {}),
)
  .map(([equipment, values]) => ({ equipment, ...values }))
  .sort((a, b) => b.rows - a.rows || a.equipment.localeCompare(b.equipment));

async function writeOrCheck(file, contents) {
  if (checkOnly) {
    const existing = await readFile(file, "utf8");
    if (existing.replace(/\r\n/g, "\n") !== contents.replace(/\r\n/g, "\n")) {
      throw new Error(`Generated Wisconsin audit artifact is stale: ${file}`);
    }
  } else {
    await writeFile(file, contents, "utf8");
  }
}

await writeOrCheck(textPath, text);
await writeOrCheck(
  selectionsPath,
  csv(selections, [
    "state",
    "electionYear",
    "auditName",
    "county",
    "municipality",
    "reportingUnit",
    "auditableEquipment",
    "ballotsAudited",
    "sourceDocumentId",
    "sourceUrl",
  ]),
);

const summary = {
  state: "WI",
  electionYear: 2024,
  sourceDocumentId: "wi-2024-post-election-voting-equipment-audit-final-report",
  sourcePageUrl: reportPageUrl,
  sourcePdfUrl: reportPdfUrl,
  sourcePdfSha256: expectedPdfSha256,
  localPdf: pdfPath,
  extractedText: textPath,
  normalizedSelections: selectionsPath,
  reportDate: "2025-03-13",
  commissionMeetingDate: "2025-03-07",
  selectedReportingUnits: selections.length,
  selectedMunicipalities: 336,
  countiesCovered: summaryCounts.countyCount,
  zeroBallotSelectedRows: summaryCounts.zeroBallotRows,
  ballotsAudited: summaryCounts.ballotsAudited,
  aggregateAuditResults,
  statewideFinding:
    "WEC staff reported no evidence that audited voting systems changed votes, incorrectly tabulated votes, altered outcomes, had programming errors, unauthorized software/hardware alterations, hacking, or equipment malfunctions that changed contest outcomes.",
  caveat:
    "Appendix B provides selected reporting units, auditable equipment, and ballots audited. The source report gives statewide findings and aggregate/error discussion, not a per-reporting-unit discrepancy outcome table.",
  equipmentSummary,
};
await writeOrCheck(summaryPath, JSON.stringify(summary, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      selections: selections.length,
      counties: summaryCounts.countyCount,
      zeroBallotSelectedRows: summaryCounts.zeroBallotRows,
      ballotsAudited: summaryCounts.ballotsAudited,
      output: selectionsPath,
      summary: summaryPath,
    },
    null,
    2,
  ),
);
