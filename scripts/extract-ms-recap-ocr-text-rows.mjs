import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const defaults = {
  out: ".etl/ocr/ms-ocr-text-row-candidates.csv",
  textPagesDir: "data/ms-2024-county-results-ocr-text/pages",
  county: "",
  limitCounties: 0,
  limitPages: 0,
};

const targetRows = [
  {
    key: "harris",
    contest: "President",
    candidate: "Kamala Harris",
    party: "Democrat",
    patterns: [/kamala|harris/i, /democrat/i],
  },
  {
    key: "trump",
    contest: "President",
    candidate: "Donald Trump",
    party: "Republican",
    patterns: [/donald|trump/i, /republican/i],
  },
  {
    key: "pinkins",
    contest: "U.S. Senate",
    candidate: "Ty Pinkins",
    party: "Democrat",
    patterns: [/pinkins/i, /democrat/i],
  },
  {
    key: "wicker",
    contest: "U.S. Senate",
    candidate: "Roger Wicker",
    party: "Republican",
    patterns: [/wicker/i, /republican/i],
  },
];

function usage() {
  console.log([
    "Usage: node scripts/extract-ms-recap-ocr-text-rows.mjs [options]",
    "",
    "Extract review-gated Mississippi candidate rows from full-page OCR text.",
    "This is a fallback companion to grid-cell extraction; it is not a database importer.",
    "",
    "Options:",
    "  --text-pages-dir <dir>  Directory containing <County>/page-*.txt. Default: " + defaults.textPagesDir,
    "  --out <file>           Candidate CSV output. Default: " + defaults.out,
    "  --county <name>        Process one county directory name.",
    "  --limit-counties <n>   Process only the first N county directories.",
    "  --limit-pages <n>      Process only the first N page text files per county.",
    "  --help                 Show this help.",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--text-pages-dir") options.textPagesDir = argv[++index];
    else if (arg === "--out") options.out = argv[++index];
    else if (arg === "--county") options.county = argv[++index];
    else if (arg === "--limit-counties") options.limitCounties = Number(argv[++index]);
    else if (arg === "--limit-pages") options.limitPages = Number(argv[++index]);
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

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function pageNumber(fileName) {
  const match = fileName.match(/page-(\d+)\.txt$/i);
  return match ? Number(match[1]) : 0;
}

function listCountyDirs(options) {
  if (!fs.existsSync(options.textPagesDir)) {
    throw new Error("Text pages directory does not exist: " + options.textPagesDir);
  }
  let dirs = fs
    .readdirSync(options.textPagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (options.county) dirs = dirs.filter((name) => name.toLowerCase() === options.county.toLowerCase());
  if (options.limitCounties > 0) dirs = dirs.slice(0, options.limitCounties);
  return dirs;
}

function listPageFiles(countyDir, options) {
  let pages = fs
    .readdirSync(countyDir)
    .filter((name) => /^page-\d+\.txt$/i.test(name))
    .sort((a, b) => pageNumber(a) - pageNumber(b));
  if (options.limitPages > 0) pages = pages.slice(0, options.limitPages);
  return pages;
}

function targetForText(text) {
  const normalized = cleanText(text);
  return targetRows.find((target) => target.patterns.every((pattern) => pattern.test(normalized)));
}

function numericTokens(block) {
  return [...block.matchAll(/\b\d[\d,]*\b/g)].map((match) => match[0]);
}

function extractPage({ county, pageFile, pagePath }) {
  const rawLines = fs.readFileSync(pagePath, "utf8").split(/\r?\n/);
  const lines = rawLines.map(cleanText).filter(Boolean);
  const records = [];
  const warnings = new Set();
  const seenTargets = new Set();

  for (let index = 0; index < lines.length; index += 1) {
    let rowText = lines[index];
    let target = targetForText(rowText);
    if (!target) {
      const lookahead = [lines[index], lines[index + 1] ?? "", lines[index + 2] ?? ""].join(" ");
      target = targetForText(lookahead);
      if (target) {
        const candidateLine = [lines[index], lines[index + 1] ?? "", lines[index + 2] ?? ""].find((line) => target.patterns.some((pattern) => pattern.test(line)) && numericTokens(line).length);
        rowText = candidateLine ?? lookahead;
      }
    }
    if (!target || seenTargets.has(target.key)) continue;

    const values = numericTokens(rowText);
    if (!values.length) {
      warnings.add("missing_numeric_values_" + target.key);
      continue;
    }
    seenTargets.add(target.key);

    for (const [valueIndex, rawValue] of values.entries()) {
      const value = rawValue.replace(/\D/g, "");
      records.push({
        county,
        page: pageNumber(pageFile),
        image: path.relative(process.cwd(), pagePath),
        columnIndex: valueIndex + 1,
        precinctLabel: "page " + pageNumber(pageFile) + " OCR column " + (valueIndex + 1),
        contest: target.contest,
        candidate: target.candidate,
        party: target.party,
        value,
        rawValue,
        rowText: cleanText(rowText),
        x1: "",
        x2: "",
        y1: "",
        y2: "",
        warnings: "text_row_fallback",
      });
    }
  }

  for (const target of targetRows) {
    if (!seenTargets.has(target.key)) warnings.add("missing_" + target.key);
  }

  return { records, warnings: [...warnings] };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!Number.isFinite(options.limitCounties) || options.limitCounties < 0) throw new Error("--limit-counties must be a non-negative number");
  if (!Number.isFinite(options.limitPages) || options.limitPages < 0) throw new Error("--limit-pages must be a non-negative number");

  const records = [];
  const summaries = [];
  for (const county of listCountyDirs(options)) {
    const countyDir = path.join(options.textPagesDir, county);
    for (const pageFile of listPageFiles(countyDir, options)) {
      const result = extractPage({ county, pageFile, pagePath: path.join(countyDir, pageFile) });
      records.push(...result.records);
      summaries.push({ county, page: pageNumber(pageFile), rows: result.records.length, warnings: result.warnings });
      console.log("extract text " + county + " " + pageFile + " -> " + result.records.length + " cells" + (result.warnings.length ? " [" + result.warnings.join(",") + "]" : ""));
    }
  }

  ensureDir(path.dirname(options.out));
  const header = ["county", "page", "image", "columnIndex", "precinctLabel", "contest", "candidate", "party", "value", "rawValue", "rowText", "x1", "x2", "y1", "y2", "warnings"];
  fs.writeFileSync(options.out, [header.join(","), ...records.map((record) => header.map((key) => csv(record[key])).join(","))].join("\n") + "\n");
  fs.writeFileSync(options.out.replace(/\.csv$/i, ".manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), options, summaries }, null, 2) + "\n");
  console.log("Wrote " + records.length + " OCR text candidate cells to " + options.out);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
