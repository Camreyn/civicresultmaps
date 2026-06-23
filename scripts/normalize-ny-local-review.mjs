import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(repoRoot, ".etl", "ny-local-review-sources");
const outputPath = path.join(repoRoot, "data", "ny-2024-local-review.csv");
const manifestPath = path.join(repoRoot, "data", "ny-2024-local-review-sources.json");
const apiUrl = "https://api.github.com/repos/openelections/openelections-sources-ny/contents/2024/general";
const legacyNyUrl = "https://raw.githubusercontent.com/Camreyn/wisconsin-2024-election-mapper/main/data/ny-app-data.js";

const skipped = new Set(["Rockland (president only).xlsx", "Suffolk.txt", "Suffolk key.pdf"]);
const supportedExtensions = new Set([".csv", ".xlsx", ".html"]);

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
  const text = cleanText(value).replace(/,/g, "");
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
  if (!text || /blank|void|over votes|under votes|scattering|total/.test(text)) return "";
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

  return [...pending.values()].filter((entry) => entry.pres_total && (entry.comparison_dem || entry.comparison_rep || entry.comparison_other));
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

  return [...pending.values()].filter((entry) => entry.pres_total && (entry.comparison_dem || entry.comparison_rep || entry.comparison_other));
}

function workbookRows(filePath, county) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const allRows = workbook.SheetNames.flatMap((name) => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, blankrows: false }));
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
  const re = /<h2[\s\S]*?<\/h2>\s*<table[\s\S]*?<\/table>/gi;
  let match;
  while ((match = re.exec(html))) {
    const block = match[0];
    if (!/president|united states senator|gillibrand|sapraicone/i.test(block)) continue;
    const office = /president/i.test(block) ? "president" : "senate";
    const cellsByRow = [...block.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((rowMatch) =>
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
  return [...pending.values()].filter((entry) => entry.pres_total && (entry.comparison_dem || entry.comparison_rep || entry.comparison_other));
}

function countyName(fileName) {
  return `${fileName.replace(/\.[^.]+$/i, "").replace(/\s+\(.+\)$/i, "")} County`;
}

async function main() {
  ensureDir(sourceDir);
  const listing = JSON.parse(await get(apiUrl));
  const selected = listing.filter((file) => supportedExtensions.has(path.extname(file.name).toLowerCase()) && !skipped.has(file.name));
  const normalizedRows = [];
  const manifest = [];

  for (const file of selected) {
    const filePath = path.join(sourceDir, file.name);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size !== file.size) {
      fs.writeFileSync(filePath, await get(file.download_url, true));
    }
    const county = countyName(file.name);
    const ext = path.extname(file.name).toLowerCase();
    const rows = ext === ".html" ? htmlRows(filePath, county) : workbookRows(filePath, county);
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
