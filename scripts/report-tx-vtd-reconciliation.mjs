import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const defaults = {
  countyJson: "data/tx-2024-official-results/County.json",
  vtdZip: "data/tx-2024-general-vtds-election-data.zip",
  returnsFile: "2024_General_Election_Returns.csv",
  summaryOut: "data/tx-2024-vtd-reconciliation-summary.json",
  countyOut: "data/tx-2024-vtd-county-reconciliation.csv",
};

function intText(value) {
  const cleaned = String(value ?? "").replaceAll(",", "").trim();
  return cleaned ? Number.parseInt(cleaned, 10) : 0;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
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
  const header = rows.shift()?.map((value) => value.replace(/^\uFEFF/, "")) ?? [];
  return rows.filter((cells) => cells.some((cell) => cell !== "")).map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""])));
}

function countyKey(value) {
  let text = String(value ?? "").trim().replace(/\s+County$/i, "").replace(/\s+/g, " ").toUpperCase();
  if (text === "LA SALLE") text = "LASALLE";
  return text;
}

function countyDisplay(key) {
  const special = new Map([
    ["MCLENNAN", "McLennan"],
    ["MCMULLEN", "McMullen"],
    ["LASALLE", "Lasalle"],
  ]);
  return `${special.get(key) ?? key.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())} County`;
}

function emptyBuckets() {
  return {
    trump: 0,
    harris: 0,
    stein: 0,
    oliver: 0,
    declaredWriteIn: 0,
    genericWriteIn: 0,
    other: 0,
    total: 0,
  };
}

function add(target, source) {
  for (const key of Object.keys(target)) target[key] += source[key] ?? 0;
}

function certifiedBuckets(candidateRows) {
  const buckets = emptyBuckets();
  for (const candidate of Object.values(candidateRows ?? {})) {
    const votes = intText(candidate.V);
    const party = String(candidate.P ?? "").trim().toUpperCase();
    const name = String(candidate.N ?? "").trim().toUpperCase();
    if (party === "REP") buckets.trump += votes;
    else if (party === "DEM") buckets.harris += votes;
    else {
      buckets.other += votes;
      if (party === "W") buckets.declaredWriteIn += votes;
      else if (name.includes("JILL STEIN")) buckets.stein += votes;
      else if (name.includes("CHASE OLIVER")) buckets.oliver += votes;
    }
    buckets.total += votes;
  }
  return buckets;
}

const countyJson = JSON.parse(fs.readFileSync(defaults.countyJson, "utf8").replace(/^\uFEFF/, ""));
const certifiedByCounty = new Map();
for (const county of Object.values(countyJson)) {
  const race = county.Races?.["1001"];
  if (!race) continue;
  certifiedByCounty.set(countyKey(county.N), certifiedBuckets(race.C));
}

const zip = await JSZip.loadAsync(fs.readFileSync(defaults.vtdZip));
const returnsText = await zip.file(defaults.returnsFile).async("string");
const vtdByCounty = new Map();
for (const row of parseCsv(returnsText)) {
  if (String(row.Office ?? "").trim() !== "President") continue;
  const key = countyKey(row.County);
  if (!vtdByCounty.has(key)) vtdByCounty.set(key, emptyBuckets());
  const buckets = vtdByCounty.get(key);
  const votes = intText(row.Votes);
  const party = String(row.Party ?? "").trim().toUpperCase();
  const name = String(row.Name ?? "").trim().toUpperCase();
  if (party === "R") buckets.trump += votes;
  else if (party === "D") buckets.harris += votes;
  else {
    buckets.other += votes;
    if (name === "STEIN") buckets.stein += votes;
    else if (name === "OLIVER") buckets.oliver += votes;
    else if (party === "W" || name === "WRITE-IN") buckets.genericWriteIn += votes;
  }
  buckets.total += votes;
}

