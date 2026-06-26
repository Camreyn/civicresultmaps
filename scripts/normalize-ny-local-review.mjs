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

const skipped = new Set(["Rockland (president only).xlsx", "Suffolk key.pdf"]);
const supportedPdfFiles = new Set(["Albany.pdf", "Allegany.pdf", "Broome.pdf", "Chemung.pdf", "Chenango.pdf", "Columbia.pdf", "Cortland.pdf", "Dutchess.pdf", "Essex.pdf", "Fulton.pdf", "Genesee.pdf", "Lewis.pdf", "Oneida.pdf", "Onondaga.pdf", "Putnam.pdf", "Seneca.pdf", "St Lawrence.pdf", "Tioga.pdf", "Tompkins.pdf", "Ulster.pdf", "Warren.pdf", "Westchester.pdf"]);
const supportedExtensions = new Set([".csv", ".xlsx", ".html", ".pdf", ".txt"]);

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

function certifiedCountyTotals(county) {
  const readRows = (fileName) => fs.readFileSync(path.join(repoRoot, "data", fileName), "utf8").trim().split(/\r?\n/).slice(1);
  const president = readRows("ny-2024-general-president.csv")
    .map((line) => line.split(","))
    .find((row) => row[2] === county);
  const senate = readRows("ny-2024-general-senate.csv")
    .map((line) => line.split(","))
    .find((row) => row[2] === county);
  if (!president || !senate) throw new Error(`Missing certified NY totals for ${county}`);
  return {
    presTrump: intValue(president[3]),
    presHarris: intValue(president[4]),
    senateRep: intValue(senate[3]),
    senateDem: intValue(senate[4]),
  };
}

