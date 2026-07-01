import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";

const jurisdictionId = "d2c804ee-4ec2-46bb-91d7-5b41526eab03";
const baseUrl = `https://enr.elections.virginia.gov/cdn/results/${jurisdictionId}`;
const userAgent = "CivicResultMaps VA source collection";
const outputs = {
  electionResults: "data/va-2024-enr-election-results.csv",
  electionTurnout: "data/va-2024-enr-election-turnout.csv",
  changeLogSummary: "data/va-2024-enr-election-change-log-summary.json",
};
const blobs = {
  electionResults: "Election Results_e5b689ae-a931-4b8a-a5f7-7392e9571c61.csv",
  electionTurnout: "Election Turnout_0869920c-fc10-402c-9c5c-f335d00f3d1f.csv",
  electionChangeLog: "Election Change Log_8d8cefda-3e5d-49be-932d-b24063bebd27.csv",
};

function csvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function increment(map, key) {
  if (!key) {
    return;
  }
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topEntries(map, limit = 12) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

async function download(blob, output) {
  const url = `${baseUrl}/${encodeURIComponent(blob)}`;
  const response = await fetch(url, { headers: { "User-Agent": userAgent } });
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  }
  await mkdir(output.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  await writeFile(output, Buffer.from(await response.arrayBuffer()));
  return { url, output };
}

async function summarizeChangeLog(csvPath, sourceUrl) {
  const byField = new Map();
  const bySource = new Map();
  const byReason = new Map();
  const byContest = new Map();
  const byVotingMethod = new Map();
  const localities = new Set();
  let rows = 0;
  let firstTimestamp = "";
  let lastTimestamp = "";
  let header = [];

  const reader = createInterface({
    crlfDelay: Infinity,
    input: createReadStream(csvPath, { encoding: "utf8" }),
  });

  for await (const line of reader) {
    if (!line.trim()) {
      continue;
    }
    if (!header.length) {
      header = csvLine(line);
      continue;
    }
    const values = csvLine(line);
    const row = Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""]));
    rows += 1;
    firstTimestamp ||= row.Timestamp;
    lastTimestamp = row.Timestamp || lastTimestamp;
    increment(byField, row.FieldName);
    increment(bySource, row.Source);
    increment(byReason, row.ChangeReason);
    increment(byContest, row.Contest);
    increment(byVotingMethod, row.VotingMethod);
    if (row.Locality) {
      localities.add(row.Locality);
    }
  }

  return {
    sourceAuthority: "Virginia Department of Elections",
    sourceUrl,
    sourceBlobName: basename(csvPath),
    generatedAt: new Date().toISOString(),
    electionYear: 2024,
    reportingGrain: "locality/precinct change-log rows",
    parser: "scripts/collect-va-enr-sources.mjs",
    localArtifactPath: outputs.changeLogSummary,
    rows,
    firstTimestamp,
    lastTimestamp,
    localityCount: localities.size,
    topFields: topEntries(byField),
    topSources: topEntries(bySource),
    topChangeReasons: topEntries(byReason),
    topContests: topEntries(byContest),
    topVotingMethods: topEntries(byVotingMethod),
    caveats: [
      "Summary is derived from the official ENR Election Change Log CSV because the raw change-log export is large.",
      "Rows document source-system updates and initial entries; they are provenance context, not evidence of misconduct.",
      "Use the official report URL to regenerate the summary or inspect raw row-level changes.",
    ],
  };
}

const downloadedResults = await download(blobs.electionResults, outputs.electionResults);
const downloadedTurnout = await download(blobs.electionTurnout, outputs.electionTurnout);
const cacheDir = ".etl/va-enr-cache";
await mkdir(cacheDir, { recursive: true });
const changeLogPath = join(cacheDir, blobs.electionChangeLog);
const downloadedChangeLog = await download(blobs.electionChangeLog, changeLogPath.replaceAll("\\", "/"));
const summary = await summarizeChangeLog(changeLogPath, downloadedChangeLog.url);
await writeFile(outputs.changeLogSummary, JSON.stringify(summary, null, 2) + "\n", "utf8");
await rm(changeLogPath, { force: true });

console.log(
  JSON.stringify(
    {
      electionResults: downloadedResults,
      electionTurnout: downloadedTurnout,
      changeLogSummary: outputs.changeLogSummary,
      changeLogRows: summary.rows,
    },
    null,
    2,
  ),
);
