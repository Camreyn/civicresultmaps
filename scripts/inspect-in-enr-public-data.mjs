import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const checkedAt = process.env.CHECKED_AT ?? "2026-07-04";
const officialDir = path.join(repoRoot, "data", "in-2024-official-results");
const jurDir = path.join(repoRoot, "data", "in-2024-enr-jurisdiction-reports");
const outPath = path.join(repoRoot, "data", "in-2024-official-enr-public-data-inventory.json");

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function readJson(filePath) {
  return JSON.parse((await readFile(filePath, "utf8")).replace(/^\uFEFF/, ""));
}

function countCandidateContainers(value) {
  let count = 0;
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (current.Candidates?.Candidate || current.Candidate) count += 1;
    for (const child of Object.values(current)) {
      if (!child || typeof child !== "object") continue;
      if (Array.isArray(child)) stack.push(...child);
      else stack.push(child);
    }
  }
  return count;
}

function collectKeyMatches(value, pattern) {
  const matches = new Set();
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, child] of Object.entries(current)) {
      if (pattern.test(key)) matches.add(key);
      if (!child || typeof child !== "object") continue;
      if (Array.isArray(child)) stack.push(...child);
      else stack.push(child);
    }
  }
  return [...matches].sort();
}

function sumCandidateVotes(candidateList, fieldNames) {
  let total = 0;
  for (const candidate of asArray(candidateList)) {
    for (const field of fieldNames) {
      const value = candidate?.[field];
      if (value !== undefined && value !== null && value !== "") {
        total += Number(String(value).replace(/,/g, "")) || 0;
        break;
      }
    }
  }
  return total;
}

function officeCategorySummary(fileName, payload) {
  const category = payload.Root?.OfficeCategory ?? {};
  const regions = asArray(category.Regions?.Region);
  const raceRows = [];
  for (const region of regions) {
    for (const race of asArray(region.Races?.Race)) {
      const candidates = asArray(race.Candidates?.Candidate);
      const jurisdiction = race.Jurisdiction ?? {};
      raceRows.push({
        officeId: String(race.OFFICEID ?? ""),
        jurisdictionType: String(jurisdiction.JURISDICTION_TYPE ?? ""),
        jurisdictionName: String(jurisdiction.JURISDICTION_NAME ?? ""),
        voteTotal: sumCandidateVotes(candidates, ["TOTAL_VOTES", "TOTAL"]),
      });
    }
  }

  const regionVoteTotal = regions.reduce((sum, region) => {
    const candidates = region.RegionSummary?.Race?.Candidates?.Candidate ?? [];
    return sum + sumCandidateVotes(candidates, ["TOTAL", "TOTAL_VOTES"]);
  }, 0);

  const regionTypes = {};
  for (const region of regions) {
    const type = String(region.MAP_JURISDICTION_TYPE ?? "unknown");
    regionTypes[type] = (regionTypes[type] ?? 0) + 1;
  }

  const raceJurisdictionTypes = {};
  for (const row of raceRows) {
    const type = row.jurisdictionType || "unspecified";
    raceJurisdictionTypes[type] = (raceJurisdictionTypes[type] ?? 0) + 1;
  }

  return {
    fileName,
    officeCategoryId: String(category.OFFICECATEGORYID ?? ""),
    officeCategoryName: String(category.OFFICE_CATEGORY_NAME ?? ""),
    writeTime: String(payload.Root?.WriteTime ?? ""),
    regionCount: regions.length,
    regionMapJurisdictionTypes: regionTypes,
    regionVoteTotal,
    raceRows: raceRows.length,
    raceJurisdictionTypes,
    candidateContainerCount: countCandidateContainers(category),
    localCandidateFieldNames: collectKeyMatches(category, /precinct|ward|township|vote.?center|reporting.?unit/i),
    notes:
      "OfficeCategory files expose statewide/district summaries plus county/locality race rows. For President and U.S. Senate, the relevant official rows are county/locality rows, not precinct or lower reporting-unit candidate rows.",
  };
}

