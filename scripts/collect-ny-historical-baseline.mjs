import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

const state = "NY";
const output = "data/ny-historical-presidential-baseline.csv";
const countySource = "data/ny-2024-general-president.csv";

const documents = [
  {
    year: 2012,
    documentId: 106,
    localFile: "data/ny-2012-general.pdf",
    demColumns: [0, 3],
    repColumns: [1, 2],
    otherColumns: [4, 5, 6, 7],
    hasSeparateWriteInTotal: true,
    expected: { rows: 62, demVotes: 4485741, repVotes: 2490431, otherVotes: 159150, totalVotes: 7135322 },
  },
  {
    year: 2016,
    documentId: 116,
    localFile: "data/ny-2016-general.pdf",
    demColumns: [0, 4, 6],
    repColumns: [1, 2],
    otherColumns: [3, 5, 7],
    hasSeparateWriteInTotal: true,
    expected: { rows: 62, demVotes: 4556118, repVotes: 2819533, otherVotes: 426334, totalVotes: 7801985 },
  },
  {
    year: 2020,
    documentId: 128,
    localFile: "data/ny-2020-general.pdf",
    demColumns: [0, 3],
    repColumns: [1, 2],
    otherColumns: [4, 5, 6, 7],
    hasSeparateWriteInTotal: false,
    expected: { rows: 62, demVotes: 5244886, repVotes: 3251997, otherVotes: 116870, totalVotes: 8613753 },
  },
];

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function intValue(value) {
  const normalized = String(value ?? "").replace(/[^0-9]/g, "");
  return normalized ? Number(normalized) : 0;
}

function cleanLine(value) {
  return String(value ?? "")
    .replace(/Page\s+\d+\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCountyName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+County\s*$/i, "")
    .replace(/[.*]/g, "")
    .trim()
    .toLowerCase();
}

function documentUrl(documentId) {
  return `https://ny.elstats-staging.com/eng/files/serve/${documentId}`;
}

function readCountyMap() {
  const rows = readFileSync(countySource, "utf8").trim().split(/\r?\n/).slice(1);
  return new Map(rows.map((line) => {
    const county = line.split(",")[2];
    return [cleanCountyName(county), county];
  }));
}

async function downloadIfMissing(entry) {
  if (existsSync(entry.localFile)) return;
  const response = await fetch(documentUrl(entry.documentId), {
    headers: { "User-Agent": "CivicResultMaps data normalization" },
  });
  if (!response.ok) {
    throw new Error(`${documentUrl(entry.documentId)} failed: ${response.status} ${response.statusText}`);
  }
  await mkdir("data", { recursive: true });
  await writeFile(entry.localFile, Buffer.from(await response.arrayBuffer()));
}

function earliestContestEnd(text, start) {
  const starts = ["u.s. senator", "united states senator", "representative in congress"]
    .map((term) => text.toLowerCase().indexOf(term, start + 1))
    .filter((index) => index > 0)
    .sort((a, b) => a - b);
  return starts[0] ?? text.length;
}

function sumColumns(values, columns) {
  return columns.reduce((sum, index) => sum + values[index], 0);
}

async function parseDocument(entry, countyByName) {
  await downloadIfMissing(entry);
  const parser = new PDFParse({ data: readFileSync(entry.localFile) });
  try {
    const result = await parser.getText();
    const text = result.text.replace(/\r/g, "");
    const start = text.toLowerCase().indexOf("president");
    if (start < 0) throw new Error(`${entry.localFile} is missing a presidential section`);

    const presidentText = text.slice(start, earliestContestEnd(text, start));
    const recapIndex = presidentText.indexOf("RECAP");
    const candidateText = entry.hasSeparateWriteInTotal && recapIndex >= 0
      ? presidentText.slice(0, recapIndex)
      : presidentText;
    const rows = new Map();

    for (const rawLine of candidateText.split("\n")) {
      const line = cleanLine(rawLine);
      const matches = [...line.matchAll(/\d[\d,]*/g)];
      if (matches.length < 8) continue;

      const selected = matches.slice(-8);
      const county = countyByName.get(cleanCountyName(line.slice(0, selected[0].index)));
      if (!county || rows.has(county)) continue;

      const values = selected.map((match) => intValue(match[0]));
      const demVotes = sumColumns(values, entry.demColumns);
      const repVotes = sumColumns(values, entry.repColumns);
      const otherVotes = sumColumns(values, entry.otherColumns);
      rows.set(county, {
        state,
        election_year: entry.year,
        jurisdiction_name: county,
        county,
        local_unit: county,
        source_id: `ny-${entry.year}-general-official-pdf`,
        source_level: "county",
        row_method: "newYorkOfficialGeneralPdfCountyPresident",
        source_url: documentUrl(entry.documentId),
        dem_votes: demVotes,
        rep_votes: repVotes,
        other_votes: otherVotes,
        total_votes: demVotes + repVotes + otherVotes,
      });
    }

    if (entry.hasSeparateWriteInTotal) {
      const totals = new Map();
      const writeInText = recapIndex >= 0 ? presidentText.slice(recapIndex) : presidentText;
      for (const rawLine of writeInText.split("\n")) {
        const line = cleanLine(rawLine);
        const matches = [...line.matchAll(/\d[\d,]*/g)];
        if (matches.length < 2) continue;
        const county = countyByName.get(cleanCountyName(line.slice(0, matches[0].index)));
        if (county) totals.set(county, intValue(matches.at(-1)[0]));
      }

      for (const [county, row] of rows) {
        const totalVotes = totals.get(county);
        if (!totalVotes) throw new Error(`${entry.year} is missing final write-in total for ${county}`);
        row.total_votes = totalVotes;
        row.other_votes = totalVotes - row.dem_votes - row.rep_votes;
        if (row.other_votes < 0) throw new Error(`${entry.year} ${county} has negative computed other votes`);
      }
    }

    const parsedRows = [...rows.values()].sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));
    const totals = parsedRows.reduce(
      (sum, row) => ({
        rows: sum.rows + 1,
        demVotes: sum.demVotes + row.dem_votes,
        repVotes: sum.repVotes + row.rep_votes,
        otherVotes: sum.otherVotes + row.other_votes,
        totalVotes: sum.totalVotes + row.total_votes,
      }),
      { rows: 0, demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
    );
    for (const [key, expected] of Object.entries(entry.expected)) {
      if (totals[key] !== expected) throw new Error(`${entry.year} expected ${key}=${expected}, got ${totals[key]}`);
    }
    return parsedRows;
  } finally {
    await parser.destroy();
  }
}

const countyByName = readCountyMap();
const rows = (await Promise.all(documents.map((entry) => parseDocument(entry, countyByName)))).flat();
const headers = [
  "state",
  "election_year",
  "jurisdiction_name",
  "county",
  "local_unit",
  "source_id",
  "source_level",
  "row_method",
  "source_url",
  "dem_votes",
  "rep_votes",
  "other_votes",
  "total_votes",
];
const csv = `${[headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n")}\n`;
await writeFile(output, csv, "utf8");
console.log(JSON.stringify({ rows: rows.length, years: documents.map((entry) => entry.year), output }, null, 2));
