import fs from "node:fs";
import path from "node:path";

const AGP_PATH = "data/de-2024-agp-registered-voted-report.txt";
const EAC_PATH = "data/eac-2024-state-turnout/de-2024-eac-turnout.csv";
const NOVEMBER_REG_PATH = "data/de-2024-november-1-party-registration.csv";
const OUT_CSV = "data/de-2024-agp-turnout-reconciliation.csv";
const OUT_SUMMARY = "data/de-2024-agp-turnout-reconciliation-summary.json";
const GENERATED_AT = process.env.SOURCE_DATE_EPOCH
  ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  : "2026-07-02T00:00:00.000Z";

function parseNumber(value) {
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  return cleaned ? Number(cleaned) : 0;
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function readCsv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]));
  });
}

function blankCounty() {
  return { electionDistrictRows: 0, registeredVoters: 0, voted: 0 };
}

function parseAgp() {
  const counties = new Map();
  let currentCounty = "";
  let currentDistrict = "";
  const lines = fs.readFileSync(AGP_PATH, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/\s+/g, " ");
    if (["KENT COUNTY", "NEW CASTLE COUNTY", "SUSSEX COUNTY"].includes(line)) {
      currentCounty = line;
      currentDistrict = "";
      if (!counties.has(currentCounty)) counties.set(currentCounty, blankCounty());
      continue;
    }
    if (line.startsWith("Representative District ")) {
      currentDistrict = "";
      continue;
    }
    const district = line.match(/^Election District (\d{2}-\d{2})$/);
    if (district) {
      currentDistrict = district[1];
      continue;
    }
    if (!currentCounty || !currentDistrict || !line.startsWith("i. Total")) continue;
    const numbers = [...line.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((match) => match[0]);
    if (numbers.length < 12) {
      throw new Error(`Could not parse AGP total row for ${currentCounty} ${currentDistrict}: ${line}`);
    }
    const totalRegistered = parseNumber(numbers.at(-3));
    const totalVoted = parseNumber(numbers.at(-2));
    const row = counties.get(currentCounty) ?? blankCounty();
    row.electionDistrictRows += 1;
    row.registeredVoters += totalRegistered;
    row.voted += totalVoted;
    counties.set(currentCounty, row);
  }
  return counties;
}

const agpByCounty = parseAgp();
const eacByCounty = new Map(readCsv(EAC_PATH).map((row) => [row.jurisdiction_name.toUpperCase(), row]));
const novemberByCounty = new Map();
for (const row of readCsv(NOVEMBER_REG_PATH)) {
  for (const county of ["KENT", "NEW CASTLE", "SUSSEX"]) {
    novemberByCounty.set(`${county} COUNTY`, (novemberByCounty.get(`${county} COUNTY`) ?? 0) + parseNumber(row[county]));
  }
}

const rows = [...agpByCounty.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([county, agp]) => {
  const eac = eacByCounty.get(county);
  if (!eac) throw new Error(`Missing EAC row for ${county}`);
  const novemberRegistration = novemberByCounty.get(county) ?? 0;
  return {
    county,
    agp_election_district_rows: agp.electionDistrictRows,
    agp_registered_voters: agp.registeredVoters,
    agp_voted: agp.voted,
    eac_registered_voters: parseNumber(eac.registered_voters),
    eac_ballots_cast: parseNumber(eac.ballots_cast),
    november_1_registered_voters: novemberRegistration,
    agp_minus_eac_registered_voters: agp.registeredVoters - parseNumber(eac.registered_voters),
    agp_voted_minus_eac_ballots_cast: agp.voted - parseNumber(eac.ballots_cast),
    november_1_minus_agp_registered_voters: novemberRegistration - agp.registeredVoters,
    caveat: "AGP voted and EAC ballots-cast fields may use different turnout semantics; keep EAC fallback active until replacement semantics are reviewed.",
  };
});

const header = Object.keys(rows[0]);
const csv = [header.join(","), ...rows.map((row) => header.map((key) => JSON.stringify(String(row[key]))).join(","))].join("\n") + "\n";
fs.writeFileSync(OUT_CSV, csv);

const totals = rows.reduce((acc, row) => {
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "number") acc[key] = (acc[key] ?? 0) + value;
  }
  return acc;
}, {});
const summary = {
  state: "DE",
  electionYear: 2024,
  sourceAuthority: "Delaware Department of Elections; U.S. Election Assistance Commission",
  generatedAt: GENERATED_AT,
  inputArtifacts: [AGP_PATH, EAC_PATH, NOVEMBER_REG_PATH],
  outputArtifact: OUT_CSV,
  totals,
  activeTurnoutDecision: "keep_eac_fallback_active_pending_agp_semantics_review",
  caveats: [
    "The DOE AGP report provides registered and voted rows by election district plus summaries, but this normalizer uses only election-district i. Total rows to avoid double-counting summary sections.",
    "AGP statewide voted is 3,719 above EAC ballots cast; registered-voter totals also differ by timing/source, so AGP is not activated as turnout replacement in etl/state-configs/de.json.",
  ],
};
fs.writeFileSync(OUT_SUMMARY, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Wrote ${OUT_CSV} and ${OUT_SUMMARY}`);
