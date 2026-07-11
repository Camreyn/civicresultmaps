import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const root = process.cwd();
const data = path.join(root, "data");
const landingUrl = "https://www.elections.il.gov/ElectionOperations/DownloadVoteTotals.aspx";
const siteMapUrl = "https://www.elections.il.gov/PDFSiteMapProd.htm";
const refresh = process.argv.includes("--refresh");
const sources = [
  {
    year: 2016,
    file: "GE2016Cty.xls",
    id: "il-2016-general-candidate-totals-by-county",
    local: path.join(data, "il-2016-general-candidate-totals-by-county.xls"),
    expected: { sourceRows: 2923, rows: 102, dem: 3090729, rep: 2146015, other: 299680, total: 5536424 },
  },
  {
    year: 2020,
    file: "GE2020Cty.xls",
    id: "il-2020-general-candidate-totals-by-county",
    local: path.join(data, "il-2020-general-candidate-totals-by-county.xls"),
    expected: { sourceRows: 1361, rows: 102, dem: 3471915, rep: 2446891, other: 114938, total: 6033744 },
  },
];

function stableUrl(source) {
  return new URL(`/Downloads/ElectionOperations/VoteTotals/${source.file}`, landingUrl).href;
}

async function request(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "CivicResultMaps Illinois historical baseline collector" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function htmlLinks(html, base) {
  return [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].flatMap((match) => {
    try {
      return [new URL(match[1].replace(/&amp;/gi, "&"), base).href];
    } catch {
      return [];
    }
  });
}

async function discoverUrls(wanted) {
  const landingHtml = await (await request(landingUrl)).text();
  if (!/id=["']ContentPlaceHolder1_ddlCurrent["']/i.test(landingHtml)) {
    throw new Error("Illinois download page did not expose its vote-total year selector");
  }
  let links = htmlLinks(landingHtml, landingUrl);
  try {
    links = links.concat(htmlLinks(await (await request(siteMapUrl)).text(), siteMapUrl));
  } catch (error) {
    console.warn(`Illinois site-map lookup failed; using verified stable download routes: ${error.message}`);
  }
  return new Map(wanted.map((source) => {
    const yearPattern = new RegExp(`<option\\s+value=["']${source.year}["'][^>]*>\\s*${source.year}\\s*</option>`, "i");
    if (!yearPattern.test(landingHtml)) throw new Error(`${source.year} is not listed on ${landingUrl}`);
    const suffix = `/${source.file}`.toLowerCase();
    return [source.year, links.find((url) => new URL(url).pathname.toLowerCase().endsWith(suffix)) ?? stableUrl(source)];
  }));
}

let resolvedUrls = new Map(sources.map((source) => [source.year, stableUrl(source)]));
const needed = sources.filter((source) => refresh || !fs.existsSync(source.local));
if (needed.length) {
  const discovered = await discoverUrls(needed);
  resolvedUrls = new Map(sources.map((source) => [source.year, discovered.get(source.year) ?? stableUrl(source)]));
  for (const source of needed) {
    const bytes = Buffer.from(await (await request(resolvedUrls.get(source.year))).arrayBuffer());
    if (bytes.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1") {
      throw new Error(`${resolvedUrls.get(source.year)} did not return an OLE .xls workbook`);
    }
    fs.writeFileSync(source.local, bytes);
  }
}

function countyKey(value) {
  return String(value ?? "").normalize("NFKD").replace(/\bCOUNTY\b/gi, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

const countyReference = {
  authority: "U.S. Census Bureau",
  sourceUrl: "https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html",
  localFile: "data/il-counties.geojson",
};
const countyGeometryBuffer = fs.readFileSync(path.join(root, countyReference.localFile));
const countyGeometryPayload = JSON.parse(countyGeometryBuffer.toString("utf8"));
const geometry = new Map();
for (const feature of countyGeometryPayload.features ?? []) {
  const name = String(feature.properties?.NAME ?? "").trim();
  const geoid = String(feature.properties?.GEOID ?? "").trim();
  const key = countyKey(feature.properties?.BASENAME ?? name);
  if (!name || !key || !/^17\d{3}$/.test(geoid) || geometry.has(key)) {
    throw new Error(`Invalid Illinois county geometry: ${JSON.stringify(feature.properties ?? {})}`);
  }
  geometry.set(key, { name, tag: `county:${geoid}` });
}
if (geometry.size !== 102) throw new Error(`Expected 102 Illinois county features, got ${geometry.size}`);
countyReference.sha256 = createHash("sha256").update(countyGeometryBuffer).digest("hex");
countyReference.featureCount = geometry.size;
countyReference.joinFields = ["properties.BASENAME", "properties.NAME", "properties.GEOID"];

function integer(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`Invalid vote count for ${label}: ${value}`);
  return number;
}

function parseSource(source) {
  const buffer = fs.readFileSync(source.local);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  if (workbook.SheetNames.length !== 1) throw new Error(`${source.file} expected one sheet`);
  const sheetName = workbook.SheetNames[0];
  const input = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: true, defval: null });
  const required = ["Election", "OfficeName", "CanFirstName", "CanLastName", "County", "Votes", "PartyName", "PartyAbbrev"];
  const missing = required.filter((column) => !Object.hasOwn(input[0] ?? {}, column));
  if (missing.length) throw new Error(`${source.file} missing columns: ${missing.join(", ")}`);
  const contest = input.filter((row) => row.Election === `GE ${source.year}` && row.OfficeName === "PRESIDENT AND VICE PRESIDENT");
  if (contest.length !== source.expected.sourceRows) {
    throw new Error(`${source.file} expected ${source.expected.sourceRows} candidate/county rows, got ${contest.length}`);
  }

  const counties = new Map();
  const candidates = new Map();
  for (const row of contest) {
    const key = countyKey(row.County);
    const county = geometry.get(key);
    if (!county) throw new Error(`${source.file} has unknown county ${row.County}`);
    const label = [row.CanFirstName, row.CanLastName].filter(Boolean).join(" ").trim() || `Candidate ${row.CandidateID}`;
    const votes = integer(row.Votes, `${source.year} ${row.County} ${label}`);
    const party = String(row.PartyAbbrev ?? "").trim().toUpperCase();
    const bucket = counties.get(key) ?? { county, dem: 0, rep: 0, other: 0 };
    if (party === "DEM") bucket.dem += votes;
    else if (party === "REP") bucket.rep += votes;
    else bucket.other += votes;
    counties.set(key, bucket);
    const candidateKey = `${label}|${row.PartyName ?? ""}|${party}`;
    const candidate = candidates.get(candidateKey) ?? { candidate: label, partyName: row.PartyName || null, partyAbbrev: party || null, votes: 0 };
    candidate.votes += votes;
    candidates.set(candidateKey, candidate);
  }
  if (counties.size !== 102) throw new Error(`${source.file} expected 102 counties, got ${counties.size}`);
  const rows = [...counties.values()].map(({ county, dem, rep, other }) => ({
    state: "IL",
    election_year: source.year,
    jurisdiction_name: county.name,
    jurisdiction_tag: county.tag,
    local_unit: county.name,
    source_id: "il-historical-presidential-baseline",
    source_level: "county",
    row_method: "historicalPresidentialCsv",
    dem_votes: dem,
    rep_votes: rep,
    other_votes: other,
    total_votes: dem + rep + other,
    source_url: resolvedUrls.get(source.year),
    notes: "Official Illinois Candidate Totals by County; non-Democratic/non-Republican and write-in candidate votes are included in other_votes.",
  })).sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));
  const totals = rows.reduce((sum, row) => ({
    rows: sum.rows + 1,
    dem: sum.dem + row.dem_votes,
    rep: sum.rep + row.rep_votes,
    other: sum.other + row.other_votes,
    total: sum.total + row.total_votes,
  }), { rows: 0, dem: 0, rep: 0, other: 0, total: 0 });
  for (const key of ["rows", "dem", "rep", "other", "total"]) {
    if (totals[key] !== source.expected[key]) throw new Error(`${source.file} ${key}=${totals[key]}, expected ${source.expected[key]}`);
  }
  const candidateTotals = [...candidates.values()].sort((a, b) => b.votes - a.votes || a.candidate.localeCompare(b.candidate));
  if (candidateTotals.reduce((sum, row) => sum + row.votes, 0) !== totals.total) {
    throw new Error(`${source.file} candidate totals do not reconcile to its presidential total`);
  }
  return {
    rows,
    summary: {
      id: source.id,
      year: source.year,
      discoveryPageUrl: landingUrl,
      resolvedUrl: resolvedUrls.get(source.year),
      localFile: path.relative(root, source.local).replace(/\\/g, "/"),
      sha256: createHash("sha256").update(buffer).digest("hex"),
      byteLength: buffer.length,
      sheetName,
      sourceCandidateRows: contest.length,
      sourceCountyCount: counties.size,
      normalizedRowCount: rows.length,
      totals,
      candidateTotals,
    },
  };
}

