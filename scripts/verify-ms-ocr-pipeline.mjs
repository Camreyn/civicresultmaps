import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const defaults = {
  pdfDir: "data/ms-2024-county-results-pdfs",
  recap: "data/ms-2024-election-recap-sheets.csv",
  textOutDir: "data/ms-2024-county-results-ocr-text",
  textPagesDir: "data/ms-2024-county-results-ocr-text/pages",
  imageDir: ".etl/ocr/ms-county-results-images",
  tessdataDir: ".etl/ocr/tesseract-cache",
  cells: ".etl/ocr/ms-ocr-text-row-candidates.csv",
  reconciliation: ".etl/ocr/ms-ocr-text-row-reconciliation.csv",
  corrections: "",
  correctionTemplate: ".etl/ocr/ms-ocr-correction-template.csv",
  report: ".etl/ocr/ms-ocr-verification-report.csv",
  state: ".etl/ocr/ms-ocr-verification-state.json",
  limitCounties: 0,
  limitPages: 0,
  county: "",
  scale: 3,
  rotate: 270,
  psm: 4,
  skipOcr: false,
  forceOcr: false,
  failOnReview: false,
};

const expectedCandidateKeys = ["harris", "trump", "pinkins", "wicker"];

function usage() {
  console.log([
    "Usage: node scripts/verify-ms-ocr-pipeline.mjs [options]",
    "",
    "Run the Mississippi OCR verification pipeline in resumable batches.",
    "This writes review artifacts only; it does not import OCR rows into the database.",
    "",
    "Options:",
    "  --pdf-dir <dir>              Source county PDF directory. Default: " + defaults.pdfDir,
    "  --recap <file>             Official statewide recap CSV. Default: " + defaults.recap,
    "  --text-out-dir <dir>         OCR text output directory. Default: " + defaults.textOutDir,
    "  --text-pages-dir <dir>       OCR per-page text directory. Default: " + defaults.textPagesDir,
    "  --image-dir <dir>            Rendered OCR image directory. Default: " + defaults.imageDir,
    "  --tessdata-dir <dir>         Tesseract cache directory. Default: " + defaults.tessdataDir,
    "  --cells <file>               Candidate-cell CSV output. Default: " + defaults.cells,
    "  --reconciliation <file>      Reconciliation CSV output. Default: " + defaults.reconciliation,
    "  --corrections <file>         Optional reviewed correction CSV.",
    "  --correction-template <file>  Correction-template CSV output. Default: " + defaults.correctionTemplate,
    "  --report <file>              County verification report CSV output. Default: " + defaults.report,
    "  --state <file>               Resumable pipeline state JSON. Default: " + defaults.state,
    "  --county <name>              Process one county/PDF stem.",
    "  --limit-counties <n>         Process only the first N pending counties.",
    "  --limit-pages <n>            Limit page extraction per county, for samples.",
    "  --scale <number>             OCR render scale passed to the county OCR script. Default: " + defaults.scale,
    "  --rotate <degrees>           OCR rotation passed to the county OCR script. Default: " + defaults.rotate,
    "  --psm <number>               Tesseract page segmentation mode. Default: " + defaults.psm,
    "  --skip-ocr                   Reuse existing OCR text and only extract/reconcile/report.",
    "  --force-ocr                  Re-OCR selected counties even when text exists.",
    "  --fail-on-review             Exit nonzero if any county is not import-ready.",
    "  --help                       Show this help.",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--pdf-dir") options.pdfDir = argv[++index];
    else if (arg === "--recap") options.recap = argv[++index];
    else if (arg === "--text-out-dir") options.textOutDir = argv[++index];
    else if (arg === "--text-pages-dir") options.textPagesDir = argv[++index];
    else if (arg === "--image-dir") options.imageDir = argv[++index];
    else if (arg === "--tessdata-dir") options.tessdataDir = argv[++index];
    else if (arg === "--cells") options.cells = argv[++index];
    else if (arg === "--reconciliation") options.reconciliation = argv[++index];
    else if (arg === "--corrections") options.corrections = argv[++index];
    else if (arg === "--correction-template") options.correctionTemplate = argv[++index];
    else if (arg === "--report") options.report = argv[++index];
    else if (arg === "--state") options.state = argv[++index];
    else if (arg === "--county") options.county = argv[++index];
    else if (arg === "--limit-counties") options.limitCounties = Number(argv[++index]);
    else if (arg === "--limit-pages") options.limitPages = Number(argv[++index]);
    else if (arg === "--scale") options.scale = Number(argv[++index]);
    else if (arg === "--rotate") options.rotate = Number(argv[++index]);
    else if (arg === "--psm") options.psm = Number(argv[++index]);
    else if (arg === "--skip-ocr") options.skipOcr = true;
    else if (arg === "--force-ocr") options.forceOcr = true;
    else if (arg === "--fail-on-review") options.failOnReview = true;
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

function safeStem(fileName) {
  return path.basename(fileName, path.extname(fileName)).replace(/[\\/:*?"<>|]/g, "_").trim();
}

function canonicalCountyName(value) {
  return String(value ?? "").replace(/\s+Updated$/i, "").trim();
}

function listOfficialCounties(options) {
  if (!fs.existsSync(options.recap)) throw new Error("Official recap CSV does not exist: " + options.recap);
  return [...new Set(parseCsv(fs.readFileSync(options.recap, "utf8")).filter((row) => row.Office === "United States-President").map((row) => row.County).filter(Boolean))].sort();
}

function listCountyStems(options, officialCounties) {
  if (!fs.existsSync(options.pdfDir)) throw new Error("PDF directory does not exist: " + options.pdfDir);
  const pdfStems = fs
    .readdirSync(options.pdfDir)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .map(safeStem)
    .sort();
  const byCanonical = new Map();
  for (const stem of pdfStems) {
    const canonical = canonicalCountyName(stem);
    const current = byCanonical.get(canonical);
    if (!current || /\s+Updated$/i.test(stem)) byCanonical.set(canonical, stem);
  }
  let counties = officialCounties.map((county) => byCanonical.get(county)).filter(Boolean);
  if (options.county) {
    counties = counties.filter((name) => name.toLowerCase() === options.county.toLowerCase() || canonicalCountyName(name).toLowerCase() === options.county.toLowerCase());
  }
  return counties;
}

function readState(file) {
  if (!fs.existsSync(file)) return { generatedAt: null, completed: {}, failed: {} };
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeState(file, state) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify({ ...state, generatedAt: new Date().toISOString() }, null, 2) + "\n");
}

function runNode(args) {
  console.log("run node " + args.join(" "));
  const result = spawnSync(process.execPath, args, { encoding: "utf8", stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("node " + args.join(" ") + " failed with exit " + result.status);
}

function runOcrBatch(options, counties) {
  const state = readState(options.state);
  const selected = counties
    .filter((county) => options.forceOcr || !state.completed[county])
    .slice(0, options.limitCounties > 0 ? options.limitCounties : undefined);
  if (!selected.length) {
    console.log("No pending OCR counties selected.");
    return state;
  }

  for (const county of selected) {
    const args = [
      "scripts/ocr-ms-county-result-pdfs.mjs",
      "--pdf-dir",
      options.pdfDir,
      "--out-dir",
      options.textOutDir,
      "--image-dir",
      options.imageDir,
      "--tessdata-dir",
      options.tessdataDir,
      "--county",
      county,
      "--scale",
      String(options.scale),
      "--rotate",
      String(options.rotate),
      "--psm",
      String(options.psm),
    ];
    if (options.forceOcr) args.push("--force");
    if (options.limitPages > 0) args.push("--first-pages", String(options.limitPages));
    try {
      runNode(args);
      state.completed[county] = { completedAt: new Date().toISOString() };
      delete state.failed[county];
    } catch (error) {
      state.failed[county] = { failedAt: new Date().toISOString(), error: error.message };
      writeState(options.state, state);
      throw error;
    }
    writeState(options.state, state);
  }

  return state;
}

function runExtractor(options) {
  const args = [
    "scripts/extract-ms-recap-ocr-text-rows.mjs",
    "--text-pages-dir",
    options.textPagesDir,
    "--out",
    options.cells,
  ];
  if (options.county) args.push("--county", options.county);
  if (options.skipOcr && options.limitCounties > 0) args.push("--limit-counties", String(options.limitCounties));
  if (options.limitPages > 0) args.push("--limit-pages", String(options.limitPages));
  runNode(args);
}

function runReconciler(options) {
  const args = ["scripts/reconcile-ms-ocr-grid-cells.mjs", "--cells", options.cells, "--out", options.reconciliation];
  if (options.corrections) args.push("--corrections", options.corrections);
  runNode(args);
}

function runCorrectionTemplate(options) {
  runNode([
    "scripts/create-ms-ocr-correction-template.mjs",
    "--cells",
    options.cells,
    "--reconciliation",
    options.reconciliation,
    "--out",
    options.correctionTemplate,
  ]);
}

function reportRows(reconciliationRows, expectedCounties) {
  const byCounty = new Map();
  for (const county of expectedCounties) {
    byCounty.set(county, {
      county,
      candidateRows: 0,
      reconciledCandidateRows: 0,
      reviewCandidateRows: 0,
      missingCandidates: [...expectedCandidateKeys],
      pageRows: 0,
      reviewPageRows: 0,
      warnings: new Set(),
    });
  }

  for (const row of reconciliationRows) {
    if (!byCounty.has(row.county)) {
      byCounty.set(row.county, {
        county: row.county,
        candidateRows: 0,
        reconciledCandidateRows: 0,
        reviewCandidateRows: 0,
        missingCandidates: [...expectedCandidateKeys],
        pageRows: 0,
        reviewPageRows: 0,
        warnings: new Set(),
      });
    }
    const summary = byCounty.get(row.county);
    for (const warning of String(row.warnings || "").split(";").filter(Boolean)) summary.warnings.add(warning);
    if (row.kind === "candidate_total") {
      summary.candidateRows += 1;
      summary.missingCandidates = summary.missingCandidates.filter((candidate) => candidate !== row.candidate);
      if (row.status === "reconciled") summary.reconciledCandidateRows += 1;
      else summary.reviewCandidateRows += 1;
    } else if (row.kind === "page_coverage") {
      summary.pageRows += 1;
      if (row.status === "review") summary.reviewPageRows += 1;
    }
  }

  return [...byCounty.values()].sort((a, b) => a.county.localeCompare(b.county)).map((summary) => {
    const missingCandidates = summary.missingCandidates.join(";");
    const importReady = summary.reconciledCandidateRows === expectedCandidateKeys.length && summary.reviewCandidateRows === 0 && !missingCandidates;
    const status = importReady ? "import_ready" : summary.candidateRows ? "review_required" : "missing_ocr";
    return {
      county: summary.county,
      status,
      importReady: importReady ? "yes" : "no",
      candidateRows: summary.candidateRows,
      reconciledCandidateRows: summary.reconciledCandidateRows,
      reviewCandidateRows: summary.reviewCandidateRows,
      missingCandidates,
      pageRows: summary.pageRows,
      reviewPageRows: summary.reviewPageRows,
      warnings: [...summary.warnings].sort().join(";"),
    };
  });
}

function writeReport(options, counties) {
  if (!fs.existsSync(options.reconciliation)) throw new Error("Reconciliation CSV does not exist: " + options.reconciliation);
  const rows = reportRows(parseCsv(fs.readFileSync(options.reconciliation, "utf8")), counties);
  const header = [
    "county",
    "status",
    "importReady",
    "candidateRows",
    "reconciledCandidateRows",
    "reviewCandidateRows",
    "missingCandidates",
    "pageRows",
    "reviewPageRows",
    "warnings",
  ];
  ensureDir(path.dirname(options.report));
  fs.writeFileSync(options.report, [header.join(","), ...rows.map((row) => header.map((key) => csv(row[key])).join(","))].join("\n") + "\n");
  const metrics = {
    counties: rows.length,
    importReadyCounties: rows.filter((row) => row.importReady === "yes").length,
    reviewRequiredCounties: rows.filter((row) => row.status === "review_required").length,
    missingOcrCounties: rows.filter((row) => row.status === "missing_ocr").length,
  };
  fs.writeFileSync(options.report.replace(/\.csv$/i, ".manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), options, metrics }, null, 2) + "\n");
  console.log(JSON.stringify(metrics, null, 2));
  console.log("Wrote Mississippi OCR verification report to " + options.report);
  return { rows, metrics };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!Number.isFinite(options.limitCounties) || options.limitCounties < 0) throw new Error("--limit-counties must be a non-negative number");
  if (!Number.isFinite(options.limitPages) || options.limitPages < 0) throw new Error("--limit-pages must be a non-negative number");
  if (!Number.isFinite(options.scale) || options.scale <= 0) throw new Error("--scale must be a positive number");
  if (!Number.isFinite(options.rotate)) throw new Error("--rotate must be a number");
  if (!Number.isFinite(options.psm) || options.psm < 0) throw new Error("--psm must be a non-negative number");

  const officialCounties = listOfficialCounties(options);
  const counties = listCountyStems(options, officialCounties);
  if (!counties.length) throw new Error("No Mississippi county PDFs matched the requested options.");

  const canonicalRunCounties = counties.map(canonicalCountyName);
  const reportCounties = options.skipOcr && options.limitCounties > 0 ? canonicalRunCounties.slice(0, options.limitCounties) : canonicalRunCounties;

  if (!options.skipOcr) runOcrBatch(options, counties);
  else console.log("Skipping OCR; using existing text pages from " + options.textPagesDir);

  runExtractor(options);
  runReconciler(options);
  runCorrectionTemplate(options);
  const report = writeReport(options, reportCounties);
  if (options.failOnReview && report.metrics.importReadyCounties !== report.metrics.counties) {
    throw new Error("Mississippi OCR import gate failed: " + report.metrics.importReadyCounties + " of " + report.metrics.counties + " counties are import-ready.");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
