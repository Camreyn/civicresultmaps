import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { gzipSync } from "node:zlib";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import XLSX from "xlsx";
import { reportingUnitCode } from "../src/lib/precinct-geography.ts";

const STATE = "IA";
const YEAR_SPECS = Object.freeze({
  2012: { electionId: "2012-11-06-general", expectedRows: 1_686 },
  2016: { electionId: "2016-11-08-general", expectedRows: 1_680 },
  2020: { electionId: "2020-11-03-general", expectedRows: 1_661 },
  2024: { electionId: "2024-11-05-general", expectedRows: 1_653 },
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const normalizedKey = (value) => String(value ?? "")
  .normalize("NFKC")
  .trim()
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/\s+/g, " ")
  .toUpperCase();
const integer = (value, label) => {
  const parsed = Number(String(value ?? "0").replaceAll(",", "").trim());
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label} is not a nonnegative integer: ${value}`);
  return parsed;
};

function parseArgs(argv) {
  const parsed = {};
  for (const token of argv) {
    if (token === "--check") {
      parsed.check = true;
      continue;
    }
    const match = token.match(/^--([^=]+)=(.+)$/);
    if (!match) throw new Error(`Unsupported argument: ${token}`);
    parsed[match[1]] = match[2];
  }
  const year = Number(parsed.year);
  if (!YEAR_SPECS[year]) throw new Error("Use --year=2012, --year=2016, --year=2020, or --year=2024");
  if (parsed["retrieved-at"] && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(parsed["retrieved-at"])) {
    throw new Error("--retrieved-at must be an exact UTC ISO timestamp");
  }
  return {
    year,
    retrievedAt: parsed["retrieved-at"] ?? null,
    check: parsed.check === true,
  };
}

function repoPath(root, relative, label = "artifact") {
  if (typeof relative !== "string" || path.isAbsolute(relative) || relative.includes("\\") || relative.split("/").includes("..")) {
    throw new Error(`Unsafe ${label} path: ${relative}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relative.split("/"));
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`${label} escapes repository: ${relative}`);
  return resolved;
}

function json(root, relative) {
  return JSON.parse(readFileSync(repoPath(root, relative), "utf8"));
}

function countyContext(root) {
  const document = json(root, "data/precinct-geometry/IA/2012-11-06-general/raw/census/ia-county-parent-geoids.json");
  if (document.schemaVersion !== 1 || document.countyCount !== 99 || document.counties?.length !== 99) {
    throw new Error("Iowa county parent context drifted");
  }
  return new Map(document.counties.map((row) => [normalizedKey(row.county), row]));
}

function lookupCounty(counties, value) {
  const key = normalizedKey(value);
  const exact = counties.get(key);
  if (exact) return exact;
  const compact = key.replace(/[^A-Z0-9]/g, "");
  return [...counties.entries()].find(([candidate]) => candidate.replace(/[^A-Z0-9]/g, "") === compact)?.[1] ?? null;
}

function resultRow(spec, county, sourceUnitId, sourceDisplayName, democratic, republican, other) {
  const total = democratic + republican + other;
  return {
    resultUnitCode: reportingUnitCode({
      state: STATE,
      electionId: spec.electionId,
      reportingGrain: "precinct",
      parentGeoid: county.geoid,
      sourceUnitId,
    }),
    sourceUnitId,
    sourceDisplayName,
    parentGeoid: county.geoid,
    parentSourceName: county.censusDisplayName,
    democratic,
    republican,
    other,
    total,
  };
}

