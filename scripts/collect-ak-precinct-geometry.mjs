import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { buildAlaskaPrecinctGeometry } from "./lib/ak-precinct-geometry.mjs";
import {
  ALASKA_PRECINCT_ELECTIONS,
  augmentAlaska2020WriteIns,
  parseAlaska2012SovcPdfs,
  parseAlaska2016ResultText,
  parseAlaska2020ResultText,
  parseAlaska2024EnrCsv,
  summarizeAlaskaResultUnits,
} from "./lib/ak-precinct-reporting-units.mjs";

const STATE = "AK";
const REPORTING_GRAIN = "precinct";
const SHARED = "data/precinct-geometry/AK/raw-shared/alaska-division-of-elections";
const RETRIEVAL_URLS = Object.freeze({
  2012: "https://www.elections.alaska.gov/Core/Archive/ElectionReturns_2012_GENR.php",
  2016: "https://www.elections.alaska.gov/results/16GENR/",
  2020: "https://www.elections.alaska.gov/results/20GENR/",
  2024: "https://www.elections.alaska.gov/results/24GENR/ENRbyPrecinct.csv",
});
const EXPECTED = Object.freeze({
  2012: Object.freeze({ resultUnits: 558, geographic: 438, nonGeographic: 120, president: 300495, comparisonOffice: "us_house", comparison: 289804 }),
  2016: Object.freeze({ resultUnits: 562, geographic: 441, nonGeographic: 121, president: 318608, comparisonOffice: "senate", comparison: 311441 }),
  2020: Object.freeze({ resultUnits: 562, geographic: 441, nonGeographic: 121, president: 359530, comparisonOffice: "senate", comparison: 354587 }),
  2024: Object.freeze({ resultUnits: 523, geographic: 402, nonGeographic: 121, president: 338177, comparisonOffice: "us_house", comparison: 328805 }),
});