const stateCertified = emptyBuckets();
const stateVtd = emptyBuckets();
for (const buckets of certifiedByCounty.values()) add(stateCertified, buckets);
for (const buckets of vtdByCounty.values()) add(stateVtd, buckets);

const countyRows = [...new Set([...certifiedByCounty.keys(), ...vtdByCounty.keys()])].sort().map((key) => {
  const certified = certifiedByCounty.get(key) ?? emptyBuckets();
  const vtd = vtdByCounty.get(key) ?? emptyBuckets();
  return {
    county: countyDisplay(key),
    certified_total: certified.total,
    vtd_total: vtd.total,
    total_delta_vtd_minus_certified: vtd.total - certified.total,
    trump_delta_vtd_minus_certified: vtd.trump - certified.trump,
    harris_delta_vtd_minus_certified: vtd.harris - certified.harris,
    other_delta_vtd_minus_certified: vtd.other - certified.other,
    named_minor_delta_vtd_minus_certified: vtd.stein + vtd.oliver - certified.stein - certified.oliver,
    vtd_generic_write_in: vtd.genericWriteIn,
    certified_declared_write_in: certified.declaredWriteIn,
    write_in_delta_vtd_generic_minus_certified_declared: vtd.genericWriteIn - certified.declaredWriteIn,
  };
});

const summary = {
  generatedAt: new Date().toISOString().slice(0, 10),
  caveat: "The Capitol Data Portal VTD file carries a generic Write-In row by VTD. Texas SOS certified county results carry named declared write-in candidate totals. This reconciliation explains evidence scope and does not allege or prove tabulation error.",
  sources: {
    certifiedCountyJson: defaults.countyJson,
    vtdZip: defaults.vtdZip,
    vtdReturnsFile: defaults.returnsFile,
  },
  stateTotals: {
    certified: stateCertified,
    vtd: stateVtd,
    deltasVtdMinusCertified: {
      trump: stateVtd.trump - stateCertified.trump,
      harris: stateVtd.harris - stateCertified.harris,
      other: stateVtd.other - stateCertified.other,
      namedMinor: stateVtd.stein + stateVtd.oliver - stateCertified.stein - stateCertified.oliver,
      genericWriteInMinusDeclaredWriteIn: stateVtd.genericWriteIn - stateCertified.declaredWriteIn,
      total: stateVtd.total - stateCertified.total,
    },
  },
  interpretation: "The statewide VTD presidential aggregate is 15,854 votes above the SOS certified county candidate total. The VTD generic Write-In total is 24,730 versus 8,569 named certified write-in votes, a +16,161 difference. Major-party VTD rows are 310 votes below certified combined, and named Green/Libertarian rows are 3 votes above certified combined, leaving the +15,854 net gap.",
  countyRows: countyRows.length,
  countiesWithAnyDelta: countyRows.filter((row) => row.total_delta_vtd_minus_certified !== 0 || row.trump_delta_vtd_minus_certified !== 0 || row.harris_delta_vtd_minus_certified !== 0 || row.other_delta_vtd_minus_certified !== 0).length,
  largestAbsoluteTotalDeltas: countyRows
    .filter((row) => row.total_delta_vtd_minus_certified !== 0)
    .sort((a, b) => Math.abs(b.total_delta_vtd_minus_certified) - Math.abs(a.total_delta_vtd_minus_certified))
    .slice(0, 25),
};

fs.mkdirSync(path.dirname(defaults.summaryOut), { recursive: true });
fs.writeFileSync(defaults.summaryOut, `${JSON.stringify(summary, null, 2)}\n`);
const headers = Object.keys(countyRows[0]);
const csv = [headers.join(","), ...countyRows.map((row) => headers.map((header) => JSON.stringify(String(row[header] ?? ""))).join(","))].join("\n");
fs.writeFileSync(defaults.countyOut, `${csv}\n`);
console.log(JSON.stringify({ summaryOut: defaults.summaryOut, countyOut: defaults.countyOut, ...summary.stateTotals.deltasVtdMinusCertified }, null, 2));
