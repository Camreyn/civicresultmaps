import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const outputFile = process.argv[2] ?? "data/nh-historical-presidential-baseline.csv";

const countyTags = {
  "Belknap County": "county:33001",
  "Carroll County": "county:33003",
  "Cheshire County": "county:33005",
  "Coos County": "county:33007",
  "Grafton County": "county:33009",
  "Hillsborough County": "county:33011",
  "Merrimack County": "county:33013",
  "Rockingham County": "county:33015",
  "Strafford County": "county:33017",
  "Sullivan County": "county:33019",
};

const presidentSources = [
  {
    county: "Belknap County",
    file: "data/nh-2016-ge-president-summary-and-belknap.xls",
    url: "https://web.archive.org/web/20240720085645id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2016-ge-president-summary-and-belknap.xls",
  },
  {
    county: "Carroll County",
    file: "data/nh-2016-ge-president-carroll.xls",
    url: "https://web.archive.org/web/20240720085657id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2016-ge-president-carroll.xls",
  },
  {
    county: "Cheshire County",
    file: "data/nh-2016-ge-president-cheshire.xls",
    url: "https://web.archive.org/web/20240720085703id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2016-ge-president-cheshire.xls",
  },
  {
    county: "Coos County",
    file: "data/nh-2016-ge-president-coos.xls",
    url: "https://web.archive.org/web/20240720085707id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2016-ge-president-coos.xls",
  },
  {
    county: "Grafton County",
    file: "data/nh-2016-ge-president-grafton.xls",
    url: "https://web.archive.org/web/20240720085717id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2016-ge-president-grafton.xls",
  },
  {
    county: "Hillsborough County",
    file: "data/nh-2016-ge-president-hillsborough.xls",
    url: "https://web.archive.org/web/20240720085721id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2016-ge-president-hillsborough.xls",
  },
  {
    county: "Merrimack County",
    file: "data/nh-2016-ge-president-merrimack.xls",
    url: "https://web.archive.org/web/20240720085726id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2016-ge-president-merrimack.xls",
  },
  {
    county: "Rockingham County",
    file: "data/nh-2016-ge-president-rockingham.xls",
    url: "https://web.archive.org/web/20240720085729id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2016-ge-president-rockingham.xls",
  },
  {
    county: "Strafford County",
    file: "data/nh-2016-ge-president-strafford-and-sullivan.xls",
    url: "https://web.archive.org/web/20240720085733id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2016-ge-president-strafford-and-sullivan.xls",
  },
  {
    county: "Sullivan County",
    file: "data/nh-2016-ge-president-strafford-and-sullivan.xls",
    url: "https://web.archive.org/web/20240720085733id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2016-ge-president-strafford-and-sullivan.xls",
  },
];

const writeInFile = "data/nh-2016-ge-presidential-write-ins-summary.xls";
const writeInUrl =
  "https://web.archive.org/web/20240720085740id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2016-ge-presidential-write-ins-summary.xls";

const president2020File = "data/nh-2020-president.xls";
const president2020Url =
  "https://web.archive.org/web/20231127033944id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/documents/2020%20GE%20Election%20Tallies/2020-president.xls";
const writeIn2020File = "data/nh-2020-presidential-write-ins.xls";
const writeIn2020Url =
  "https://web.archive.org/web/20231127033944id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/documents/2020%20GE%20Election%20Tallies/2020-presidential-write-ins.xls";

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