const parsed = sources.map(parseSource);
const outputRows = parsed.flatMap((item) => item.rows).sort((a, b) => a.election_year - b.election_year || a.jurisdiction_name.localeCompare(b.jurisdiction_name));
if (outputRows.length !== 204) throw new Error(`Expected 204 historical rows, got ${outputRows.length}`);
const headers = ["state", "election_year", "jurisdiction_name", "jurisdiction_tag", "local_unit", "source_id", "source_level", "row_method", "dem_votes", "rep_votes", "other_votes", "total_votes", "source_url", "notes"];
const cell = (value) => /[",\r\n]/.test(String(value ?? "")) ? `"${String(value ?? "").replace(/"/g, '""')}"` : String(value ?? "");
fs.writeFileSync(path.join(data, "il-historical-presidential-baseline.csv"), `${[headers.join(","), ...outputRows.map((row) => headers.map((key) => cell(row[key])).join(","))].join("\n")}\n`);

const summary = {
  generatedAt: new Date().toISOString(),
  authority: "Illinois State Board of Elections",
  discoveryPageUrl: landingUrl,
  parser: "scripts/collect-il-historical-presidential-baseline.mjs",
  reportingGrain: "county",
  caveat: "Official Candidate Totals by County workbooks contain candidate and write-in votes, but not blank, undervote, or overvote records. Non-Democratic/non-Republican rows are other_votes. These are contextual historical baselines, not 2024 certified results.",
  countyReference,
  sources: parsed.map((item) => item.summary),
  output: { localFile: "data/il-historical-presidential-baseline.csv", rowCount: outputRows.length, rowsPerYear: { 2016: 102, 2020: 102 }, jurisdictionTagPattern: "county:<GEOID>" },
};
fs.writeFileSync(path.join(data, "il-historical-presidential-baseline-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary.output));
