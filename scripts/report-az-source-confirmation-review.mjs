import fs from "node:fs";
import path from "node:path";

const SUBMITTED_SOURCE_URL =
  "https://azsos.gov/elections/election-information/2024-election-info#collps_election_info_04";
const SUBMITTED_SOURCE_BASE =
  "https://azsos.gov/elections/election-information/2024-election-info";
const SIGNED_CANVASS_URL =
  "https://apps.azsos.gov/election/2024/ge/canvass/20241105_GeneralCanvass_Signed.pdf";
const OUT = "data/az-2024-source-confirmation-review.json";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = "";
  const serialized = url.toString();
  return serialized.endsWith("/") ? serialized.slice(0, -1) : serialized;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sourceById(config, sourceId) {
  const source = config.sources.find((entry) => entry.id === sourceId);
  assert(source, `Missing AZ source ${sourceId}`);
  return source;
}

function hasLoadedArtifact(inventory, predicate) {
  return inventory.loadedArtifacts.some(predicate);
}

const config = readJson("etl/state-configs/az.json");
const coverageInventory = readJson("data/az-2024-data-coverage-inventory.json");
const adminInventory = readJson("data/az-2024-admin-source-inventory.json");
const sourceTiers = readJson("data/source-acquisition-tiers.json");
const nativePackages = readJson("data/native-import-source-packages.json");

assert(config.code === "AZ", "Expected Arizona config");
assert(config.electionYear === 2024, "Expected 2024 Arizona config");
assert(coverageInventory.state === "AZ", "Expected Arizona coverage inventory");
assert(adminInventory.state === "AZ", "Expected Arizona admin inventory");

const submittedBase = normalizeUrl(SUBMITTED_SOURCE_URL);
assert(
  submittedBase === normalizeUrl(SUBMITTED_SOURCE_BASE),
  "Submitted source URL should normalize to the AZ SOS 2024 Election Information page",
);

const presidentSource = sourceById(config, config.certifiedResults.sourceId);
const senateSource = sourceById(config, config.reviewCharts.sourceId);
const turnoutSource = sourceById(config, config.turnout.sourceId);

assert(
  config.certifiedResults.sourceId === "az-2024-general-canvass-signed",
  "AZ certified results should use the signed canvass source",
);
assert(
  config.certifiedResults.format === "arizonaCanvassCountyCsv",
  "AZ certified results should use the Arizona canvass county parser",
);
assert(
  config.reviewCharts.sourceId === "az-2024-general-canvass-senate",
  "AZ review charts should use the signed canvass Senate source",
);
assert(
  config.reviewCharts.format === "countyComparisonCsv",
  "AZ review rows should remain county comparison rows",
);
assert(
  config.turnout.sourceId === "az-2024-general-canvass-signed",
  "AZ turnout should use the signed canvass source",
);
assert(
  [presidentSource.url, senateSource.url, turnoutSource.url].every(
    (url) => normalizeUrl(url) === normalizeUrl(SIGNED_CANVASS_URL),
  ),
  "AZ signed canvass pipeline should point to the official signed canvass PDF",
);

assert(
  normalizeUrl(adminInventory.resultCoverage.sourceUrl) === normalizeUrl(SUBMITTED_SOURCE_BASE),
  "AZ admin inventory should represent the submitted SOS election-info page",
);
assert(
  adminInventory.resultCoverage.loadedArtifacts.includes(
    "data/az-2024-general-canvass-president.csv",
  ) &&
    adminInventory.resultCoverage.loadedArtifacts.includes(
      "data/az-2024-general-canvass-senate.csv",
    ),
  "AZ admin inventory should link the submitted page to loaded signed-canvass artifacts",
);

assert(
  coverageInventory.officialSourceSearchPath.some(
    (entry) => normalizeUrl(entry.sourceUrl) === normalizeUrl(SUBMITTED_SOURCE_BASE),
  ),
  "AZ coverage inventory should include the submitted SOS election-info page",
);
assert(
  hasLoadedArtifact(
    coverageInventory,
    (artifact) =>
      artifact.id === "az-2024-general-canvass-president" &&
      normalizeUrl(artifact.sourceUrl) === normalizeUrl(SIGNED_CANVASS_URL),
  ),
  "AZ coverage inventory should include signed-canvass presidential rows",
);
assert(
  hasLoadedArtifact(
    coverageInventory,
    (artifact) =>
      artifact.id === "az-2024-general-canvass-senate" &&
      normalizeUrl(artifact.sourceUrl) === normalizeUrl(SIGNED_CANVASS_URL),
  ),
  "AZ coverage inventory should include signed-canvass Senate rows",
);
assert(
  hasLoadedArtifact(
    coverageInventory,
    (artifact) =>
      artifact.id === "az-2024-turnout" &&
      normalizeUrl(artifact.sourceUrl) === normalizeUrl(SIGNED_CANVASS_URL),
  ),
  "AZ coverage inventory should include signed-canvass turnout rows",
);