function intValue(value) {
  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

function cleanCounty(value) {
  const cleaned = String(value ?? "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned || /^total/i.test(cleaned)) return "";
  return /county$/i.test(cleaned) ? cleaned.replace(/\bcounty$/i, "County") : `${cleaned} County`;
}

function readWriteIns() {
  const workbook = XLSX.readFile(writeInFile, { cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false });
  const totals = new Map();
  for (const row of rows.slice(3)) {
    const county = cleanCounty(row[0]);
    if (!county) continue;
    const writeIns = row.slice(1).reduce((sum, cell) => sum + intValue(cell), 0);
    totals.set(county, writeIns);
  }
  return totals;
}

function read2020WriteIns() {
  const workbook = XLSX.readFile(writeIn2020File, { cellDates: false });
  const sheet = workbook.Sheets.SUMMARY ?? workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false });
  const totals = new Map();
  for (const row of rows.slice(3)) {
    const county = cleanCounty(row[0]);
    if (!county) continue;
    const writeIns = row.slice(1).reduce((sum, cell) => sum + intValue(cell), 0);
    totals.set(county, writeIns);
  }
  return totals;
}

function readCountyTotals(source) {
  const workbook = XLSX.readFile(source.file, { cellDates: false });
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, blankrows: false });
    let inCountySection = false;
    for (const row of rows.slice(2)) {
      const county = cleanCounty(row[0]);
      if (county === source.county) {
        inCountySection = true;
        continue;
      }
      if (!inCountySection || !/^totals?$/i.test(String(row[0] ?? "").trim())) continue;
      const rep = intValue(row[1]);
      const dem = intValue(row[2]);
      const namedOther = intValue(row[3]) + intValue(row[4]) + intValue(row[5]);
      return { county: source.county, dem, rep, namedOther };
    }
  }
  throw new Error(`Could not find ${source.county} in ${source.file}`);
}

function read2020CountyTotals() {
  const workbook = XLSX.readFile(president2020File, { cellDates: false });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets["sum-belkpres"], {
    header: 1,
    raw: false,
    blankrows: false,
  });
  const totals = [];
  for (const row of rows.slice(3)) {
    if (/^totals?$/i.test(String(row[0] ?? "").trim())) break;
    const county = cleanCounty(row[0]);
    if (!county) continue;
    totals.push({ county, rep: intValue(row[1]), dem: intValue(row[2]), namedOther: intValue(row[3]) });
  }
  return totals;
}

const writeInsByCounty = readWriteIns();
const header = [
  "state",
  "election_year",
  "jurisdiction_name",
  "source_id",
  "source_level",
  "row_method",
  "dem_votes",
  "rep_votes",
  "other_votes",
  "total_votes",
  "source_url",
  "local_unit",
  "jurisdiction_tag",
  "notes",
];

const rows = [header];
for (const source of presidentSources) {
  const totals = readCountyTotals(source);
  const writeIns = writeInsByCounty.get(totals.county) ?? 0;
  const other = totals.namedOther + writeIns;
  rows.push([
    "NH",
    "2016",
    totals.county,
    "nh-2016-official-historical-presidential-workbooks",
    "county",
    "officialArchivedNewHampshire2016PresidentWorkbooks",
    totals.dem,
    totals.rep,
    other,
    totals.dem + totals.rep + other,
    source.url,
    totals.county,
    countyTags[totals.county],
    `Other includes Green, American Delta, Libertarian, and ${writeIns} official county write-in votes from ${writeInUrl}.`,
  ]);
}

const writeIns2020ByCounty = read2020WriteIns();
for (const totals of read2020CountyTotals()) {
  const writeIns = writeIns2020ByCounty.get(totals.county) ?? 0;
  const other = totals.namedOther + writeIns;
  rows.push([
    "NH",
    "2020",
    totals.county,
    "nh-2020-official-historical-presidential-workbooks",
    "county",
    "officialArchivedNewHampshire2020PresidentWorkbook",
    totals.dem,
    totals.rep,
    other,
    totals.dem + totals.rep + other,
    president2020Url,
    totals.county,
    countyTags[totals.county],
    `Other includes Libertarian and ${writeIns} official county write-in votes from ${writeIn2020Url}.`,
  ]);
}

const output = rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, output);
console.log(`Wrote ${rows.length - 1} New Hampshire historical baseline rows to ${outputFile}`);