function collect2012(root, counties) {
  const sourcePath = "data/precinct-geometry/IA/2012-11-06-general/reports/ia-2012-11-06-presidential-precinct-results.json";
  const bytes = readFileSync(repoPath(root, sourcePath));
  const source = JSON.parse(bytes);
  if (source.state !== STATE || source.electionId !== YEAR_SPECS[2012].electionId || source.countyWorkbookCount !== 99 || !source.statewideReconciles) {
    throw new Error("Iowa 2012 reconciled official-result report drifted");
  }
  const rows = source.rows.filter((row) => row.isGeographic).map((row) => {
    const county = lookupCounty(counties, row.county);
    if (!county || county.geoid !== row.parentGeoid) throw new Error(`Iowa 2012 county identity drifted: ${row.county}`);
    const totalSlice = row.sourceSlices?.total;
    const democratic = integer(totalSlice?.Obama, `${row.sourceIdentity} Obama`);
    const republican = integer(totalSlice?.Romney, `${row.sourceIdentity} Romney`);
    const other = ["Goode", "Stein", "Johnson", "LaRiva", "Harris", "Litzel", "writeIn"]
      .reduce((sum, key) => sum + integer(totalSlice?.[key], `${row.sourceIdentity} ${key}`), 0);
    return resultRow(YEAR_SPECS[2012], county, String(row.sourceUnitId), String(row.sourceDisplayName), democratic, republican, other);
  });
  return {
    rows,
    exclusions: source.rows.filter((row) => !row.isGeographic).map((row) => ({
      parentGeoid: row.parentGeoid,
      sourceUnitId: row.sourceUnitId,
      sourceDisplayName: row.sourceDisplayName,
      reason: "Official all-zero administrative ABSENTEE source row; not a precinct polygon.",
    })),
    sources: [{
      authority: "Iowa Secretary of State",
      sourceUrl: source.indexUrl,
      artifact: sourcePath,
      sha256: sha256(bytes),
      byteCount: bytes.length,
      role: "Reconciled identity and presidential-vote extraction from all 99 retained official county XLS workbooks.",
    }],
  };
}

function workbookFiles(root, year) {
  const relative = `data/precinct-geometry/IA/${YEAR_SPECS[year].electionId}/raw/ia-sos/county-workbooks`;
  const directory = repoPath(root, relative);
  const files = readdirSync(directory).filter((name) => /\.xlsx?$/i.test(name)).sort();
  if (files.length !== 99) throw new Error(`Iowa ${year} official workbook count drifted: ${files.length}`);
  return { relative, directory, files };
}

function sourceArtifact(relative, fullPath, sourceUrl, role) {
  const bytes = readFileSync(fullPath);
  return { authority: "Iowa Secretary of State", sourceUrl, artifact: `${relative}/${path.basename(fullPath)}`, sha256: sha256(bytes), byteCount: bytes.length, role };
}

function collect2016(root, counties) {
  const spec = YEAR_SPECS[2016];
  const { relative, directory, files } = workbookFiles(root, 2016);
  const rows = [];
  const sources = [];
  for (const name of files) {
    const fullPath = path.join(directory, name);
    const workbook = XLSX.readFile(fullPath, { raw: true });
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: true, defval: null });
    const header = matrix[0] ?? [];
    const candidateRows = matrix.filter((row, index) => index > 0 && normalizedKey(row[0]) === "PRESIDENT AND VICE PRESIDENT");
    if (candidateRows.length !== 11) throw new Error(`${name} does not contain 11 presidential candidate rows`);
    const countyName = String(header.at(-1) ?? "").replace(/\s+Total$/i, "").trim();
    const county = lookupCounty(counties, countyName);
    if (!county) throw new Error(`${name} has unknown county header: ${countyName}`);
    const unitColumns = [];
    const firstUnitColumn = header.findIndex((value, index) => index >= 2 && /\s+Absentee$/i.test(String(value ?? "")));
    if (firstUnitColumn < 2) throw new Error(`${name} has no precinct vote columns`);
    for (let index = firstUnitColumn; index < header.length - 1; index += 3) {
      const value = String(header[index + 2] ?? "").trim();
      if (!/\s+Total$/i.test(value)) throw new Error(`${name} precinct total header drifted at column ${index + 2}`);
      const qualified = value.replace(/\s+Total$/i, "").trim();
      const sourceUnitId = qualified.replace(new RegExp(`^${countyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-`, "i"), "");
      unitColumns.push({ totalColumn: index + 2, sourceUnitId, sourceDisplayName: sourceUnitId });
    }
    for (const unit of unitColumns) {
      let democratic = 0;
      let republican = 0;
      let other = 0;
      for (const candidate of candidateRows) {
        const votes = integer(candidate[unit.totalColumn], `${name} ${unit.sourceUnitId} ${candidate[1]}`);
        const candidateName = normalizedKey(candidate[1]);
        if (candidateName.includes("HILLARY CLINTON")) democratic += votes;
        else if (candidateName.includes("DONALD J. TRUMP")) republican += votes;
        else other += votes;
      }
      rows.push(resultRow(spec, county, unit.sourceUnitId, unit.sourceDisplayName, democratic, republican, other));
    }
    sources.push(sourceArtifact(relative, fullPath, `https://sos.iowa.gov/elections/pdf/precinctresults/2016general/${name}`, "Official county precinct result workbook."));
  }
  return { rows, exclusions: [], sources };
}

