import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const presidentWorkbook = process.argv[2] ?? "data/nh-2024-ge-president.xls";
const governorWorkbook = process.argv[3] ?? "data/nh-2024-ge-governor.xls";
const outputFile = process.argv[4] ?? "data/nh-2024-town-ward-president-governor.csv";
const houseDistrict1Workbook = process.argv[5] ?? "data/nh-2024-ge-congressional-district-1.xlsx";
const houseDistrict2Workbook = process.argv[6] ?? "data/nh-2024-ge-congressional-district-2.xlsx";
const ballotsCastWorkbook = process.argv[7] ?? "data/nh-2024-ge-ballots-cast.xls";
const checklistWorkbook = process.argv[8] ?? "data/nh-2024-ge-names-on-checklist.xlsx";

const workbookSourceUrl = "https://www.sos.nh.gov/2024-general-election-results";

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
  const cleaned = String(value ?? "").replace(/\*/g, "").replace(/\s*-\s*Ward\s+/gi, " Ward ").replace(/\s+/g, " ").trim();
  const aliases = new Map([
    ["At. & Gil. Academy Grant", "Atkinson & Gilmanton Academy Grant"],
    ["Atk. & Gilm. Ac. Gt.", "Atkinson & Gilmanton Academy Grant"],
    ["Atkinson and Gilmanton Academy Grant", "Atkinson & Gilmanton Academy Grant"],
    ["Sargents Purchase", "Sargent's Purchase"],
    ["Wentworth's Loc.", "Wentworth's Location"],
  ]);
  return aliases.get(cleaned) ?? cleaned;
}

function joinKey(localUnit) {
  return cleanLocalUnit(localUnit).toUpperCase();
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
      const key = county + "\u0000" + joinKey(localUnit);
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

function indexByLocalUnit(rows) {
  const index = new Map();
  for (const row of rows.values()) {
    const key = joinKey(row.localUnit);
    if (index.has(key)) {
      throw new Error("Duplicate New Hampshire local unit in President workbook: " + row.localUnit);
    }
    index.set(key, row);
  }
  return index;
}

function mergeHouseContest(file, district, rowsByLocalUnit) {
  const workbook = XLSX.readFile(file, { cellDates: false });
  const unmatched = [];
  let merged = 0;
  for (const sheetName of workbook.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, blankrows: false });
    for (const row of sheetRows.slice(3)) {
      const localUnit = cleanLocalUnit(row[0]);
      if (!localUnit || /^total/i.test(localUnit)) continue;
      const dem = intValue(row[1]);
      const rep = intValue(row[2]);
      const other = intValue(row[5]);
      const target = rowsByLocalUnit.get(joinKey(localUnit));
      if (!target) {
        if (dem + rep + other === 0) continue;
        unmatched.push(localUnit);
        continue;
      }
      target.house_district = district;
      target.house_dem = dem;
      target.house_rep = rep;
      target.house_other = other;
      target.house_total = dem + rep + other;
      merged += 1;
    }
  }
  if (unmatched.length) {
    throw new Error("Unmatched New Hampshire U.S. House local units: " + unmatched.join(", "));
  }
  return merged;
}

function countyFromHeading(value, suffix) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(.+?)\s+COUNTY\//i);
  if (!match || !text.toUpperCase().includes(suffix)) return null;
  const rawCounty = cleanLocalUnit(match[1]).toLowerCase();
  return [...countyByPrefix.values()].find((county) => county.toLowerCase().startsWith(rawCounty)) ?? cleanLocalUnit(match[1]) + " County";
}

function mergeBallotsCast(file, presidentRows) {
  const workbook = XLSX.readFile(file, { cellDates: false });
  const unmatched = [];
  let merged = 0;
  for (const sheetName of workbook.SheetNames) {
    let county = null;
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, blankrows: false });
    for (const row of sheetRows) {
      const headingCounty = countyFromHeading(row[0], "BALLOTS CAST");
      if (headingCounty) {
        county = headingCounty;
        continue;
      }
      if (!county) continue;
      const localUnit = cleanLocalUnit(row[0]);
      if (!localUnit || /^november|^totals?$|^corrected\b/i.test(localUnit)) continue;
      const key = county + "\u0000" + joinKey(localUnit);
      const target = presidentRows.get(key);
      if (!target) {
        unmatched.push(county + " / " + localUnit);
        continue;
      }
      target.ballots_regular = intValue(row[1]);
      target.ballots_absentee = intValue(row[2]);
      target.ballots_cast = intValue(row[3]);
      merged += 1;
    }
  }
  if (unmatched.length) {
    throw new Error("Unmatched New Hampshire ballots-cast local units: " + unmatched.join(", "));
  }
  return merged;
}

