import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { PDFParse } from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(repoRoot, ".etl", "ny-local-review-sources");
const outputPath = path.join(repoRoot, "data", "ny-2024-local-review.csv");
const manifestPath = path.join(repoRoot, "data", "ny-2024-local-review-sources.json");
const apiUrl = "https://api.github.com/repos/openelections/openelections-sources-ny/contents/2024/general";
const legacyNyUrl = "https://raw.githubusercontent.com/Camreyn/wisconsin-2024-election-mapper/main/data/ny-app-data.js";

const skipped = new Set(["Rockland (president only).xlsx", "Suffolk.txt", "Suffolk key.pdf"]);
const supportedPdfFiles = new Set(["Chemung.pdf", "Columbia.pdf", "Fulton.pdf", "Seneca.pdf", "Tompkins.pdf"]);
const supportedExtensions = new Set([".csv", ".xlsx", ".html", ".pdf"]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function get(url, binary = false) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "CivicResultMaps ETL" } }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          resolve(get(response.headers.location, binary));
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`GET ${url} failed with ${response.statusCode}`));
          response.resume();
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const buffer = Buffer.concat(chunks);
          resolve(binary ? buffer : buffer.toString("utf8"));
        });
      })
      .on("error", reject);
  });
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function intValue(value) {
  const text = cleanText(value).replace(/[$,%]/g, "").replace(/,/g, "");
  if (!text || text === "-" || /^total$/i.test(text)) return 0;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTotalRow(label) {
  return /^total\b/i.test(cleanText(label));
}

function isDataRow(row) {
  const label = cleanText(row[0]);
  if (!label || isTotalRow(label) || /^2024$/.test(label)) return false;
  return row.slice(1).some((value) => intValue(value) > 0);
}

function classifyColumn(header, office) {
  const text = cleanText(header).toLowerCase();
  if (!text || /blank|void|over ?votes|under ?votes|scattering|total/.test(text)) return "";
  if (office === "president") {
    if (text.includes("harris")) return "dem";
    if (text.includes("trump")) return "rep";
  } else {
    if (text.includes("gillibrand") || text.includes("kirsten") || text.includes("kristen")) return "dem";
    if (text.includes("sapraicone") || text.includes("michael d.")) return "rep";
  }
  if (/write|sare|larouche|de la cruz|stein|oliver|ayyadurai|sonski|west|scollin|garrity|hubbard|mcneil|mc neil|o'donnell|potus/.test(text)) return "other";
  return "";
}

function valuesFromRow(row, header, office) {
  const values = { dem: 0, rep: 0, other: 0 };
  header.forEach((column, index) => {
    const bucket = classifyColumn(column, office);
    if (bucket) values[bucket] += intValue(row[index]);
  });
  return values;
}

function completeRowsFromPending(pending) {
  return [...pending.values()].filter((entry) => entry.pres_total && (entry.comparison_dem || entry.comparison_rep || entry.comparison_other));
}

function rowsFromSheetRows(rows, county) {
  let currentOffice = "";
  let header = null;
  const pending = new Map();

  for (const rawRow of rows) {
    const row = rawRow.map((value) => cleanText(value));
    const first = row[0] || "";
    const rowText = row.join(" ").toLowerCase();
    if (/harris/.test(rowText) && /trump/.test(rowText)) {
      currentOffice = "president";
      header = row;
      continue;
    }
    if (/gillibrand|sapraicone/.test(rowText)) {
      currentOffice = "senate";
      header = row;
      continue;
    }
    if (/presidential electors|electors for president|president and vice president/.test(rowText) || (/president/.test(rowText) && /harris|trump/.test(rowText))) {
      currentOffice = "president";
      header = row;
      continue;
    }
    if (/united states senator|u\.s\. senator/.test(rowText)) {
      currentOffice = "senate";
      header = row;
      continue;
    }
    if (/^(election district|ed|precinct)$/i.test(first)) {
      header = row;
      continue;
    }
    if (!currentOffice || !header || !isDataRow(row)) continue;

    const localUnit = cleanText(row[0]);
    const values = valuesFromRow(row, header, currentOffice);
    if (!values.dem && !values.rep) continue;
    const key = localUnit.toUpperCase();
    const entry = pending.get(key) ?? { county, local_unit: localUnit };
    if (currentOffice === "president") {
      entry.pres_harris = values.dem;
      entry.pres_trump = values.rep;
      entry.pres_other = values.other;
      entry.pres_total = values.dem + values.rep + values.other;
    } else {
      entry.comparison_dem = values.dem;
      entry.comparison_rep = values.rep;
      entry.comparison_other = values.other;
    }
    pending.set(key, entry);
  }

  return completeRowsFromPending(pending);
}

function longFormatRows(rows, county) {
  const headerIndex = rows.findIndex((row) => {
    const cells = row.map(cleanText).map((cell) => cell.toLowerCase());
    const hasOfficeShape = cells.includes("office name") && cells.includes("election district") && cells.includes("ballot name");
    const hasContestShape = cells.includes("contest") && (cells.includes("district name") || cells.includes("precinct")) && (cells.includes("candidate issue") || cells.includes("candidate"));
    return hasOfficeShape || hasContestShape;
  });
  if (headerIndex < 0) return [];
  const header = rows[headerIndex].map(cleanText);
  const index = Object.fromEntries(header.map((name, i) => [name.toLowerCase(), i]));
  const officeKey = index["office name"] !== undefined ? "office name" : "contest";
  const localKey = index["election district"] !== undefined ? "election district" : (index["district name"] !== undefined ? "district name" : "precinct");
  const ballotKey = index["ballot name"] !== undefined ? "ballot name" : (index["candidate issue"] !== undefined ? "candidate issue" : "candidate");
  const totalKey = index.total !== undefined ? "total" : (index["total votes"] !== undefined ? "total votes" : "votes cast");
  const pending = new Map();

  for (const rawRow of rows.slice(headerIndex + 1)) {
    const row = rawRow.map(cleanText);
    const localUnit = row[index[localKey]] || "";
    const office = (row[index[officeKey]] || "").toLowerCase();
    const ballotName = (row[index[ballotKey]] || "").toLowerCase();
    const party = (row[index.party] || "").toLowerCase();
    const total = intValue(row[index[totalKey]]);
    if (!localUnit || !total || /ballots cast|over vote|under vote|blank|void/.test(ballotName)) continue;
    const isPresident = /president/.test(office);
    const isSenate = /united states senator/.test(office);
    if (!isPresident && !isSenate) continue;

    let bucket = "other";
    if (isPresident) {
      if (/harris/.test(ballotName) || /democratic|working families/.test(party)) bucket = "dem";
      else if (/trump/.test(ballotName) || /republican|conservative/.test(party)) bucket = "rep";
    } else {
      if (/gillibrand|kirsten|kristen/.test(ballotName) || /democratic|working families/.test(party)) bucket = "dem";
      else if (/sapraicone/.test(ballotName) || /republican|conservative/.test(party)) bucket = "rep";
    }

    const key = localUnit.toUpperCase();
    const entry = pending.get(key) ?? { county, local_unit: localUnit, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
    if (isPresident) {
      if (bucket === "dem") entry.pres_harris += total;
      else if (bucket === "rep") entry.pres_trump += total;
      else entry.pres_other += total;
      entry.pres_total += total;
    } else {
      if (bucket === "dem") entry.comparison_dem += total;
      else if (bucket === "rep") entry.comparison_rep += total;
      else entry.comparison_other += total;
    }
    pending.set(key, entry);
  }

  return completeRowsFromPending(pending);
}

function reportWorkbookRows(rows, county) {
  const pending = new Map();
  let localUnit = "";
  let currentOffice = "";

  for (const rawRow of rows) {
    const cells = rawRow.map((value) => cleanText(value));
    const first = cells[0] || "";
    const rowText = cells.join(" ").toLowerCase();

    if (/^\d{4}\s+\S+/.test(first)) {
      localUnit = first;
      currentOffice = "";
      if (!pending.has(localUnit.toUpperCase())) {
        pending.set(localUnit.toUpperCase(), { county, local_unit: localUnit, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 });
      }
      continue;
    }
    if (/electors for president and vice president/.test(rowText)) {
      currentOffice = "president";
      continue;
    }
    if (/^united states senator$/.test(rowText) || /united states senator -/.test(rowText)) {
      currentOffice = "senate";
      continue;
    }
    if (!localUnit || !currentOffice || !first || /over votes|under votes|write-in|total write-in|undervote|overvote/i.test(first)) continue;

    const match = first.match(/^(.*?)\s+(?:\.\s*){2,}([\d,]+)\s+(?:\d+\.\d+|\.\d+)/);
    if (!match) continue;
    const candidate = cleanText(match[1]).toLowerCase();
    const votes = intValue(match[2]);
    if (!votes) continue;

    const entry = pending.get(localUnit.toUpperCase());
    let bucket = "other";
    if (currentOffice === "president") {
      if (/harris/.test(candidate)) bucket = "dem";
      else if (/trump/.test(candidate)) bucket = "rep";
      if (bucket === "dem") entry.pres_harris += votes;
      else if (bucket === "rep") entry.pres_trump += votes;
      else entry.pres_other += votes;
      entry.pres_total += votes;
    } else {
      if (/gillibrand/.test(candidate)) bucket = "dem";
      else if (/sapraicone|sparaicone/.test(candidate)) bucket = "rep";
      if (bucket === "dem") entry.comparison_dem += votes;
      else if (bucket === "rep") entry.comparison_rep += votes;
      else entry.comparison_other += votes;
    }
  }

  return completeRowsFromPending(pending);
}

function otsegoWorkbookRows(workbook, county) {
  const pending = new Map();
  for (const sheetName of workbook.SheetNames.filter((name) => name !== "Document map")) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, blankrows: false });
    const precinctRow = rows.find((row) => cleanText(row[0]) && /ballots cast/i.test(cleanText(row[17])));
    const localUnit = cleanText(precinctRow?.[0]);
    if (!localUnit) continue;
    const entry = { county, local_unit: localUnit, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
    let currentOffice = "";
    for (const rawRow of rows) {
      const row = rawRow.map((value) => cleanText(value));
      const first = row[0] || "";
      const rowText = row.join(" ").toLowerCase();
      if (/electors for president and vice president/.test(rowText)) {
        currentOffice = "president";
        continue;
      }
      if (/united states senator/.test(rowText)) {
        currentOffice = "senate";
        continue;
      }
      if (!currentOffice || !first) continue;
      const votes = intValue(row[20]);
      if (!votes) continue;
      if (currentOffice === "president") {
        if (/harris/i.test(first)) entry.pres_harris += votes;
        else if (/trump/i.test(first)) entry.pres_trump += votes;
        else entry.pres_other += votes;
        entry.pres_total += votes;
      } else {
        if (/gillibrand/i.test(first)) entry.comparison_dem += votes;
        else if (/sapraicone|sparaicone/i.test(first)) entry.comparison_rep += votes;
        else entry.comparison_other += votes;
      }
    }
    pending.set(localUnit.toUpperCase(), entry);
  }
  return completeRowsFromPending(pending);
}
function workbookRows(filePath, county) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const allRows = workbook.SheetNames.flatMap((name) => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, blankrows: false }));
  const reportRows = reportWorkbookRows(allRows, county);
  if (reportRows.length) return reportRows;
  if (workbook.SheetNames.includes("Document map")) {
    const otsegoRows = otsegoWorkbookRows(workbook, county);
    if (otsegoRows.length) return otsegoRows;
  }
  const longRows = longFormatRows(allRows, county);
  if (longRows.length) return longRows;
  const presidentSheet = workbook.SheetNames.find((name) => /president|u\.s\. president/i.test(name));
  const senateSheet = workbook.SheetNames.find((name) => /senator|u\.s\. senator/i.test(name));
  if (presidentSheet && senateSheet) {
    const rows = [presidentSheet, senateSheet].flatMap((sheetName) => XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, blankrows: false }));
    return rowsFromSheetRows(rows, county);
  }
  return rowsFromSheetRows(allRows, county);
}

