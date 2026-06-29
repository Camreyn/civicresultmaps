import { readFile, writeFile } from "node:fs/promises";

const stagingPath = process.argv[2] ?? ".etl/staging/fl-2024-staging.json";
const extractPath = process.argv[3] ?? "data/fl-2024-general-results-extract.tsv";
const outPath = process.argv[4] ?? "data/fl-2024-county-review-analysis.json";
const policy = {
  countyDistributionDropoffThresholdPct: 4,
  countyDistributionZThreshold: 2,
};

function parseTsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const header = headerLine.split("\t");
  return lines.map((line) => Object.fromEntries(line.split("\t").map((value, index) => [header[index], value])));
}

function intValue(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function countyName(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }
  return /county$/i.test(trimmed) ? trimmed : `${trimmed} County`;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stddev(values) {
  if (values.length < 2) {
    return 0;
  }
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function zScore(value, mean, deviation) {
  return deviation ? (value - mean) / deviation : 0;
}

function buildExtractVerification(rows) {
  const totals = {
    president: new Map(),
    senate: new Map(),
  };
  const raceCodes = new Set();

  for (const row of rows) {
    const race = String(row.RaceCode ?? "").trim().toUpperCase();
    const county = countyName(row.CountyName);
    const party = String(row.PartyCode ?? "").trim().toUpperCase();
    const votes = intValue(row.CanVotes);
    raceCodes.add(race);
    if (!county) {
      continue;
    }

    if (race === "PRE") {
      const current = totals.president.get(county) ?? { Harris: 0, Other: 0, Trump: 0 };
      if (party === "DEM") {
        current.Harris += votes;
      } else if (party === "REP") {
        current.Trump += votes;
      } else {
        current.Other += votes;
      }
      totals.president.set(county, current);
    }

    if (race === "USS") {
      const current = totals.senate.get(county) ?? { DEM: 0, REP: 0 };
      if (party === "DEM" || party === "REP") {
        current[party] += votes;
      }
      totals.senate.set(county, current);
    }
  }

  return { raceCodes: [...raceCodes].filter(Boolean).sort(), totals };
}

const artifact = JSON.parse(await readFile(stagingPath, "utf8"));
const reviewRows = artifact.native?.reviewRows ?? [];
const resultRows = artifact.native?.resultRows ?? [];
const extractRows = parseTsv(await readFile(extractPath, "latin1"));
const verification = buildExtractVerification(extractRows);
const mismatches = [];

for (const row of resultRows) {
  const expected = verification.totals.president.get(row.jurisdictionName);
  if (JSON.stringify(expected) !== JSON.stringify(row.votes)) {
    mismatches.push({ county: row.jurisdictionName, kind: "president" });
  }
}

for (const row of reviewRows) {
  const expected = verification.totals.senate.get(row.county);
  if (!expected || expected.DEM !== row.comparisonDemVotes || expected.REP !== row.comparisonRepVotes) {
    mismatches.push({ county: row.county, kind: "senate" });
  }
}

if (mismatches.length) {
  throw new Error(`Florida extract verification failed: ${JSON.stringify(mismatches.slice(0, 5))}`);
}

const demValues = reviewRows.map((row) => row.demDropoff).filter(Number.isFinite);
const repValues = reviewRows.map((row) => row.repDropoff).filter(Number.isFinite);
const demMean = average(demValues);
const repMean = average(repValues);
const demStdDev = stddev(demValues);
const repStdDev = stddev(repValues);

const counties = reviewRows.map((row) => {
  const demDistributionZ = zScore(row.demDropoff, demMean, demStdDev);
  const repDistributionZ = zScore(row.repDropoff, repMean, repStdDev);
  const maxAbsDropoff = Math.max(Math.abs(row.demDropoff), Math.abs(row.repDropoff));
  const maxAbsZ = Math.max(Math.abs(demDistributionZ), Math.abs(repDistributionZ));
  const flagged =
    maxAbsDropoff >= policy.countyDistributionDropoffThresholdPct ||
    maxAbsZ >= policy.countyDistributionZThreshold;
  return {
    county: row.county,
    comparisonContest: row.comparisonContest,
    demDropoff: row.demDropoff,
    demDistributionZ: Number(demDistributionZ.toFixed(4)),
    flagged,
    harris: row.harris,
    maxAbsDropoff: Number(maxAbsDropoff.toFixed(4)),
    maxAbsZ: Number(maxAbsZ.toFixed(4)),
    repDropoff: row.repDropoff,
    repDistributionZ: Number(repDistributionZ.toFixed(4)),
    totalVotes: row.totalVotes,
    trump: row.trump,
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  state: "FL",
  electionYear: 2024,
  sourceArtifacts: {
    staging: stagingPath,
    extract: extractPath,
  },
  policy,
  verification: {
    extractRows: extractRows.length,
    extractRaceCount: verification.raceCodes.length,
    extractPresidentCountyCount: verification.totals.president.size,
    extractSenateCountyCount: verification.totals.senate.size,
    matchedStagingRows: true,
    raceCodes: verification.raceCodes,
  },
  distribution: {
    demDropoffMean: Number(demMean.toFixed(4)),
    demDropoffStdDev: Number(demStdDev.toFixed(4)),
    repDropoffMean: Number(repMean.toFixed(4)),
    repDropoffStdDev: Number(repStdDev.toFixed(4)),
  },
  summary: {
    countyRows: counties.length,
    flaggedCountyCount: counties.filter((row) => row.flagged).length,
    caveat:
      "County-distribution rows are official county-level President-versus-U.S. Senate review screens. They are not precinct-level evidence and do not prove causation or tabulation error.",
  },
  flaggedCounties: counties
    .filter((row) => row.flagged)
    .sort((a, b) => b.maxAbsZ - a.maxAbsZ || b.maxAbsDropoff - a.maxAbsDropoff),
  counties: counties.sort((a, b) => b.maxAbsZ - a.maxAbsZ || b.maxAbsDropoff - a.maxAbsDropoff),
};

await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outPath, flaggedCountyCount: report.summary.flaggedCountyCount }, null, 2));