const tierAz = sourceTiers.states.find(
  (entry) => entry.state === "AZ" && entry.scope === "statewide",
);
assert(tierAz, "Missing AZ source-acquisition tier row");
assert(
  tierAz.sourceUrls.some((url) => normalizeUrl(url) === normalizeUrl(SUBMITTED_SOURCE_BASE)),
  "AZ source tier should include the submitted SOS election-info page",
);
assert(
  tierAz.exampleUrls.some((url) => normalizeUrl(url) === normalizeUrl(SIGNED_CANVASS_URL)),
  "AZ source tier should include the signed canvass PDF as the example source",
);

const nativeAz = nativePackages.states.find((entry) => entry.state === "AZ");
assert(nativePackages.completedNativeStates.includes("AZ"), "AZ should be a completed native state");
if (nativeAz) {
  assert(
    nativeAz.artifacts.presidentialCountyResults.sourceUrl === SIGNED_CANVASS_URL,
    "AZ native package should use the signed canvass for presidential county results",
  );
  assert(
    nativeAz.artifacts.localReviewRows.sourceUrl === SIGNED_CANVASS_URL,
    "AZ native package should use the signed canvass for local review rows",
  );
  assert(
    nativeAz.artifacts.turnout.sourceUrl === SIGNED_CANVASS_URL,
    "AZ native package should use the signed canvass for turnout",
  );
}

const review = {
  state: "AZ",
  stateName: "Arizona",
  electionYear: 2024,
  checkedAt: "2026-07-06",
  sourceAuthority: "Arizona Secretary of State",
  submittedSourceUrl: SUBMITTED_SOURCE_URL,
  normalizedSubmittedSourceUrl: SUBMITTED_SOURCE_BASE,
  submittedSourcePageObservation: {
    basis:
      "Live page review on 2026-07-06, followed by deterministic local config/inventory verification.",
    observedFacts: [
      "The submitted SOS 2024 Election Information page lists a Statewide Canvass section for the 2024 General Election.",
      "That section links the 2024 General Election Signed Canvass and labels it Signed Nov 25, 2024.",
      "The linked signed canvass PDF URL matches the active AZ signed canvass source in the repo config.",
    ],
    signedCanvassUrl: SIGNED_CANVASS_URL,
  },
  reviewedLocalContracts: [
    "etl/state-configs/az.json",
    "data/az-2024-data-coverage-inventory.json",
    "data/az-2024-admin-source-inventory.json",
    "data/source-acquisition-tiers.json",
    "data/native-import-source-packages.json",
  ],
  decision: "already_represented_by_signed_canvass_pipeline",
  productionPromotionPerformed: false,
  representedBy: {
    certifiedResults: {
      sourceId: config.certifiedResults.sourceId,
      parser: config.certifiedResults.format,
      localArtifact: presidentSource.localFile,
      sourceUrl: presidentSource.url,
      reportingGrain: "county",
      expectedRows: config.expected.resultRows,
      expectedStateTotal: config.expected.stateTotal,
    },
    reviewRows: {
      sourceId: config.reviewCharts.sourceId,
      parser: config.reviewCharts.format,
      localArtifact: senateSource.localFile,
      sourceUrl: senateSource.url,
      reportingGrain: "county",
      comparisonContest: config.reviewCharts.comparisonContest,
      expectedRows: config.expected.reviewRows,
    },
    turnout: {
      sourceId: config.turnout.sourceId,
      parser: config.turnout.format,
      localArtifact: turnoutSource.localFile,
      sourceUrl: turnoutSource.url,
      reportingGrain: config.turnout.sourceLevel,
      denominatorType: config.turnout.denominatorType,
      expectedRows: config.turnout.expected.rowCount,
      expectedBallotsCast: config.turnout.expected.ballotsCast,
      expectedRegisteredVoters: config.turnout.expected.registeredVoters,
    },
    sourceInventory: {
      coverageInventory: config.coverageInventory.localFile,
      adminSourceInventory: config.coverageInventory.adminSourceInventory,
      sourceTier: tierAz.tier,
      nativePackageStatus: nativeAz
        ? nativeAz.nativeReadiness
        : "AZ is listed in completedNativeStates; this registry does not repeat a full AZ state package row.",
    },
  },
  noNewResultSourceNeeded: true,
  caveats: [
    "The submitted SOS page is an official source page and source-navigation record; the loaded result, review, and turnout rows come from its signed statewide canvass PDF link.",
    "The signed canvass pipeline supports county certified results, county President-versus-U.S. Senate advisory review, and county turnout denominators only.",
    "No official statewide precinct/local President plus same-grain U.S. Senate export is represented by this submitted page or loaded in the current AZ package.",
    "This review is source confirmation only. It does not promote production data and does not allege fraud or misconduct.",
  ],
  remainingGaps: coverageInventory.gaps.map((gap) => ({
    artifact: gap.artifact,
    status: gap.status,
    neededFor: gap.neededFor,
  })),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(review, null, 2)}\n`);
console.log(`Wrote ${OUT}`);
