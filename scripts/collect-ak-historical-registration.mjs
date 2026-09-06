import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = "data/ak-historical-registration";
const receiptFile = "source-receipts.json";
const sourceAuthority = "Alaska Division of Elections";
const landingUrl = "https://www.elections.alaska.gov/research/statistics/";

// Reviewed pins are independent of generated manifests. A source change needs
// review and an explicit code change, never an automatic hash rebase.
export const REPORTS = [
  {
    year: 2012, reportDate: "2012-11-03", precinctCount: 438, statewideRegisteredVoters: 506701,
    url: "https://www.elections.alaska.gov/statistics/vi_vrs_stats_party_2012.11.03.htm",
    rawFile: "ak-2012-11-03-registration-by-party-and-precinct.html", byteCount: 120699,
    sha256: "7293cb15bfcd4d9e4c040b252aac2c010c5c16b94dc2d4e4f43a91b8a4afef1a",
  },
  {
    year: 2016, reportDate: "2016-11-03", precinctCount: 441, statewideRegisteredVoters: 528879,
    url: "https://elections.alaska.gov/statistics/2016/NOV/VOTERS%20BY%20PARTY%20AND%20PRECINCT.htm",
    rawFile: "ak-2016-11-03-registration-by-party-and-precinct.html", byteCount: 186216,
    sha256: "54bfb4f7bec396c4d691b77be657dbc20a712f18257a33402949aa414b1cab97",
  },
  {
    year: 2020, reportDate: "2020-11-03", precinctCount: 441, statewideRegisteredVoters: 597319,
    url: "https://www.elections.alaska.gov/statistics/2020/NOV/VOTERS%20BY%20PARTY%20AND%20PRECINCT.htm",
    rawFile: "ak-2020-11-03-registration-by-party-and-precinct.html", byteCount: 179174,
    sha256: "8bb29c067798fa12499e7b87a5729f0cd99e311fd58129f5d7248b3610d90052",
  },
];
export const AGE_2012 = {
  year: 2012, reportDate: "2012-11-03",
  url: "https://www.elections.alaska.gov/statistics/vi_vrs_stats_age_2012.11.03.htm",
  rawFile: "ak-2012-11-03-registration-by-age.html", statewideRegisteredVoters: 506702, byteCount: 5958,
  sha256: "0e6d935834fbd5e221f050686b00d93a4e3d48e6360a6f0f150d082dc869154e",
};
const sources = [...REPORTS, AGE_2012];

function textFromHtml(bytes) {
  return bytes.toString("utf8")
    .replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&#8211;|&#x2013;/gi, "-").replace(/\s+/g, " ").trim();
}
function integer(value) {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value ?? "")) {
    throw new Error(`AK registration: invalid integer ${JSON.stringify(value)}.`);
  }
  const result = Number(value.replaceAll(",", ""));
  if (!Number.isSafeInteger(result)) throw new Error("AK registration: unsafe integer.");
  return result;
}
export function assertPinnedSource(bytes, source) {
  if (bytes.length !== source.byteCount || createHash("sha256").update(bytes).digest("hex") !== source.sha256) {
    throw new Error(`AK ${source.year}: source byte/SHA-256 mismatch for ${source.rawFile}; review required.`);
  }
}

