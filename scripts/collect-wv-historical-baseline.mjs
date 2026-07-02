import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const state = "WV";
const sourceId = "wv-historical-presidential-baseline";
const output = "data/wv-historical-presidential-baseline.csv";

const historicalSources = [
  {
    year: 2012,
    sourceUrl: "https://apps.sos.wv.gov/elections/results/readfile.aspx?eid=13&format=csv&type=StateCountyTotals",
    localFile: "data/wv-2012-official-state-county-results.csv",
    rowMethod: "westVirginiaLegacyResultsCenterStateCountyCsv",
    expected: { rows: 55, demVotes: 238269, repVotes: 417655, otherVotes: 14514, totalVotes: 670438 },
  },
  {
    year: 2016,
    sourceUrl: "https://apps.sos.wv.gov/elections/results/readfile.aspx?eid=23&format=csv&type=StateCountyTotals",
    localFile: "data/wv-2016-official-state-county-results.csv",
    rowMethod: "westVirginiaLegacyResultsCenterStateCountyCsv",
    expected: { rows: 55, demVotes: 188794, repVotes: 489371, otherVotes: 34886, totalVotes: 713051 },
  },
  {
    year: 2020,
    sourceUrl: "https://results.enr.clarityelections.com/WV/106210/272340/json/details.json",
    localDir: "data/wv-2020-official-results",
    rowMethod: "westVirginiaClarityDetailsJsonCountyHistorical",
    expected: { rows: 55, demVotes: 235984, repVotes: 545382, otherVotes: 13286, totalVotes: 794652 },
  },
];

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function intValue(value) {
  const normalized = String(value ?? "").replace(/[^0-9-]/g, "");
  return normalized ? Number(normalized) : 0;
}

function countyName(value) {
  const name = String(value ?? "").trim();
  return name ? `${name.replace(/\s+County$/i, "")} County` : "";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
  }

  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/csv,text/plain,*/*",
      "user-agent": "CivicResultMaps West Virginia historical baseline collector",
    },
  });
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function ensureTextArtifact(url, localFile) {
  try {
    return await readFile(localFile, "utf8");
  } catch {
    const text = await fetchText(url);
    await mkdir(path.dirname(localFile), { recursive: true });
    await writeFile(localFile, text, "utf8");
    return text;
  }
}

async function collectClarity2020(entry) {
  const currentVersionUrl = "https://results.enr.clarityelections.com/WV/106210/current_ver.txt";
  const version = (await fetchText(currentVersionUrl)).trim();
  const baseUrl = `https://results.enr.clarityelections.com/WV/106210/${version}/json`;
  await mkdir(entry.localDir, { recursive: true });

  const detailsFile = path.join(entry.localDir, "details.json");
  const sumFile = path.join(entry.localDir, "sum.json");
  const currentVersionFile = path.join(entry.localDir, "current_ver.txt");

  const [detailsText, sumText] = await Promise.all([
    ensureTextArtifact(`${baseUrl}/details.json`, detailsFile),
    ensureTextArtifact(`${baseUrl}/sum.json`, sumFile),
  ]);
  await writeFile(currentVersionFile, `${version}\n`);

  return {
    details: JSON.parse(detailsText),
    sourceUrl: `${baseUrl}/details.json`,
    sum: JSON.parse(sumText),
  };
}

function bucketParty(partyCode) {
  const party = String(partyCode ?? "").trim().toUpperCase();
  if (party === "D" || party === "DEM") return "dem";
  if (party === "R" || party === "REP") return "rep";
  return "other";
}

function parseLegacyCsv(entry, text) {
  const grouped = new Map();
  for (const row of parseCsv(text)) {
    if (
      row.Type !== "County" ||
      row.OfficialResults !== "Yes" ||
      row.OfficeDescription !== "U.S. President" ||
      !row.CountyName
    ) {
      continue;
    }
    const county = countyName(row.CountyName);
    const current = grouped.get(county) ?? { dem: 0, other: 0, rep: 0, total: 0 };
    const votes = intValue(row.Votes);
    current[bucketParty(row.PartyCode)] += votes;
    current.total += votes;
    grouped.set(county, current);
  }

  return [...grouped.entries()]
    .map(([county, values]) => ({
      state,
      election_year: entry.year,
      jurisdiction_name: county,
      county,
      local_unit: county,
      source_id: sourceId,
      source_level: "county",
      row_method: entry.rowMethod,
      source_url: entry.sourceUrl,
      dem_votes: values.dem,
      rep_votes: values.rep,
      other_votes: values.other,
      total_votes: values.total,
    }))
    .sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));
}

function parseClarity2020(entry, payload) {
  const summary = payload.sum.Contests.find((contest) => String(contest.K) === "100");
  const details = payload.details.Contests.find((contest) => String(contest.K) === "100");
  if (!summary || !details) {
    throw new Error("West Virginia 2020 Clarity payload missing presidential contest 100.");
  }

  const candidateBuckets = summary.P.map((party) => bucketParty(party));
  const rows = details.P.map((county, index) => {
    const values = { dem: 0, other: 0, rep: 0, total: 0 };
    for (const [candidateIndex, votesRaw] of (details.V[index] ?? []).entries()) {
      const votes = intValue(votesRaw);
      values[candidateBuckets[candidateIndex] ?? "other"] += votes;
      values.total += votes;
    }
    const normalizedCounty = countyName(county);
    return {
      state,
      election_year: entry.year,
      jurisdiction_name: normalizedCounty,
      county: normalizedCounty,
      local_unit: normalizedCounty,
      source_id: sourceId,
      source_level: "county",
      row_method: entry.rowMethod,
      source_url: payload.sourceUrl,
      dem_votes: values.dem,
      rep_votes: values.rep,
      other_votes: values.other,
      total_votes: values.total,
    };
  }).filter((row) => row.total_votes > 0);

  return rows.sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));
}

function validateTotals(entry, rows) {
  const totals = rows.reduce(
    (sum, row) => ({
      rows: sum.rows + 1,
      demVotes: sum.demVotes + row.dem_votes,
      repVotes: sum.repVotes + row.rep_votes,
      otherVotes: sum.otherVotes + row.other_votes,
      totalVotes: sum.totalVotes + row.total_votes,
    }),
    { rows: 0, demVotes: 0, otherVotes: 0, repVotes: 0, totalVotes: 0 },
  );

  for (const [key, expectedValue] of Object.entries(entry.expected)) {
    if (totals[key] !== expectedValue) {
      throw new Error(`${entry.year} expected ${key}=${expectedValue}, got ${totals[key]}`);
    }
  }
}

const rows = [];
for (const entry of historicalSources) {
  if (entry.year === 2020) {
    const yearRows = parseClarity2020(entry, await collectClarity2020(entry));
    validateTotals(entry, yearRows);
    rows.push(...yearRows);
  } else {
    const text = await ensureTextArtifact(entry.sourceUrl, entry.localFile);
    const yearRows = parseLegacyCsv(entry, text);
    validateTotals(entry, yearRows);
    rows.push(...yearRows);
  }
}

const headers = [
  "state",
  "election_year",
  "jurisdiction_name",
  "county",
  "local_unit",
  "source_id",
  "source_level",
  "row_method",
  "source_url",
  "dem_votes",
  "rep_votes",
  "other_votes",
  "total_votes",
];

const csv = `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\n")}\n`;
await mkdir("data", { recursive: true });
await writeFile(output, csv, "utf8");
console.log(JSON.stringify({ rows: rows.length, years: historicalSources.map((entry) => entry.year), output }, null, 2));
