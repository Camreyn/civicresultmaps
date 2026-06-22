import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const defaults = {
  cells: ".etl/ocr/ms-grid-cell-candidates.csv",
  recap: "data/ms-2024-election-recap-sheets.csv",
  out: ".etl/ocr/ms-grid-reconciliation.csv",
};

const candidateAliases = [
  { key: "harris", candidate: "Kamala Harris", office: "United States-President", patterns: [/kamala/i, /harris/i] },
  { key: "trump", candidate: "Donald Trump", office: "United States-President", patterns: [/donald/i, /trump/i] },
  { key: "pinkins", candidate: "Ty Pinkins", office: "United States-Senate", patterns: [/pinkins/i] },
  { key: "wicker", candidate: "Roger Wicker", office: "United States-Senate", patterns: [/wicker/i] },
];

function usage() {
  console.log([
    "Usage: node scripts/reconcile-ms-ocr-grid-cells.mjs [options]",
    "",
    "Summarize Mississippi OCR grid-cell candidate CSV quality before any database import.",
    "This is a review gate, not an importer.",
    "",
    "Options:",
    "  --cells <file>  Candidate cell CSV. Default: " + defaults.cells,
    "  --recap <file>  Official Mississippi statewide recap CSV. Default: " + defaults.recap,
    "  --out <file>    Reconciliation CSV output. Default: " + defaults.out,
    "  --help          Show this help.",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--cells") options.cells = argv[++index];
    else if (arg === "--recap") options.recap = argv[++index];
    else if (arg === "--out") options.out = argv[++index];
    else throw new Error("Unknown option: " + arg);
  }
  return options;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function csv(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = "";
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows.shift();
  return rows.filter((items) => items.some(Boolean)).map((items) => Object.fromEntries(header.map((key, index) => [key, items[index] ?? ""])));
}

function candidateKeyFromName(name) {
  for (const alias of candidateAliases) {
    if (alias.patterns.every((pattern) => pattern.test(name))) return alias.key;
  }
  return "other";
}

function loadOfficialTotals(recapPath) {
  const rows = parseCsv(fs.readFileSync(recapPath, "utf8"));
  const totals = new Map();
  for (const row of rows) {
    const key = candidateKeyFromName(row.Candidate ?? "");
    if (key === "other") continue;
    totals.set(row.County + "|" + key, Number(row["County Total"] || 0));
  }
  return totals;
}

function numericValue(value) {
  if (value == null || value === "") return null;
  if (!/^\d+$/.test(String(value))) return null;
  return Number(value);
}

function summarize(cells, officialTotals) {
  const byCountyCandidate = new Map();
  const byCountyPage = new Map();
  const precinctKeys = new Set();
  let blankCells = 0;
  let nonNumericCells = 0;

  for (const cell of cells) {
    const key = candidateKeyFromName(cell.candidate ?? "");
    if (key === "other") continue;
    const value = numericValue(cell.value);
    if (value == null) {
      if (!cell.value) blankCells += 1;
      else nonNumericCells += 1;
    }
    const countyKey = cell.county + "|" + key;
    if (!byCountyCandidate.has(countyKey)) {
      byCountyCandidate.set(countyKey, { county: cell.county, candidateKey: key, cells: 0, numericCells: 0, total: 0, pages: new Set() });
    }
    const summary = byCountyCandidate.get(countyKey);
    summary.cells += 1;
    summary.pages.add(cell.page);
    if (value != null) {
      summary.numericCells += 1;
      summary.total += value;
    }

    const pageKey = cell.county + "|" + cell.page;
    if (!byCountyPage.has(pageKey)) byCountyPage.set(pageKey, { county: cell.county, page: cell.page, cells: 0, candidates: new Set(), columns: new Set(), warnings: new Set() });
    const page = byCountyPage.get(pageKey);
    page.cells += 1;
    page.candidates.add(key);
    page.columns.add(cell.columnIndex);
    for (const warning of String(cell.warnings || "").split(";").filter(Boolean)) page.warnings.add(warning);

    precinctKeys.add(cell.county + "|" + cell.page + "|" + cell.columnIndex);
  }

  const candidateRows = [];
  for (const summary of byCountyCandidate.values()) {
    const official = officialTotals.get(summary.county + "|" + summary.candidateKey) ?? null;
    const delta = official == null ? "" : summary.total - official;
    candidateRows.push({
      kind: "candidate_total",
      county: summary.county,
      page: "",
      candidate: summary.candidateKey,
      cells: summary.cells,
      numericCells: summary.numericCells,
      columns: "",
      extractedTotal: summary.total,
      officialTotal: official ?? "",
      delta,
      status: official != null && delta === 0 ? "reconciled" : "review",
      warnings: summary.numericCells === summary.cells ? "" : "missing_or_non_numeric_cells",
    });
  }

  const pageRows = [];
  for (const page of byCountyPage.values()) {
    const missing = candidateAliases.map((alias) => alias.key).filter((key) => !page.candidates.has(key));
    pageRows.push({
      kind: "page_coverage",
      county: page.county,
      page: page.page,
      candidate: "",
      cells: page.cells,
      numericCells: "",
      columns: page.columns.size,
      extractedTotal: "",
      officialTotal: "",
      delta: "",
      status: missing.length || page.warnings.size ? "review" : "candidate",
      warnings: [...page.warnings, ...missing.map((key) => "missing_" + key)].join(";"),
    });
  }

  return {
    rows: [...candidateRows, ...pageRows].sort((a, b) => (a.county + a.kind + a.candidate + a.page).localeCompare(b.county + b.kind + b.candidate + b.page)),
    metrics: {
      cells: cells.length,
      precinctCandidates: precinctKeys.size,
      blankCells,
      nonNumericCells,
      countyCandidateSummaries: candidateRows.length,
      pageSummaries: pageRows.length,
      reconciledCandidateTotals: candidateRows.filter((row) => row.status === "reconciled").length,
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!fs.existsSync(options.cells)) throw new Error("Candidate cell CSV does not exist: " + options.cells);
  if (!fs.existsSync(options.recap)) throw new Error("Official recap CSV does not exist: " + options.recap);

  const cells = parseCsv(fs.readFileSync(options.cells, "utf8"));
  const officialTotals = loadOfficialTotals(options.recap);
  const report = summarize(cells, officialTotals);
  ensureDir(path.dirname(options.out));
  const header = ["kind", "county", "page", "candidate", "cells", "numericCells", "columns", "extractedTotal", "officialTotal", "delta", "status", "warnings"];
  fs.writeFileSync(options.out, [header.join(","), ...report.rows.map((row) => header.map((key) => csv(row[key])).join(","))].join("\n") + "\n");
  fs.writeFileSync(options.out.replace(/\.csv$/i, ".manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), options, metrics: report.metrics }, null, 2) + "\n");
  console.log(JSON.stringify(report.metrics, null, 2));
  console.log("Wrote reconciliation report to " + options.out);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