function htmlRows(filePath, county) {
  const html = fs.readFileSync(filePath, "utf8");
  const tables = [];
  const re = /<table[\s\S]*?<\/table>/gi;
  let match;
  let previousIndex = 0;
  while ((match = re.exec(html))) {
    const tableHtml = match[0];
    const context = cleanText(html.slice(previousIndex, match.index));
    previousIndex = re.lastIndex;
    if (/counting group:\s*(election day|early voting|absentee)/i.test(context)) continue;
    const contextAndTable = `${context} ${cleanText(tableHtml)}`;
    const office = /president/i.test(contextAndTable) ? "president" : (/united states senator|gillibrand|sapraicone/i.test(contextAndTable) ? "senate" : "");
    if (!office) continue;
    const cellsByRow = [...tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((rowMatch) =>
      [...rowMatch[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => cleanText(cell[1])),
    );
    if (!cellsByRow.length) continue;
    tables.push({ office, header: cellsByRow[0], rows: cellsByRow.slice(1).filter(isDataRow) });
  }

  const pending = new Map();
  for (const table of tables) {
    for (const row of table.rows) {
      const key = cleanText(row[0]).toUpperCase();
      const entry = pending.get(key) ?? { county, local_unit: cleanText(row[0]) };
      const values = valuesFromRow(row, table.header, table.office);
      if (!values.dem && !values.rep) continue;
      if (table.office === "president") {
        entry.pres_harris = values.dem;
        entry.pres_trump = values.rep;
        entry.pres_other = values.other;
        entry.pres_total = values.dem + values.rep + values.other;
      } else {
        entry.comparison_dem = values.dem;
        entry.comparison_rep = values.rep;
        entry.comparison_other = values.other;
      }
      pending.set(key, entry);
    }
  }
  return completeRowsFromPending(pending);
}

function isPotentialContestHeader(line) {
  return /representative|state senator|supreme court|county court|district attorney|proposal|proposition|member of assembly|family court|surrogate|city court/i.test(line);
}

function trailingNumberParse(line, office) {
  const matches = [...line.matchAll(/\d[\d,]*/g)];
  const candidates = [];
  for (const width of [10, 9, 8]) {
    if (matches.length < width) continue;
    const selected = matches.slice(-width);
    const nums = selected.map((match) => intValue(match[0]));
    const label = cleanText(line.slice(0, selected[0].index));
    if (!label || /^contest total|^total\b|^grand total|^town\/city total/i.test(label)) continue;
    const candidateCount = office === "president" ? (width >= 10 ? 6 : 5) : 6;
    if (nums.length <= candidateCount) continue;
    const candidateSum = nums.slice(0, candidateCount).reduce((sum, value) => sum + value, 0);
    const total = nums[nums.length - 1];
    const withUnderOver = candidateSum + (nums[candidateCount] ?? 0) + (nums[candidateCount + 1] ?? 0);
    const score = Math.min(Math.abs(candidateSum - total), Math.abs(withUnderOver - total));
    if (candidateSum > 0 && total > 0 && score <= Math.max(3, total * 0.02)) {
      candidates.push({ label, nums, candidateCount, score });
    }
  }
  candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const aPref = /LD:/i.test(a.label) ? -a.nums.length : a.nums.length;
    const bPref = /LD:/i.test(b.label) ? -b.nums.length : b.nums.length;
    return aPref - bPref;
  });
  return candidates[0] ?? null;
}

