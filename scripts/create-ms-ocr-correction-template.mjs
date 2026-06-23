import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const defaults = {
  cells: ".etl/ocr/ms-ocr-text-row-candidates.csv",
  reconciliation: ".etl/ocr/ms-ocr-text-row-reconciliation.csv",
  out: ".etl/ocr/ms-ocr-correction-template.csv",
};

function usage() {
  console.log([
    "Usage: node scripts/create-ms-ocr-correction-template.mjs [options]",
    "",
    "Create a human-review correction template for Mississippi OCR candidate cells.",
    "The generated CSV is not imported; reviewers fill correctedValue/exclude/action before reconciliation applies it.",
    "",
    "Options:",
    "  --cells <file>           Candidate cell CSV.",
    "  --reconciliation <file>  Reconciliation CSV from reconcile-ms-ocr-grid-cells.",
    "  --out <file>             Correction template CSV.",
    "  --help                   Show this help.",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--cells") options.cells = argv[++index];
    else if (arg === "--reconciliation") options.reconciliation = argv[++index];
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

function candidateKey(name) {
  const text = String(name ?? "").toLowerCase();
  if (text.includes("harris")) return "harris";
  if (text.includes("trump")) return "trump";
  if (text.includes("pinkins")) return "pinkins";
  if (text.includes("wicker")) return "wicker";
  return text.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function correctionKey(row) {
  return [
    row.county,
    row.page,
    candidateKey(row.candidate),
    row.columnIndex,
  ].join("|");
}

function candidateRowsNeedingReview(reconciliation) {
  const keys = new Set();
  for (const row of reconciliation) {
    if (row.kind !== "candidate_total") continue;
    if (row.status === "reconciled") continue;
    keys.add(row.county + "|" + candidateKey(row.candidate));
  }
  return keys;
}

function buildTemplateRows(cells, reconciliation) {
  const reviewCandidateKeys = candidateRowsNeedingReview(reconciliation);
  const rows = [];
  for (const cell of cells) {
    const summaryKey = cell.county + "|" + candidateKey(cell.candidate);
    if (!reviewCandidateKeys.has(summaryKey)) continue;
    rows.push({
      action: "update",
      county: cell.county,
      page: cell.page,
      candidate: candidateKey(cell.candidate),
      columnIndex: cell.columnIndex,
      currentValue: cell.value,
      correctedValue: "",
      exclude: "",
      reason: "",
      reviewer: "",
      rowText: cell.rowText,
      sourceWarnings: cell.warnings,
      correctionKey: correctionKey(cell),
    });
  }

  for (const row of reconciliation) {
    if (row.kind !== "candidate_total" || row.status === "reconciled") continue;
    rows.push({
      action: "add",
      county: row.county,
      page: "",
      candidate: candidateKey(row.candidate),
      columnIndex: "",
      currentValue: "",
      correctedValue: "",
      exclude: "",
      reason: `Candidate total still needs review: precinctDelta=${row.precinctDelta}`,
      reviewer: "",
      rowText: "",
      sourceWarnings: row.warnings,
      correctionKey: "",
    });
  }

  return rows;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!fs.existsSync(options.cells)) throw new Error("Candidate cell CSV does not exist: " + options.cells);
  if (!fs.existsSync(options.reconciliation)) throw new Error("Reconciliation CSV does not exist: " + options.reconciliation);

  const cells = parseCsv(fs.readFileSync(options.cells, "utf8"));
  const reconciliation = parseCsv(fs.readFileSync(options.reconciliation, "utf8"));
  const rows = buildTemplateRows(cells, reconciliation);
  const header = [
    "action",
    "county",
    "page",
    "candidate",
    "columnIndex",
    "currentValue",
    "correctedValue",
    "exclude",
    "reason",
    "reviewer",
    "rowText",
    "sourceWarnings",
    "correctionKey",
  ];
  ensureDir(path.dirname(options.out));
  fs.writeFileSync(options.out, [header.join(","), ...rows.map((row) => header.map((key) => csv(row[key])).join(","))].join("\n") + "\n");
  fs.writeFileSync(options.out.replace(/\.csv$/i, ".manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), options, rows: rows.length }, null, 2) + "\n");
  console.log("Wrote " + rows.length + " correction template rows to " + options.out);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