function assertCountyDrTotals(rows, county) {
  const expected = certifiedCountyTotals(county);
  const actual = rows.reduce((totals, row) => {
    totals.presHarris += row.pres_harris;
    totals.presTrump += row.pres_trump;
    totals.senateDem += row.comparison_dem;
    totals.senateRep += row.comparison_rep;
    return totals;
  }, { presHarris: 0, presTrump: 0, senateDem: 0, senateRep: 0 });
  for (const key of Object.keys(expected)) {
    if (actual[key] !== expected[key]) {
      throw new Error(`${county} local review rows do not reconcile ${key}: parsed ${actual[key]}, expected ${expected[key]}`);
    }
  }
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

function firstInteger(value) {
  const match = cleanText(value).match(/\d[\d,]*/);
  return match ? intValue(match[0]) : 0;
}

function numberMatches(line) {
  const normalized = cleanText(line).replace(/\d+(?:\.\d+)?%/g, "");
  return [...normalized.matchAll(/\d[\d,]*/g)];
}

function fixedWidthParts(line, width) {
  const normalized = cleanText(line).replace(/\d+(?:\.\d+)?%/g, "");
  const matches = numberMatches(normalized);
  if (matches.length < width) return null;
  const selected = matches.slice(-width);
  const label = cleanText(normalized.slice(0, selected[0].index));
  return { label, nums: selected.map((match) => intValue(match[0])) };
}

function albanyPrecinctSummaryRows(text, county) {
  const pending = new Map();
  let localUnit = "";
  let currentOffice = "";
  let inCandidateRows = false;

  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = cleanText(rawLine);
    if (!line) continue;
    if (/^[A-Z][A-Z0-9 .'-]+ (?:WARD|ED|DIST|\d)/.test(line) && !/OFFICIAL|TOTAL|VOTE|PAGE/.test(line) && !/^--/.test(line)) {
      localUnit = line;
      continue;
    }
    if (/Electors for President/i.test(line)) {
      currentOffice = "president";
      inCandidateRows = true;
      continue;
    }
    if (/United States Senator/i.test(line)) {
      currentOffice = "senate";
      inCandidateRows = true;
      continue;
    }
    if (/Totals by Candidate|Total Votes Cast|Overvotes|Undervotes|Contest Totals|Representative|Member of Assembly|State Senator|Supreme Court|Proposal/i.test(line)) {
      if (/Totals by Candidate|Representative|Member of Assembly|State Senator|Supreme Court|Proposal/i.test(line)) inCandidateRows = false;
      if (/Representative|Member of Assembly|State Senator|Supreme Court|Proposal/i.test(line)) currentOffice = "";
      continue;
    }
    if (!localUnit || !currentOffice || !inCandidateRows) continue;
    const votes = firstInteger(line);
    if (!votes) continue;
    const key = localUnit.toUpperCase();
    const entry = pending.get(key) ?? { county, local_unit: localUnit, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
    if (currentOffice === "president") {
      if (/^(DEM|WFP) Kamala/i.test(line)) entry.pres_harris += votes;
      else if (/^(REP|CON) Donald/i.test(line)) entry.pres_trump += votes;
      else if (/^Write-In/i.test(line)) entry.pres_other += votes;
      entry.pres_total = entry.pres_harris + entry.pres_trump + entry.pres_other;
    } else {
      if (/^(DEM|WFP) Kirsten/i.test(line)) entry.comparison_dem += votes;
      else if (/^(REP|CON) Michael/i.test(line)) entry.comparison_rep += votes;
      else if (/^LAR Diane|^Write-In/i.test(line)) entry.comparison_other += votes;
    }
    pending.set(key, entry);
  }

  return completeRowsFromPending(pending);
}

function alleganySideBySideRows(text, county) {
  const rows = [];
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = cleanText(rawLine);
    if (!line || /^Total\b|^Harris|^DEM|^Allegany|^OFFICIAL|^Electors|^President|^United|^--|Nowak|Panepinto/i.test(line)) continue;
    const match = line.match(/^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\1\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);
    if (!match) continue;
    const [, localUnit, ...values] = match;
    const nums = values.map((value) => intValue(value));
    rows.push({
      county,
      local_unit: localUnit,
      pres_harris: nums[0] + nums[3],
      pres_trump: nums[1] + nums[2],
      pres_other: nums[4],
      pres_total: nums.slice(0, 5).reduce((sum, value) => sum + value, 0),
      comparison_dem: nums[5] + nums[8],
      comparison_rep: nums[6] + nums[7],
      comparison_other: nums[9] + nums[10],
    });
  }
  return rows;
}

function oneidaDetailedRows(text, county) {
  const pending = new Map();
  let currentOffice = "";
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = cleanText(rawLine);
    if (!line) continue;
    if (/Electors for President and Vice President/i.test(line)) {
      currentOffice = "president";
      continue;
    }
    if (/United States Senator/i.test(line)) {
      currentOffice = "senate";
      continue;
    }
    if (currentOffice && /Representative|Justice|Proposal|State Senator/i.test(line)) {
      currentOffice = "";
      continue;
    }
    if (!currentOffice || /^(Total|Grand Total|Page|--|Election District|Precinct|DISTRICT|Vote For|Rows Continued|Total Registered|Voters|Total Votes)/i.test(line)) continue;
    const parts = fixedWidthParts(line, currentOffice === "president" ? 17 : 10);
    if (!parts || !parts.label || /^\d+$/.test(parts.label) || /^contest total$/i.test(parts.label)) continue;
    const key = parts.label.toUpperCase();
    const entry = pending.get(key) ?? { county, local_unit: parts.label, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
    if (currentOffice === "president") {
      entry.pres_harris = parts.nums[0] + parts.nums[1];
      entry.pres_trump = parts.nums[2] + parts.nums[3];
      entry.pres_other = parts.nums.slice(4, -4).reduce((sum, value) => sum + value, 0);
      entry.pres_total = parts.nums.at(-1);
    } else {
      entry.comparison_dem = parts.nums[0] + parts.nums[1];
      entry.comparison_rep = parts.nums[2] + parts.nums[3];
      entry.comparison_other = parts.nums[4] + parts.nums[5];
    }
    pending.set(key, entry);
  }
  return completeRowsFromPending(pending);
}

function onondagaSummaryRows(text, county) {
  const pending = new Map();
  let currentOffice = "";
  const totals = { president: {}, senate: {} };

  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = cleanText(rawLine);
    if (!line) continue;
    if (/ELECTORS FOR PRESIDENT AND VICE PRESIDENT/i.test(line)) {
      currentOffice = "president";
      continue;
    }
    if (/UNITED STATES SENATOR/i.test(line)) {
      currentOffice = "senate";
      continue;
    }
    if (currentOffice && /REPRESENTATIVE|SUPREME|PROPOSAL|FAMILY|DISTRICT ATTORNEY/i.test(line)) {
      currentOffice = "";
      continue;
    }
    if (!currentOffice) continue;
    const nums = numberMatches(line).map((match) => intValue(match[0]));
    if (/^TOWN TOTAL\b/i.test(line)) {
      totals[currentOffice].town = nums;
      continue;
    }
    if (/^GRAND TOTAL\b/i.test(line)) {
      totals[currentOffice].grand = nums;
      continue;
    }
    if (/^(Total|Page|--|Election District|Precinct|DISTRICT|A WHOLE|B A C|Rows Continued|Voids|Blanks)/i.test(line)) continue;
    const label = cleanText(line.replace(/\d+(?:\.\d+)?%/g, "").slice(0, line.replace(/\d+(?:\.\d+)?%/g, "").search(/\d[\d,]*/)));
    if (!label || /\d/.test(label) || /\btotal$/i.test(label)) continue;
    if (nums.length < (currentOffice === "president" ? 7 : 8)) continue;
    const key = label.toUpperCase();
    const entry = pending.get(key) ?? { county, local_unit: label, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
    if (currentOffice === "president") {
      entry.pres_harris = nums[1] + nums[4];
      entry.pres_trump = nums[2] + nums[3];
      entry.pres_other = nums[5];
      entry.pres_total = nums[0];
    } else {
      entry.comparison_dem = nums[1] + nums[4];
      entry.comparison_rep = nums[2] + nums[3];
      entry.comparison_other = nums[5] + nums[6];
    }
    pending.set(key, entry);
  }

  const presidentTown = totals.president.town;
  const presidentGrand = totals.president.grand;
  const senateTown = totals.senate.town;
  const senateGrand = totals.senate.grand;
  if (presidentTown && presidentGrand && senateTown && senateGrand) {
    pending.set("CITY OF SYRACUSE", {
      county,
      local_unit: "CITY OF SYRACUSE",
      pres_harris: (presidentGrand[1] + presidentGrand[4]) - (presidentTown[1] + presidentTown[4]),
      pres_trump: (presidentGrand[2] + presidentGrand[3]) - (presidentTown[2] + presidentTown[3]),
      pres_other: presidentGrand[5] - presidentTown[5],
      pres_total: presidentGrand[0] - presidentTown[0],
      comparison_dem: (senateGrand[1] + senateGrand[4]) - (senateTown[1] + senateTown[4]),
      comparison_rep: (senateGrand[2] + senateGrand[3]) - (senateTown[2] + senateTown[3]),
      comparison_other: (senateGrand[5] + senateGrand[6]) - (senateTown[5] + senateTown[6]),
    });
  }

  return completeRowsFromPending(pending);
}
function fixedWidthPartsWithoutTrailingNotes(line, width) {
  return fixedWidthParts(cleanText(line).replace(/\([^)]*\).*$/, ""), width);
}

