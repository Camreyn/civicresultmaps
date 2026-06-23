import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PDFParse } from "pdf-parse";

const defaults = {
  pdfDir: "data/ms-2024-county-results-pdfs",
  outDir: "data/ms-2024-county-results-ocr-text",
  county: "",
  minChars: 500,
  force: false,
};

function usage() {
  console.log([
    "Usage: node scripts/extract-ms-pdf-text-layer.mjs [options]",
    "",
    "Extract embedded text layers from official Mississippi county result PDFs.",
    "This is an ETL preparation helper for PDFs where image OCR fails but pdf text is usable.",
    "",
    "Options:",
    "  --pdf-dir <dir>      Source PDF directory. Default: " + defaults.pdfDir,
    "  --out-dir <dir>      Text output directory. Default: " + defaults.outDir,
    "  --county <name>      Process one PDF whose sanitized stem or canonical county matches.",
    "  --min-chars <n>      Skip extracted text shorter than this. Default: " + defaults.minChars,
    "  --force              Overwrite existing county text files.",
    "  --help               Show this help.",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--pdf-dir") options.pdfDir = argv[++index];
    else if (arg === "--out-dir") options.outDir = argv[++index];
    else if (arg === "--county") options.county = argv[++index];
    else if (arg === "--min-chars") options.minChars = Number(argv[++index]);
    else if (arg === "--force") options.force = true;
    else throw new Error("Unknown option: " + arg);
  }
  return options;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeStem(fileName) {
  return path.basename(fileName, path.extname(fileName)).replace(/[\\/:*?"<>|]/g, "_").trim();
}

function canonicalCountyName(value) {
  return String(value ?? "").replace(/\s+Updated$/i, "").trim();
}

function textPages(text) {
  const marker = /\n\s*--\s+\d+\s+of\s+\d+\s+--\s*\n/g;
  const pages = text.split(marker).map((page) => page.trim()).filter(Boolean);
  return pages.length ? pages : [text.trim()].filter(Boolean);
}

async function extractPdfText(pdfPath) {
  const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
  try {
    const result = await parser.getText();
    return result.text.replace(/\r\n/g, "\n");
  } finally {
    await parser.destroy();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!Number.isFinite(options.minChars) || options.minChars < 0) throw new Error("--min-chars must be a non-negative number");
  if (!fs.existsSync(options.pdfDir)) throw new Error("PDF directory does not exist: " + options.pdfDir);

  ensureDir(options.outDir);
  ensureDir(path.join(options.outDir, "pages"));

  let pdfs = fs.readdirSync(options.pdfDir).filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
  if (options.county) {
    pdfs = pdfs.filter((name) => safeStem(name).toLowerCase() === options.county.toLowerCase() || canonicalCountyName(safeStem(name)).toLowerCase() === options.county.toLowerCase());
  }
  if (!pdfs.length) throw new Error("No PDFs matched the requested options.");

  const manifest = { generatedAt: new Date().toISOString(), options, files: [], skipped: [] };
  for (const pdfName of pdfs) {
    const stem = safeStem(pdfName);
    const combinedTextPath = path.join(options.outDir, stem + ".txt");
    const pageTextDir = path.join(options.outDir, "pages", stem);
    if (!options.force && fs.existsSync(combinedTextPath)) {
      console.log("skip existing " + pdfName + " -> " + combinedTextPath);
      manifest.skipped.push({ pdf: pdfName, reason: "existing_text" });
      continue;
    }

    const text = await extractPdfText(path.join(options.pdfDir, pdfName));
    if (text.trim().length < options.minChars) {
      console.log("skip sparse text " + pdfName + " (" + text.trim().length + " chars)");
      manifest.skipped.push({ pdf: pdfName, reason: "sparse_text", chars: text.trim().length });
      continue;
    }

    const pages = textPages(text);
    ensureDir(pageTextDir);
    for (const [index, page] of pages.entries()) {
      fs.writeFileSync(path.join(pageTextDir, "page-" + String(index + 1).padStart(3, "0") + ".txt"), page.trimEnd() + "\n");
    }
    fs.writeFileSync(combinedTextPath, pages.join("\n\n--- PAGE ---\n\n") + "\n");
    manifest.files.push({ pdf: pdfName, textFile: path.relative(options.outDir, combinedTextPath), pageTextDir: path.relative(options.outDir, pageTextDir), pages: pages.length, chars: text.trim().length });
    console.log("text-layer " + pdfName + " -> " + combinedTextPath + " (" + pages.length + " pages)");
  }

  fs.writeFileSync(path.join(options.outDir, "text-layer-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("Wrote text-layer manifest to " + path.join(options.outDir, "text-layer-manifest.json"));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});