import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

const artifactPath = "data/us-2024-election-bomb-threat-tracker-brennan-center.pdf";
const geometryPath = "public/data/national-counties.geojson";
const outputPath = "data/brennan-2024-election-bomb-threat-tracker.json";
const sourceUrl =
  "https://www.brennancenter.org/sites/default/files/2025-03/bcj-2024-election-bomb-threat-tracker_0.pdf";

const stateMetadata = {
  Arizona: { code: "AZ", name: "Arizona" },
  California: { code: "CA", name: "California" },
  Georgia: { code: "GA", name: "Georgia" },
  Maryland: { code: "MD", name: "Maryland" },
  Michigan: { code: "MI", name: "Michigan" },
  Minnesota: { code: "MN", name: "Minnesota" },
  Oregon: { code: "OR", name: "Oregon" },
  Pennsylvania: { code: "PA", name: "Pennsylvania" },
  Wisconsin: { code: "WI", name: "Wisconsin" },
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeCountyName(value) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\s+county$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isoDate(value) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new Error(`Unsupported tracker date: ${value}.`);
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function extractUrls(value) {
  const compact = value.replace(/\s+/g, "");
  return unique(
    [...compact.matchAll(/https:\/\/.*?(?=(?:;|,)https:\/\/|$)/g)]
      .map((match) => match[0].replace(/[;,]+$/, ""))
      .filter((url) => {
        try {
          return new URL(url).protocol === "https:";
        } catch {
          return false;
        }
      }),
  );
}

async function extractPdfText(buffer) {
  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text.replace(/\r\n/g, "\n");
  } finally {
    await parser?.destroy();
  }
}

function parseTrackerRows(text) {
  const lines = text
    .replace(/^-- \d+ of \d+ --$/gm, "")
    .split("\n")
    .map((line) => line.trimEnd());
  const rows = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!/^11\/\d{1,2}\/2024\b/.test(line)) continue;

    const cells = line.split(/\t+/).map((cell) => cell.trim());
    const dateAndState = cells[0]?.match(/^(11\/\d{1,2}\/2024)\s+(.+)$/);
    if (!dateAndState || cells.length < 3) {
      throw new Error(`Could not parse tracker row: ${line}`);
    }

    const [, sourceDate, sourceState] = dateAndState;
    const sourceCounty = cells[1];
    const threatCount = Number(cells[2]);
    const sourceLines = cells.slice(3);

    while (index + 1 < lines.length) {
      const next = lines[index + 1].trim();
      if (/^(?:11\/\d{1,2}\/2024|TOTAL\b)/.test(next)) break;
      index += 1;
      if (next && !/^-- \d+ of \d+ --$/.test(next)) sourceLines.push(next);
    }

    const state = stateMetadata[sourceState];
    if (!state) throw new Error(`Unsupported tracker state: ${sourceState}.`);
    if (!Number.isInteger(threatCount) || threatCount < 1) {
      throw new Error(`Invalid threat count for ${sourceState} ${sourceCounty}.`);
    }

    rows.push({
      eventDate: isoDate(sourceDate),
      sourceCounty,
      sourceState,
      sourceUrls: extractUrls(sourceLines.join("")),
      state: state.code,
      stateName: state.name,
      threatCount,
    });
  }

  return rows;
}

const artifact = await readFile(artifactPath);
const geometry = JSON.parse(await readFile(geometryPath, "utf8"));
const text = await extractPdfText(artifact);
const parsedRows = parseTrackerRows(text);
const featuresByState = new Map();

for (const feature of geometry.features ?? []) {
  const rows = featuresByState.get(feature.properties.STATE) ?? [];
  rows.push(feature.properties);
  featuresByState.set(feature.properties.STATE, rows);
}

const rows = parsedRows.map((row) => {
  const unspecified = /^Unspecified\*?$/i.test(row.sourceCounty);
  if (unspecified) {
    return {
      ...row,
      county: null,
      jurisdictionCode: null,
      jurisdictionTag: `state:${row.state}:unspecified`,
      reportingGrain: "statewide_unspecified",
    };
  }

  const normalizedSourceCounty = normalizeCountyName(row.sourceCounty);
  const candidates = (featuresByState.get(row.state) ?? []).filter(
    (feature) => normalizeCountyName(feature.NAME) === normalizedSourceCounty,
  );
  if (candidates.length !== 1) {
    throw new Error(
      `Expected one county geometry match for ${row.state} ${row.sourceCounty}; found ${candidates.length}.`,
    );
  }
  const [county] = candidates;
  return {
    ...row,
    county: county.NAME,
    jurisdictionCode: county.GEOID,
    jurisdictionTag: `county:${county.GEOID}`,
    reportingGrain: "county",
  };
});

const reportedThreatCount = rows.reduce((sum, row) => sum + row.threatCount, 0);
const stateCodes = unique(rows.map((row) => row.state)).sort();
const countyRows = rows.filter((row) => row.reportingGrain === "county");
const statewideRows = rows.filter((row) => row.reportingGrain === "statewide_unspecified");

if (reportedThreatCount !== 227) {
  throw new Error(`Expected the tracker rows to sum to 227 threats; found ${reportedThreatCount}.`);
}
if (stateCodes.join(",") !== "AZ,CA,GA,MD,MI,MN,OR,PA,WI") {
  throw new Error(`Unexpected tracker states: ${stateCodes.join(",")}.`);
}
if (statewideRows.length !== 2) {
  throw new Error(`Expected two statewide-unspecified rows; found ${statewideRows.length}.`);
}

const output = {
  schemaVersion: 1,
  sourceAuthority: "Brennan Center for Justice",
  sourceTitle: "2024 Election Bomb Threat Tracker",
  sourceUrl,
  localArtifact: artifactPath,
  sha256: createHash("sha256").update(artifact).digest("hex"),
  acquiredAt: "2026-07-13",
  lastUpdated: "2025-03-28",
  electionYear: 2024,
  reportingWindow: {
    start: rows.map((row) => row.eventDate).sort()[0],
    end: rows.map((row) => row.eventDate).sort().at(-1),
  },
  normalizationPath: "scripts/extract-brennan-security-tracker.mjs",
  expected: {
    rowCount: rows.length,
    stateCount: stateCodes.length,
    countyRowCount: countyRows.length,
    countyCount: new Set(countyRows.map((row) => row.jurisdictionTag)).size,
    statewideUnspecifiedRowCount: statewideRows.length,
    reportedThreatCount,
  },
  caveat:
    "The Brennan Center says this tracker is based on its research of publicly available information and may not be exhaustive. It is a later public-source compilation, not an official FBI roster. Statewide-unspecified rows are retained in totals without assigning them to a county.",
  rows,
};

await writeFile(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(
  `Extracted ${rows.length} tracker rows (${countyRows.length} county rows and ${statewideRows.length} statewide rows) totaling ${reportedThreatCount} threats.`,
);
