import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

async function loadPdfParse() {
  try {
    return (await import("pdf-parse")).PDFParse;
  } catch (error) {
    if (!process.env.NODE_PATH) {
      throw error;
    }
    return require(resolve(process.env.NODE_PATH, "pdf-parse")).PDFParse;
  }
}

const PDFParse = await loadPdfParse();

const outputPath = resolve(repoRoot, process.argv[2] ?? "data/ne-historical-presidential-baseline.csv");

const sources = [
  {
    year: 2020,
    sourceId: "ne-2020-general-canvass-book",
    sourceUrl: "https://sos.nebraska.gov/sites/default/files/doc/elections/2020/2020-General-Canvass-Book.pdf",
    localFile: "data/ne-2020-general-canvass-book.pdf",
    pageIndexes: [10, 11],
    expected: { rows: 93, dem: 374583, rep: 556846, other: 24954 },
  },
  {
    year: 2016,
    sourceId: "ne-2016-general-canvass-book",
    sourceUrl: "https://sos.nebraska.gov/sites/default/files/doc/elections/2016/2016-canvass-book.pdf",
    localFile: "data/ne-2016-general-canvass-book.pdf",
    pageIndexes: [9, 10],
    expected: { rows: 93, dem: 284494, rep: 495961, other: 63772 },
  },
  {
    year: 2012,
    sourceId: "ne-2012-general-canvass-book",
    sourceUrl: "https://sos.nebraska.gov/sites/default/files/doc/elections/2012/2012-general-canvass.pdf",
    localFile: "data/ne-2012-general-canvass-book.pdf",
    pageIndexes: [7, 8],
    expected: { rows: 93, dem: 302081, rep: 475064, other: 17234 },
  },
];

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCanvassLines(text, source) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line
      .trim()
      .match(/^(.+?)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)(?:\s+([0-9][0-9,]*))?$/);
    if (!match) {
      continue;
    }

    const jurisdictionName = match[1].trim();
    if (
      /^total$/i.test(jurisdictionName) ||
      /^(Page|County|Federal|President|Candidate|Republican|Democratic|Libertarian|Scattering|Write|By Petition)/i.test(
        jurisdictionName,
      )
    ) {
      continue;
    }

    const values = match
      .slice(2)
      .filter(Boolean)
      .map((value) => Number(value.replaceAll(",", "")));
    const repVotes = values[0];
    const demVotes = values[1];
    const otherVotes = values.slice(2).reduce((sum, value) => sum + value, 0);
    rows.push({
      state: "NE",
      election_year: source.year,
      jurisdiction_name: jurisdictionName,
      source_id: source.sourceId,
      source_level: "county",
      row_method: "officialCanvassPdfText",
      dem_votes: demVotes,
      rep_votes: repVotes,
      other_votes: otherVotes,
      total_votes: demVotes + repVotes + otherVotes,
      source_url: source.sourceUrl,
    });
  }
  return rows;
}

function assertExpected(source, rows) {
  const totals = rows.reduce(
    (acc, row) => ({
      rows: acc.rows + 1,
      dem: acc.dem + row.dem_votes,
      rep: acc.rep + row.rep_votes,
      other: acc.other + row.other_votes,
    }),
    { rows: 0, dem: 0, rep: 0, other: 0 },
  );
  const mismatches = Object.entries(source.expected).filter(([key, expected]) => totals[key] !== expected);
  if (mismatches.length) {
    throw new Error(
      `${source.year} historical canvass totals mismatch: ${JSON.stringify(totals)} expected ${JSON.stringify(
        source.expected,
      )}`,
    );
  }
}

async function extractSource(source) {
  const data = await readFile(resolve(repoRoot, source.localFile));
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const text = source.pageIndexes.map((pageIndex) => result.pages[pageIndex]?.text ?? "").join("\n");
    const rows = parseCanvassLines(text, source);
    assertExpected(source, rows);
    return rows;
  } finally {
    await parser.destroy();
  }
}

const rows = (await Promise.all(sources.map(extractSource))).flat();
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
];
const csv = [header.join(","), ...rows.map((row) => header.map((key) => csvValue(row[key])).join(","))].join("\n");
await writeFile(outputPath, `${csv}\n`, "utf8");
console.log(`Wrote ${rows.length} Nebraska historical baseline rows to ${outputPath}`);

