import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const defaults = {
  county: "Tunica",
  sourceTextDir: ".etl/ocr/probe-zero/20260623-010715/Tunica/r270-psm6-s2/text",
  targetTextDir: ".etl/ocr/ms-full-text",
};

const requiredRows = [
  { key: "harris", pattern: /\b(?:D|Democrat)\b.*(?:Kamala|Harris).*\b\d[\d,]*\b/i },
  { key: "trump", pattern: /\b(?:R|Republican)\b.*(?:Donald|Trump).*\b\d[\d,]*\b/i },
  { key: "pinkins", pattern: /\b(?:D|Democrat)\b.*Pinkins.*\b\d[\d,]*\b/i },
  { key: "wicker", pattern: /\b(?:R|Republican)\b.*Wicker.*\b\d[\d,]*\b/i },
];

function usage() {
  console.log([
    "Usage: node scripts/promote-ms-ocr-recovery-text.mjs [options]",
    "",
    "Promote a verified Mississippi OCR recovery text directory into the main OCR text output.",
    "This copies generated OCR artifacts only; it does not import rows into the database.",
    "",
    "Options:",
    "  --county <name>             County name. Default: " + defaults.county,
    "  --source-text-dir <dir>     Recovery text dir containing <County>.txt and pages/<County>/page-*.txt.",
    "                              Default: " + defaults.sourceTextDir,
    "  --target-text-dir <dir>     Main OCR text dir containing pages/<County>. Default: " + defaults.targetTextDir,
    "  --help                      Show this help.",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--county") options.county = argv[++index];
    else if (arg === "--source-text-dir") options.sourceTextDir = argv[++index];
    else if (arg === "--target-text-dir") options.targetTextDir = argv[++index];
    else throw new Error("Unknown option: " + arg);
  }
  return options;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function listPageFiles(dir) {
  if (!fs.existsSync(dir)) throw new Error("Recovery page directory does not exist: " + dir);
  return fs.readdirSync(dir).filter((name) => /^page-\d+\.txt$/i.test(name)).sort();
}

function copyFile(source, target) {
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function validateCandidateRows({ county, sourceTextDir }) {
  const pagesDir = path.join(sourceTextDir, "pages", county);
  const pageFiles = listPageFiles(pagesDir);
  const pageTexts = pageFiles.map((file) => ({
    file,
    text: fs.readFileSync(path.join(pagesDir, file), "utf8"),
  }));
  const combinedText = pageTexts.map((page) => cleanText(page.text)).join("\n");
  const found = {};

  for (const row of requiredRows) {
    const page = pageTexts.find((entry) => row.pattern.test(cleanText(entry.text)));
    if (!page) throw new Error("Recovery text is missing required candidate row: " + row.key);
    found[row.key] = page.file;
  }

  if (!combinedText.includes(county)) {
    throw new Error("Recovery text does not appear to be for county: " + county);
  }

  return { pageFiles, found };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const sourceCountyText = path.join(options.sourceTextDir, options.county + ".txt");
  const sourcePagesDir = path.join(options.sourceTextDir, "pages", options.county);
  if (!fs.existsSync(sourceCountyText)) throw new Error("Recovery county text does not exist: " + sourceCountyText);

  const validation = validateCandidateRows(options);
  const targetCountyText = path.join(options.targetTextDir, options.county + ".txt");
  const targetPagesDir = path.join(options.targetTextDir, "pages", options.county);

  copyFile(sourceCountyText, targetCountyText);
  for (const pageFile of validation.pageFiles) {
    copyFile(path.join(sourcePagesDir, pageFile), path.join(targetPagesDir, pageFile));
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    county: options.county,
    sourceTextDir: options.sourceTextDir,
    targetTextDir: options.targetTextDir,
    requiredRowsFoundOnPages: validation.found,
    copiedPages: validation.pageFiles.length,
  };
  const manifestPath = path.join(options.targetTextDir, "ms-ocr-recovery-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Promoted " + options.county + " OCR recovery text into " + options.targetTextDir);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
