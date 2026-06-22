import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const defaults = {
  pdfDir: "data/ms-2024-county-results-pdfs",
  outDir: "data/ms-2024-county-results-ocr-text",
  imageDir: ".etl/ocr/ms-county-results-images",
  dpi: 300,
  psm: 6,
  lang: "eng",
  force: false,
  limit: 0,
};

function usage() {
  console.log([
    "Usage: node scripts/ocr-ms-county-result-pdfs.mjs [options]",
    "",
    "OCR the official Mississippi 2024 county result PDFs into per-page text files.",
    "This is an ETL preparation step only; it is not part of the Next.js site runtime.",
    "",
    "Required external tools on PATH:",
    "  - pdftoppm  (Poppler; renders PDF pages to PNG)",
    "  - tesseract (OCR engine)",
    "",
    "Options:",
    "  --pdf-dir <dir>     Source PDF directory. Default: " + defaults.pdfDir,
    "  --out-dir <dir>     OCR text output directory. Default: " + defaults.outDir,
    "  --image-dir <dir>   Temporary/rendered PNG directory. Default: " + defaults.imageDir,
    "  --dpi <number>      Render DPI for pdftoppm. Default: " + defaults.dpi,
    "  --psm <number>      Tesseract page segmentation mode. Default: " + defaults.psm,
    "  --lang <code>       Tesseract language. Default: " + defaults.lang,
    "  --limit <number>    Process only the first N PDFs, for sampling.",
    "  --force             Re-render/re-OCR even when output text exists.",
    "  --help              Show this help.",
    "",
    "Output:",
    "  <out-dir>/<County>.txt              Combined OCR text for each PDF",
    "  <out-dir>/pages/<County>/page-*.txt Per-page OCR text",
    "  <out-dir>/manifest.json             Source/output manifest and warnings",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--pdf-dir") {
      options.pdfDir = argv[++index];
    } else if (arg === "--out-dir") {
      options.outDir = argv[++index];
    } else if (arg === "--image-dir") {
      options.imageDir = argv[++index];
    } else if (arg === "--dpi") {
      options.dpi = Number(argv[++index]);
    } else if (arg === "--psm") {
      options.psm = Number(argv[++index]);
    } else if (arg === "--lang") {
      options.lang = argv[++index];
    } else if (arg === "--limit") {
      options.limit = Number(argv[++index]);
    } else {
      throw new Error("Unknown option: " + arg);
    }
  }
  return options;
}

function assertTool(command, hint) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(command + " is required but was not found or did not run. " + hint);
  }
  return (result.stdout || result.stderr || "").split(/\r?\n/)[0].trim();
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      encoding: "utf8",
      windowsHide: true,
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(command + " " + args.join(" ") + " failed with exit " + code + "\n" + stderr));
      }
    });
  });
}

function safeStem(fileName) {
  return path.basename(fileName, path.extname(fileName)).replace(/[\\/:*?"<>|]/g, "_").trim();
}

function pageNumber(fileName) {
  const match = fileName.match(/-(\d+)\.png$/i);
  return match ? Number(match[1]) : 0;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function renderPdf(pdfPath, imageBase, options) {
  const parent = path.dirname(imageBase);
  ensureDir(parent);
  for (const existing of fs.readdirSync(parent).filter((name) => name.startsWith(path.basename(imageBase) + "-") && name.endsWith(".png"))) {
    fs.rmSync(path.join(parent, existing), { force: true });
  }
  await run("pdftoppm", ["-r", String(options.dpi), "-png", pdfPath, imageBase]);
  return fs
    .readdirSync(parent)
    .filter((name) => name.startsWith(path.basename(imageBase) + "-") && name.endsWith(".png"))
    .sort((a, b) => pageNumber(a) - pageNumber(b))
    .map((name) => path.join(parent, name));
}

async function ocrImage(imagePath, options) {
  const result = await run("tesseract", [imagePath, "stdout", "-l", options.lang, "--psm", String(options.psm)]);
  return result.stdout.replace(/\r\n/g, "\n").trimEnd() + "\n";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!Number.isFinite(options.dpi) || options.dpi < 100) {
    throw new Error("--dpi must be a number >= 100");
  }
  if (!Number.isFinite(options.psm) || options.psm < 0) {
    throw new Error("--psm must be a non-negative number");
  }

  const pdftoppmVersion = assertTool("pdftoppm", "Install Poppler, then ensure pdftoppm is on PATH.");
  const tesseractVersion = assertTool("tesseract", "Install Tesseract OCR, then ensure tesseract is on PATH.");
  if (!fs.existsSync(options.pdfDir)) {
    throw new Error("PDF directory does not exist: " + options.pdfDir);
  }

  ensureDir(options.outDir);
  ensureDir(path.join(options.outDir, "pages"));
  ensureDir(options.imageDir);

  let pdfs = fs.readdirSync(options.pdfDir).filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
  if (options.limit > 0) {
    pdfs = pdfs.slice(0, options.limit);
  }
  if (!pdfs.length) {
    throw new Error("No PDFs found in " + options.pdfDir);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    pdfDir: options.pdfDir,
    outDir: options.outDir,
    imageDir: options.imageDir,
    dpi: options.dpi,
    psm: options.psm,
    lang: options.lang,
    tools: { pdftoppm: pdftoppmVersion, tesseract: tesseractVersion },
    files: [],
    warnings: [],
  };

  for (const pdfName of pdfs) {
    const stem = safeStem(pdfName);
    const pdfPath = path.join(options.pdfDir, pdfName);
    const combinedTextPath = path.join(options.outDir, stem + ".txt");
    const pageTextDir = path.join(options.outDir, "pages", stem);
    if (!options.force && fs.existsSync(combinedTextPath)) {
      console.log("skip " + pdfName + " -> " + combinedTextPath);
      manifest.files.push({ pdf: pdfName, textFile: path.relative(options.outDir, combinedTextPath), skipped: true });
      continue;
    }

    ensureDir(pageTextDir);
    const imageBase = path.join(options.imageDir, stem, "page");
    const images = await renderPdf(pdfPath, imageBase, options);
    if (!images.length) {
      manifest.warnings.push(pdfName + ": pdftoppm produced no page images");
      continue;
    }

    const pageTexts = [];
    for (const image of images) {
      const page = pageNumber(path.basename(image));
      const text = await ocrImage(image, options);
      const pageTextPath = path.join(pageTextDir, "page-" + String(page).padStart(3, "0") + ".txt");
      fs.writeFileSync(pageTextPath, text);
      pageTexts.push({ page, image, text, textFile: pageTextPath });
    }

    const combined = pageTexts.map((item) => "\n-- " + stem + " page " + item.page + " --\n\n" + item.text).join("\n").trimStart();
    fs.writeFileSync(combinedTextPath, combined.endsWith("\n") ? combined : combined + "\n");
    manifest.files.push({
      pdf: pdfName,
      pages: pageTexts.length,
      textFile: path.relative(options.outDir, combinedTextPath),
      pageTextDir: path.relative(options.outDir, pageTextDir),
    });
    console.log("ocr " + pdfName + " -> " + combinedTextPath + " (" + pageTexts.length + " pages)");
  }

  fs.writeFileSync(path.join(options.outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("Wrote OCR manifest to " + path.join(options.outDir, "manifest.json"));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