function collect2020Workbook(root, counties, name, relative, directory) {
  const spec = YEAR_SPECS[2020];
  const fullPath = path.join(directory, name);
  const bytes = readFileSync(fullPath);
  if (bytes.subarray(0, 4).toString("hex") !== "504b0304") return null;
  const workbook = XLSX.read(bytes, { raw: true, type: "buffer" });
  const sheet = workbook.Sheets["2"];
  if (!sheet) throw new Error(`${name} is missing presidential sheet 2`);
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const candidates = matrix[1] ?? [];
  const columns = [];
  for (let index = 2; index < candidates.length - 1; index += 3) {
    if (candidates[index] == null) break;
    columns.push({ index: index + 2, name: normalizedKey(candidates[index]) });
  }
  if (columns.length !== 10) throw new Error(`${name} presidential candidate-column count drifted: ${columns.length}`);
  const prefix = name.match(/^(\d{2})-/)?.[1];
  const county = [...counties.values()].find((row) => row.geoid.slice(-3) === String(Number(prefix) * 2 - 1).padStart(3, "0"));
  if (!county) throw new Error(`${name} county FIPS sequence could not be resolved`);
  const rows = [];
  for (const line of matrix.slice(3)) {
    const label = String(line[0] ?? "").trim();
    if (!label || /^Total:?$/i.test(label)) continue;
    let democratic = 0;
    let republican = 0;
    let other = 0;
    for (const candidate of columns) {
      const votes = integer(line[candidate.index], `${name} ${label} ${candidate.name}`);
      if (candidate.name.includes("JOSEPH R. BIDEN")) democratic += votes;
      else if (candidate.name.includes("DONALD J. TRUMP")) republican += votes;
      else other += votes;
    }
    const reportedTotal = integer(line.at(-1), `${name} ${label} total`);
    if (reportedTotal !== democratic + republican + other) throw new Error(`${name} ${label} candidate total drifted`);
    rows.push(resultRow(spec, county, label, label, democratic, republican, other));
  }
  return {
    rows,
    source: sourceArtifact(relative, fullPath, `https://sos.iowa.gov/elections/pdf/precinctresults/2020general/${name}`, "Official county precinct result workbook."),
  };
}

async function collectScott2020(root, counties) {
  const relative = "data/precinct-geometry/IA/2020-11-03-general/raw/ia-sos/scott-county-official-detail.pdf";
  const fullPath = repoPath(root, relative);
  const bytes = readFileSync(fullPath);
  const parser = new PDFParse({ data: bytes });
  const parsed = await parser.getText();
  await parser.destroy();
  const lines = parsed.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const county = lookupCounty(counties, "Scott");
  const rows = [];
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\(([A-Z0-9]+)\)\s*(.*)$/);
    if (match) {
      current = { code: match[1], labelParts: [match[2]].filter(Boolean), collectingLabel: true };
      continue;
    }
    if (!current) continue;
    if (lines[index] === "Election") {
      current.collectingLabel = false;
      continue;
    }
    if (/^Day\s/.test(lines[index])) continue;
    if (/^Absentee\s/.test(lines[index])) continue;
    if (/^Total\s/.test(lines[index])) {
      const values = lines[index].replace(/^Total\s+/, "").split(/\s+/).map((value) => integer(value, `Scott ${current.code} total row`));
      if (values.length !== 13) throw new Error(`Scott ${current.code} total row has ${values.length} values`);
      const democratic = values[0];
      const republican = values[1];
      const other = values.slice(2, 10).reduce((sum, value) => sum + value, 0);
      const reportedTotal = values[12] - values[10] - values[11];
      if (reportedTotal !== democratic + republican + other) throw new Error(`Scott ${current.code} presidential total drifted`);
      const displayName = current.labelParts.join(" ").replace(/\s+/g, " ").trim();
      rows.push(resultRow(YEAR_SPECS[2020], county, current.code, displayName, democratic, republican, other));
      current = null;
      if (rows.length === 63) break;
      continue;
    }
    if (current.collectingLabel && !/^Page \d+ of |^-- \d+ of |^SCOTT COUNTY|^General Election|^President and Vice President$/.test(lines[index])) {
      current.labelParts.push(lines[index]);
    }
  }
  if (rows.length !== 63 || new Set(rows.map((row) => row.sourceUnitId)).size !== 63) {
    throw new Error(`Scott official PDF precinct count drifted: ${rows.length}`);
  }
  return {
    rows,
    source: {
      authority: "Iowa Secretary of State",
      sourceUrl: "https://sos.iowa.gov/elections/pdf/precinctresults/2020general/scott.pdf",
      artifact: relative,
      sha256: sha256(bytes),
      byteCount: bytes.length,
      role: "Official Scott County precinct-detail canvass used because the SOS workbook link returns HTML rather than XLSX.",
    },
  };
}