function geneseeTableRows(text, county) {
  const pending = new Map();
  let currentOffice = "";
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = cleanText(rawLine);
    if (!line) continue;
    if (/Electors for President/i.test(line)) {
      currentOffice = "president";
      continue;
    }
    if (/United States Senator/i.test(line)) {
      currentOffice = "senate";
      continue;
    }
    if (currentOffice && /Representative|Justice|Proposal/i.test(line)) {
      currentOffice = "";
      continue;
    }
    if (!currentOffice || /^(Total|Grand Total|Page|--|Precinct|Official|Registered|Electors|United|Vote)/i.test(line)) continue;
    const parts = fixedWidthPartsWithoutTrailingNotes(line, currentOffice === "president" ? 9 : 10);
    if (!parts || !parts.label || /\btotal$/i.test(parts.label)) continue;
    const key = parts.label.toUpperCase();
    const entry = pending.get(key) ?? { county, local_unit: parts.label, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
    if (currentOffice === "president") {
      entry.pres_harris = parts.nums[1] + parts.nums[2];
      entry.pres_trump = parts.nums[3] + parts.nums[4];
      entry.pres_other = parts.nums[8];
      entry.pres_total = parts.nums[5];
    } else {
      entry.comparison_dem = parts.nums[1] + parts.nums[2];
      entry.comparison_rep = parts.nums[3] + parts.nums[4];
      entry.comparison_other = parts.nums[5] + parts.nums[8];
    }
    pending.set(key, entry);
  }
  return completeRowsFromPending(pending);
}

