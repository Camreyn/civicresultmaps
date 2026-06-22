import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const statewideDetailsPath = path.join(process.cwd(), "data", "wv-2024-official-results", "details.json");
const outDir = path.join(process.cwd(), "data", "wv-2024-county-detailxml-reports");
const baseUrl = "https://results.enr.clarityelections.com/WV";

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

function countyEntries(details) {
  const president = details.Contests.find((contest) => String(contest.K) === "100");
  if (!president) {
    throw new Error("West Virginia statewide details missing presidential contest 100.");
  }

  return president.P.map((county, index) => ({
    county: String(county),
    electionId: String(president.Eid[index]),
  }));
}

async function collectCounty({ county, electionId }) {
  const countyDir = path.join(outDir, county.replace(/[^A-Za-z0-9._ -]+/g, "").trim());
  await mkdir(countyDir, { recursive: true });

  const versionUrl = `${baseUrl}/${encodeURIComponent(county)}/${electionId}/current_ver.txt`;
  const version = (await fetchText(versionUrl)).trim();
  const reportUrl = `${baseUrl}/${encodeURIComponent(county)}/${electionId}/${version}/reports/detailxml.zip`;
  const report = await fetchBuffer(reportUrl);

  await writeFile(path.join(countyDir, "current_ver.txt"), `${version}\n`);
  await writeFile(path.join(countyDir, "source-url.txt"), `${reportUrl}\n`);
  await writeFile(path.join(countyDir, "detailxml.zip"), report);
  return { county, electionId, version, bytes: report.length };
}

const details = JSON.parse(await fetchText(`file://${statewideDetailsPath}`).catch(async () => {
  const { readFile } = await import("node:fs/promises");
  return readFile(statewideDetailsPath, "utf8");
}));

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
      source: "West Virginia Secretary of State Clarity county detailxml.zip reports",
      counties: collected,
    },
    null,
    2,
  )}\n`,
);

console.log(`Collected ${collected.length} West Virginia county detail XML reports.`);