async function collect2020(root, counties) {
  const { relative, directory, files } = workbookFiles(root, 2020);
  const rows = [];
  const sources = [];
  let htmlWorkbook = null;
  for (const name of files) {
    const collected = collect2020Workbook(root, counties, name, relative, directory);
    if (!collected) {
      if (htmlWorkbook) throw new Error("More than one Iowa 2020 workbook is non-XLSX HTML");
      htmlWorkbook = name;
      continue;
    }
    rows.push(...collected.rows);
    sources.push(collected.source);
  }
  if (htmlWorkbook !== "82-scott.xlsx") throw new Error(`Unexpected Iowa 2020 HTML workbook: ${htmlWorkbook}`);
  const scott = await collectScott2020(root, counties);
  rows.push(...scott.rows);
  sources.push(scott.source);
  return { rows, exclusions: [], sources };
}

function xmlAttributes(text) {
  return Object.fromEntries([...text.matchAll(/([A-Za-z][A-Za-z0-9]*)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

async function collect2024(root, counties) {
  const baseRelative = "data/ia-2024-county-detailxml-reports";
  const base = repoPath(root, baseRelative);
  const directories = readdirSync(base).filter((name) => statSync(path.join(base, name)).isDirectory()).sort();
  if (directories.length !== 99) throw new Error(`Iowa 2024 official county-report count drifted: ${directories.length}`);
  const rows = [];
  const sources = [];
  for (const countyDirectory of directories) {
    const county = lookupCounty(counties, countyDirectory);
    if (!county) throw new Error(`Unknown Iowa 2024 county report: ${countyDirectory}`);
    const relative = `${baseRelative}/${countyDirectory}/detailxml.zip`;
    const fullPath = repoPath(root, relative);
    const bytes = readFileSync(fullPath);
    const archive = await JSZip.loadAsync(bytes);
    const member = Object.keys(archive.files).find((name) => /(?:^|\/)detail\.xml$/i.test(name));
    if (!member) throw new Error(`${countyDirectory} archive lacks detail.xml`);
    const xml = await archive.file(member).async("string");
    const contest = xml.match(/<Contest\b[^>]*text="President and Vice President"[^>]*>([\s\S]*?)<\/Contest>/i)?.[1];
    if (!contest) throw new Error(`${countyDirectory} report lacks presidential contest`);
    const byPrecinct = new Map();
    for (const choiceMatch of contest.matchAll(/<Choice\b([^>]*)>([\s\S]*?)<\/Choice>/gi)) {
      const choice = xmlAttributes(choiceMatch[1]);
      const bucket = choice.party === "DEM" ? "democratic" : choice.party === "REP" ? "republican" : "other";
      for (const voteType of choiceMatch[2].matchAll(/<VoteType\b([^>]*)>([\s\S]*?)<\/VoteType>/gi)) {
        const type = xmlAttributes(voteType[1]).name;
        if (!/^(Election Day|Absentee)$/i.test(type)) continue;
        for (const precinctMatch of voteType[2].matchAll(/<Precinct\b([^>]*)\/>/gi)) {
          const precinct = xmlAttributes(precinctMatch[1]);
          const record = byPrecinct.get(precinct.name) ?? { democratic: 0, republican: 0, other: 0 };
          record[bucket] += integer(precinct.votes, `${countyDirectory} ${precinct.name} ${choice.text} ${type}`);
          byPrecinct.set(precinct.name, record);
        }
      }
    }
    for (const [sourceUnitId, votes] of [...byPrecinct].sort(([left], [right]) => left.localeCompare(right))) {
      rows.push(resultRow(YEAR_SPECS[2024], county, sourceUnitId, sourceUnitId, votes.democratic, votes.republican, votes.other));
    }
    sources.push({
      authority: "Iowa Secretary of State",
      sourceUrl: readFileSync(path.join(base, countyDirectory, "source-url.txt"), "utf8").trim(),
      artifact: relative,
      sha256: sha256(bytes),
      byteCount: bytes.length,
      role: "Official county Clarity detail XML presidential precinct result report.",
    });
  }
  return { rows, exclusions: [], sources };
}

function validateCollected(year, collected) {
  const spec = YEAR_SPECS[year];
  if (collected.rows.length !== spec.expectedRows) throw new Error(`Iowa ${year} normalized row count drifted: ${collected.rows.length}`);
  const codes = new Set();
  const identities = new Set();
  for (const row of collected.rows) {
    if (!/^19\d{3}$/.test(row.parentGeoid)) throw new Error(`Iowa ${year} invalid county GEOID: ${row.parentGeoid}`);
    const identity = `${row.parentGeoid}|${normalizedKey(row.sourceUnitId)}`;
    if (identities.has(identity) || codes.has(row.resultUnitCode)) throw new Error(`Iowa ${year} duplicate result identity: ${identity}`);
    identities.add(identity);
    codes.add(row.resultUnitCode);
    if (![row.democratic, row.republican, row.other, row.total].every(Number.isSafeInteger) || row.total !== row.democratic + row.republican + row.other) {
      throw new Error(`Iowa ${year} invalid vote total: ${identity}`);
    }
  }
  collected.rows.sort((left, right) => left.parentGeoid.localeCompare(right.parentGeoid) || left.sourceUnitId.localeCompare(right.sourceUnitId));
  return {
    democratic: collected.rows.reduce((sum, row) => sum + row.democratic, 0),
    republican: collected.rows.reduce((sum, row) => sum + row.republican, 0),
    other: collected.rows.reduce((sum, row) => sum + row.other, 0),
    total: collected.rows.reduce((sum, row) => sum + row.total, 0),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const counties = countyContext(root);
  const collected = options.year === 2012 ? collect2012(root, counties)
    : options.year === 2016 ? collect2016(root, counties)
      : options.year === 2020 ? await collect2020(root, counties)
        : await collect2024(root, counties);
  const totals = validateCollected(options.year, collected);
  const spec = YEAR_SPECS[options.year];
  const document = {
    schemaVersion: 1,
    state: STATE,
    electionId: spec.electionId,
    reportingGrain: "precinct",
    sourceUnitCount: collected.rows.length + collected.exclusions.length,
    colorableUnitCount: collected.rows.length,
    excludedUnitCount: collected.exclusions.length,
    totals,
    collection: {
      retrievedAt: options.retrievedAt,
      authority: "Iowa Secretary of State",
      sourceArtifactCount: collected.sources.length,
      sources: collected.sources,
    },
    rows: collected.rows,
    exclusions: collected.exclusions,
  };
  const relative = `data/precinct-geometry/IA/${spec.electionId}/normalized/ia-${options.year}-president-results.json.gz`;
  const output = repoPath(root, relative, "output");
  const bytes = gzipSync(Buffer.from(`${JSON.stringify(document)}\n`), { level: 9 });
  let disposition = "created";
  if (options.check) {
    if (!existsSync(output) || !readFileSync(output).equals(bytes)) {
      throw new Error(`Iowa ${options.year} normalized result replay drifted: ${relative}`);
    }
    disposition = "verified_existing";
  } else {
    if (existsSync(output)) throw new Error(`Refusing to replace existing normalized result artifact: ${relative}`);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, bytes, { flag: "wx" });
  }
  process.stdout.write(`${JSON.stringify({ year: options.year, output: relative, byteCount: bytes.length, sha256: sha256(bytes), rows: document.colorableUnitCount, excluded: document.excludedUnitCount, totals, disposition })}\n`);
}

await main();
