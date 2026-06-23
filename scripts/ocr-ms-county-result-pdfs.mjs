import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PDFParse } from "pdf-parse";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

const defaults = {
  pdfDir: "data/ms-2024-county-results-pdfs",
  outDir: "data/ms-2024-county-results-ocr-text",
  imageDir: ".etl/ocr/ms-county-results-images",
  tessdataDir: ".etl/ocr/tesseract-cache",
  engine: "tesseractjs",
  renderer: "pdf-parse",
  scale: 3,
  rotate: 270,
  dpi: 300,
  psm: 4,
  lang: "eng",
  force: false,
  limit: 0,
  county: "",
  exactCounty: false,
  firstPages: 0,
  keepImages: true,
};

function usage() {
  console.log([
    "Usage: node scripts/ocr-ms-county-result-pdfs.mjs [options]",
    "",
    "OCR the official Mississippi 2024 county result PDFs into per-page text files.",
    "This is an ETL preparation step only; it is not part of the Next.js site runtime.",
    "",
    "Default mode is pure Node:",
    "  pdf-parse renders PDF pages to PNG, then tesseract.js OCRs those PNGs.",
    "",
    "Optional external mode requires tools on PATH:",
    "  --renderer external  requires pdftoppm (Poppler)",
    "  --engine external    requires tesseract",
    "",
    "Options:",
    "  --pdf-dir <dir>       Source PDF directory. Default: " + defaults.pdfDir,
    "  --out-dir <dir>       OCR text output directory. Default: " + defaults.outDir,
    "  --image-dir <dir>     Rendered PNG directory. Default: " + defaults.imageDir,
    "  --tessdata-dir <dir>  tesseract.js traineddata cache. Default: " + defaults.tessdataDir,
    "  --engine <name>       tesseractjs or external. Default: " + defaults.engine,
    "  --renderer <name>     pdf-parse or external. Default: " + defaults.renderer,
    "  --scale <number>      pdf-parse render scale. Default: " + defaults.scale,
    "  --rotate <degrees>    Rotate rendered page before OCR; use 0, 90, 180, or 270. Default: " + defaults.rotate,
    "  --dpi <number>        External pdftoppm DPI. Default: " + defaults.dpi,
    "  --psm <number>        Tesseract page segmentation mode. Default: " + defaults.psm,
    "  --lang <code>         OCR language. Default: " + defaults.lang,
    "  --limit <number>      Process only the first N PDFs, for sampling.",
    "  --county <name>       Process one PDF whose sanitized stem matches this county name.",
    "  --exact-county        Match --county against the sanitized PDF stem only.",
    "  --first-pages <num>   Process only the first N pages of each PDF, for sampling.",
    "  --force               Re-render/re-OCR even when output text exists.",
    "  --no-keep-images      Delete rendered page PNGs after OCR.",
    "  --help                Show this help.",
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
    } else if (arg === "--no-keep-images") {
      options.keepImages = false;
    } else if (arg === "--pdf-dir") {
      options.pdfDir = argv[++index];
    } else if (arg === "--out-dir") {
      options.outDir = argv[++index];
    } else if (arg === "--image-dir") {
      options.imageDir = argv[++index];
    } else if (arg === "--tessdata-dir") {
      options.tessdataDir = argv[++index];
    } else if (arg === "--engine") {
      options.engine = argv[++index];
    } else if (arg === "--renderer") {
      options.renderer = argv[++index];
    } else if (arg === "--scale") {
      options.scale = Number(argv[++index]);
    } else if (arg === "--rotate") {
      options.rotate = Number(argv[++index]);
    } else if (arg === "--dpi") {
      options.dpi = Number(argv[++index]);
    } else if (arg === "--psm") {
      options.psm = Number(argv[++index]);
    } else if (arg === "--lang") {
      options.lang = argv[++index];
    } else if (arg === "--limit") {
      options.limit = Number(argv[++index]);
    } else if (arg === "--county") {
      options.county = argv[++index];
    } else if (arg === "--exact-county") {
      options.exactCounty = true;
    } else if (arg === "--first-pages") {
      options.firstPages = Number(argv[++index]);
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

function canonicalCountyName(value) {
  return String(value ?? "").replace(/\s+Updated$/i, "").trim();
}

function pageNumber(fileName) {
  const match = fileName.match(/-(\d+)\.png$/i);
  return match ? Number(match[1]) : 0;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanRenderedImages(parent, baseName) {
  if (!fs.existsSync(parent)) return;
  for (const existing of fs.readdirSync(parent).filter((name) => name.startsWith(baseName + "-") && name.endsWith(".png"))) {
    fs.rmSync(path.join(parent, existing), { force: true });
  }
}

async function renderPdfExternal(pdfPath, imageBase, options) {
  const parent = path.dirname(imageBase);
  ensureDir(parent);
  cleanRenderedImages(parent, path.basename(imageBase));
  const args = ["-r", String(options.dpi), "-png"];
  if (options.firstPages > 0) {
    args.push("-f", "1", "-l", String(options.firstPages));
  }
  args.push(pdfPath, imageBase);
  await run("pdftoppm", args);
  return fs
    .readdirSync(parent)
    .filter((name) => name.startsWith(path.basename(imageBase) + "-") && name.endsWith(".png"))
    .sort((a, b) => pageNumber(a) - pageNumber(b))
    .map((name) => ({ page: pageNumber(name), imagePath: path.join(parent, name) }));
}

async function renderPdfWithPdfParse(pdfPath, imageBase, options) {
  const parent = path.dirname(imageBase);
  ensureDir(parent);
  cleanRenderedImages(parent, path.basename(imageBase));
  const data = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data });
  const params = { scale: options.scale, imageDataUrl: false, imageBuffer: true };
  if (options.firstPages > 0) {
    params.first = options.firstPages;
  }
  const result = await parser.getScreenshot(params);
  await parser.destroy();
  const images = [];
  for (const page of result.pages) {
    const pageNumberValue = page.pageNumber ?? images.length + 1;
    const imagePath = imageBase + "-" + String(pageNumberValue).padStart(3, "0") + ".png";
    fs.writeFileSync(imagePath, page.data);
    images.push({ page: pageNumberValue, imagePath, width: page.width, height: page.height, scale: page.scale });
  }
  return images;
}

async function ocrImageExternal(imagePath, options) {
  const result = await run("tesseract", [imagePath, "stdout", "-l", options.lang, "--psm", String(options.psm)]);
  return result.stdout.replace(/\r\n/g, "\n").trimEnd() + "\n";
}

async function createOcr(options) {
  if (options.engine === "external") {
    return {
      tools: { tesseract: assertTool("tesseract", "Install Tesseract OCR, then ensure tesseract is on PATH.") },
      recognize: (imagePath) => ocrImageExternal(imagePath, options),
      close: async () => {},
    };
  }
  if (options.engine !== "tesseractjs") {
    throw new Error("--engine must be tesseractjs or external");
  }
  ensureDir(options.tessdataDir);
  const worker = await createWorker(options.lang, 1, { cachePath: options.tessdataDir });
  await worker.setParameters({ tessedit_pageseg_mode: String(options.psm) });
  return {
    tools: { tesseractjs: "tesseract.js" },
    recognize: async (imagePath) => {
      const result = await worker.recognize(imagePath);
      return result.data.text.replace(/\r\n/g, "\n").trimEnd() + "\n";
    },
    close: async () => worker.terminate(),
  };
}

async function renderPdf(pdfPath, imageBase, options) {
  if (options.renderer === "external") {
    return renderPdfExternal(pdfPath, imageBase, options);
  }
  if (options.renderer === "pdf-parse") {
    return renderPdfWithPdfParse(pdfPath, imageBase, options);
  }
  throw new Error("--renderer must be pdf-parse or external");
}

function normalizeRotation(rotation) {
  return ((rotation % 360) + 360) % 360;
}

async function preprocessImageForOcr(image, options) {
  const rotate = normalizeRotation(options.rotate);
  if (rotate === 0) {
    return { ...image, sourceImagePath: image.imagePath, rotation: 0 };
  }
  const parsed = path.parse(image.imagePath);
  const rotatedPath = path.join(parsed.dir, parsed.name + "-rot" + rotate + parsed.ext);
  await sharp(image.imagePath).rotate(rotate).toFile(rotatedPath);
  const metadata = await sharp(rotatedPath).metadata();
  return {
    ...image,
    sourceImagePath: image.imagePath,
    imagePath: rotatedPath,
    rotation: rotate,
    width: metadata.width ?? image.width,
    height: metadata.height ?? image.height,
  };
}

function validateOptions(options) {
  if (!Number.isFinite(options.scale) || options.scale <= 0) throw new Error("--scale must be a positive number");
  if (!Number.isFinite(options.rotate) || ![0, 90, 180, 270].includes(normalizeRotation(options.rotate))) throw new Error("--rotate must be 0, 90, 180, or 270");
  if (!Number.isFinite(options.dpi) || options.dpi < 100) throw new Error("--dpi must be a number >= 100");
  if (!Number.isFinite(options.psm) || options.psm < 0) throw new Error("--psm must be a non-negative number");
  if (!Number.isFinite(options.limit) || options.limit < 0) throw new Error("--limit must be a non-negative number");
  if (!Number.isFinite(options.firstPages) || options.firstPages < 0) throw new Error("--first-pages must be a non-negative number");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  validateOptions(options);
  if (!fs.existsSync(options.pdfDir)) {
    throw new Error("PDF directory does not exist: " + options.pdfDir);
  }

  const rendererTools = {};
  if (options.renderer === "external") {
    rendererTools.pdftoppm = assertTool("pdftoppm", "Install Poppler, then ensure pdftoppm is on PATH.");
  } else if (options.renderer === "pdf-parse") {
    rendererTools.pdfParse = "pdf-parse";
  }

  ensureDir(options.outDir);
  ensureDir(path.join(options.outDir, "pages"));
  ensureDir(options.imageDir);

  let pdfs = fs.readdirSync(options.pdfDir).filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
  if (options.county) {
    pdfs = pdfs.filter((name) => {
      const stem = safeStem(name).toLowerCase();
      const county = options.county.toLowerCase();
      if (stem === county) return true;
      const canonical = canonicalCountyName(safeStem(name)).toLowerCase();
      return !options.exactCounty && canonical === county;
    });
  }
  if (options.limit > 0) {
    pdfs = pdfs.slice(0, options.limit);
  }
  if (!pdfs.length) {
    throw new Error("No PDFs found in " + options.pdfDir);
  }

  const ocr = await createOcr(options);
  const manifest = {
    generatedAt: new Date().toISOString(),
    pdfDir: options.pdfDir,
    outDir: options.outDir,
    imageDir: options.imageDir,
    tessdataDir: options.tessdataDir,
    engine: options.engine,
    renderer: options.renderer,
    scale: options.scale,
    rotate: normalizeRotation(options.rotate),
    dpi: options.dpi,
    psm: options.psm,
    lang: options.lang,
    firstPages: options.firstPages,
    tools: { ...rendererTools, ...ocr.tools },
    files: [],
    warnings: [],
  };

  try {
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
        manifest.warnings.push(pdfName + ": renderer produced no page images");
        continue;
      }

      const ocrImages = [];
      for (const image of images) {
        ocrImages.push(await preprocessImageForOcr(image, options));
      }

      const pageTexts = [];
      for (const image of ocrImages) {
        const text = await ocr.recognize(image.imagePath);
        const pageTextPath = path.join(pageTextDir, "page-" + String(image.page).padStart(3, "0") + ".txt");
        fs.writeFileSync(pageTextPath, text);
        pageTexts.push({ ...image, text, textFile: pageTextPath });
        if (!options.keepImages) {
          fs.rmSync(image.imagePath, { force: true });
          if (image.sourceImagePath && image.sourceImagePath !== image.imagePath) {
            fs.rmSync(image.sourceImagePath, { force: true });
          }
        }
      }

      const combined = pageTexts.map((item) => "\n-- " + stem + " page " + item.page + " --\n\n" + item.text).join("\n").trimStart();
      fs.writeFileSync(combinedTextPath, combined.endsWith("\n") ? combined : combined + "\n");
      manifest.files.push({
        pdf: pdfName,
        pages: pageTexts.length,
        textFile: path.relative(options.outDir, combinedTextPath),
        pageTextDir: path.relative(options.outDir, pageTextDir),
        images: options.keepImages ? pageTexts.map((item) => path.relative(options.imageDir, item.imagePath)) : [],
        sourceImages: options.keepImages
          ? pageTexts
              .filter((item) => item.sourceImagePath && item.sourceImagePath !== item.imagePath)
              .map((item) => path.relative(options.imageDir, item.sourceImagePath))
          : [],
      });
      console.log("ocr " + pdfName + " -> " + combinedTextPath + " (" + pageTexts.length + " pages)");
    }
  } finally {
    await ocr.close();
  }

  fs.writeFileSync(path.join(options.outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("Wrote OCR manifest to " + path.join(options.outDir, "manifest.json"));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
