import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const sourceId = "la-2020-sos-presidential-electors-precinct-csv";
const officialSourceUrl = "https://voterportal.sos.la.gov/static/20201103/resultsRace/Presidential";
const csvSourceUrl = "https://voterportal.sos.la.gov/ElectionResults/ElectionResults/Data?blob=20201103/csv/ByPrecinct_59568.csv";
const rawCsv = "data/la-2020-general-presidential-electors-by-precinct.csv";
const outputCsv = "data/la-historical-presidential-baseline.csv";
const summaryJson = "data/la-historical-presidential-baseline-summary.json";

const expected = {
  2020: {
    rows: 64,
    demVotes: 856034,
    repVotes: 1255776,
    otherVotes: 36252,
    totalVotes: 2148062,
  },
};

function absolute(relativePath) {
  return path.join(repoRoot, relativePath);
}

async function download(url, target) {
  mkdirSync(path.dirname(target), { recursive: true });
  const response = await fetch(url, { headers: { "User-Agent": "CivicResultMaps Louisiana historical baseline collector" } });
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  }
  writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  return body
    .filter((entry) => entry.some((value) => String(value ?? "").trim()))
    .map((entry) => Object.fromEntries(header.map((key, index) => [key, entry[index] ?? ""])));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function intValue(value) {
  const normalized = String(value ?? "").replace(/[^0-9-]/g, "");
  return normalized ? Number.parseInt(normalized, 10) : 0;
}

function parishName(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^la\s*salle$/i.test(raw)) return "LaSalle Parish";
  const titled = raw === raw.toUpperCase()
    ? raw.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
    : raw;
  return /\bparish$/i.test(titled) ? titled : `${titled} Parish`;
}

function candidateBucket(column) {
  const normalized = String(column ?? "").toLowerCase();
  if (normalized.includes("biden") && normalized.includes("dem")) return "dem";
  if (normalized.includes("trump") && normalized.includes("rep")) return "rep";
  return "other";
}

function totals(rows) {
  return rows.reduce(
    (sum, row) => ({
      rows: sum.rows + 1,
      demVotes: sum.demVotes + row.dem_votes,
      repVotes: sum.repVotes + row.rep_votes,
      otherVotes: sum.otherVotes + row.other_votes,
      totalVotes: sum.totalVotes + row.total_votes,
    }),
    { rows: 0, demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function buildRows() {
  const rows = parseCsv(readFileSync(absolute(rawCsv), "utf8"));
  const header = Object.keys(rows[0] ?? {});
  const voteColumns = header.filter((column) => !["Office", "Parish", "Ward", "Precinct"].includes(column));
  if (!voteColumns.some((column) => candidateBucket(column) === "dem")) {
    throw new Error("Official Louisiana 2020 CSV is missing the Biden Democratic column");
  }
  if (!voteColumns.some((column) => candidateBucket(column) === "rep")) {
    throw new Error("Official Louisiana 2020 CSV is missing the Trump Republican column");
  }

  const byParish = new Map();
  for (const sourceRow of rows) {
    const parish = parishName(sourceRow.Parish);
    if (!parish) continue;
    const bucket = byParish.get(parish) ?? { dem: 0, rep: 0, other: 0 };
    for (const column of voteColumns) {
      bucket[candidateBucket(column)] += intValue(sourceRow[column]);
    }
    byParish.set(parish, bucket);
  }

  return [...byParish.entries()]
    .map(([parish, votes]) => ({
      state: "LA",
      election_year: 2020,
      jurisdiction_name: parish,
      county: parish,
      local_unit: parish,
      source_id: sourceId,
      source_level: "county",
      row_method: "louisianaSosOfficialPrecinctCsvParishHistorical",
      source_url: csvSourceUrl,
      dem_votes: votes.dem,
      rep_votes: votes.rep,
      other_votes: votes.other,
      total_votes: votes.dem + votes.rep + votes.other,
    }))
    .sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));
}

async function main() {
  if (process.argv.includes("--download") || !existsSync(absolute(rawCsv))) {
    await download(csvSourceUrl, absolute(rawCsv));
  }

  const rows = buildRows();
  const actual = totals(rows);
  for (const [key, expectedValue] of Object.entries(expected[2020])) {
    if (actual[key] !== expectedValue) {
      throw new Error(`2020 expected ${key}=${expectedValue}, got ${actual[key]}`);
    }
  }

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
  writeFileSync(
    absolute(outputCsv),
    `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\n")}\n`,
  );

  const summary = {
    checkedAt: "2026-07-09",
    state: "LA",
    source: {
      authority: "Louisiana Secretary of State",
      sourcePageUrl: officialSourceUrl,
      precinctCsvUrl: csvSourceUrl,
      rawCsvLocalFile: rawCsv,
      normalizedCsvLocalFile: outputCsv,
      parserNormalizationPath: "scripts/collect-la-historical-baseline.mjs",
      rawCsvSha256: sha256(absolute(rawCsv)),
    },
    expected: expected[2020],
    actual,
    caveats: [
      "Louisiana parishes are Census county equivalents; normalized rows preserve Parish display names for county-equivalent joins.",
      "Rows are official 2020 parish presidential baselines for context and jurisdictionTag matching, not 2024 certified-result replacements.",
      "2012 and 2016 official parish historical baselines remain uncollected in this pass.",
    ],
  };
  writeFileSync(absolute(summaryJson), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ outputCsv, summaryJson, actual }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
