import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const statewideDetailsPath = path.join(process.cwd(), "data", "ia-2024-official-results", "details.json");
const outDir = path.join(process.cwd(), "data", "ia-2024-county-detailxml-reports");
const baseUrl = "https://electionresults.iowa.gov/IA";
const firstCountyElectionId = 122323;

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: {
      accept: "*/*",
      "user-agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function countySlug(county) {
  return county.replace(/\s+/g, "_");
}

function countyEntries(details) {
  const president = details.Contests.find((contest) => String(contest.K) === "1000");
  if (!president) {
    throw new Error("Iowa statewide details missing presidential contest 1000.");
  }

  return president.P.map((county, index) => ({
    county: String(county),
    electionId: String(firstCountyElectionId + index),
    slug: countySlug(String(county)),
  }));
}

async function collectCounty({ county, electionId, slug }) {
  const countyDir = path.join(outDir, county.replace(/[^A-Za-z0-9._ -]+/g, "").trim());
  await mkdir(countyDir, { recursive: true });

  const versionUrl = `${baseUrl}/${encodeURIComponent(slug).replace(/%5F/g, "_")}/${electionId}/current_ver.txt`;
  const version = (await fetchText(versionUrl)).trim();
  const reportUrl = `${baseUrl}/${encodeURIComponent(slug).replace(/%5F/g, "_")}/${electionId}/${version}/reports/detailxml.zip`;
  const report = await fetchBuffer(reportUrl);

  await writeFile(path.join(countyDir, "current_ver.txt"), `${version}\n`);
  await writeFile(path.join(countyDir, "source-url.txt"), `${reportUrl}\n`);
  await writeFile(path.join(countyDir, "detailxml.zip"), report);
  return { county, electionId, version, bytes: report.length };
}

const details = JSON.parse(await readFile(statewideDetailsPath, "utf8"));

await mkdir(outDir, { recursive: true });
const collected = [];
for (const entry of countyEntries(details)) {
  collected.push(await collectCounty(entry));
  const latest = collected[collected.length - 1];
  console.log(`${latest.county}: ${latest.version} (${latest.bytes.toLocaleString()} bytes)`);
}

await writeFile(
  path.join(outDir, "manifest.json"),
  `${JSON.stringify(
    {
      collectedAt: new Date().toISOString(),
      source: "Iowa Secretary of State Clarity county detailxml.zip reports",
      counties: collected,
    },
    null,
    2,
  )}\n`,
);

console.log(`Collected ${collected.length} Iowa county detail XML reports.`);
