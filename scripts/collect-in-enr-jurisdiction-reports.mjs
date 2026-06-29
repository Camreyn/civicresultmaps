import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const outDir = path.join(process.cwd(), "data", "in-2024-enr-jurisdiction-reports");
const countyGeojsonPath = path.join(process.cwd(), "data", "in-counties.geojson");
const fallbackArchiveTimestamp = "20241106000950";
const cdxUrl =
  "https://web.archive.org/cdx?url=enr.indianavoters.in.gov/site/data/JurR_*_B.json&from=20241101&to=20250131&output=json&fl=timestamp,original,statuscode,mimetype,digest&filter=statuscode:200&collapse=urlkey";

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,*/*",
      "user-agent": "Mozilla/5.0 CivicResultMaps data collector",
    },
  });
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    encoding: response.headers.get("content-encoding") ?? "",
  };
}

async function fetchJson(url) {
  const { buffer, encoding } = await fetchBuffer(url);
  let decoded = buffer;
  if (encoding.toLowerCase() === "br") {
    try {
      decoded = zlib.brotliDecompressSync(buffer);
    } catch {
      decoded = buffer;
    }
  }
  return JSON.parse(decoded.toString("utf8").replace(/^\uFEFF/, ""));
}

function fileNameForUrl(url) {
  return new URL(url).pathname.split("/").pop();
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function countCandidateRaceContainers(payload) {
  let count = 0;
  const stack = [payload];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (current.Candidates?.Candidate || current.Candidate) {
      count += 1;
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        if (Array.isArray(value)) stack.push(...value);
        else stack.push(value);
      }
    }
  }
  return count;
}

function countyMetadata(payload) {
  const region = payload.Root?.Region ?? {};
  const reportingRegions = region.Reporting_Regions?.Regions;
  const reportingRegionCount = Array.isArray(reportingRegions) ? reportingRegions.length : reportingRegions ? 1 : 0;
  const referendumCount = asArray(
    Array.isArray(reportingRegions)
      ? reportingRegions.flatMap((entry) => asArray(entry.Referendums?.Referendum))
      : reportingRegions?.Referendums?.Referendum,
  ).length;

  return {
    fips: String(region.FIPS ?? ""),
    county: `${String(region.JURISDICTION_NAME ?? "").trim()} County`,
    writeTime: payload.Root?.WriteTime ?? "",
    reportingRegionCount,
    referendumCount,
    candidateRaceContainers: countCandidateRaceContainers(payload),
  };
}

async function fallbackRowsFromCountyGeojson() {
  const geojson = JSON.parse(await readFile(countyGeojsonPath, "utf8"));
  return geojson.features
    .map((feature) => String(feature.properties?.GEOID ?? "").trim())
    .filter((geoid) => /^18\d{3}$/.test(geoid))
    .sort()
    .map((geoid) => ({
      timestamp: fallbackArchiveTimestamp,
      original: `https://enr.indianavoters.in.gov/site/data/JurR_${geoid}_B.json`,
      statuscode: "200",
      mimetype: "application/json",
      digest: "",
    }));
}

async function cdxRowsOrFallback() {
  try {
    const cdxRows = await fetchJson(cdxUrl);
    const rows = cdxRows.slice(1).map(([timestamp, original, statuscode, mimetype, digest]) => ({
      timestamp,
      original,
      statuscode,
      mimetype,
      digest,
    }));
    if (rows.length) return rows;
  } catch (error) {
    console.warn(`CDX lookup failed; using county FIPS fallback: ${error.message}`);
  }
  return fallbackRowsFromCountyGeojson();
}

const rows = await cdxRowsOrFallback();

await mkdir(outDir, { recursive: true });

const counties = [];
for (const row of rows) {
  const fileName = fileNameForUrl(row.original);
  const archiveUrl = `https://web.archive.org/web/${row.timestamp}id_/${row.original}`;
  const payload = await fetchJson(archiveUrl);
  const pretty = `${JSON.stringify(payload, null, 2)}\n`;
  await writeFile(path.join(outDir, fileName), pretty);
  const metadata = countyMetadata(payload);
  counties.push({
    ...metadata,
    fileName,
    sourceUrl: archiveUrl,
    originalUrl: row.original,
    archiveTimestamp: row.timestamp,
    digest: row.digest,
    bytes: Buffer.byteLength(pretty),
  });
  console.log(`${metadata.fips} ${metadata.county}: ${metadata.candidateRaceContainers} candidate race containers`);
}

counties.sort((left, right) => left.fips.localeCompare(right.fips));

await writeFile(
  path.join(outDir, "manifest.json"),
  `${JSON.stringify(
    {
      collectedAt: new Date().toISOString(),
      source: "Internet Archive captures of Indiana Election Division ENR JurR county jurisdiction JSON files",
      cdxUrl,
      caveat:
        "These official ENR county jurisdiction JSON captures inventory county office/contact and reporting-region/referendum structures. They do not contain President or U.S. Senate candidate result rows and are not sufficient to generate Indiana advisory result flags.",
      countyCount: counties.length,
      candidateRaceContainerCount: counties.reduce((sum, county) => sum + county.candidateRaceContainers, 0),
      counties,
    },
    null,
    2,
  )}\n`,
);

console.log(`Collected ${counties.length} Indiana ENR jurisdiction reports into ${outDir}.`);
