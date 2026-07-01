import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PDFParse } from "pdf-parse";

const defaults = {
  sourceUrl: "https://www.sos.ms.gov/sites/default/files/active-voter-count-reports/2024November%20Voter%20Count%20Red.pdf",
  sourcePage: "https://www.sos.ms.gov/elections-voting/active-voter-count-reports",
  pdfOut: "data/ms-2024-november-active-voter-count.pdf",
  csvOut: "data/ms-2024-november-active-voter-count.csv",
  month: "2024-11",
  expectedRows: 82,
  force: false,
};

function usage() {
  console.log([
    "Usage: node scripts/collect-ms-active-voter-count.mjs [options]",
    "",
    "Download and normalize the official Mississippi SOS November 2024 Active Voter Count PDF.",
    "The output is a denominator lead only; it does not replace turnout rows because the source has no ballots-cast field.",
    "",
    "Options:",
    "  --source-url <url>     Source PDF URL. Default: " + defaults.sourceUrl,
    "  --source-page <url>    Source index page used as referer. Default: " + defaults.sourcePage,
    "  --pdf-out <file>      Downloaded PDF path. Default: " + defaults.pdfOut,
    "  --csv-out <file>      Normalized CSV path. Default: " + defaults.csvOut,
    "  --month <YYYY-MM>     Source month label. Default: " + defaults.month,
    "  --expected-rows <n>   Expected county rows. Default: " + defaults.expectedRows,
    "  --force              Re-download the PDF even when it exists.",
    "  --help               Show this help.",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--source-url") options.sourceUrl = argv[++index];
    else if (arg === "--source-page") options.sourcePage = argv[++index];
    else if (arg === "--pdf-out") options.pdfOut = argv[++index];
    else if (arg === "--csv-out") options.csvOut = argv[++index];
    else if (arg === "--month") options.month = argv[++index];
    else if (arg === "--expected-rows") options.expectedRows = Number(argv[++index]);
    else if (arg === "--force") options.force = true;
    else throw new Error("Unknown option: " + arg);
  }
  return options;
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function csv(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

async function fetchPdf(options) {
  const response = await fetch(options.sourceUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      accept: "application/pdf,text/html,*/*;q=0.8",
      referer: options.sourcePage,
    },
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(options.sourceUrl + " returned " + response.status + "\n" + buffer.toString("utf8", 0, 500));
  }
  if (!String(response.headers.get("content-type") ?? "").toLowerCase().includes("pdf")) {
    throw new Error(options.sourceUrl + " did not return a PDF");
  }
  return buffer;
}

async function ensurePdf(options) {
  if (!options.force && fs.existsSync(options.pdfOut)) {
    return fs.readFileSync(options.pdfOut);
  }
  const buffer = await fetchPdf(options);
  ensureDir(options.pdfOut);
  fs.writeFileSync(options.pdfOut, buffer);
  return buffer;
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.replace(/\r\n/g, "\n");
  } finally {
    await parser.destroy();
  }
}

function numberValue(value) {
  return Number(String(value).replace(/[,\s]/g, ""));
}

function parseRows(text, options) {
  const prepared = text
    .replace(/(\d+\.\d+%)\s*(\d{1,2}\s+-\s+)/g, "$1\n$2")
    .replace(/ATTENTION:[^\n]+?(?=\d{1,2}\s+-\s+)/g, "");
  const rows = [];
  const pattern = /\b(\d{1,2})\s+-\s+([A-Za-z .]+?)\s+([\d,]+)\s+([\d,]+)\s+(\d+(?:\.\d+)?)%/g;
  for (const match of prepared.matchAll(pattern)) {
    const countyCode = match[1].padStart(2, "0");
    const county = match[2].replace(/\s+/g, " ").trim();
    const cvapEstimate = numberValue(match[3]);
    const activeVoters = numberValue(match[4]);
    const percentage = Number(match[5]);
    rows.push({
      state: "MS",
      election_year: 2024,
      source_month: options.month,
      county_code: countyCode,
      county,
      cvap_estimate: cvapEstimate,
      active_voters: activeVoters,
      active_voter_pct: percentage.toFixed(3),
      source_url: options.sourceUrl,
      source_pdf: options.pdfOut,
      denominator_note: "Monthly active voter count from Mississippi SEMS; denominator lead only, not ballots cast or turnout.",
      warning_required: "true",
    });
  }
  return rows.sort((a, b) => Number(a.county_code) - Number(b.county_code));
}

function validateRows(rows, options) {
  if (!Number.isFinite(options.expectedRows) || options.expectedRows <= 0) {
    throw new Error("--expected-rows must be a positive number");
  }
  if (rows.length !== options.expectedRows) {
    throw new Error("Expected " + options.expectedRows + " county rows but parsed " + rows.length);
  }
  const codes = new Set(rows.map((row) => row.county_code));
  if (codes.size !== rows.length) {
    throw new Error("Parsed duplicate county codes");
  }
  for (let code = 1; code <= options.expectedRows; code += 1) {
    if (!codes.has(String(code).padStart(2, "0"))) {
      throw new Error("Missing county code " + String(code).padStart(2, "0"));
    }
  }
}

function writeCsv(rows, options) {
  const header = [
    "state",
    "election_year",
    "source_month",
    "county_code",
    "county",
    "cvap_estimate",
    "active_voters",
    "active_voter_pct",
    "source_url",
    "source_pdf",
    "denominator_note",
    "warning_required",
  ];
  ensureDir(options.csvOut);
  fs.writeFileSync(options.csvOut, [header.join(","), ...rows.map((row) => header.map((key) => csv(row[key])).join(","))].join("\n") + "\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  const buffer = await ensurePdf(options);
  const text = await extractPdfText(buffer);
  const rows = parseRows(text, options);
  validateRows(rows, options);
  writeCsv(rows, options);
  const summary = {
    rows: rows.length,
    cvapEstimate: rows.reduce((sum, row) => sum + row.cvap_estimate, 0),
    activeVoters: rows.reduce((sum, row) => sum + row.active_voters, 0),
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log("Wrote Mississippi active-voter denominator lead to " + options.csvOut);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