function pdfTextRows(text, county) {
  const pending = new Map();
  let currentOffice = "";
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = cleanText(rawLine);
    if (!line || /^-- \d+ of \d+ --$/.test(line) || /^page \d+/i.test(line)) continue;
    if (/^(president of the united states|president and vice president|electors for president)/i.test(line)) {
      currentOffice = "president";
      continue;
    }
    if (/^(us senate|united states senator)$/i.test(line)) {
      currentOffice = "senate";
      continue;
    }
    if (currentOffice && isPotentialContestHeader(line)) {
      currentOffice = "";
      continue;
    }
    if (!currentOffice) continue;

    const parsed = trailingNumberParse(line, currentOffice);
    if (!parsed) continue;
    const key = parsed.label.toUpperCase();
    const entry = pending.get(key) ?? { county, local_unit: parsed.label, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
    if (currentOffice === "president") {
      const other = parsed.nums.slice(4, parsed.candidateCount).reduce((sum, value) => sum + value, 0);
      entry.pres_harris = parsed.nums[0] + parsed.nums[1];
      entry.pres_trump = parsed.nums[2] + parsed.nums[3];
      entry.pres_other = other;
      entry.pres_total = entry.pres_harris + entry.pres_trump + entry.pres_other;
    } else {
      const other = parsed.nums.slice(4, parsed.candidateCount).reduce((sum, value) => sum + value, 0);
      entry.comparison_dem = parsed.nums[0] + parsed.nums[1];
      entry.comparison_rep = parsed.nums[2] + parsed.nums[3];
      entry.comparison_other = other;
    }
    pending.set(key, entry);
  }
  return completeRowsFromPending(pending);
}

