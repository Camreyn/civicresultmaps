import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const defaults = {
  textCells: ".etl/ocr/ms-full-text-row-candidates.csv",
  textReconciliation: ".etl/ocr/ms-full-text-row-reconciliation.csv",
  gridCells: ".etl/ocr/ms-full-grid-cell-candidates.csv",
  gridReconciliation: ".etl/ocr/ms-full-grid-reconciliation.csv",
  recap: "data/ms-2024-election-recap-sheets.csv",
  sourceOverrides: "data/ms-2024-ocr-source-overrides.json",
  outCells: ".etl/ocr/ms-combined-review-candidates.csv",
  outReconciliation: ".etl/ocr/ms-combined-review-reconciliation.csv",
  outCorrectionTemplate: ".etl/ocr/ms-combined-review-correction-template.csv",
  outAudit: ".etl/ocr/ms-combined-review-audit.csv",
  corrections: "",
};

const expectedCandidateKeys = ["harris", "trump", "pinkins", "wicker"];

function usage() {
  console.log([
    "Usage: node scripts/combine-ms-ocr-review-artifacts.mjs [options]",
    "",
    "Combine Mississippi text-row OCR and grid-cell OCR review artifacts.",
    "Grid rows are used only where grid reconciliation resolves a candidate that text OCR did not.",
    "This writes review artifacts only; it does not import rows into the database.",
    "",
    "Options:",
    "  --text-cells <file>              Text OCR candidate CSV. Default: " + defaults.textCells,
    "  --text-reconciliation <file>     Text OCR reconciliation CSV. Default: " + defaults.textReconciliation,
    "  --grid-cells <file>              Grid OCR candidate CSV. Default: " + defaults.gridCells,
    "  --grid-reconciliation <file>     Grid OCR reconciliation CSV. Default: " + defaults.gridReconciliation,
    "  --recap <file>                   Official recap CSV. Default: " + defaults.recap,
    "  --source-overrides <file>        Optional source/reconciliation override JSON. Default: " + defaults.sourceOverrides,
    "  --out-cells <file>               Combined candidate CSV output. Default: " + defaults.outCells,
    "  --out-reconciliation <file>      Combined reconciliation CSV output. Default: " + defaults.outReconciliation,
    "  --out-correction-template <file> Combined correction template output. Default: " + defaults.outCorrectionTemplate,
    "  --out-audit <file>               Combined audit CSV output. Default: " + defaults.outAudit,
    "  --corrections <file>             Optional human-reviewed correction CSV applied during reconciliation.",
    "  --help                           Show this help.",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--text-cells") options.textCells = argv[++index];
    else if (arg === "--text-reconciliation") options.textReconciliation = argv[++index];
    else if (arg === "--grid-cells") options.gridCells = argv[++index];
    else if (arg === "--grid-reconciliation") options.gridReconciliation = argv[++index];
    else if (arg === "--recap") options.recap = argv[++index];
    else if (arg === "--source-overrides") options.sourceOverrides = argv[++index];
    else if (arg === "--out-cells") options.outCells = argv[++index];
    else if (arg === "--out-reconciliation") options.outReconciliation = argv[++index];
    else if (arg === "--out-correction-template") options.outCorrectionTemplate = argv[++index];
    else if (arg === "--out-audit") options.outAudit = argv[++index];
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
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
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

function readCsv(file) {
  if (!fs.existsSync(file)) throw new Error("CSV does not exist: " + file);
  return parseCsv(fs.readFileSync(file, "utf8"));
}

function canonicalCountyName(value) {
  return String(value ?? "").replace(/\s+Updated$/i, "").trim();
}

function candidateKey(name) {
  const text = String(name ?? "").toLowerCase();
  if (text.includes("harris") || text.includes("kamala")) return "harris";
  if (text.includes("trump") || text.includes("donald")) return "trump";
  if (text.includes("pinkins")) return "pinkins";
  if (text.includes("wicker")) return "wicker";
  return "other";
}

function candidateSummaryKey(row) {
  return canonicalCountyName(row.county) + "|" + candidateKey(row.candidate);
}

function reconciliationMap(file) {
  const map = new Map();
  for (const row of readCsv(file)) {
    if (row.kind !== "candidate_total") continue;
    map.set(canonicalCountyName(row.county) + "|" + row.candidate, row);
  }
  return map;
}

function officialCounties(recapPath) {
  return [...new Set(readCsv(recapPath)
    .filter((row) => row.Office === "United States-President")
    .map((row) => row.County)
    .filter(Boolean))].sort();
}

function replacementKeys(textReconciliation, gridReconciliation) {
  const replacements = [];
  for (const [key, gridRow] of gridReconciliation) {
    const textRow = textReconciliation.get(key);
    if (gridRow.status === "reconciled" && (!textRow || textRow.status !== "reconciled")) {
      replacements.push(key);
    }
  }
  return replacements.sort();
}

function writeCombinedCells(options, replacements) {
  const replacementSet = new Set(replacements);
  const textRows = readCsv(options.textCells);
  const gridRows = readCsv(options.gridCells).map((row) => ({
    ...row,
    county: canonicalCountyName(row.county),
    warnings: [row.warnings, "grid_review_replacement"].filter(Boolean).join(";"),
  }));
  const rows = [];
  for (const row of textRows) {
    if (!replacementSet.has(candidateSummaryKey(row))) rows.push(row);
  }
  for (const row of gridRows) {
    if (replacementSet.has(candidateSummaryKey(row))) rows.push(row);
  }

  const header = ["county", "page", "image", "columnIndex", "precinctLabel", "contest", "candidate", "party", "value", "rawValue", "rowText", "x1", "x2", "y1", "y2", "warnings"];
  ensureDir(path.dirname(options.outCells));
  fs.writeFileSync(options.outCells, [header.join(","), ...rows.map((row) => header.map((key) => csv(row[key])).join(","))].join("\n") + "\n");
  fs.writeFileSync(options.outCells.replace(/\.csv$/i, ".manifest.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    textCells: textRows.length,
    gridCells: gridRows.length,
    outputCells: rows.length,
    replacementKeys: replacements,
    corrections: options.corrections,
  }, null, 2) + "\n");
  return rows.length;
}

function runNode(args) {
  console.log("run node " + args.join(" "));
  const result = spawnSync(process.execPath, args, { encoding: "utf8", stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("node " + args.join(" ") + " failed with exit " + result.status);
}

function writeAudit(options, replacements) {
  const replacementCountySet = new Set(replacements.map((key) => key.split("|")[0]));
  const byCounty = new Map(officialCounties(options.recap).map((county) => [county, []]));
  for (const row of readCsv(options.outReconciliation)) {
    if (row.kind !== "candidate_total") continue;
    const county = canonicalCountyName(row.county);
    if (!byCounty.has(county)) byCounty.set(county, []);
    byCounty.get(county).push(row);
  }

  const rows = [];
  for (const [county, summaries] of [...byCounty.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const missing = expectedCandidateKeys.filter((key) => !summaries.some((row) => row.candidate === key));
    const review = summaries.filter((row) => row.status !== "reconciled");
    const absReviewDelta = review.reduce((total, row) => total + Math.abs(Number(row.precinctDelta || 0)), 0);
    const maxReviewDelta = review.reduce((max, row) => Math.max(max, Math.abs(Number(row.precinctDelta || 0))), 0);
    const reconciledCandidateRows = summaries.filter((row) => row.status === "reconciled").length;
    let reviewClass = "import_ready";
    if (missing.length) reviewClass = "missing_candidate_rows";
    else if (review.length === 0) reviewClass = replacementCountySet.has(county) ? "resolved_by_grid_review" : "import_ready";
    else if (maxReviewDelta <= 100) reviewClass = "small_numeric_delta";
    else if (maxReviewDelta <= 1000) reviewClass = "medium_numeric_delta";
    else reviewClass = "large_or_incomplete_extraction";

    rows.push({
      county,
      reviewClass,
      candidateRows: summaries.length,
      reconciledCandidateRows,
      reviewCandidateRows: review.length,
      missingCandidates: missing.join(";"),
      absReviewDelta,
      maxReviewDelta,
      reviewDeltas: review.map((row) => row.candidate + ":" + row.precinctDelta + "/" + row.officialTotal).join(";"),
      notes: replacementCountySet.has(county) ? "grid candidate replacement used where it reconciled better than text OCR" : "",
    });
  }

  const header = ["county", "reviewClass", "candidateRows", "reconciledCandidateRows", "reviewCandidateRows", "missingCandidates", "absReviewDelta", "maxReviewDelta", "reviewDeltas", "notes"];
  ensureDir(path.dirname(options.outAudit));
  fs.writeFileSync(options.outAudit, [header.join(","), ...rows.map((row) => header.map((key) => csv(row[key])).join(","))].join("\n") + "\n");
  const counts = {};
  for (const row of rows) counts[row.reviewClass] = (counts[row.reviewClass] || 0) + 1;
  fs.writeFileSync(options.outAudit.replace(/\.csv$/i, ".manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), counts, replacementKeys: replacements, corrections: options.corrections }, null, 2) + "\n");
  console.log(JSON.stringify({ counts, replacementKeys: replacements }, null, 2));
  console.log("Wrote Mississippi OCR combined review audit to " + options.outAudit);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const textReconciliation = reconciliationMap(options.textReconciliation);
  const gridReconciliation = reconciliationMap(options.gridReconciliation);
  const replacements = replacementKeys(textReconciliation, gridReconciliation);
  const outputCells = writeCombinedCells(options, replacements);
  console.log("Wrote " + outputCells + " combined OCR candidate cells to " + options.outCells);

  const reconcileArgs = ["scripts/reconcile-ms-ocr-grid-cells.mjs", "--cells", options.outCells, "--recap", options.recap, "--source-overrides", options.sourceOverrides, "--out", options.outReconciliation];
  if (options.corrections) reconcileArgs.push("--corrections", options.corrections);
  runNode(reconcileArgs);
  runNode(["scripts/create-ms-ocr-correction-template.mjs", "--cells", options.outCells, "--reconciliation", options.outReconciliation, "--out", options.outCorrectionTemplate]);
  writeAudit(options, replacements);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
