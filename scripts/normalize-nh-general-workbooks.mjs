import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const presidentWorkbook = process.argv[2] ?? "data/nh-2024-ge-president.xls";
const governorWorkbook = process.argv[3] ?? "data/nh-2024-ge-governor.xls";
const outputFile = process.argv[4] ?? "data/nh-2024-town-ward-president-governor.csv";

const countyByPrefix = new Map([
  ["bel", "Belknap County"],
  ["carr", "Carroll County"],
  ["ches", "Cheshire County"],
  ["coos", "Coos County"],
  ["graf", "Grafton County"],
  ["hills", "Hillsborough County"],
  ["merr", "Merrimack County"],
  ["rock", "Rockingham County"],
  ["stra", "Strafford County"],
  ["sull", "Sullivan County"],
]);

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

function intValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

function cleanLocalUnit(value) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  const aliases = new Map([
    ["Atk. & Gilm. Ac. Gt.", "At. & Gil. Academy Grant"],
    ["Wentworth's Loc.", "Wentworth's Location"],
  ]);
  return aliases.get(cleaned) ?? cleaned;
}

function countyForSheet(sheetName) {
  const normalized = sheetName.toLowerCase().replace(/\s+/g, "");
  for (const [prefix, county] of countyByPrefix) {
    if (normalized.startsWith(prefix)) return county;
  }
  return null;
}

function readContest(file, type) {
  const workbook = XLSX.readFile(file, { cellDates: false });
  const rows = new Map();
  for (const sheetName of workbook.SheetNames) {
    if (/^sum|summary/i.test(sheetName)) continue;
    const county = countyForSheet(sheetName);
    if (!county) throw new Error("Could not identify county for sheet " + sheetName);
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, blankrows: false });
    for (const row of sheetRows.slice(3)) {
      const localUnit = cleanLocalUnit(row[0]);
      if (!localUnit || /^total/i.test(localUnit)) continue;
      const key = county + "\u0000" + localUnit.toUpperCase();
      const item = rows.get(key) ?? { county, localUnit };
      if (type === "president") {
        const harris = intValue(row[1]);
        const trump = intValue(row[2]);
        const other = intValue(row[3]) + intValue(row[4]) + intValue(row[7]);
        item.pres_harris = harris;
        item.pres_trump = trump;
        item.pres_other = other;
        item.pres_total = harris + trump + other;
      } else {
        const dem = intValue(row[1]);
        const rep = intValue(row[2]);
        const other = intValue(row[3]) + intValue(row[6]);
        item.gov_dem = dem;
        item.gov_rep = rep;
        item.gov_other = other;
        item.gov_total = dem + rep + other;
      }
      rows.set(key, item);
    }
  }
  return rows;
}

const presidentRows = readContest(presidentWorkbook, "president");
const governorRows = readContest(governorWorkbook, "governor");
for (const [key, row] of governorRows) {
  presidentRows.set(key, { ...(presidentRows.get(key) ?? { county: row.county, localUnit: row.localUnit }), ...row });
}

const header = [
  "state",
  "election_year",
  "county",
  "local_unit",
  "pres_harris",
  "pres_trump",
  "pres_other",
  "pres_total",
  "gov_dem",
  "gov_rep",
  "gov_other",
  "gov_total",
];
const output = [header.join(",")];
for (const row of [...presidentRows.values()].sort((a, b) => a.county.localeCompare(b.county) || a.localUnit.localeCompare(b.localUnit))) {
  const presTotal = row.pres_total ?? 0;
  const govTotal = row.gov_total ?? 0;
  if (!presTotal && !govTotal) continue;
  output.push([
    "NH",
    "2024",
    row.county,
    row.localUnit,
    row.pres_harris ?? 0,
    row.pres_trump ?? 0,
    row.pres_other ?? 0,
    presTotal,
    row.gov_dem ?? 0,
    row.gov_rep ?? 0,
    row.gov_other ?? 0,
    row.gov_total ?? 0,
  ].map(csvCell).join(","));
}
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, output.join("\n") + "\n");
console.log("Wrote " + (output.length - 1) + " New Hampshire town/ward rows to " + outputFile);