function tiogaTableRows(text, county) {
  const pending = new Map();
  let currentOffice = "";
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = cleanText(rawLine);
    if (!line) continue;
    if (/Electors for President/i.test(line)) {
      currentOffice = "president";
      continue;
    }
    if (/United States Senator/i.test(line)) {
      currentOffice = "senate";
      continue;
    }
    if (currentOffice && /Representative|Justice|Proposal/i.test(line)) {
      currentOffice = "";
      continue;
    }
    if (!currentOffice || /^(Total|Election District|Official|General|--|Valid|Kirsten|Gillibrand|Kamala|Tim|Walz|JD|Vance|DEM|REP|CON|WF|LAR)/i.test(line)) continue;
    const parts = fixedWidthParts(line, currentOffice === "president" ? 10 : 11);
    if (!parts || !parts.label || /\btotal$/i.test(parts.label)) continue;
    const key = parts.label.toUpperCase();
    const entry = pending.get(key) ?? { county, local_unit: parts.label, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
    if (currentOffice === "president") {
      entry.pres_harris = parts.nums[0] + parts.nums[3];
      entry.pres_trump = parts.nums[1] + parts.nums[2];
      entry.pres_other = parts.nums[4];
      entry.pres_total = parts.nums[5];
    } else {
      entry.comparison_dem = parts.nums[0] + parts.nums[3];
      entry.comparison_rep = parts.nums[1] + parts.nums[2];
      entry.comparison_other = parts.nums[4] + parts.nums[5];
    }
    pending.set(key, entry);
  }
  return completeRowsFromPending(pending);
}
function essexCanvassRows(text, county) {
  const pending = new Map();
  for (const chunk of text.replace(/\r/g, "").split(/-- \d+ of \d+ --/)) {
    const isPresident = /Presidential Electors for President and Vice President/i.test(chunk);
    const isSenate = /United States Senator/i.test(chunk);
    if (!isPresident && !isSenate) continue;
    for (const rawLine of chunk.split("\n")) {
      const line = cleanText(rawLine);
      if (!line || /^(TOWN NAME|WHOLE|NUMBER|OF VOTES|CAST|Kamala|Donald|Write|VOIDS|BLANKS|Kirsten|Michael|Diane|Scattered|ESSEX COUNTY|GENERAL|At the|Presidential|United States|REPRESENTATIVE|STATE SENATOR|MEMBER|PROPOSAL|COUNTY|--)/i.test(line)) continue;
      const matches = [...line.matchAll(/\d[\d,]*/g)];
      if (matches.length < 6) continue;
      const values = matches.map((match) => intValue(match[0]));
      const town = cleanText(line.slice(0, matches[0].index));
      if (!town) continue;
      const ed = values[0];
      const localUnit = ed === 0 ? town : `${town} ${ed}`;
      const nums = values.slice(1);
      const key = localUnit.toUpperCase();
      const entry = pending.get(key) ?? { county, local_unit: localUnit, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
      if (isPresident) {
        entry.pres_harris = nums[1] + nums[2];
        entry.pres_trump = nums[3] + nums[4];
        entry.pres_other = nums.slice(5, -2).reduce((sum, value) => sum + value, 0);
        entry.pres_total = nums[0];
      } else {
        entry.comparison_dem = nums[1] + nums[2];
        entry.comparison_rep = nums[3] + nums[4];
        entry.comparison_other = nums[5] + (nums[6] ?? 0);
      }
      pending.set(key, entry);
    }
  }
  return completeRowsFromPending(pending);
}

function stLawrenceDistrictRows(text, county) {
  const pending = new Map();
  let currentOffice = "";
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = cleanText(rawLine);
    if (!line) continue;
    if (/Kamala D\. Harris/i.test(line)) {
      currentOffice = "president";
      continue;
    }
    if (/Kirsten E\. Gillibrand/i.test(line)) {
      currentOffice = "senate";
      continue;
    }
    if (currentOffice && /Representative|Proposal|Supreme|Assembly|Write-In Results/i.test(line)) {
      currentOffice = "";
      continue;
    }
    if (!currentOffice || /^(DISTRICT|TOTAL|VOTER|REGISTRATION|%|DEM|REP|CON|WOR|LAR|TOTAL TURNOUT|November|--)/i.test(line)) continue;
    const normalized = line.replace(/\d+(?:\.\d+)?%/g, "");
    const matches = [...normalized.matchAll(/\d[\d,]*/g)];
    if (matches.length < (currentOffice === "president" ? 11 : 12)) continue;
    const first = matches[0];
    const localUnit = cleanText(`${normalized.slice(0, first.index)}${first[0]}`);
    const nums = matches.slice(1).map((match) => intValue(match[0]));
    const key = localUnit.toUpperCase();
    const entry = pending.get(key) ?? { county, local_unit: localUnit, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
    if (currentOffice === "president") {
      entry.pres_harris = nums[6];
      entry.pres_trump = nums[7];
      entry.pres_other = nums[8];
      entry.pres_total = nums[9];
    } else {
      entry.comparison_dem = nums[7];
      entry.comparison_rep = nums[8];
      entry.comparison_other = nums[6] + nums[9];
    }
    pending.set(key, entry);
  }
  return completeRowsFromPending(pending);
}
function chenangoAllRows(text, county) {
  const chunks = text.replace(/\r/g, "").split(/-- \d+ of \d+ --/);
  const presidentChunk = chunks.find((chunk) => /Election District/i.test(chunk) && /Kamala D\./i.test(chunk) && /Donald J\./i.test(chunk));
  const senateChunk = chunks.find((chunk) => /Election District/i.test(chunk) && /Kirsten E\./i.test(chunk) && /Michael D\./i.test(chunk));
  if (!presidentChunk || !senateChunk) return [];

  const parseChunk = (chunk, office) => {
    const rows = new Map();
    for (const rawLine of chunk.split("\n")) {
      const line = cleanText(rawLine);
      if (!line || /^(Election District|Kamala|Donald|Claudia|Chase|Jill|Cornel|Future|Peter|Shiva|Write|in Void|Blank|Total|2024|Chenango|General|District|Office|Counting|Vote|Kirsten|Michael|Diane)/i.test(line)) continue;
      const matches = [...line.matchAll(/\d[\d,]*/g)];
      const width = office === "president" ? 12 : 9;
      if (matches.length < width) continue;
      const selected = matches.slice(-width);
      const localUnit = cleanText(line.slice(0, selected[0].index));
      if (!localUnit || /total/i.test(localUnit)) continue;
      const nums = selected.map((match) => intValue(match[0]));
      rows.set(localUnit.toUpperCase(), { localUnit, nums });
    }
    return rows;
  };

  const presidentRows = parseChunk(presidentChunk, "president");
  const senateRows = parseChunk(senateChunk, "senate");
  return [...presidentRows.entries()]
    .filter(([key]) => senateRows.has(key))
    .map(([key, president]) => {
      const senate = senateRows.get(key);
      return {
        county,
        local_unit: president.localUnit,
        pres_harris: president.nums[0] + president.nums[3],
        pres_trump: president.nums[1] + president.nums[2],
        pres_other: president.nums.slice(4, -3).reduce((sum, value) => sum + value, 0),
        pres_total: president.nums.at(-1),
        comparison_dem: senate.nums[0] + senate.nums[3],
        comparison_rep: senate.nums[1] + senate.nums[2],
        comparison_other: senate.nums[4] + senate.nums[5],
      };
    });
}

function warrenSummaryRows(text, county) {
  const pending = new Map();
  for (const chunk of text.replace(/\r/g, "").split(/-- \d+ of \d+ --/)) {
    const isPresident = /PRESIDENT AND VICE PRESIDENT OF THE UNITED STATES[\s\S]*Summary/i.test(chunk);
    const isSenate = /UNITED STATES SENATOR[\s\S]*Summary/i.test(chunk);
    if (!isPresident && !isSenate) continue;
    for (const rawLine of chunk.split("\n")) {
      const line = cleanText(rawLine);
      if (!line || /^(A WHOLE|KAMALA|DONALD|KIRSTEN|MICHAEL|DIANE|WRITE|B A C|Wards|Voids|TOWN|GRAND|Page|PRESIDENT|UNITED)/i.test(line)) continue;
      const parts = fixedWidthParts(line, isPresident ? 7 : 8);
      if (!parts || !parts.label) continue;
      const key = parts.label.toUpperCase();
      const entry = pending.get(key) ?? { county, local_unit: parts.label, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
      if (isPresident) {
        entry.pres_harris = parts.nums[1] + parts.nums[2];
        entry.pres_trump = parts.nums[3] + parts.nums[4];
        entry.pres_other = parts.nums[5];
        entry.pres_total = parts.nums[0];
      } else {
        entry.comparison_dem = parts.nums[1] + parts.nums[2];
        entry.comparison_rep = parts.nums[3] + parts.nums[4];
        entry.comparison_other = parts.nums[5] + parts.nums[6];
      }
      pending.set(key, entry);
    }
  }
  return completeRowsFromPending(pending);
}
function boundedPdfTextRows(text, county) {
  const pending = new Map();
  let currentOffice = "";
  const completed = new Set();
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = cleanText(rawLine);
    if (!line || /^-- \d+ of \d+ --$/.test(line) || /^page \d+/i.test(line)) continue;
    if (!completed.has("president") && /president and vice president/i.test(line)) {
      currentOffice = "president";
      continue;
    }
    if (!completed.has("senate") && /^united states senator/i.test(line)) {
      currentOffice = "senate";
      continue;
    }
    if (!currentOffice) continue;
    if (/^grand total\b/i.test(line)) {
      completed.add(currentOffice);
      currentOffice = "";
      continue;
    }

    const parsed = trailingNumberParse(line, currentOffice);
    if (!parsed || /\btotal$/i.test(parsed.label)) continue;
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

function cortlandTabbedRows(text, county) {
  const lines = text.split(/\r?\n/);
  const findLine = (predicate, start = 0) => {
    const index = lines.findIndex((line, lineIndex) => lineIndex >= start && predicate(line, lineIndex));
    if (index < 0) throw new Error(`Missing Cortland source marker for ${county}`);
    return index;
  };
  const presidentStart = findLine((line) => line.startsWith("City of Cortland"));
  const presidentEnd = findLine((line) => line.startsWith("3317 \t2610"), presidentStart);
  const senateStart = findLine((line) => line.startsWith("City of Cortland"), presidentEnd);
  const senateEnd = findLine((line) => line.startsWith("3247 \t2482"), senateStart);

  const parseRows = (start, end, office) => {
    const rows = new Map();
    let legislativeDistrict = "";
    for (let index = start; index <= end; index++) {
      const cells = lines[index].split("\t").map((cell) => cleanText(cell)).filter(Boolean);
      if (cells.length < 2) continue;
      let label = cells[0];
      let values = cells.slice(1);
      if (/^L\.D\.\s+\d+/i.test(label)) {
        legislativeDistrict = label;
        label = cells[1] || "";
        values = cells.slice(2);
      }
      if (!label || /^\d/.test(label) || /Totals|County|City of|Town of|OFFICIAL|Election|--/i.test(label)) continue;
      if (values.length !== 36) continue;
      const totalBlock = values.slice(27, 36).map(intValue);
      const localUnit = `${legislativeDistrict} ${label}`.trim();
      const key = localUnit.toUpperCase();
      const entry = rows.get(key) ?? { county, local_unit: localUnit, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
      if (office === "president") {
        entry.pres_harris = totalBlock[0] + totalBlock[3];
        entry.pres_trump = totalBlock[1] + totalBlock[2];
        entry.pres_other = totalBlock[4];
        entry.pres_total = totalBlock[8];
      } else {
        entry.comparison_dem = totalBlock[0] + totalBlock[3];
        entry.comparison_rep = totalBlock[1] + totalBlock[2];
        entry.comparison_other = totalBlock[4] + totalBlock[5];
      }
      rows.set(key, entry);
    }
    return rows;
  };

  const presidentRows = parseRows(presidentStart, presidentEnd, "president");
  const senateRows = parseRows(senateStart, senateEnd, "senate");
  const rows = [...presidentRows.entries()].map(([key, president]) => {
    const senate = senateRows.get(key);
    if (!senate) throw new Error(`Missing Cortland senate row for ${president.local_unit}`);
    return {
      county,
      local_unit: president.local_unit,
      pres_harris: president.pres_harris,
      pres_trump: president.pres_trump,
      pres_other: president.pres_other,
      pres_total: president.pres_total,
      comparison_dem: senate.comparison_dem,
      comparison_rep: senate.comparison_rep,
      comparison_other: senate.comparison_other,
    };
  }).filter((row) => row.pres_total || row.comparison_dem || row.comparison_rep || row.comparison_other);
  assertCountyDrTotals(rows, county);
  return rows;
}
function broomeStatementRows(text, county) {
  const lines = text.split(/\r?\n/);
  const findLine = (predicate, start = 0) => {
    const index = lines.findIndex((line, lineIndex) => lineIndex >= start && predicate(line, lineIndex));
    if (index < 0) throw new Error(`Missing Broome source marker for ${county}`);
    return index;
  };
  const presidentEnd = findLine((line) => line.startsWith("TOTALS \t42,191"));
  const senateStart = findLine((line, index) => line === "Kirsten E." && lines[index + 1] === "Gillibrand", presidentEnd);
  const senateEnd = findLine((line) => line.startsWith("TOTALS \t42,415"), senateStart);

  const parseRows = (start, end, office) => {
    const rows = new Map();
    for (let index = start; index <= end; index++) {
      const rawLine = lines[index];
      if (!rawLine.includes("\t")) continue;
      const cells = rawLine.split("\t").map((cell) => cleanText(cell)).filter(Boolean);
      const label = cells[0] || "";
      if (!label || label === "TOTALS" || label === "Candidate" || label === "Voters" || /^(City|Town) of /i.test(label) || /^COUNTY/i.test(label)) continue;
      if (!/%$/.test(cells.at(-1) ?? "")) continue;
      const nums = cells.slice(1, -1).map(intValue);
      const key = label.toUpperCase();
      const entry = rows.get(key) ?? { county, local_unit: label, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
      if (office === "president") {
        if (nums.length !== 9) continue;
        entry.pres_harris = nums[0] + nums[3];
        entry.pres_trump = nums[1] + nums[2];
        entry.pres_other = nums[4];
        entry.pres_total = nums[7];
      } else {
        if (nums.length !== 10) continue;
        entry.comparison_dem = nums[0] + nums[3];
        entry.comparison_rep = nums[1] + nums[2];
        entry.comparison_other = nums[4] + nums[5];
      }
      rows.set(key, entry);
    }
    return rows;
  };

  const presidentRows = parseRows(0, presidentEnd, "president");
  const senateRows = parseRows(senateStart, senateEnd, "senate");
  const rows = [...presidentRows.entries()].map(([key, president]) => {
    const senate = senateRows.get(key);
    if (!senate) throw new Error(`Missing Broome senate row for ${president.local_unit}`);
    return {
      county,
      local_unit: president.local_unit,
      pres_harris: president.pres_harris,
      pres_trump: president.pres_trump,
      pres_other: president.pres_other,
      pres_total: president.pres_total,
      comparison_dem: senate.comparison_dem,
      comparison_rep: senate.comparison_rep,
      comparison_other: senate.comparison_other,
    };
  }).filter((row) => row.pres_total || row.comparison_dem || row.comparison_rep || row.comparison_other);
  assertCountyDrTotals(rows, county);
  return rows;
}
function putnamGrandTotalRows(text, county) {
  const pending = new Map();
  let currentOffice = "";
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = cleanText(rawLine).replace(/\d+(?:\.\d+)?%/g, "");
    if (/PUTNAM COUNTY ELECTORS FOR PRESIDENT/i.test(line)) {
      currentOffice = "president";
      continue;
    }
    if (/PUTNAM COUNTY UNITED STATES SENATOR/i.test(line)) {
      currentOffice = "senate";
      continue;
    }
    if (/^PUTNAM COUNTY /i.test(line)) {
      currentOffice = "";
      continue;
    }
    if (!currentOffice || /^(TOTAL|TOTAL TURNOUT|KIRSTEN|MICHAEL|KAMALA|DONALD|TIM|JD|TOTAL CANDIDATE|TOTAL VOTES|\()/i.test(line)) continue;
    const match = line.match(/^([A-Z]{2}\s+\d{2})\s+(.+)$/);
    if (!match) continue;
    const localUnit = match[1];
    const nums = [...match[2].matchAll(/\d[\d,]*/g)].map((value) => intValue(value[0]));
    const key = localUnit.toUpperCase();
    const entry = pending.get(key) ?? { county, local_unit: localUnit, pres_harris: 0, pres_trump: 0, pres_other: 0, pres_total: 0, comparison_dem: 0, comparison_rep: 0, comparison_other: 0 };
    if (currentOffice === "president") {
      if (nums.length < 20) continue;
      entry.pres_total = nums.at(-3);
      entry.pres_harris = nums.at(-2);
      entry.pres_trump = nums.at(-1);
      entry.pres_other = Math.max(0, entry.pres_total - entry.pres_harris - entry.pres_trump);
    } else {
      if (nums.length < 16) continue;
      entry.comparison_dem = nums.at(-3);
      entry.comparison_rep = nums.at(-2);
      entry.comparison_other = nums.at(-1);
    }
    pending.set(key, entry);
  }
  return completeRowsFromPending(pending);
}
function lewisTableRows(text, county) {
  const chunks = text.replace(/\r/g, "").split(/-- \d+ of \d+ --/);
  const parseChunk = (chunkIndex, office) => {
    const rows = new Map();
    const width = office === "president" ? 8 : 9;
    for (const rawLine of (chunks[chunkIndex] ?? "").split("\n")) {
      const line = cleanText(rawLine);
      if (!line || /^(TOTALS|Lewis County|General|November|President|United|ED|Kamala|Tim|DEM|Donald|J\.D|WOR|Blank|Void|Scatter|Total|Kirsten|Michael|Diane)/i.test(line)) continue;
      const matches = [...line.matchAll(/\d[\d,]*/g)];
      if (matches.length < width) continue;
      const selected = matches.slice(-width);
      const localUnit = cleanText(line.slice(0, selected[0].index));
      if (!localUnit) continue;
      const nums = selected.map((value) => intValue(value[0]));
      if (office === "president") {
        rows.set(localUnit.toUpperCase(), {
          localUnit,
          pres_harris: nums[0] + nums[3],
          pres_trump: nums[1] + nums[2],
          pres_other: nums[4] + nums[5] + nums[6],
          pres_total: nums[7],
        });
      } else {
        rows.set(localUnit.toUpperCase(), {
          localUnit,
          comparison_dem: nums[0] + nums[3],
          comparison_rep: nums[1] + nums[2],
          comparison_other: nums[4],
        });
      }
    }
    return rows;
  };
  const presidentRows = parseChunk(0, "president");
  const senateRows = parseChunk(1, "senate");
  return [...presidentRows.entries()]
    .filter(([key]) => senateRows.has(key))
    .map(([key, president]) => {
      const senate = senateRows.get(key);
      return {
        county,
        local_unit: president.localUnit,
        pres_harris: president.pres_harris,
        pres_trump: president.pres_trump,
        pres_other: president.pres_other,
        pres_total: president.pres_total,
        comparison_dem: senate.comparison_dem,
        comparison_rep: senate.comparison_rep,
        comparison_other: senate.comparison_other,
      };
    });
}
function dutchessDetailedRows(text, county) {
  const chunks = text.replace(/\r/g, "").split(/-- \d+ of \d+ --/);
  const parseContestRows = (startChunk, endChunk, office) => {
    const rows = new Map();
    const totals = { harris: 0, trump: 0, other: 0, total: 0 };
    const visible = { harris: 0, trump: 0, other: 0, total: 0 };
    let protectedUnit = "";
    const segment = chunks.slice(startChunk, endChunk + 1).join("\n");
    for (const rawLine of segment.split("\n")) {
      const line = cleanText(rawLine);
      if (!line) continue;
      const totalMatch = line.match(/^Contest Total\s+(.+)$/i);
      if (totalMatch) {
        const nums = [...totalMatch[1].matchAll(/\d[\d,]*/g)].map((value) => intValue(value[0]));
        if (office === "president" && nums.length >= 9) {
          totals.harris = nums[0] + nums[1];
          totals.trump = nums[2] + nums[3];
          totals.other = nums[4] + nums[5] + nums[6];
          totals.total = nums[8];
        } else if (office === "senate" && nums.length >= 10) {
          totals.harris = nums[0] + nums[1];
          totals.trump = nums[2] + nums[3];
          totals.other = nums[4];
          totals.total = nums[9];
        }
        continue;
      }
      const protectedMatch = line.match(/^(.+?)\s+(?:\*\*\s+)+0\s+(\d+)$/);
      if (protectedMatch) {
        protectedUnit = cleanText(protectedMatch[1]);
        continue;
      }
      const matches = [...line.matchAll(/\d[\d,]*/g)];
      const width = office === "president" ? 9 : 10;
      if (matches.length < width) continue;
      const selected = matches.slice(-width);
      const localUnit = cleanText(line.slice(0, selected[0].index));
      if (!localUnit || /^Contest Total/i.test(localUnit)) continue;
      const nums = selected.map((value) => intValue(value[0]));
      const entry = office === "president"
        ? {
            localUnit,
            harris: nums[0] + nums[1],
            trump: nums[2] + nums[3],
            other: nums[4] + nums[5] + nums[6],
            total: nums[8],
          }
        : {
            localUnit,
            harris: nums[0] + nums[1],
            trump: nums[2] + nums[3],
            other: nums[4],
            total: nums[9],
          };
      visible.harris += entry.harris;
      visible.trump += entry.trump;
      visible.other += entry.other;
      visible.total += entry.total;
      rows.set(localUnit.toUpperCase(), entry);
    }
    if (protectedUnit) {
      const residual = {
        localUnit: protectedUnit,
        harris: Math.max(0, totals.harris - visible.harris),
        trump: Math.max(0, totals.trump - visible.trump),
        other: Math.max(0, totals.other - visible.other),
        total: Math.max(0, totals.total - visible.total),
      };
      if (residual.total || residual.harris || residual.trump || residual.other) rows.set(protectedUnit.toUpperCase(), residual);
    }
    return rows;
  };

  const presidentRows = parseContestRows(0, 8, "president");
  const senateRows = parseContestRows(9, 17, "senate");
  return [...presidentRows.entries()]
    .filter(([key]) => senateRows.has(key))
    .map(([key, president]) => {
      const senate = senateRows.get(key);
      return {
        county,
        local_unit: president.localUnit,
        pres_harris: president.harris,
        pres_trump: president.trump,
        pres_other: president.other,
        pres_total: president.total,
        comparison_dem: senate.harris,
        comparison_rep: senate.trump,
        comparison_other: senate.other,
      };
    });
}
function westchesterCanvassRows(text, county) {
  const chunks = text.replace(/\r/g, "").split(/-- \d+ of \d+ --/);
  const parseContestRows = (startChunk, endChunk, office) => {
    const rows = new Map();
    const segment = chunks.slice(startChunk, endChunk + 1).join("\n");
    for (const rawLine of segment.split("\n")) {
      const line = cleanText(rawLine);
      if (!/^(Town|City) of /i.test(line)) continue;
      const match = line.match(/^(.+?)\s+(\d{5,6})\s+(.+)$/);
      if (!match) continue;
      const localUnit = `${cleanText(match[1])} ${match[2]}`;
      const nums = [...match[3].matchAll(/\d[\d,]*/g)].map((value) => intValue(value[0]));
      const key = localUnit.toUpperCase();
      if (office === "president") {
        if (nums.length !== 16) continue;
        rows.set(key, {
          localUnit,
          pres_harris: nums[0] + nums[3],
          pres_trump: nums[1] + nums[2],
          pres_other: nums.slice(4, 13).reduce((sum, value) => sum + value, 0) + nums[14],
          pres_total: nums[15],
        });
      } else {
        if (nums.length !== 9) continue;
        rows.set(key, {
          localUnit,
          comparison_dem: nums[0] + nums[3],
          comparison_rep: nums[1] + nums[2],
          comparison_other: nums[4],
        });
      }
    }
    return rows;
  };

  const presidentRows = parseContestRows(109, 159, "president");
  const senateRows = parseContestRows(161, 217, "senate");
  return [...presidentRows.entries()]
    .filter(([key]) => senateRows.has(key))
    .map(([key, president]) => {
      const senate = senateRows.get(key);
      return {
        county,
        local_unit: president.localUnit,
        pres_harris: president.pres_harris,
        pres_trump: president.pres_trump,
        pres_other: president.pres_other,
        pres_total: president.pres_total,
        comparison_dem: senate.comparison_dem,
        comparison_rep: senate.comparison_rep,
        comparison_other: senate.comparison_other,
      };
    });
}
const suffolkTownNames = {
  "0": "Shelter Island",
  "1": "Brookhaven",
  "2": "Huntington",
  "3": "Islip",
  "4": "Babylon",
  "5": "Smithtown",
  "6": "Southampton",
  "7": "East Hampton",
  "8": "Southold",
  "9": "Riverhead",
};

function suffolkCandidateRecord(line) {
  return {
    name: cleanText(line.slice(5, 30)),
    party: cleanText(line.slice(30, 33)),
    total: intValue(line.slice(34, 41)),
  };
}

function suffolkTextRows(filePath, county) {
  const sections = [];
  let current = null;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (line.startsWith("0064R")) {
      current = { race: cleanText(line.slice(5, 45)), candidates: [], rows: [] };
      sections.push(current);
    } else if (current && line.startsWith("0044C")) {
      current.candidates.push(suffolkCandidateRecord(line));
    } else if (current && /^\d{4}E/.test(line)) {
      current.rows.push(line);
    }
  }

  const parseRace = (raceName, office) => {
    const section = sections.find((entry) => entry.race === raceName);
    if (!section) throw new Error(`Missing Suffolk race section: ${raceName}`);
    const candidateTotals = Array(section.candidates.length).fill(0);
    const demIndexes = [];
    const repIndexes = [];
    const otherIndexes = [];
    section.candidates.forEach((candidate, index) => {
      const candidateName = candidate.name.toLowerCase();
      if (office === "president" && candidateName.includes("harris")) demIndexes.push(index);
      else if (office === "president" && candidateName.includes("trump")) repIndexes.push(index);
      else if (office === "senate" && candidateName.includes("gillibrand")) demIndexes.push(index);
      else if (office === "senate" && candidateName.includes("sapraicone")) repIndexes.push(index);
      else otherIndexes.push(index);
    });

    const rows = new Map();
    for (const line of section.rows) {
      const expectedLength = 52 + (4 * section.candidates.length);
      if (line.length !== expectedLength || intValue(line.slice(0, 4)) !== expectedLength) {
        throw new Error(`Unexpected Suffolk ${raceName} E-record length: ${line.length}, expected ${expectedLength}`);
      }
      const townCode = line.slice(5, 6);
      const electionDistrict = line.slice(6, 9);
      const localUnit = `${suffolkTownNames[townCode] ?? `Town ${townCode}`} ED ${electionDistrict}`;
      const values = section.candidates.map((_, index) => intValue(line.slice(52 + (index * 4), 56 + (index * 4))));
      values.forEach((value, index) => {
        candidateTotals[index] += value;
      });
      const sumIndexes = (indexes) => indexes.reduce((sum, index) => sum + values[index], 0);
      const key = `${townCode}-${electionDistrict}`;
      if (office === "president") {
        rows.set(key, {
          county,
          local_unit: localUnit,
          pres_harris: sumIndexes(demIndexes),
          pres_trump: sumIndexes(repIndexes),
          pres_other: sumIndexes(otherIndexes),
          pres_total: values.reduce((sum, value) => sum + value, 0),
        });
      } else {
        rows.set(key, {
          local_unit: localUnit,
          comparison_dem: sumIndexes(demIndexes),
          comparison_rep: sumIndexes(repIndexes),
          comparison_other: sumIndexes(otherIndexes),
        });
      }
    }

    for (const index of [...demIndexes, ...repIndexes]) {
      const expected = section.candidates[index].total;
      if (candidateTotals[index] !== expected) {
        throw new Error(`Suffolk ${raceName} candidate total mismatch for ${section.candidates[index].name}: parsed ${candidateTotals[index]}, expected ${expected}`);
      }
    }
    return rows;
  };

  const presidentRows = parseRace("President and Vice President", "president");
  const senateRows = parseRace("United States Senator", "senate");
  if (presidentRows.size !== senateRows.size) {
    throw new Error(`Suffolk president/senate ED row count mismatch: ${presidentRows.size} vs ${senateRows.size}`);
  }
  const rows = [...presidentRows.entries()].map(([key, president]) => {
    const senate = senateRows.get(key);
    if (!senate) throw new Error(`Missing Suffolk senate row for ${president.local_unit}`);
    return {
      county,
      local_unit: president.local_unit,
      pres_harris: president.pres_harris,
      pres_trump: president.pres_trump,
      pres_other: president.pres_other,
      pres_total: president.pres_total,
      comparison_dem: senate.comparison_dem,
      comparison_rep: senate.comparison_rep,
      comparison_other: senate.comparison_other,
    };
  }).filter((row) => row.pres_total || row.comparison_dem || row.comparison_rep || row.comparison_other);
  assertCountyDrTotals(rows, county);
  return rows;
}

function textRows(filePath, county) {
  if (county === "Suffolk County") return suffolkTextRows(filePath, county);
  throw new Error(`Unsupported NY text local review source for ${county}`);
}
async function pdfRows(filePath, county) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const result = await parser.getText();
    if (county === "Albany County") return albanyPrecinctSummaryRows(result.text, county);
    if (county === "Allegany County") return alleganySideBySideRows(result.text, county);
    if (county === "Broome County") return broomeStatementRows(result.text, county);
    if (county === "Chenango County") return chenangoAllRows(result.text, county);
    if (county === "Cortland County") return cortlandTabbedRows(result.text, county);
    if (county === "Dutchess County") return dutchessDetailedRows(result.text, county);
    if (county === "Essex County") return essexCanvassRows(result.text, county);
    if (county === "Genesee County") return geneseeTableRows(result.text, county);
    if (county === "Lewis County") return lewisTableRows(result.text, county);
    if (county === "Oneida County") return oneidaDetailedRows(result.text, county);
    if (county === "Onondaga County") return onondagaSummaryRows(result.text, county);
    if (county === "Putnam County") return putnamGrandTotalRows(result.text, county);
    if (county === "St. Lawrence County") return stLawrenceDistrictRows(result.text, county);
    if (county === "Tioga County") return tiogaTableRows(result.text, county);
    if (county === "Warren County") return warrenSummaryRows(result.text, county);
    if (county === "Westchester County") return westchesterCanvassRows(result.text, county);
    if (county === "Fulton County" || county === "Seneca County") return candidateOnlyPdfRows(result.text, county);
    if (county === "Ulster County") return boundedPdfTextRows(result.text, county);
    return pdfTextRows(result.text, county);
  } finally {
    await parser.destroy();
  }
}

function countyName(fileName) {
  const base = fileName.replace(/\.[^.]+$/i, "").replace(/\s+\(.+\)$/i, "");
  if (base === "St Lawrence") return "St. Lawrence County";
  return `${base} County`;
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
    const rows = ext === ".html" ? htmlRows(filePath, county) : (ext === ".txt" ? textRows(filePath, county) : (ext === ".pdf" ? await pdfRows(filePath, county) : workbookRows(filePath, county)));
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