function mergeChecklist(file, presidentRows) {
  const workbook = XLSX.readFile(file, { cellDates: false });
  const unmatched = [];
  let merged = 0;
  for (const sheetName of workbook.SheetNames) {
    let county = null;
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, blankrows: false });
    for (const row of sheetRows) {
      const headingCounty = countyFromHeading(row[0], "NAMES ON CHECKLIST");
      if (headingCounty) {
        county = headingCounty;
        continue;
      }
      if (!county) continue;
      const localUnit = cleanLocalUnit(row[0]);
      if (!localUnit || /^totals?$|^\d+\./i.test(localUnit)) continue;
      const registered = intValue(row[4]);
      const key = county + "\u0000" + joinKey(localUnit);
      const target = presidentRows.get(key);
      if (!target) {
        if (registered === 0) continue;
        unmatched.push(county + " / " + localUnit);
        continue;
      }
      target.checklist_republican = intValue(row[1]);
      target.checklist_democratic = intValue(row[2]);
      target.checklist_undeclared = intValue(row[3]);
      target.registered_voters = registered;
      target.same_day_registered = intValue(row[8]);
      merged += 1;
    }
  }
  if (unmatched.length) {
    throw new Error("Unmatched New Hampshire names-on-checklist local units: " + unmatched.join(", "));
  }
  return merged;
}

const presidentRows = readContest(presidentWorkbook, "president");
const governorRows = readContest(governorWorkbook, "governor");
for (const [key, row] of governorRows) {
  presidentRows.set(key, { ...(presidentRows.get(key) ?? { county: row.county, localUnit: row.localUnit }), ...row });
}
const rowsByLocalUnit = indexByLocalUnit(presidentRows);
const houseRows = mergeHouseContest(houseDistrict1Workbook, "1", rowsByLocalUnit) + mergeHouseContest(houseDistrict2Workbook, "2", rowsByLocalUnit);
const ballotsRows = mergeBallotsCast(ballotsCastWorkbook, presidentRows);
const checklistRows = mergeChecklist(checklistWorkbook, presidentRows);

const header = [
  "state",
  "election_year",
  "jurisdiction_name",
  "level",
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
  "house_district",
  "house_dem",
  "house_rep",
  "house_other",
  "house_total",
  "ballots_regular",
  "ballots_absentee",
  "ballots_cast",
  "checklist_republican",
  "checklist_democratic",
  "checklist_undeclared",
  "registered_voters",
  "same_day_registered",
  "turnout_pct",
  "denominator_type",
  "denominator_note",
  "warning_required",
  "source_url",
];
const output = [header.join(",")];
for (const row of [...presidentRows.values()].sort((a, b) => a.county.localeCompare(b.county) || a.localUnit.localeCompare(b.localUnit))) {
  const presTotal = row.pres_total ?? 0;
  const govTotal = row.gov_total ?? 0;
  if (!presTotal && !govTotal) continue;
  const registeredVoters = row.registered_voters ?? 0;
  const ballotsCast = row.ballots_cast ?? 0;
  const turnoutPct = registeredVoters ? ((ballotsCast / registeredVoters) * 100).toFixed(2) : "";
  output.push([
    "NH",
    "2024",
    row.localUnit,
    "town_ward",
    row.county,
    row.localUnit,
    row.pres_harris ?? 0,
    row.pres_trump ?? 0,
    row.pres_other ?? 0,
    presTotal,
    row.gov_dem ?? 0,
    row.gov_rep ?? 0,
    row.gov_other ?? 0,
    govTotal,
    row.house_district ?? "",
    row.house_dem ?? 0,
    row.house_rep ?? 0,
    row.house_other ?? 0,
    row.house_total ?? 0,
    row.ballots_regular ?? 0,
    row.ballots_absentee ?? 0,
    ballotsCast,
    row.checklist_republican ?? 0,
    row.checklist_democratic ?? 0,
    row.checklist_undeclared ?? 0,
    registeredVoters,
    row.same_day_registered ?? 0,
    turnoutPct,
    "namesOnChecklist",
    "New Hampshire Secretary of State names-on-checklist total from the 2024 General Election workbook.",
    !registeredVoters || !ballotsCast ? "true" : "false",
    workbookSourceUrl,
  ].map(csvCell).join(","));
}
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, output.join("\n") + "\n");
console.log("Wrote " + (output.length - 1) + " New Hampshire town/ward rows to " + outputFile);
console.log("Merged " + houseRows + " U.S. House rows, " + ballotsRows + " ballots-cast rows, and " + checklistRows + " names-on-checklist rows.");