function candidateOnlyPdfRows(text, county) {
  const pending = new Map();
  let currentOffice = "";
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = cleanText(rawLine);
    if (!line || /^-- \d+ of \d+ --$/.test(line) || /^total\b/i.test(line)) continue;
    if (/presidential electors|president and vice president/i.test(line)) {
      currentOffice = "president";
      continue;
    }
    if (/^united states senator/i.test(line)) {
      currentOffice = "senate";
      continue;
    }
    if (!currentOffice) continue;
    const matches = [...line.matchAll(/\d[\d,]*/g)];
    const width = currentOffice === "president" ? 5 : 6;
    if (matches.length < width) continue;
    const selected = matches.slice(-width);
    const label = cleanText(line.slice(0, selected[0].index));
    if (!label || /^(precinct|kamala|donald|kirsten|michael|diane|write|and tim|jd vance)/i.test(label)) continue;
    const nums = selected.map((match) => intValue(match[0]));
    const key = label.toUpperCase();
    const entry = pending.get(key) ?? { county, local_unit: label, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
    if (currentOffice === "president") {
      entry.pres_harris = nums[0] + nums[1];
      entry.pres_trump = nums[2] + nums[3];
      entry.pres_other = nums[4];
      entry.pres_total = entry.pres_harris + entry.pres_trump + entry.pres_other;
    } else {
      entry.comparison_dem = nums[0] + nums[1];
      entry.comparison_rep = nums[2] + nums[3];
      entry.comparison_other = nums[4] + nums[5];
    }
    pending.set(key, entry);
  }
  return completeRowsFromPending(pending);
}