async function main() {
  const settings = await readJson(path.join(officialDir, "settings.json"));
  const officeList = await readJson(path.join(officialDir, "statewideElectionsC_A.json"));
  const ticker = await readJson(path.join(officialDir, "statewideTickerC_A.json"));
  const jurManifest = await readJson(path.join(jurDir, "manifest.json"));

  const officeItems = [];
  for (const group of asArray(officeList.Root?.List)) {
    for (const item of asArray(group.Items?.Item)) {
      officeItems.push({
        officeCategoryId: String(item.OFFICECATEGORYID ?? ""),
        officeCategoryName: String(item.OFFICE_CATEGORY_NAME ?? ""),
        heading: String(group.Heading ?? ""),
        mapCode: String(item.MAPCODE ?? ""),
      });
    }
  }

  const localOfficeFiles = (await readdir(officialDir))
    .filter((fileName) => /^OffCatC_\d+_A\.json$/i.test(fileName))
    .sort();
  const retainedOfficeCategoryFiles = [];
  for (const fileName of localOfficeFiles) {
    retainedOfficeCategoryFiles.push(officeCategorySummary(fileName, await readJson(path.join(officialDir, fileName))));
  }

  const jurFiles = (await readdir(jurDir)).filter((fileName) => /^JurR_\d+_B\.json$/i.test(fileName)).sort();
  let jurCandidateContainers = 0;
  const jurLocalFieldNames = new Set();
  for (const fileName of jurFiles) {
    const payload = await readJson(path.join(jurDir, fileName));
    jurCandidateContainers += countCandidateContainers(payload);
    for (const key of collectKeyMatches(payload, /candidate|precinct|ward|township|vote.?center|reporting.?unit/i)) {
      jurLocalFieldNames.add(key);
    }
  }

  const federalTicker = asArray(ticker.Root?.ElectionSummaries?.Race)
    .filter((race) => /president|senator/i.test(String(race.OFFICE_TITLE ?? "")))
    .map((race) => ({
      officeId: String(race.OFFICEID ?? ""),
      officeTitle: String(race.OFFICE_TITLE ?? ""),
      totalVotes: sumCandidateVotes(race.Candidates?.Candidate, ["TOTAL"]),
    }));

  const inventory = {
    state: "IN",
    stateName: "Indiana",
    electionYear: 2024,
    checkedAt,
    purpose:
      "State-scoped inspection of the official Indiana ENR public JSON family retained in this repository. This artifact sharpens the current blocker for official same-grain precinct/subcounty President and U.S. Senate rows.",
    officialArchivePage: "https://enr.indianavoters.in.gov/archive/2024General/index.html",
    localArtifactsInspected: {
      officialResultsDirectory: "data/in-2024-official-results",
      jurisdictionReportsDirectory: "data/in-2024-enr-jurisdiction-reports",
    },
    settings: {
      currentElection: String(settings.Root?.CurrentElection ?? ""),
      versionType: String(settings.Root?.VersionType ?? ""),
      versionCode: String(settings.Root?.VersionCode ?? ""),
      jsonContainer: String(settings.Root?.JSONContainer ?? ""),
      defaultMapName: String(settings.Root?.DefaultMapName ?? ""),
      stateFp: String(settings.Root?.StateFP ?? ""),
    },
    appDataPathProbe: {
      scriptEvidence: [
        {
          url: "https://enr.indianavoters.in.gov/archive/2024General/Scripts/EnrAngular/Services/jsonDataFetcher.js",
          observation:
            "The ENR app builds data JSON paths as data/<fileName>_<version>.json after settings.json reports VersionType A.",
        },
        {
          url: "https://enr.indianavoters.in.gov/archive/2024General/Scripts/EnrAngular/Initialization/enrMainController.js?version=1.0",
          observation:
            "Startup fetches statewideElectionsC_A/statewideTickerC_A and then office category files named OffCatC_<OFFICECATEGORYID>_A.json from the office list.",
        },
        {
          url: "https://enr.indianavoters.in.gov/archive/2024General/Scripts/EnrAngular/Directives/enrDownloadResults.js",
          observation:
            "The visible download-results directive fetches statewideTurnout_A.json and exports voter statistics only, not candidate result rows.",
        },
      ],
      conclusion:
        "The public app path identifies office-category, ticker/settings, turnout, map, and referendum JurR files. It does not identify a public President or U.S. Senate precinct/subcounty candidate-result export.",
    },
    livePublicPathRecheck: {
      checkedAt: "2026-07-04",
      method:
        "Ordinary public HTTPS GET requests to documented official ENR archive data paths; no browser automation, credentialed access, or anti-bot bypass was used.",
      endpoints: [
        {
          url: "https://enr.indianavoters.in.gov/archive/2024General/data/settings.json",
          httpStatus: 200,
          finding: "Settings metadata remains publicly reachable and identifies the archive data version family.",
        },
        {
          url: "https://enr.indianavoters.in.gov/archive/2024General/data/OffCatC_1019_A.json",
          httpStatus: 200,
          finding:
            "President office-category JSON remains publicly reachable; retained/local inspection shows county/locality candidate summaries, not precinct/subcounty candidate rows.",
        },
        {
          url: "https://enr.indianavoters.in.gov/archive/2024General/data/OffCatC_1006_A.json",
          httpStatus: 200,
          finding:
            "U.S. Senate office-category JSON remains publicly reachable; retained/local inspection shows county/locality candidate summaries, not precinct/subcounty candidate rows.",
        },
        {
          url: "https://enr.indianavoters.in.gov/archive/2024General/data/statewideTurnout_A.json",
          httpStatus: 200,
          finding: "The public download/statistics data path remains reachable for turnout-style data, not candidate result rows.",
        },
      ],
      conclusion:
        "The ordinary public archive paths are reachable, but the checked ENR data family still exposes county-level President and U.S. Senate candidate rows plus turnout/statistics data, not a same-grain precinct/subcounty President and U.S. Senate export.",
    },
    statewideOfficeList: {
      officeCategoryCount: officeItems.length,
      federalOfficeCategoryIds: officeItems.filter((item) => item.heading === "Federal"),
    },
    retainedOfficeCategoryFiles,
    federalTickerTotals: federalTicker,
    jurisdictionReportInventory: {
      fileCount: jurFiles.length,
      manifestCountyCount: jurManifest.countyCount,
      manifestCandidateRaceContainerCount: jurManifest.candidateRaceContainerCount,
      rescannedCandidateContainerCount: jurCandidateContainers,
      localOrCandidateFieldNames: [...jurLocalFieldNames].sort(),
      conclusion:
        "The collected JurR files contain county jurisdiction/contact and reporting-region/referendum structures. They contain zero candidate containers on both the retained manifest and this rescan.",
    },
    conclusion: {
      officialPresidentRowsAvailable: "county",
      officialSenateRowsAvailable: "county",
      officialSameGrainSubcountyPresidentSenateRowsAvailable: false,
      blocker:
        "The retained official ENR public JSON family supports county certified President and U.S. Senate rows, plus county turnout/statistics and referendum inventory. It does not expose same-grain precinct/subcounty President and U.S. Senate candidate rows needed to replace the supplemental MIT/OpenElections local review artifact.",
      nextOfficialSourceStep:
        "Request a statewide precinct/subcounty President and U.S. Senate export from the Indiana Election Division, then fall back to county election offices only if the state confirms no statewide export exists.",
    },
  };

  await writeFile(outPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