export function parseDistrictTotals(bytes, report) {
  const text = textFromHtml(bytes);
  const dateMatch = text.match(/(?:DATE:\s*|AS OF\s*)(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  const reportDate = dateMatch && `${dateMatch[3]}-${dateMatch[1].padStart(2, "0")}-${dateMatch[2].padStart(2, "0")}`;
  if (reportDate !== report.reportDate) throw new Error(`AK ${report.year}: missing or changed report date.`);
  if (!/VOTER\s+REGISTRATION\s+BY\s+(?:PARTY\/?PRECINCT|PARTY\s+AND\s+PRECINCT)/i.test(text)) {
    throw new Error(`AK ${report.year}: expected party-and-precinct report heading is missing.`);
  }
  // Official 2012/2020 HTML omit some closing TR tags. Opening TR boundaries,
  // not a DOM repair heuristic, delimit this source-specific parser.
  const rows = bytes.toString("utf8").replace(/<!--[\s\S]*?-->/g, " ").split(/<tr\b[^>]*>/i).slice(1)
    .map((row) => [...row.split(/<\/tr>/i)[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => textFromHtml(cell[1])));
  const districts = new Map();
  const precincts = [];
  let active = null;
  let statewideSection = false;
  let statewide = null;
  for (const cells of rows) {
    const label = cells[0] ?? "";
    const districtHeading = label.match(/^DISTRICT (\d{2})$/i);
    if (districtHeading) {
      const district = districtHeading[1];
      if (active || statewideSection || districts.has(district) || !/^(?:0[1-9]|[1-3]\d|40)$/.test(district)) {
        throw new Error(`AK ${report.year}: duplicate, invalid, or unfinished district ${district}.`);
      }
      active = { district, precincts: new Map() };
      continue;
    }
    if (/^STATE\s*WIDE TOTALS$/i.test(label)) {
      if (active || statewideSection || districts.size !== 40) throw new Error(`AK ${report.year}: invalid statewide heading.`);
      statewideSection = true;
      continue;
    }
    const total = label.match(/^(?:TOTAL DISTRICT\s*)?\((\d+) PRECINCTS?\)$/i);
    if (total) {
      const published = { precinctCount: integer(total[1]), registeredVoters: integer(cells[1]) };
      if (statewideSection) {
        if (statewide) throw new Error(`AK ${report.year}: duplicate statewide total.`);
        statewide = published;
      } else {
        if (!active) throw new Error(`AK ${report.year}: district total without a district heading.`);
        const observed = [...active.precincts.values()];
        if (observed.length !== published.precinctCount || observed.reduce((sum, row) => sum + row.registeredVoters, 0) !== published.registeredVoters) {
          throw new Error(`AK ${report.year}: district ${active.district} precinct rows do not reconcile to its published total/count.`);
        }
        districts.set(active.district, { district: active.district, ...published });
        precincts.push(...observed);
        active = null;
      }
      continue;
    }
    const precinct = label.match(/^(\d{3}|\d{2}-\d{3})\s+(.+)$/);
    if (precinct) {
      if (!active || statewideSection || active.precincts.has(precinct[1])) {
        throw new Error(`AK ${report.year}: duplicate or unscoped precinct ${precinct[1]}.`);
      }
      const code = precinct[1];
      if (report.year !== 2012 && !code.startsWith(`${active.district}-`)) {
        throw new Error(`AK ${report.year}: precinct ${code} does not match its published district heading.`);
      }
      active.precincts.set(code, {
        district: active.district, sourcePrecinctCode: code, sourcePrecinctName: precinct[2], registeredVoters: integer(cells[1]),
      });
      continue;
    }
    if (active && cells.some(Boolean)) throw new Error(`AK ${report.year}: unrecognized precinct row ${JSON.stringify(label)}.`);
  }
  if (active || districts.size !== 40) throw new Error(`AK ${report.year}: expected 40 complete, uniquely identified districts.`);
  if (!statewideSection || !statewide) throw new Error(`AK ${report.year}: explicit published statewide total is missing.`);
  const statewideRegisteredVoters = precincts.reduce((sum, row) => sum + row.registeredVoters, 0);
  if (precincts.length !== report.precinctCount || statewide.precinctCount !== report.precinctCount ||
      statewideRegisteredVoters !== report.statewideRegisteredVoters || statewide.registeredVoters !== report.statewideRegisteredVoters) {
    throw new Error(`AK ${report.year}: precinct rows and published statewide total/count do not reconcile to reviewed expectations.`);
  }
  return {
    reportDate, districtTotals: [...districts.values()].sort((a, b) => a.district.localeCompare(b.district)),
    precincts, precinctCount: precincts.length, statewideRegisteredVoters,
  };
}

function validateInputs(inputs) {
  for (const source of sources) assertPinnedSource(inputs.get(source.rawFile), source);
  const reports = REPORTS.map((source) => parseDistrictTotals(inputs.get(source.rawFile), source));
  const ageText = textFromHtml(inputs.get(AGE_2012.rawFile));
  if (!/AS OF\s+11\/3\/2012/i.test(ageText) || !/TOTAL\s+506,?702\b/i.test(ageText)) {
    throw new Error("AK 2012: age-report discrepancy evidence does not match the retained official report.");
  }
  return reports;
}
function csv(rows) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  return `${rows.map((row) => row.map(quote).join(",")).join("\n")}\n`;
}

export async function buildPackage({ check = false, root = repoRoot } = {}) {
  const packageDir = path.join(root, packagePath);
  const inputs = new Map(await Promise.all(sources.map(async (source) =>
    [source.rawFile, await readFile(path.join(packageDir, "raw", source.rawFile))])));
  const parsed = validateInputs(inputs);
  const receipts = JSON.parse(await readFile(path.join(packageDir, receiptFile), "utf8"));
  if (!Array.isArray(receipts) || receipts.length !== sources.length) throw new Error("AK: source receipt set is incomplete.");
  const receiptFor = (source) => {
    const matches = receipts.filter((receipt) => receipt.rawFile === source.rawFile);
    const receipt = matches[0];
    if (matches.length !== 1 || receipt.url !== source.url || receipt.byteCount !== source.byteCount || receipt.sha256 !== source.sha256 ||
        !Number.isFinite(Date.parse(receipt.retrievedAt)) || new Date(receipt.retrievedAt).toISOString() !== receipt.retrievedAt ||
        !/^https:\/\/(?:www\.)?elections\.alaska\.gov\//.test(receipt.resolvedUrl)) {
      throw new Error(`AK: missing or mismatched source receipt for ${source.rawFile}.`);
    }
    return receipt;
  };
  const provenance = (source) => ({
    ...source, ...receiptFor(source), sourceAuthority, landingUrl,
    originalFilename: decodeURIComponent(new URL(source.url).pathname.split("/").at(-1)),
    format: "HTML", localArtifact: `${packagePath}/raw/${source.rawFile}`,
  });
  const districtRows = [["state", "election_year", "report_date", "house_district", "precinct_count", "registered_voters"]];
  const precinctRows = [["state", "election_year", "report_date", "house_district", "source_precinct_code", "source_precinct_name", "registered_voters"]];
  const reports = REPORTS.map((source, index) => {
    const report = parsed[index];
    for (const row of report.districtTotals) districtRows.push(["AK", source.year, report.reportDate, row.district, row.precinctCount, row.registeredVoters]);
    for (const row of report.precincts) precinctRows.push(["AK", source.year, report.reportDate, row.district, row.sourcePrecinctCode, row.sourcePrecinctName, row.registeredVoters]);
    return { ...provenance(source), parsedPrecinctRowCount: report.precinctCount, districtRowCount: report.districtTotals.length, reconciliation: "all_precinct_rows_to_published_district_and_statewide_totals" };
  });
  const manifest = {
    state: "AK", stateName: "Alaska", packageType: "official_historical_registration_source_review_only",
    sourceAuthority, landingUrl, parserOrNormalizationPath: "scripts/collect-ak-historical-registration.mjs",
    reportingGrain: "dated_source_precinct_registration_with_house_district_and_statewide_reconciliation",
    runtimeEffect: "none", reports,
    "2012AgeReportDiscrepancy": {
      ...provenance(AGE_2012), reportingGrain: "statewide_age_aggregate",
      partyAndPrecinctRegisteredVoters: REPORTS[0].statewideRegisteredVoters,
      difference: AGE_2012.statewideRegisteredVoters - REPORTS[0].statewideRegisteredVoters,
      decision: "preserved_unresolved_party_and_precinct_report_is_package_primary",
    },
    confidence: "High confidence in exact transcription of retained public aggregate reports; turnout-denominator and cross-year geographic compatibility are not established.",
    reuseStatus: "Official publicly accessible aggregate reports retained for source review; no additional reuse license has been established.",
    caveats: [
      "2012 and 2016 snapshots are dated November 3, respectively three and five days before their general elections; they are not election-day turnout denominators.",
      "The 2020 snapshot is dated November 3, 2020, the general-election date, but this package does not calculate turnout.",
      "Source precinct codes and names remain year-specific labels, not canonical reporting-unit identities or geometry joins. House districts are read from the report headings, not inferred from row order.",
      "No registration is allocated to absentee, early-voting, questioned, remote, federal-overseas, county-equivalent, or geometry units.",
      "The 2012 registration-by-age report publishes 506,702, one voter above the party-and-precinct report's 506,701. The discrepancy is retained and not resolved by inference.",
      "This source-review package does not change active turnout, result, historical-baseline, database, API, or map data.",
    ],
  };
  const outputs = [
    ["ak-historical-registration-source-review.json", `${JSON.stringify(manifest, null, 2)}\n`],
    ["ak-historical-registration-by-house-district.csv", csv(districtRows)],
    ["ak-historical-registration-by-source-precinct.csv", csv(precinctRows)],
  ];
  // Validate all inputs/receipts before changing any derived artifact.
  for (const [filename, expected] of outputs) {
    const output = path.join(packageDir, filename);
    if (check) {
      if (await readFile(output, "utf8") !== expected) throw new Error(`AK historical registration artifact is stale: ${filename}.`);
    } else {
      await writeFile(output, expected, "utf8");
    }
  }
  return manifest;
}

export async function refreshRaw({ root = repoRoot, fetchSource = fetch, now = () => new Date() } = {}) {
  const downloaded = await Promise.all(sources.map(async (source) => {
    const response = await fetchSource(source.url, { headers: { Accept: "text/html" }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`AK ${source.year} source fetch failed: ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const resolvedUrl = response.url || source.url;
    if (!/^https:\/\/(?:www\.)?elections\.alaska\.gov\//.test(resolvedUrl)) throw new Error("AK: source redirected outside the official host.");
    assertPinnedSource(bytes, source);
    return { source, bytes, receipt: {
      rawFile: source.rawFile, url: source.url, resolvedUrl, retrievedAt: now().toISOString(), byteCount: bytes.length, sha256: source.sha256,
    } };
  }));
  validateInputs(new Map(downloaded.map(({ source, bytes }) => [source.rawFile, bytes])));
  const packageDir = path.join(root, packagePath);
  // No raw files or receipts are written if any download or validation fails.
  await mkdir(path.join(packageDir, "raw"), { recursive: true });
  for (const { source, bytes } of downloaded) await writeFile(path.join(packageDir, "raw", source.rawFile), bytes);
  await writeFile(path.join(packageDir, receiptFile), `${JSON.stringify(downloaded.map(({ receipt }) => receipt), null, 2)}\n`);
}
export function parseArgs(args) {
  if (args.some((arg) => !["--check", "--refresh"].includes(arg)) || new Set(args).size !== args.length || args.length > 1) {
    throw new Error("Usage: node scripts/collect-ak-historical-registration.mjs [--check | --refresh]");
  }
  return { check: args.includes("--check"), refresh: args.includes("--refresh") };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { check, refresh } = parseArgs(process.argv.slice(2));
  if (refresh) await refreshRaw();
  const manifest = await buildPackage({ check });
  console.log(JSON.stringify({ reports: manifest.reports.length, parsedPrecinctRows: manifest.reports.reduce((sum, report) => sum + report.parsedPrecinctRowCount, 0), runtimeEffect: manifest.runtimeEffect }, null, 2));
}