async function pdfRows(filePath, county) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const result = await parser.getText();
    if (county === "Fulton County" || county === "Seneca County") return candidateOnlyPdfRows(result.text, county);
    return pdfTextRows(result.text, county);
  } finally {
    await parser.destroy();
  }
}

function countyName(fileName) {
  return `${fileName.replace(/\.[^.]+$/i, "").replace(/\s+\(.+\)$/i, "")} County`;
}

async function main() {
  ensureDir(sourceDir);
  const listing = JSON.parse(await get(apiUrl));
  const selected = listing.filter((file) => {
    const ext = path.extname(file.name).toLowerCase();
    if (!supportedExtensions.has(ext) || skipped.has(file.name)) return false;
    return ext !== ".pdf" || supportedPdfFiles.has(file.name);
  });
  const normalizedRows = [];
  const manifest = [];

  for (const file of selected) {
    const filePath = path.join(sourceDir, file.name);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size !== file.size) {
      fs.writeFileSync(filePath, await get(file.download_url, true));
    }
    const county = countyName(file.name);
    const ext = path.extname(file.name).toLowerCase();
    const rows = ext === ".html" ? htmlRows(filePath, county) : (ext === ".pdf" ? await pdfRows(filePath, county) : workbookRows(filePath, county));
    normalizedRows.push(...rows);
    manifest.push({ county, file: file.name, url: file.html_url, rows: rows.length });
    console.log(`${county}: ${rows.length}`);
  }
  const legacyText = await get(legacyNyUrl);
  globalThis.window = globalThis;
  eval(legacyText);
  const legacyRows = (globalThis.NY_ELECTION_APP_DATA?.reviewCharts?.metadata?.rows ?? []).map((row) => ({
    county: row.county + " County",
    local_unit: row.ward,
    pres_harris: row.harris,
    pres_trump: row.trump,
    pres_other: Math.max(0, row.total - row.harris - row.trump),
    pres_total: row.total,
    comparison_dem: 0,
    comparison_rep: 0,
    comparison_other: 0,
    dem_dropoff: row.demDropoff,
    rep_dropoff: row.repDropoff,
  }));
  normalizedRows.push(...legacyRows);
  manifest.push({ county: "Bronx/Kings/New York/Queens/Richmond Counties", file: "ny-app-data.js", url: legacyNyUrl, rows: legacyRows.length });

  normalizedRows.sort((a, b) => a.county.localeCompare(b.county) || a.local_unit.localeCompare(b.local_unit));
  const header = ["state", "election_year", "county", "local_unit", "pres_harris", "pres_trump", "pres_other", "pres_total", "comparison_dem", "comparison_rep", "comparison_other", "dem_dropoff", "rep_dropoff"];
  const csv = [
    header.join(","),
    ...normalizedRows.map((row) =>
      header
        .map((name) => {
          if (name === "state") return "NY";
          if (name === "election_year") return "2024";
          if ((name === "dem_dropoff" || name === "rep_dropoff") && row[name] === undefined) return "";
          return csvValue(row[name] ?? 0);
        })
        .join(","),
    ),
  ].join("\n");

  fs.writeFileSync(outputPath, `${csv}\n`);
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), sourceRepository: "openelections/openelections-sources-ny", sourcePath: "2024/general", files: manifest }, null, 2)}\n`,
  );
  console.log(`Wrote ${normalizedRows.length} rows to ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
