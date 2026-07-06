import { readFile, writeFile } from "node:fs/promises";
import JSZip from "jszip";

const pageUrl = "https://dos.fl.gov/elections/data-statistics/elections-data/precinct-level-election-results/";
const zipOutPath = "data/fl-2024-general-precinct-results.zip";
const definitionsOutPath = "data/fl-2024-precinct-data-definitions.pdf";
const reviewOutPath = "data/fl-2024-precinct-source-review.json";
const shouldDownload = process.argv.includes("--download");

function intValue(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveOfficialUrl(pageHtml, labelPattern) {
  const linkPattern = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of pageHtml.matchAll(linkPattern)) {
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (labelPattern.test(text)) {
      return new URL(match[1], pageUrl).href;
    }
  }
  throw new Error(`Could not find Florida source link matching ${labelPattern}`);
}

async function downloadFile(url, outPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Florida source download failed for ${url}: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outPath, buffer);
  return { outPath, bytes: buffer.byteLength, sourceUrl: url };
}

async function downloadOfficialArtifacts() {
  const response = await fetch(pageUrl);
  if (!response.ok) {
    throw new Error(`Florida precinct source page failed with HTTP ${response.status}`);
  }
  const html = await response.text();
  const definitionsUrl = resolveOfficialUrl(html, /^Data Definitions and Field Codes$/i);
  const zipUrl = resolveOfficialUrl(html, /^2024 General Election\b/i);
  return {
    zip: await downloadFile(zipUrl, zipOutPath),
    definitions: await downloadFile(definitionsUrl, definitionsOutPath),
  };
}

async function analyzePrecinctZip(zipPath) {
  const zip = await JSZip.loadAsync(await readFile(zipPath));
  const countyFiles = Object.values(zip.files).filter(
    (file) => !file.dir && /_PctResults20241105\.txt$/i.test(file.name),
  );
  const precincts = new Map();
  const countyPresident = new Map();
  const countySenate = new Map();
  let sourceRows = 0;

  for (const file of countyFiles) {
    const text = await file.async("string");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      sourceRows += 1;
      const cols = line.split("\t");
      if (cols.length < 19) {
        continue;
      }
      const county = cols[1].trim();
      const precinct = cols[5].trim();
      const location = cols[6].trim();
      const registeredVoters = intValue(cols[7]);
      const contest = cols[11].trim();
      const candidate = cols[14].trim();
      const party = cols[15].trim().toUpperCase();
      const votes = intValue(cols[18]);
      const key = `${county}|${precinct}|${location}`;
      const row =
        precincts.get(key) ??
        {
          county,
          precinct,
          location,
          registeredVoters,
          harris: 0,
          trump: 0,
          presidentOther: 0,
          presidentSpecial: 0,
          senateDem: 0,
          senateRep: 0,
          senateOther: 0,
          senateSpecial: 0,
        };
      precincts.set(key, row);

      if (contest === "President and Vice President") {
        const countyRow = countyPresident.get(county) ?? { Harris: 0, Trump: 0, Other: 0, Special: 0 };
        if (party === "DEM") {
          row.harris += votes;
          countyRow.Harris += votes;
        } else if (party === "REP") {
          row.trump += votes;
          countyRow.Trump += votes;
        } else if (["WriteinVotes", "OverVotes", "UnderVotes"].includes(candidate)) {
          row.presidentSpecial += votes;
          countyRow.Special += votes;
        } else {
          row.presidentOther += votes;
          countyRow.Other += votes;
        }
        countyPresident.set(county, countyRow);
      } else if (contest === "United States Senator") {
        const countyRow = countySenate.get(county) ?? { DEM: 0, REP: 0, Other: 0, Special: 0 };
        if (party === "DEM") {
          row.senateDem += votes;
          countyRow.DEM += votes;
        } else if (party === "REP") {
          row.senateRep += votes;
          countyRow.REP += votes;
        } else if (["WriteinVotes", "OverVotes", "UnderVotes"].includes(candidate)) {
          row.senateSpecial += votes;
          countyRow.Special += votes;
        } else {
          row.senateOther += votes;
          countyRow.Other += votes;
        }
        countySenate.set(county, countyRow);
      }
    }
  }

  const precinctRows = [...precincts.values()];
  const reviewableRows = precinctRows.filter(
    (row) => row.harris + row.trump + row.presidentOther > 0 && row.senateDem + row.senateRep > 0,
  );
  const presidentTotals = [...countyPresident.values()].reduce(
    (sum, row) => ({
      Harris: sum.Harris + row.Harris,
      Trump: sum.Trump + row.Trump,
      Other: sum.Other + row.Other,
      Special: sum.Special + row.Special,
    }),
    { Harris: 0, Trump: 0, Other: 0, Special: 0 },
  );
  const senateTotals = [...countySenate.values()].reduce(
    (sum, row) => ({
      DEM: sum.DEM + row.DEM,
      REP: sum.REP + row.REP,
      Other: sum.Other + row.Other,
      Special: sum.Special + row.Special,
    }),
    { DEM: 0, REP: 0, Other: 0, Special: 0 },
  );

  return {
    state: "FL",
    electionYear: 2024,
    generatedAt: new Date().toISOString(),
    sourceArtifacts: {
      precinctZip: zipPath,
      dataDefinitions: definitionsOutPath,
      sourcePage: pageUrl,
    },
    sourceShape: {
      countyFiles: countyFiles.length,
      sourceRows,
      precinctLocationRows: precinctRows.length,
      reviewablePresidentVsSenateRows: reviewableRows.length,
      zeroRegistrationPrecinctLocationRows: precinctRows.filter((row) => row.registeredVoters === 0).length,
      registeredVotersAcrossUniquePrecinctLocationRows: precinctRows.reduce(
        (sum, row) => sum + row.registeredVoters,
        0,
      ),
    },
    presidentTotals,
    senateTotals,
    reconciliation: {
      certifiedCountyDetailPresidentCandidateTotal: 10893752,
      precinctZipPresidentCandidateTotal: presidentTotals.Harris + presidentTotals.Trump + presidentTotals.Other,
      precinctZipCandidateTotalDelta: presidentTotals.Harris + presidentTotals.Trump + presidentTotals.Other - 10893752,
      caveat:
        "Use the precinct ZIP for same-grain local review rows and registration-denominator leads only. Certified Florida map totals remain anchored to the official county detail table because the precinct ZIP President candidate total is 204 votes below that table and the Trump total is one vote higher.",
    },
  };
}

const downloads = shouldDownload ? await downloadOfficialArtifacts() : null;
const review = await analyzePrecinctZip(zipOutPath);
await writeFile(reviewOutPath, `${JSON.stringify({ ...review, downloads }, null, 2)}\n`);
console.log(JSON.stringify({ outPath: reviewOutPath, sourceShape: review.sourceShape }, null, 2));
