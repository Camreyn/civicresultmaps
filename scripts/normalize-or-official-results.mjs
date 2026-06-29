import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const inputPdf = "data/or-2024-general-official-results.pdf";
const presidentOut = "data/or-2024-general-president.csv";
const attorneyGeneralOut = "data/or-2024-general-attorney-general.csv";

const counties = [
  "Baker",
  "Benton",
  "Clackamas",
  "Clatsop",
  "Columbia",
  "Coos",
  "Crook",
  "Curry",
  "Deschutes",
  "Douglas",
  "Gilliam",
  "Grant",
  "Harney",
  "Hood River",
  "Jackson",
  "Jefferson",
  "Josephine",
  "Klamath",
  "Lake",
  "Lane",
  "Lincoln",
  "Linn",
  "Malheur",
  "Marion",
  "Morrow",
  "Multnomah",
  "Polk",
  "Sherman",
  "Tillamook",
  "Umatilla",
  "Union",
  "Wallowa",
  "Wasco",
  "Washington",
  "Wheeler",
  "Yamhill",
];

function intText(value) {
  return Number(String(value ?? "").replace(/,/g, "").trim() || "0");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, header, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    [
      header.join(","),
      ...rows.map((row) => header.map((column) => csvEscape(row[column])).join(",")),
    ].join("\n") + "\n",
  );
}

function contestBlock(text, contestName) {
  const start = text.indexOf(`\n${contestName}\n`);
  if (start < 0) throw new Error(`Could not find contest block: ${contestName}`);
  const nextPage = text.indexOf("\n--", start);
  if (nextPage < 0) throw new Error(`Could not find page break after contest block: ${contestName}`);
  return text.slice(start, nextPage);
}

function parseCountyRows(block, contestName, expectedColumnCount) {
  const rows = new Map();
  for (const county of counties) {
    const match = block.match(new RegExp(`^${county.replace(/ /g, "\\s+")}\\s+([\\d,\\s]+)$`, "m"));
    if (!match) throw new Error(`${contestName} missing county row: ${county}`);
    const values = match[1].trim().split(/\s+/).map(intText);
    if (values.length !== expectedColumnCount) {
      throw new Error(`${contestName} ${county} row has ${values.length} columns, expected ${expectedColumnCount}`);
    }
    rows.set(county, values);
  }
  const totalMatch = block.match(/^Total\s+([\d,\s]+)$/m);
  if (!totalMatch) throw new Error(`${contestName} missing Total row`);
  const totalValues = totalMatch[1].trim().split(/\s+/).map(intText);
  if (totalValues.length !== expectedColumnCount) {
    throw new Error(`${contestName} Total row has ${totalValues.length} columns, expected ${expectedColumnCount}`);
  }
  return { rows, totalValues };
}

function sumColumn(rows, columnIndex) {
  return [...rows.values()].reduce((sum, values) => sum + values[columnIndex], 0);
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function extractPdfText(filePath) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const result = await parser.getText();
    return result.text.replace(/\r\n/g, "\n");
  } finally {
    await parser.destroy();
  }
}

const text = await extractPdfText(inputPdf);

const president = parseCountyRows(contestBlock(text, "US President"), "US President", 8);
const presidentRows = [...president.rows.entries()].map(([county, values]) => {
  const other = values[0] + values[1] + values[2] + values[3] + values[5] + values[7];
  return {
    state: "OR",
    election_year: 2024,
    jurisdiction_name: county,
    harris: values[6],
    trump: values[4],
    other,
  };
});

assertEqual("US President county count", presidentRows.length, 36);
assertEqual("US President Trump total", sumColumn(president.rows, 4), 919480);
assertEqual("US President Harris total", sumColumn(president.rows, 6), 1240600);
assertEqual("US President other total", presidentRows.reduce((sum, row) => sum + row.other, 0), 84413);
assertEqual("US President total votes", presidentRows.reduce((sum, row) => sum + row.trump + row.harris + row.other, 0), 2244493);

const attorneyGeneral = parseCountyRows(contestBlock(text, "Attorney General"), "Attorney General", 3);
const attorneyGeneralRows = [...attorneyGeneral.rows.entries()].map(([county, values]) => ({
  state: "OR",
  election_year: 2024,
  jurisdiction_name: county,
  comparison_dem: values[1],
  comparison_rep: values[0],
  comparison_other: values[2],
}));

assertEqual("Attorney General county count", attorneyGeneralRows.length, 36);
assertEqual("Attorney General Republican total", sumColumn(attorneyGeneral.rows, 0), 967964);
assertEqual("Attorney General Democratic total", sumColumn(attorneyGeneral.rows, 1), 1156489);
assertEqual("Attorney General other total", sumColumn(attorneyGeneral.rows, 2), 2612);

writeCsv(presidentOut, ["state", "election_year", "jurisdiction_name", "harris", "trump", "other"], presidentRows);
writeCsv(
  attorneyGeneralOut,
  ["state", "election_year", "jurisdiction_name", "comparison_dem", "comparison_rep", "comparison_other"],
  attorneyGeneralRows,
);

console.log(`Wrote ${presidentRows.length} presidential county rows to ${presidentOut}`);
console.log(`Wrote ${attorneyGeneralRows.length} Attorney General county rows to ${attorneyGeneralOut}`);
