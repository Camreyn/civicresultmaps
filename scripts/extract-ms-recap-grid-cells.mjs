import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

const defaults = {
  imageDir: ".etl/ocr/ms-county-results-images",
  out: ".etl/ocr/ms-grid-cell-candidates.csv",
  tessdataDir: ".etl/ocr/tesseract-cache",
  limitCounties: 0,
  limitPages: 0,
  county: "",
};

const targetRows = [
  { key: "harris", contest: "President", candidate: "Kamala Harris", party: "Democrat", pattern: /kamala|harris/i },
  { key: "trump", contest: "President", candidate: "Donald Trump", party: "Republican", pattern: /donald|trump/i },
  { key: "pinkins", contest: "U.S. Senate", candidate: "Ty Pinkins", party: "Democrat", pattern: /pinkins/i },
  { key: "wicker", contest: "U.S. Senate", candidate: "Roger Wicker", party: "Republican", pattern: /wicker/i },
];

function usage() {
  console.log([
    "Usage: node scripts/extract-ms-recap-grid-cells.mjs [options]",
    "",
    "Extract review-gated candidate vote cells from rotated Mississippi county recap OCR images.",
    "Run npm run etl:ocr:ms first so rotated page images exist.",
    "",
    "Options:",
    "  --image-dir <dir>       OCR image directory. Default: " + defaults.imageDir,
    "  --out <file>            Candidate CSV output. Default: " + defaults.out,
    "  --tessdata-dir <dir>    tesseract.js traineddata cache. Default: " + defaults.tessdataDir,
    "  --county <name>         Process one county directory name.",
    "  --limit-counties <num>  Process only the first N county directories.",
    "  --limit-pages <num>     Process only the first N rotated page images per county.",
    "  --help                  Show this help.",
    "",
    "Output is intentionally review-gated. It is not imported into the app/database directly.",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--image-dir") options.imageDir = argv[++index];
    else if (arg === "--out") options.out = argv[++index];
    else if (arg === "--tessdata-dir") options.tessdataDir = argv[++index];
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

function pageNumber(fileName) {
  const match = fileName.match(/page-(\d+)(?:-rot\d+)?\.png$/i);
  return match ? Number(match[1]) : 0;
}

function rotationNumber(fileName) {
  const match = fileName.match(/-rot(\d+)\.png$/i);
  return match ? Number(match[1]) : null;
}

function pageStem(page) {
  return "page-" + String(page).padStart(3, "0");
}

function addUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function lineRuns({ data, width, height, axis, startA, endA, startB, endB, threshold, darkThreshold }) {
  const isDark = (value) => value < darkThreshold;
  const counts = [];
  for (let a = startA; a <= endA; a += 1) {
    let count = 0;
    for (let b = startB; b <= endB; b += 1) {
      const x = axis === "x" ? a : b;
      const y = axis === "x" ? b : a;
      if (x >= 0 && x < width && y >= 0 && y < height && isDark(data[y * width + x])) count += 1;
    }
    counts.push(count);
  }

  const runs = [];
  let start = null;
  for (let index = 0; index <= counts.length; index += 1) {
    if (index < counts.length && counts[index] >= threshold) {
      if (start == null) start = index;
    } else if (start != null) {
      const end = index - 1;
      runs.push({ start: startA + start, end: startA + end, mid: Math.round((startA + start + startA + end) / 2) });
      start = null;
    }
  }
  return runs;
}

function clusterMids(lines, gap = 8) {
  const clusters = [];
  let current = [];
  for (const line of lines) {
    if (!current.length || line.mid - current[current.length - 1].mid <= gap) {
      current.push(line);
    } else {
      clusters.push(Math.round(current.reduce((sum, item) => sum + item.mid, 0) / current.length));
      current = [line];
    }
  }
  if (current.length) clusters.push(Math.round(current.reduce((sum, item) => sum + item.mid, 0) / current.length));
  return clusters;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function trimFalseStartLines(lines) {
  const result = [...lines];
  while (result.length >= 4) {
    const gaps = result.slice(1).map((x, index) => x - result[index]);
    const typicalGap = median(gaps.slice(1));
    if (typicalGap > 0 && gaps[0] < typicalGap * 0.65) result.shift();
    else break;
  }
  return result;
}

function selectDataXLines(width, candidates, options = {}) {
  const minGap = options.minGap ?? 60;
  const filtered = candidates.filter((x) => x > width * 0.28).sort((a, b) => a - b);
  const coarse = [];
  for (const x of filtered) {
    if (!coarse.length || x - coarse[coarse.length - 1] >= minGap) coarse.push(x);
  }
  let best = [];
  for (let start = 0; start < coarse.length; start += 1) {
    const seq = [coarse[start]];
    for (let index = start + 1; index < coarse.length; index += 1) {
      const gap = coarse[index] - seq[seq.length - 1];
      if (gap >= minGap && gap <= 220) seq.push(coarse[index]);
      else if (gap > 220) break;
    }
    if (seq.length > best.length) best = seq;
  }
  const selected = best.length >= 3 ? best : coarse;
  return trimFalseStartLines(selected);
}

async function detectGrid(imagePath, mode = "strict") {
  const settings = mode === "lenient"
    ? { darkThreshold: 190, minGap: 45, verticalRatio: 0.1, horizontalRatio: 0.35 }
    : { darkThreshold: 150, minGap: 60, verticalRatio: 0.18, horizontalRatio: 0.45 };
  const { data, info } = await sharp(imagePath).greyscale().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const vStart = Math.round(height * 0.13);
  const vEnd = Math.round(height * 0.88);
  const hStart = 50;
  const hEnd = width - 50;
  const xLines = selectDataXLines(
    width,
    clusterMids(
      lineRuns({
        data,
        width,
        height,
        axis: "x",
        startA: 50,
        endA: width - 50,
        startB: vStart,
        endB: vEnd,
        threshold: Math.round((vEnd - vStart) * settings.verticalRatio),
        darkThreshold: settings.darkThreshold,
      }),
    ),
    { minGap: settings.minGap },
  );
  const yLines = clusterMids(
    lineRuns({
      data,
      width,
      height,
      axis: "y",
      startA: 50,
      endA: height - 50,
      startB: hStart,
      endB: hEnd,
      threshold: Math.round((hEnd - hStart) * settings.horizontalRatio),
      darkThreshold: settings.darkThreshold,
    }),
  );
  return { width, height, xLines, yLines };
}

function cleanText(text) {
  return text.replace(/\s+/g, " ").trim();
}

async function locateTargetRows(imagePath, grid, worker) {
  const rows = new Map();
  const dataStart = grid.xLines[0] ?? Math.round(grid.width * 0.32);
  for (let index = 0; index < grid.yLines.length - 1; index += 1) {
    const y1 = grid.yLines[index];
    const y2 = grid.yLines[index + 1];
    const height = y2 - y1;
    if (height < 35 || height > 150) continue;
    const rect = { left: 80, top: y1 + 2, width: Math.max(120, dataStart - 90), height: Math.max(10, height - 4) };
    const result = await worker.recognize(imagePath, { rectangle: rect });
    const text = cleanText(result.data.text);
    for (const target of targetRows) {
      if (!rows.has(target.key) && target.pattern.test(text)) {
        rows.set(target.key, { ...target, y1, y2, rowText: text });
      }
    }
  }
  return rows;
}

function numberRect(rowKey, columnIndex, x1, x2, y1, y2) {
  if ((rowKey === "pinkins" || rowKey === "wicker") && columnIndex === 0) {
    return { left: x1 + 30, top: y1, width: x2 - x1 - 28, height: y2 - y1 };
  }
  return { left: x1 + 4, top: y1 + 4, width: x2 - x1 - 8, height: y2 - y1 - 8 };
}

async function ocrNumber(imagePath, rect, worker) {
  const result = await worker.recognize(imagePath, { rectangle: rect });
  const raw = cleanText(result.data.text);
  const value = raw.replace(/\D/g, "");
  return { raw, value };
}

async function processPage({ county, imagePath, labelWorker, numberWorker, gridMode = "strict" }) {
  const grid = await detectGrid(imagePath, gridMode);
  const warnings = [];
  if (gridMode !== "strict") warnings.push("grid_" + gridMode);
  if (grid.xLines.length < 3) warnings.push("few_x_lines");
  if (grid.yLines.length < 4) warnings.push("few_y_lines");
  const rows = await locateTargetRows(imagePath, grid, labelWorker);
  for (const target of targetRows) {
    if (!rows.has(target.key)) warnings.push("missing_" + target.key);
  }

  const records = [];
  const columns = Math.max(0, grid.xLines.length - 1);
  for (const row of rows.values()) {
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const x1 = grid.xLines[columnIndex];
      const x2 = grid.xLines[columnIndex + 1];
      const rect = numberRect(row.key, columnIndex, x1, x2, row.y1, row.y2);
      const cell = await ocrNumber(imagePath, rect, numberWorker);
      records.push({
        county,
        page: pageNumber(path.basename(imagePath)),
        image: path.relative(process.cwd(), imagePath),
        columnIndex: columnIndex + 1,
        precinctLabel: "page " + pageNumber(path.basename(imagePath)) + " column " + (columnIndex + 1),
        contest: row.contest,
        candidate: row.candidate,
        party: row.party,
        value: cell.value,
        rawValue: cell.raw,
        rowText: row.rowText,
        x1,
        x2,
        y1: row.y1,
        y2: row.y2,
        warnings: warnings.join(";"),
      });
    }
  }
  return { records, warnings, grid };
}

function listCountyDirs(options) {
  if (!fs.existsSync(options.imageDir)) throw new Error("Image directory does not exist: " + options.imageDir);
  let dirs = fs.readdirSync(options.imageDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (options.county) dirs = dirs.filter((name) => name.toLowerCase() === options.county.toLowerCase());
  if (options.limitCounties > 0) dirs = dirs.slice(0, options.limitCounties);
  return dirs;
}

function imagePriority(fileName) {
  const rotation = rotationNumber(fileName);
  if (rotation === 270) return 0;
  if (rotation === 90) return 1;
  if (rotation === 0) return 2;
  if (rotation === 180) return 3;
  return 4;
}

function listCountyPageEntries(countyDir) {
  const groups = new Map();
  for (const name of fs.readdirSync(countyDir).filter((item) => /page-\d+-rot\d+\.png$/i.test(item))) {
    const page = pageNumber(name);
    if (!groups.has(page)) groups.set(page, []);
    groups.get(page).push(name);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, images]) => ({ page, images: images.sort((a, b) => imagePriority(a) - imagePriority(b) || a.localeCompare(b)) }));
}

async function ensureRotatedVariant(countyDir, page, rotation) {
  const original = path.join(countyDir, pageStem(page) + ".png");
  if (!fs.existsSync(original)) return null;
  const rotated = path.join(countyDir, pageStem(page) + "-rot" + rotation + ".png");
  if (!fs.existsSync(rotated)) await sharp(original).rotate(rotation).toFile(rotated);
  return rotated;
}

function missesEveryTarget(result) {
  return targetRows.every((target) => result.warnings.includes("missing_" + target.key));
}

function extractionScore(result) {
  const missing = result.warnings.filter((warning) => warning.startsWith("missing_")).length;
  const fewLines = result.warnings.filter((warning) => warning.startsWith("few_")).length;
  const numericCells = result.records.filter((record) => record.value).length;
  return result.records.length * 10 + numericCells - missing * 5 - fewLines * 2;
}

async function processBestPage({ county, countyDir, entry, labelWorker, numberWorker }) {
  const candidates = [];
  for (const image of entry.images) addUnique(candidates, path.join(countyDir, image));

  let best = null;
  let triedFallback = false;
  for (let index = 0; index < candidates.length; index += 1) {
    const imagePath = candidates[index];
    const result = await processPage({ county, imagePath, labelWorker, numberWorker });
    const scored = { imagePath, result, score: extractionScore(result) };
    if (!best || scored.score > best.score) best = scored;

    const shouldTryFallback = result.records.length === 0 && missesEveryTarget(result);
    if (!shouldTryFallback) break;

    const lenientResult = await processPage({ county, imagePath, labelWorker, numberWorker, gridMode: "lenient" });
    const lenientScored = { imagePath, result: lenientResult, score: extractionScore(lenientResult) };
    if (!best || lenientScored.score > best.score) best = lenientScored;
    if (lenientResult.records.length > 0 && !missesEveryTarget(lenientResult)) break;

    if (!triedFallback) {
      triedFallback = true;
      for (const rotation of [90, 270]) addUnique(candidates, await ensureRotatedVariant(countyDir, entry.page, rotation));
    }
  }

  return { ...best.result, imagePath: best.imagePath };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!Number.isFinite(options.limitCounties) || options.limitCounties < 0) throw new Error("--limit-counties must be a non-negative number");
  if (!Number.isFinite(options.limitPages) || options.limitPages < 0) throw new Error("--limit-pages must be a non-negative number");

  const labelWorker = await createWorker("eng", 1, { cachePath: options.tessdataDir });
  await labelWorker.setParameters({ tessedit_pageseg_mode: "6" });
  const numberWorker = await createWorker("eng", 1, { cachePath: options.tessdataDir });
  await numberWorker.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789" });

  const records = [];
  const summaries = [];
  try {
    for (const county of listCountyDirs(options)) {
      const countyDir = path.join(options.imageDir, county);
      let entries = listCountyPageEntries(countyDir);
      if (options.limitPages > 0) entries = entries.slice(0, options.limitPages);
      for (const entry of entries) {
        const result = await processBestPage({ county, countyDir, entry, labelWorker, numberWorker });
        records.push(...result.records);
        const image = path.basename(result.imagePath);
        summaries.push({ county, page: entry.page, image, rows: result.records.length, warnings: result.warnings, columns: Math.max(0, result.grid.xLines.length - 1) });
        console.log("extract " + county + " " + image + " -> " + result.records.length + " cells" + (result.warnings.length ? " [" + result.warnings.join(",") + "]" : ""));
      }
    }
  } finally {
    await labelWorker.terminate();
    await numberWorker.terminate();
  }

  ensureDir(path.dirname(options.out));
  const header = ["county", "page", "image", "columnIndex", "precinctLabel", "contest", "candidate", "party", "value", "rawValue", "rowText", "x1", "x2", "y1", "y2", "warnings"];
  const lines = [header.join(",")];
  for (const record of records) {
    lines.push(header.map((key) => csv(record[key])).join(","));
  }
  fs.writeFileSync(options.out, lines.join("\n") + "\n");
  fs.writeFileSync(options.out.replace(/\.csv$/i, ".manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), options, summaries }, null, 2) + "\n");
  console.log("Wrote " + records.length + " candidate cells to " + options.out);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
