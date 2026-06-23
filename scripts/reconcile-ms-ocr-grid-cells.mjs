import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const defaults = {
  cells: ".etl/ocr/ms-grid-cell-candidates.csv",
  recap: "data/ms-2024-election-recap-sheets.csv",
  out: ".etl/ocr/ms-grid-reconciliation.csv",
  corrections: "",
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
    "  --corrections <file>  Optional human-reviewed correction CSV.",
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
    else if (arg === "--corrections") options.corrections = argv[++index];
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

function correctionCandidateKey(name) {
  const text = String(name ?? "").toLowerCase();
  if (text.includes("harris") || text.includes("kamala")) return "harris";
  if (text.includes("trump") || text.includes("donald")) return "trump";
  if (text.includes("pinkins")) return "pinkins";
  if (text.includes("wicker")) return "wicker";
  return candidateKeyFromName(name);
}

function correctionKey(row) {
  return [
    row.county,
    row.page,
    correctionCandidateKey(row.candidate),
    row.columnIndex,
  ].join("|");
}

function trueLike(value) {
  return /^(1|true|yes|y)$/i.test(String(value ?? "").trim());
}

function loadCorrections(correctionsPath) {
  if (!correctionsPath) {
    return { additions: [], updates: new Map() };
  }
  if (!fs.existsSync(correctionsPath)) {
    throw new Error("Correction CSV does not exist: " + correctionsPath);
  }

  const rows = parseCsv(fs.readFileSync(correctionsPath, "utf8"));
  const updates = new Map();
  const additions = [];
  for (const row of rows) {
    const action = String(row.action || "update").trim().toLowerCase();
    const correctedValue = String(row.correctedValue ?? "").trim();
    const exclude = trueLike(row.exclude);
    if (!correctedValue && !exclude) continue;
    if (correctedValue && numericValue(correctedValue) == null) {
      throw new Error("Correction correctedValue must be numeric for " + JSON.stringify(row));
    }
    if (action !== "update" && action !== "add") {
      throw new Error("Correction action must be update or add: " + JSON.stringify(row));
    }

    const normalized = {
      action,
      county: row.county,
      page: row.page,
      candidate: correctionCandidateKey(row.candidate),
      columnIndex: row.columnIndex,
      correctedValue,
      exclude,
      reason: row.reason ?? "",
      reviewer: row.reviewer ?? "",
    };

    if (action === "add") {
      if (!correctedValue) throw new Error("Add corrections require correctedValue: " + JSON.stringify(row));
      additions.push(normalized);
      continue;
    }

    const key = correctionKey(normalized);
    if (updates.has(key)) throw new Error("Duplicate correction key: " + key);
    updates.set(key, normalized);
  }
  return { additions, updates };
}

function applyCorrections(cells, corrections) {
  const unusedUpdates = new Set(corrections.updates.keys());
  const correctedCells = [];
  const metrics = { correctionAdditions: 0, correctionExclusions: 0, correctionUpdates: 0 };

  for (const cell of cells) {
    const key = correctionKey(cell);
    const correction = corrections.updates.get(key);
    if (!correction) {
      correctedCells.push(cell);
      continue;
    }
    unusedUpdates.delete(key);
    if (correction.exclude) {
      metrics.correctionExclusions += 1;
      continue;
    }
    correctedCells.push({
      ...cell,
      value: correction.correctedValue,
      rawValue: correction.correctedValue,
      warnings: [cell.warnings, "manual_correction"].filter(Boolean).join(";"),
    });
    metrics.correctionUpdates += 1;
  }

  if (unusedUpdates.size) {
    throw new Error("Correction rows did not match candidate cells: " + [...unusedUpdates].join(", "));
  }

  for (const correction of corrections.additions) {
    correctedCells.push({
      county: correction.county,
      page: correction.page,
      image: "manual-correction",
      columnIndex: correction.columnIndex,
      precinctLabel: "manual correction page " + correction.page + " column " + correction.columnIndex,
      contest: correction.candidate === "harris" || correction.candidate === "trump" ? "President" : "U.S. Senate",
      candidate: correction.candidate,
      party: correction.candidate === "harris" || correction.candidate === "pinkins" ? "Democrat" : "Republican",
      value: correction.correctedValue,
      rawValue: correction.correctedValue,
      rowText: correction.reason,
      x1: "",
      x2: "",
      y1: "",
      y2: "",
      warnings: "manual_addition",
    });
    metrics.correctionAdditions += 1;
  }

  return { cells: correctedCells, metrics };
}

function summarize(cells, officialTotals) {
  const byCountyCandidate = new Map();
  const byCountyPage = new Map();
  const precinctKeys = new Set();
  let blankCells = 0;
  let nonNumericCells = 0;

  for (const cell of cells) {
    const key = correctionCandidateKey(cell.candidate ?? "");
    if (key === "other") continue;
    const value = numericValue(cell.value);
    if (value == null) {
      if (!cell.value) blankCells += 1;
      else nonNumericCells += 1;
    }
    const countyKey = cell.county + "|" + key;
    if (!byCountyCandidate.has(countyKey)) {
      byCountyCandidate.set(countyKey, {
        county: cell.county,
        candidateKey: key,
        cells: 0,
        numericCells: 0,
        rawTotal: 0,
        totalColumnCells: 0,
        precinctTotal: 0,
        pages: new Set(),
        warnings: new Set(),
      });
    }
    const summary = byCountyCandidate.get(countyKey);
    summary.cells += 1;
    summary.pages.add(cell.page);
    if (value != null) {
      summary.numericCells += 1;
      summary.rawTotal += value;
      const official = officialTotals.get(countyKey);
      if (official != null && value === official) {
        summary.totalColumnCells += 1;
      } else {
        summary.precinctTotal += value;
      }
    }

    for (const warning of String(cell.warnings || "").split(";").filter(Boolean)) summary.warnings.add(warning);

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
    const rawDelta = official == null ? "" : summary.rawTotal - official;
    const precinctDelta = official == null ? "" : summary.precinctTotal - official;
    const warnings = [...summary.warnings];
    if (summary.numericCells !== summary.cells) warnings.push("missing_or_non_numeric_cells");
    if (summary.totalColumnCells > 0) warnings.push("detected_total_column_cells");
    candidateRows.push({
      kind: "candidate_total",
      county: summary.county,
      page: "",
      candidate: summary.candidateKey,
      cells: summary.cells,
      numericCells: summary.numericCells,
      columns: "",
      extractedTotal: summary.rawTotal,
      precinctExtractedTotal: summary.precinctTotal,
      totalColumnCells: summary.totalColumnCells,
      officialTotal: official ?? "",
      delta: rawDelta,
      precinctDelta,
      status: official != null && precinctDelta === 0 ? "reconciled" : "review",
      warnings: warnings.join(";"),
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
      precinctExtractedTotal: "",
      totalColumnCells: "",
      officialTotal: "",
      delta: "",
      precinctDelta: "",
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
      candidateTotalsWithDetectedTotalColumns: candidateRows.filter((row) => Number(row.totalColumnCells) > 0).length,
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

  const inputCells = parseCsv(fs.readFileSync(options.cells, "utf8"));
  const corrections = loadCorrections(options.corrections);
  const corrected = applyCorrections(inputCells, corrections);
  const officialTotals = loadOfficialTotals(options.recap);
  const report = summarize(corrected.cells, officialTotals);
  report.metrics = { ...report.metrics, ...corrected.metrics };
  ensureDir(path.dirname(options.out));
  const header = [
    "kind",
    "county",
    "page",
    "candidate",
    "cells",
    "numericCells",
    "columns",
    "extractedTotal",
    "precinctExtractedTotal",
    "totalColumnCells",
    "officialTotal",
    "delta",
    "precinctDelta",
    "status",
    "warnings",
  ];
  fs.writeFileSync(options.out, [header.join(","), ...report.rows.map((row) => header.map((key) => csv(row[key])).join(","))].join("\n") + "\n");
  fs.writeFileSync(options.out.replace(/\.csv$/i, ".manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), options, metrics: report.metrics }, null, 2) + "\n");
  console.log(JSON.stringify(report.metrics, null, 2));
  console.log("Wrote reconciliation report to " + options.out);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