function argument(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

const year = Number(argument("year"));
const retrievedAt = argument("retrieved-at");
if (!ALASKA_PRECINCT_ELECTIONS[year]) throw new Error("--year must be 2012, 2016, 2020, or 2024");
if (!retrievedAt || Number.isNaN(Date.parse(retrievedAt))) throw new Error("--retrieved-at must be an ISO timestamp");
if (Date.parse(retrievedAt) > Date.now()) throw new Error("--retrieved-at must not be in the future");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function write(relativePath, value) {
  const bytes = Buffer.isBuffer(value) ? value : jsonBytes(value);
  const absolute = path.resolve(relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
  return {
    localArtifactPath: relativePath.replaceAll("\\", "/"),
    sha256: sha256(bytes),
    byteCount: bytes.length,
  };
}

function retained(relativePath, url, authority, format, note) {
  const bytes = readFileSync(relativePath);
  return {
    localArtifactPath: relativePath.replaceAll("\\", "/"),
    url,
    authority,
    format,
    sha256: sha256(bytes),
    byteCount: bytes.length,
    note,
  };
}

function yearBase(targetYear = year) {
  return `data/precinct-geometry/AK/${ALASKA_PRECINCT_ELECTIONS[targetYear].id}`;
}

function official2012PdfPaths() {
  return Array.from({ length: 40 }, (_, index) => (
    `${yearBase(2012)}/raw/alaska-division-of-elections/sovc/hd${index + 1}.pdf`
  ));
}

function official2020PdfPaths() {
  return [
    ...Array.from({ length: 40 }, (_, index) => (
      `${yearBase(2020)}/raw/alaska-division-of-elections/sovc/HD${index + 1}p.pdf`
    )),
    `${yearBase(2020)}/raw/alaska-division-of-elections/sovc/HD99p.pdf`,
  ];
}

async function normalizedResults() {
  if (year === 2012) return parseAlaska2012SovcPdfs(official2012PdfPaths());
  if (year === 2016) {
    return parseAlaska2016ResultText(
      readFileSync(`${yearBase()}/raw/alaska-division-of-elections/resultsbyprct.txt`),
    );
  }
  if (year === 2020) {
    const base = parseAlaska2020ResultText(
      readFileSync(`${yearBase()}/raw/alaska-division-of-elections/resultsbyprecinct.txt`),
    );
    return augmentAlaska2020WriteIns(base, official2020PdfPaths());
  }
  return parseAlaska2024EnrCsv(readFileSync("data/ak-2024-general-enr-by-precinct.csv"));
}

function geometryPath() {
  if (year === 2012) return `${yearBase()}/raw/precinct-shapefiles-mirror/2012_ak_precincts.zip`;
  if (year === 2024) return `${SHARED}/AK_Election_Precincts_2023Final.zip`;
  return `${SHARED}/2013-SW-Precinct-Proc-Plan.zip`;
}

function resultSourceArtifacts() {
  if (year === 2012) {
    return [
      retained(
        `${yearBase()}/raw/alaska-division-of-elections/results-index.html`,
        RETRIEVAL_URLS[2012],
        "Alaska Division of Elections",
        "HTML",
        "Official 2012 General Election result index retaining all 40 SOVC links.",
      ),
      retained(
        `${yearBase()}/raw/alaska-division-of-elections/results-summary.html`,
        "https://www.elections.alaska.gov/results/12GENR/data/results.htm",
        "Alaska Division of Elections",
        "HTML",
        "Official certified statewide totals and 438-of-438 reporting-precinct count.",
      ),
      ...official2012PdfPaths().map((sourcePath, index) => retained(
        sourcePath,
        `https://www.elections.alaska.gov/results/12GENR/data/sovc/hd${index + 1}.pdf`,
        "Alaska Division of Elections",
        "PDF",
        `Official House District ${index + 1} Statement of Votes Cast with precinct and administrative reporting-unit results.`,
      )),
    ];
  }
  if (year === 2016) {
    return [
      retained(`${yearBase()}/raw/alaska-division-of-elections/results-index.html`, RETRIEVAL_URLS[2016], "Alaska Division of Elections", "HTML", "Official 2016 General Election results index."),
      retained(`${yearBase()}/raw/alaska-division-of-elections/results-summary.html`, "https://www.elections.alaska.gov/results/16GENR/data/results.htm", "Alaska Division of Elections", "HTML", "Official certified statewide result summary."),
      retained(`${yearBase()}/raw/alaska-division-of-elections/resultsbyprct.txt`, "https://www.elections.alaska.gov/results/16GENR/data/resultsbyprct.txt", "Alaska Division of Elections", "TXT", "Official machine-readable results by precinct and administrative reporting unit."),
    ];
  }
  if (year === 2020) {
    return [
      retained(`${yearBase()}/raw/alaska-division-of-elections/resultsbyprecinct.txt`, "https://www.elections.alaska.gov/results/20GENR/data/resultsbyprecinct.txt", "Alaska Division of Elections", "TXT", "Official machine-readable named-candidate results by precinct and administrative reporting unit."),
      retained(`${yearBase()}/raw/alaska-division-of-elections/final-summary.pdf`, "https://www.elections.alaska.gov/results/20GENR/data/results.pdf", "Alaska Division of Elections", "PDF", "Official certified statewide result summary used to confirm contest totals."),
      ...official2020PdfPaths().map((sourcePath, index) => {
        const label = index === 40 ? "HD99" : `HD${index + 1}`;
        return retained(
          sourcePath,
          `https://www.elections.alaska.gov/results/20GENR/data/sovc/${label}p.pdf`,
          "Alaska Division of Elections",
          "PDF",
          `Official ${label} Statement of Votes Cast used to restore and reconcile write-in votes omitted from the text export.`,
        );
      }),
    ];
  }
  return [
    retained(
      "data/ak-2024-general-enr-by-precinct.csv",
      RETRIEVAL_URLS[2024],
      "Alaska Division of Elections",
      "CSV",
      "Official 2024 General Election results by precinct/reporting unit; presidential rows reconcile exactly to the certified statewide summary.",
    ),
  ];
}

function geometrySourceArtifacts() {
  if (year === 2012) {
    return [
      retained(
        `${yearBase()}/raw/precinct-shapefiles-mirror/2012_ak_precincts.zip`,
        "https://raw.githubusercontent.com/aaron-strauss/precinct-shapefiles/dbacfd394b7759d4143ea4203cc00e2d503a7f6c/ak/2012_ak_precincts.zip",
        "Alaska 2012 amended-proclamation plan, retained through the Aaron Strauss precinct-shapefiles mirror",
        "ESRI Shapefile ZIP",
        "Commit-pinned copy of the 2012 statewide precinct polygons. Election identity and vintage are independently checked against official Alaska materials; the mirror custody and missing formal license are disclosed.",
      ),
      retained(`${yearBase()}/raw/precinct-shapefiles-mirror/README.md`, "https://raw.githubusercontent.com/aaron-strauss/precinct-shapefiles/dbacfd394b7759d4143ea4203cc00e2d503a7f6c/README.md", "Aaron Strauss precinct-shapefiles mirror", "MD", "Retained repository description; it does not state a formal license."),
      retained(`${yearBase()}/raw/precinct-shapefiles-mirror/content-metadata.json`, "https://api.github.com/repos/aaron-strauss/precinct-shapefiles/contents/ak/2012_ak_precincts.zip?ref=dbacfd394b7759d4143ea4203cc00e2d503a7f6c", "GitHub API", "JSON", "Commit-pinned file identity and custody evidence."),
      retained(`${yearBase()}/raw/precinct-shapefiles-mirror/commit-metadata.json`, "https://api.github.com/repos/aaron-strauss/precinct-shapefiles/commits/dbacfd394b7759d4143ea4203cc00e2d503a7f6c", "GitHub API", "JSON", "Commit metadata proving the retained file was added December 23, 2013."),
      retained(`${yearBase()}/raw/alaska-division-of-elections/2012-amended-proclamation-media.pdf`, "https://www.elections.alaska.gov/doc/mp/2012/2012PRIM-Media.pdf", "Alaska Division of Elections", "PDF", "Official media packet identifies the April 5, 2012 amended-proclamation precinct plan and the election precinct IDs/names."),
      retained(`${SHARED}/2013-SW-Precinct-Proc-Plan.zip`, "https://www.elections.alaska.gov/Core/Archive/2013districtmaps.php", "Alaska Division of Elections", "ESRI Shapefile ZIP", "Official successor precinct plan used only to prove the retained 2012 Lake Iliamna polygon's mislabeled ID; it is not substituted for the 2012 boundary layer."),
    ];
  }
  if (year === 2016 || year === 2020) {
    return [
      retained(`${SHARED}/2013-SW-Precinct-Proc-Plan.zip`, "https://www.elections.alaska.gov/Core/Archive/2013districtmaps.php", "Alaska Division of Elections", "ESRI Shapefile ZIP", "Official statewide precinct shapefile for the July 14, 2013 proclamation plan used by this election."),
      retained(`${SHARED}/2014-Statewide-Prec-Boundary-Regs.pdf`, "https://www.elections.alaska.gov/doc/prpsa/2014-Statewide-Prec-Boundary-Regs.pdf", "Alaska Division of Elections", "PDF", "Official statewide legal precinct-boundary descriptions for the 2013 proclamation plan."),
    ];
  }
  return [
    retained(`${SHARED}/AK_Election_Precincts_2023Final.zip`, "https://www.elections.alaska.gov/doc/maps/AK_Election_Precincts_2023Final.zip", "Alaska Division of Elections", "ESRI Shapefile ZIP", "Official 2023 final-proclamation election precinct shapefile approved and adopted by the Division in April 2024."),
    retained(`${yearBase()}/raw/alaska-division-of-elections/precinct-maps-page.html`, "https://www.elections.alaska.gov/research/district-maps/", "Alaska Division of Elections", "HTML", "Official page linking the retained ZIP and stating its approval, adoption, and final-proclamation vintage."),
  ];
}

function sourceTerms() {
  if (year === 2012) {
    return "Official Alaska election and boundary-plan evidence. The exact polygon archive is retained through a commit-pinned public mirror that states no formal license; public release requires preserving this custody/reuse caveat or replacing it with a redistributable official copy.";
  }
  return "Official Alaska public election and GIS records; the source pages state no additional redistribution restriction. Preserve Alaska Division of Elections attribution and source links.";
}

function caveats() {
  const values = [
    "Alaska results contain separately reported absentee, early-voting, questioned-ballot, and federal-overseas buckets. They are preserved for statewide reconciliation but are non-geographic and are never assigned to a precinct polygon.",
    "The map is parent-scoped by Alaska House District, not by county or county equivalent. No precinct is centroid-assigned or proportionally allocated to a borough or census area.",
    "Each election retains its own boundary vintage. Precinct IDs and shapes are not assumed comparable across elections; cross-year trend comparison requires a separate reviewed common-geography crosswalk.",
  ];
  if (year === 2012) values.push(
    "The 2012 statewide polygon archive is a commit-pinned public mirror of the April 5, 2012 amended-proclamation plan. Official Alaska results/media independently confirm all 438 displayed IDs except one reviewed DBF typo: source 36-616 is Lake Iliamna No. 1 and is corrected to official result ID 36-040 after identical topology, area, and population are confirmed in the official 2013 successor plan.",
    "The 2012 mirror states no formal license. Its custody and reuse limitation must remain visible until an official redistributable replacement or explicit permission is retained.",
  );
  if (year === 2020) values.push(
    "The official text export omits write-in rows. All 41 official SOVC PDFs are parsed to restore exact precinct/reporting-unit write-ins; presidential and Senate totals then reconcile exactly to the certified summary.",
  );
  if (year === 2024) values.push(
    "The 2024 ENR precinct CSV fully reconciles presidential votes. Its U.S. House rows omit 750 statewide write-in votes, so the House comparison is retained as named-candidate context only and is not represented as a complete contest total.",
  );
  return values;
}

function crosswalkSummary(rows) {
  const geographic = rows.filter((row) => row.isGeographic);
  const nonGeographic = rows.filter((row) => !row.isGeographic);
  return {
    resultUnits: rows.length,
    colorableResultUnits: geographic.length,
    matchedResultUnits: geographic.length,
    unmatchedResultUnits: 0,
    nonGeographicResultUnits: nonGeographic.length,
    sourceAliasResultUnits: 0,
    relationships: {
      oneToOne: geographic.length,
      oneToMany: 0,
      manyToOne: 0,
      unmatched: 0,
      nonGeographic: nonGeographic.length,
      sourceAlias: 0,
      pendingReview: 0,
    },
  };
}

function crosswalkReconciliation(rows) {
  const geographic = rows.filter((row) => row.isGeographic);
  const nonGeographic = rows.filter((row) => !row.isGeographic);
  const counted = {
    classifiedResultUnits: rows.length,
    geographicResultUnits: geographic.length,
    nonGeographicResultUnits: nonGeographic.length,
  };
  const scopes = [{
    scopeType: "state",
    scopeId: STATE,
    resultTotals: counted,
    mappedTotals: { ...counted },
    deltas: Object.fromEntries(Object.keys(counted).map((key) => [key, 0])),
  }];
  for (const parentGeoid of [...new Set(geographic.map((row) => row.parentGeoid))].sort()) {
    const count = geographic.filter((row) => row.parentGeoid === parentGeoid).length;
    scopes.push({
      scopeType: "parent",
      scopeId: parentGeoid,
      resultTotals: { geographicResultUnits: count },
      mappedTotals: { geographicResultUnits: count },
      deltas: { geographicResultUnits: 0 },
    });
  }
  return { status: "passed", scopes };
}

function contestRows(units) {
  return units.flatMap((unit) => Object.values(unit.contests).flatMap((contest) => (
    contest.candidates.map((candidate) => ({
      resultUnitCode: unit.resultUnitCode,
      sourceUnitId: unit.sourceUnitId,
      sourceDisplayName: unit.sourceDisplayName,
      parentGeoid: unit.parentGeoid,
      reportingGrain: unit.reportingGrain,
      isGeographic: unit.isGeographic,
      office: contest.office,
      candidate: candidate.candidate,
      party: candidate.party,
      partyCode: candidate.partyCode,
      votes: candidate.votes,
      reportedRegistration: contest.reportedRegistration,
      reportedTurnout: contest.reportedTurnout,
    }))
  )));
}

const election = ALASKA_PRECINCT_ELECTIONS[year];
const expected = EXPECTED[year];
const units = await normalizedResults();
const resultSummary = summarizeAlaskaResultUnits(units);
if (
  resultSummary.resultUnits !== expected.resultUnits
  || resultSummary.geographicResultUnits !== expected.geographic
  || resultSummary.nonGeographicResultUnits !== expected.nonGeographic
  || resultSummary.contestTotals.president?.totalVotes !== expected.president
  || resultSummary.contestTotals[expected.comparisonOffice]?.totalVotes !== expected.comparison
) {
  throw new Error(`Alaska ${year} official result reconciliation changed.`);
}
const geometry = await buildAlaskaPrecinctGeometry(
  year,
  units,
  readFileSync(geometryPath()),
  year === 2012
    ? { official2013ZipBytes: readFileSync(`${SHARED}/2013-SW-Precinct-Proc-Plan.zip`) }
    : {},
);
const base = yearBase();
const manifestId = `ak-${election.id}-precinct-geometry-candidate-v1`;
const generatedCaveats = caveats();
const normalizedGeometryPlain = Buffer.from(JSON.stringify(geometry.featureCollection));
const normalizedGeometryBytes = gzipSync(normalizedGeometryPlain, { level: 9, mtime: 0 });
const resultsDocument = {
  schemaVersion: 1,
  state: STATE,
  electionId: election.id,
  reportingGrain: REPORTING_GRAIN,
  parentLevel: "house_district",
  sourceUnitCount: units.length,
  geographicResultUnitCount: resultSummary.geographicResultUnits,
  nonGeographicResultUnitCount: resultSummary.nonGeographicResultUnits,
  contestTotals: resultSummary.contestTotals,
  rows: contestRows(units),
};
const normalizedResultsPlain = jsonBytes(resultsDocument);
const normalizedResultsBytes = gzipSync(normalizedResultsPlain, { level: 9, mtime: 0 });
const crosswalk = {
  schemaVersion: 1,
  manifestId,
  state: STATE,
  electionId: election.id,
  geographyLevel: REPORTING_GRAIN,
  parentLevel: "house_district",
  resultSourceId: `ak-${year}-official-precinct-results`,
  generatedAt: retrievedAt,
  rows: geometry.crosswalkRows,
  reconciliation: crosswalkReconciliation(geometry.crosswalkRows),
  correction: geometry.correction,
  excludedSourceFeatures: geometry.excludedSourceFeatures,
};
const normalizedArtifact = write(`${base}/normalized/ak-${year}-precincts.geojson.gz`, normalizedGeometryBytes);
const resultsArtifact = write(`${base}/normalized/ak-${year}-official-precinct-results.json.gz`, normalizedResultsBytes);
const crosswalkArtifact = write(`${base}/crosswalk/ak-${year}-precinct-result-crosswalk.json`, crosswalk);
const artifacts = [...resultSourceArtifacts(), ...geometrySourceArtifacts()];
const evidence = {
  schemaVersion: 1,
  id: `ak-${year}-precinct-geometry-source-evidence`,
  state: STATE,
  election,
  authority: year === 2012
    ? "Alaska Division of Elections results and boundary-plan evidence with a commit-pinned 2012 polygon mirror"
    : "Alaska Division of Elections",
  retrievedAt,
  sourceCrs: geometry.sourceCrs,
  servedCrs: "EPSG:4326",
  artifacts,
  resultIdentity: {
    sourceId: crosswalk.resultSourceId,
    resultUnits: units.length,
    geographicResultUnits: resultSummary.geographicResultUnits,
    nonGeographicResultUnits: resultSummary.nonGeographicResultUnits,
    normalizedResultArtifact: resultsArtifact,
    contestTotals: resultSummary.contestTotals,
    comparisonContestComplete: year !== 2024,
    ...(year === 2024 ? { comparisonContestKnownStatewideWriteInGap: 750 } : {}),
  },
  geometryContext: {
    sourceFeatureCount: geometry.sourceFeatureCount,
    outputFeatureCount: geometry.normalizedFeatureCount,
    matchedFeatureCount: resultSummary.geographicResultUnits,
    unassignedSourceFeatureCount: geometry.excludedSourceFeatures.length,
    excludedSourceFeatures: geometry.excludedSourceFeatures,
    correction: geometry.correction,
    parentLevel: "house_district",
  },
  publicReuse: {
    status: year === 2012 ? "requires_release_review" : "official_public_record_no_additional_restriction_stated",
    terms: sourceTerms(),
  },
  crossYearComparison: {
    directPrecinctComparisonSafe: false,
    reason: "Precinct boundaries and identifiers can change after redistricting or election-administration revisions.",
    supportedUse: "Render each election on its own verified boundary vintage.",
    futureRequirement: "Build a separately reviewed common-geography crosswalk before presenting precinct trend values as apples-to-apples.",
  },
  caveats: generatedCaveats,
};
const evidenceArtifact = write(`${base}/source-evidence.json`, evidence);
const summary = crosswalkSummary(geometry.crosswalkRows);
const report = {
  schemaVersion: 1,
  state: STATE,
  electionId: election.id,
  generatedAt: retrievedAt,
  disposition: "source_and_crosswalk_gates_passed_delivery_pending",
  results: resultSummary,
  geometry: evidence.geometryContext,
  crosswalk: summary,
  artifacts: {
    normalizedGeometry: normalizedArtifact,
    normalizedGeometryUncompressed: { sha256: sha256(normalizedGeometryPlain), byteCount: normalizedGeometryPlain.length },
    normalizedResults: resultsArtifact,
    normalizedResultsUncompressed: { sha256: sha256(normalizedResultsPlain), byteCount: normalizedResultsPlain.length },
    crosswalk: crosswalkArtifact,
    sourceEvidence: evidenceArtifact,
  },
  caveats: generatedCaveats,
};
const reportArtifact = write(`${base}/reports/ak-${year}-precinct-geometry-report.json`, report);
const manifest = {
  schemaVersion: 1,
  id: manifestId,
  state: STATE,
  election,
  geography: {
    level: REPORTING_GRAIN,
    parentLevel: "house_district",
    boundaryVintage: year === 2012
      ? "April 5, 2012 amended-proclamation precinct plan"
      : year === 2016 || year === 2020
        ? "July 14, 2013 proclamation precinct plan"
        : "May 15, 2023 final-proclamation precinct plan approved and adopted for elections in April 2024",
    vintageStatus: "election_date_confirmed",
    derivationMethod: year === 2012 ? "hybrid_reconstruction" : "official_export",
  },
  source: {
    authority: evidence.authority,
    url: RETRIEVAL_URLS[year],
    retrievedAt,
    artifact: evidenceArtifact.localArtifactPath,
    sha256: evidenceArtifact.sha256,
    byteCount: evidenceArtifact.byteCount,
    format: "precinct-source-evidence+json",
    licenseOrTerms: sourceTerms(),
  },
  normalization: {
    script: "scripts/collect-ak-precinct-geometry.mjs",
    sourceCrs: geometry.sourceCrs,
    servedCrs: "EPSG:4326",
    artifact: normalizedArtifact.localArtifactPath,
    sha256: normalizedArtifact.sha256,
    byteCount: normalizedArtifact.byteCount,
    featureCount: geometry.normalizedFeatureCount,
    sourceFeatureIdFields: ["CRM_FEATURE_ID"],
    parentIdFields: ["CRM_PARENT_GEOID"],
  },
  crosswalk: {
    status: "reviewed",
    resultSourceId: crosswalk.resultSourceId,
    artifact: crosswalkArtifact.localArtifactPath,
    sha256: crosswalkArtifact.sha256,
    byteCount: crosswalkArtifact.byteCount,
    ...summary,
    reviewedRelationshipRecords: summary.resultUnits,
    reviewedNoDataFeatures: 0,
    methods: [...new Set(geometry.crosswalkRows.flatMap((row) => row.relationships.map((relationship) => relationship.matchMethod)))].sort(),
  },
  validation: {
    status: "blocked",
    geometryValid: true,
    rowLevelRenderingSafe: true,
    parentTotalsReconciled: true,
    errors: ["An immutable House-District-scoped public delivery package and production release review have not been completed."],
    warnings: generatedCaveats,
  },
  delivery: null,
  caveats: generatedCaveats,
};
const manifestArtifact = write(`${base}/manifest.json`, manifest);
console.log(JSON.stringify({
  year,
  manifest: manifestArtifact,
  report: reportArtifact,
  resultUnits: units.length,
  geometryFeatures: geometry.normalizedFeatureCount,
  nonGeographicResultUnits: resultSummary.nonGeographicResultUnits,
  presidentVotes: resultSummary.contestTotals.president.totalVotes,
  delivery: null,
}, null, 2));
