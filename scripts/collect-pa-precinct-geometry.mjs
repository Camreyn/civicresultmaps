import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { unzipSync, zipSync } from "fflate";
import {
  buildPennsylvaniaCanonicalDocuments,
  PENNSYLVANIA_LRC_UPSTREAM,
  PENNSYLVANIA_PRECINCT_YEAR_SPECS,
  PENNSYLVANIA_RAW_SOURCE_PINS,
  PENNSYLVANIA_REVIEWED_AT,
  sha256,
  verifyPennsylvaniaRawSources,
} from "./lib/pa-precinct-geometry.mjs";

const option = (name) =>
  process.argv.find((value) => value.startsWith(name + "="))
    ?.slice(name.length + 1);
const year = Number(option("--year"));
const root = path.resolve(option("--root") || process.cwd());
const retrievedAt = option("--retrieved-at");
const lrcFullArchive = option("--lrc-full-archive");
const shouldDownload = process.argv.includes("--download");

if (![2012, 2016, 2020, 2024].includes(year)) {
  throw new Error(
    "Use --year=2012, --year=2016, --year=2020, or --year=2024.",
  );
}
if (retrievedAt !== PENNSYLVANIA_REVIEWED_AT) {
  throw new Error(
    "Use --retrieved-at=" + PENNSYLVANIA_REVIEWED_AT
      + " for deterministic replay.",
  );
}

const spec = PENNSYLVANIA_PRECINCT_YEAR_SPECS[year];
const absolute = (relativePath) =>
  path.join(root, ...relativePath.split("/"));
const jsonBytes = (value) =>
  Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");

const DOWNLOADS = Object.freeze({
  "data/precinct-geometry/PA/2012-11-06-general/raw/us-census/tl_2012_42_vtd10.zip":
    "https://www2.census.gov/geo/tiger/TIGER2012/VTD/tl_2012_42_vtd10.zip",
  "data/precinct-geometry/PA/2016-11-08-general/raw/vest/pa_2016.zip":
    "https://raw.githubusercontent.com/PlanScore/National-Input-Data/b8d27cbdc2e752fbadf8e3432d8eb3c96ba579b7/VEST/pa_2016.zip",
  "data/precinct-geometry/PA/2016-11-08-general/raw/vest/documentation.txt":
    "https://election.lab.ufl.edu/data-downloads/resultsdata/2016/precinct/documentation.txt",
  "data/precinct-geometry/PA/2016-11-08-general/raw/review/pa_vest_16_validation_report.pdf":
    "https://redistrictingdatahub.org/wp-content/uploads/2020/12/pa_vest_16_validation_report.pdf",
  "data/precinct-geometry/PA/2020-11-03-general/raw/vest/pa_2020.zip":
    "https://raw.githubusercontent.com/PlanScore/National-Input-Data/4ee0f4724a1e99213c95bd5c00926fb4b0c3d4c6/VEST/pa_2020.zip",
  "data/precinct-geometry/PA/2020-11-03-general/raw/vest/documentation.txt":
    "https://election.lab.ufl.edu/data-downloads/resultsdata/2020/precinct/documentation.txt",
  "data/precinct-geometry/PA/2020-11-03-general/raw/review/pa_vest_20_validation_report.pdf":
    "https://redistrictingdatahub.org/wp-content/uploads/2020/12/pa_vest_20_validation_report.pdf",
  "data/precinct-geometry/PA/2024-11-05-general/raw/pa-lrc/2021-lrc-data-certification-transcript.pdf":
    "https://www.redistricting.state.pa.us/resources/press/2021-10-25%20LRC%20Transcript%20A.pdf",
});

function write(relativePath, bytes) {
  const target = absolute(relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return {
    localArtifactPath: relativePath,
    byteCount: bytes.length,
    sha256: sha256(bytes),
  };
}

function writeJson(relativePath, value) {
  return write(relativePath, jsonBytes(value));
}

function writeGzipJson(relativePath, value) {
  const uncompressed = Buffer.from(JSON.stringify(value) + "\n", "utf8");
  return write(
    relativePath,
    gzipSync(uncompressed, { level: 9, mtime: 0 }),
  );
}

function verifyPin(relativePath, bytes, context = "source") {
  const pin = PENNSYLVANIA_RAW_SOURCE_PINS[relativePath];
  if (!pin || bytes.length !== pin[0] || sha256(bytes) !== pin[1]) {
    throw new Error(
      "Pennsylvania " + context
        + " differs from the reviewed byte pin: " + relativePath,
    );
  }
}

function restoreReviewedCrlfArtifact(relativePath) {
  const target = absolute(relativePath);
  if (!existsSync(target)) return;
  const bytes = readFileSync(target);
  const pin = PENNSYLVANIA_RAW_SOURCE_PINS[relativePath];
  if (!pin || (bytes.length === pin[0] && sha256(bytes) === pin[1])) return;
  const restored = [];
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 10 && (index === 0 || bytes[index - 1] !== 13)) {
      restored.push(13);
    }
    restored.push(bytes[index]);
  }
  const restoredBytes = Buffer.from(restored);
  if (
    restoredBytes.length === pin[0]
    && sha256(restoredBytes) === pin[1]
  ) {
    write(relativePath, restoredBytes);
  }
}

async function downloadPinned(relativePath, url) {
  const response = await fetch(url, {
    headers: { "user-agent": "CivicResultMaps-source-collector/1.0" },
  });
  if (!response.ok) {
    throw new Error(
      "Pennsylvania source download failed with HTTP "
        + response.status + ": " + url,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  verifyPin(relativePath, bytes, "downloaded source");
  write(relativePath, bytes);
}

function deriveLrcVotingDistrictArchive(fullArchiveBytes) {
  if (
    fullArchiveBytes.length !== PENNSYLVANIA_LRC_UPSTREAM.byteCount
    || sha256(fullArchiveBytes) !== PENNSYLVANIA_LRC_UPSTREAM.sha256
  ) {
    throw new Error(
      "Pennsylvania LRC full geography archive differs from the reviewed byte pin.",
    );
  }
  const members = unzipSync(fullArchiveBytes, {
    filter: (entry) =>
      /^Geography\/WP_VotingDistricts\.(?:CPG|dbf|prj|sbn|sbx|shp|shx)$/i
        .test(entry.name),
  });
  if (Object.keys(members).length !== 7) {
    throw new Error(
      "Pennsylvania LRC archive must contain all seven reviewed WP_VotingDistricts members.",
    );
  }
  const deterministicMembers = {};
  for (const [name, bytes] of Object.entries(members)) {
    deterministicMembers[path.posix.basename(name)] = [bytes, {
      level: 9,
      mtime: new Date("1980-01-02T00:00:00.000Z"),
      os: 3,
    }];
  }
  return Buffer.from(zipSync(deterministicMembers, {
    level: 9,
    mtime: new Date("1980-01-02T00:00:00.000Z"),
    os: 3,
  }));
}

async function acquire() {
  if (shouldDownload) {
    for (const [relativePath, url] of Object.entries(DOWNLOADS)) {
      if (!relativePath.includes("/" + spec.electionId + "/")) continue;
      await downloadPinned(relativePath, url);
    }
  }

  if (year !== 2024 || (!shouldDownload && !lrcFullArchive)) return;
  let fullArchiveBytes;
  if (lrcFullArchive) {
    fullArchiveBytes = readFileSync(path.resolve(lrcFullArchive));
  } else {
    const response = await fetch(PENNSYLVANIA_LRC_UPSTREAM.url, {
      headers: { "user-agent": "CivicResultMaps-source-collector/1.0" },
    });
    if (!response.ok) {
      throw new Error(
        "Pennsylvania LRC source download failed with HTTP "
          + response.status + ": " + PENNSYLVANIA_LRC_UPSTREAM.url,
      );
    }
    fullArchiveBytes = Buffer.from(await response.arrayBuffer());
  }
  const subset = deriveLrcVotingDistrictArchive(fullArchiveBytes);
  verifyPin(spec.geometryPath, subset, "derived LRC voting-district subset");
  write(spec.geometryPath, subset);
}

function pathsForYear() {
  return {
    results:
      spec.base + "/normalized/pa-" + year + "-president-results.json.gz",
    geometry:
      spec.base + "/normalized/pa-" + year
        + (spec.rowLevelSafe
          ? "-reviewed-precinct-geometry.geojson.gz"
          : "-no-approved-precinct-geometry.json"),
    crosswalk:
      spec.base + "/crosswalk/pa-" + year
        + "-result-to-geometry-review.json",
    report:
      spec.base + "/reports/pa-" + year
        + "-precinct-geometry-report.json",
    evidence: spec.base + "/source-evidence.json",
    manifest: spec.base + "/manifest.json",
    license: spec.base + "/raw/vest/version-license-evidence.json",
  };
}

function licenseEvidence(targetYear) {
  const geometryPath = PENNSYLVANIA_PRECINCT_YEAR_SPECS[targetYear].geometryPath;
  const reviewed = targetYear === 2016
    ? {
      datasetPage:
        "https://election.lab.ufl.edu/dataset/pa-2016-precinct-level-election-results/",
      custodyCommit: "b8d27cbdc2e752fbadf8e3432d8eb3c96ba579b7",
      custodyBlob: "46a497eb6a0bc34ecb8a4733e3fae336e892cf11",
    }
    : {
      datasetPage:
        "https://election.lab.ufl.edu/dataset/pa-2020-precinct-level-election-results/",
      custodyCommit: "4ee0f4724a1e99213c95bd5c00926fb4b0c3d4c6",
      custodyBlob: "e2e63a6610383195d7f03f96660f85516c86f531",
    };
  return {
    schemaVersion: 1,
    state: "PA",
    electionYear: targetYear,
    geometryArtifact: {
      filename: "pa_" + targetYear + ".zip",
      byteCount: PENNSYLVANIA_RAW_SOURCE_PINS[geometryPath][0],
      sha256: PENNSYLVANIA_RAW_SOURCE_PINS[geometryPath][1],
      vestDatasetPage: reviewed.datasetPage,
    },
    custodyMirror: {
      repository: "https://github.com/PlanScore/National-Input-Data",
      path: "VEST/pa_" + targetYear + ".zip",
      commit: reviewed.custodyCommit,
      gitBlobSha1: reviewed.custodyBlob,
      note:
        "The PlanScore repository supplies version-pinned public byte custody; VEST supplies the dataset and methodology.",
    },
    independentReview: {
      authority: "Redistricting Data Hub",
      status: "review_limitations_recorded",
      note:
        "The retained report describes checks but says the reviewer could not fully reproduce the joins and validation. CivicResultMaps therefore accepts only county-qualified VTD matches whose complete presidential candidate vectors agree exactly.",
    },
    rights: {
      license: "Creative Commons Attribution 4.0 International",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      evidenceUrl: "https://www.nature.com/articles/s41597-024-04024-2",
      note:
        "The VEST data descriptor states that the 2016, 2018, and 2020 precinct databases are released under CC BY 4.0. The article publication license is separate.",
    },
  };
}

function artifactRecord(
  relativePath,
  authority,
  sourceUrl,
  format,
  reportingGrain,
  note,
  extras = {},
) {
  const bytes = readFileSync(absolute(relativePath));
  const artifact = {
    authority,
    sourceUrl,
    derivation:
      "Downloaded byte-for-byte from the stated HTTPS source or retained as a deterministic evidence record derived from that source; byte count and SHA-256 are pinned.",
    localArtifactPath: relativePath,
    format,
    reportingGrain,
    byteCount: bytes.length,
    sha256: sha256(bytes),
    note,
    ...extras,
  };
  if (relativePath.endsWith(".gz")) {
    const uncompressed = gunzipSync(bytes);
    artifact.uncompressedByteCount = uncompressed.length;
    artifact.uncompressedSha256 = sha256(uncompressed);
  }
  return artifact;
}

function sourceAuthority() {
  if (year === 2012) {
    return "Pennsylvania Department of State results; U.S. Census Bureau 2010 VTD availability diagnostic";
  }
  if (year === 2024) {
    return "Pennsylvania Department of State results; Pennsylvania Legislative Reapportionment Commission 2021 VTD availability diagnostic";
  }
  return "Pennsylvania Department of State results with attributed VEST election-specific geometry";
}

function readmeSourceUrl() {
  return spec.readmeSourceUrl ?? spec.resultSourceUrl;
}

function sourceArtifacts(paths, documents, licenseArtifact) {
  const results = artifactRecord(
    spec.resultPath,
    "Pennsylvania Department of State",
    spec.resultSourceUrl,
    "official statewide comma-delimited precinct election returns",
    "county-scoped precinct candidate rows",
    "Sole authority for every displayed vote value; all USP candidate rows are retained.",
  );
  const readme = artifactRecord(
    spec.readmePath,
    "Pennsylvania Department of State",
    readmeSourceUrl(),
    "official precinct returns data dictionary",
    "field definitions and county code table",
    "Defines County Code, Precinct Code, VTD code, candidate fields, and the 67-county lookup.",
  );
  const archiveDetails = {
    archiveMembers: documents.geometryModel.archive.members,
    sourceCrs: documents.geometryModel.archive.sourceCrs,
  };

  if (year === 2012) {
    return [
      results,
      readme,
      artifactRecord(
        spec.geometryPath,
        "U.S. Census Bureau",
        spec.geometrySourceUrl,
        "TIGER/Line 2012 ZIP containing 2010 Census VTD polygons",
        "statistical VTD availability diagnostic",
        "The 9,256 features do not establish the precinct boundaries in effect for Pennsylvania's November 6, 2012 election.",
        archiveDetails,
      ),
    ];
  }
  if (year === 2016 || year === 2020) {
    const shortYear = String(year).slice(2);
    const documentationPath = spec.base + "/raw/vest/documentation.txt";
    const validationPath = spec.base
      + "/raw/review/pa_vest_" + shortYear + "_validation_report.pdf";
    return [
      results,
      readme,
      artifactRecord(
        spec.geometryPath,
        "Voting and Election Science Team (VEST), public PlanScore custody mirror",
        spec.geometrySourceUrl,
        "version-pinned statewide VEST Shapefile ZIP",
        "election-specific precinct reconstruction",
        "Election-value attributes are used only for exact identity diagnostics, then stripped. Pennsylvania DOS remains the sole displayed vote authority.",
        archiveDetails,
      ),
      artifactRecord(
        documentationPath,
        "Voting and Election Science Team (VEST)",
        DOWNLOADS[documentationPath],
        "VEST nationwide precinct documentation text",
        "source and methodology documentation",
        "The Pennsylvania section documents the result and boundary sources used by VEST.",
      ),
      artifactRecord(
        validationPath,
        "Redistricting Data Hub",
        DOWNLOADS[validationPath],
        "VEST Pennsylvania validation report PDF",
        "independent review evidence",
        "The review could not fully reproduce the joins and validation; that limitation is preserved and motivates the exact-vector-only acceptance rule.",
      ),
      licenseArtifact,
    ];
  }
  const transcriptPath = spec.base
    + "/raw/pa-lrc/2021-lrc-data-certification-transcript.pdf";
  return [
    results,
    readme,
    artifactRecord(
      spec.geometryPath,
      "Pennsylvania Legislative Reapportionment Commission",
      spec.geometrySourceUrl,
      "deterministic exact-member subset of the official statewide geography ZIP",
      "2021 corrected voting-district availability diagnostic",
      "Contains only the seven WP_VotingDistricts members from the pinned 338,792,424-byte official archive. It is not treated as November 5, 2024 precinct geometry.",
      {
        ...archiveDetails,
        derivedFromUrls: [PENNSYLVANIA_LRC_UPSTREAM.url],
      },
    ),
    artifactRecord(
      transcriptPath,
      "Pennsylvania Legislative Reapportionment Commission",
      DOWNLOADS[transcriptPath],
      "official data-certification transcript PDF",
      "boundary vintage and correction methodology",
      "Documents changes through December 31, 2020, including boundary adjustments, split blocks, and name/code corrections.",
    ),
  ];
}

function sourceLicenseOrTerms() {
  if (year === 2012) {
    return "Official Pennsylvania public election records and U.S. Census Bureau statistical geography; no 2012 geometry delivery is authorized.";
  }
  if (year === 2024) {
    return "Official Pennsylvania public records retained for diagnostic review; no 2024 precinct geometry delivery is authorized.";
  }
  return "VEST database geometry is retained under CC BY 4.0 with version and custody evidence; Pennsylvania DOS remains the sole displayed vote authority.";
}

function manifestDocument(documents, artifacts, paths) {
  const safe = spec.rowLevelSafe;
  const excludedUnits = documents.results.excludedUnitCount;
  const excludedVotes = documents.results.excludedTotals.total;
  const warnings = [
    "Every displayed vote value comes only from the retained Pennsylvania Department of State precinct result export.",
    excludedUnits + " official source units totaling "
      + excludedVotes.toLocaleString("en-US")
      + " presidential candidate votes lack a reviewed polygon relationship and are never allocated.",
  ];
  if (safe) {
    warnings.push(
      "The retained Redistricting Data Hub report could not fully reproduce VEST's joins and validation; CivicResultMaps accepts only exact county-qualified VTD and complete-candidate-vector matches.",
    );
  } else if (year === 2012) {
    warnings.push(
      "The Census 2010 VTD layer is a statistical availability diagnostic, not the November 6, 2012 election precinct edition.",
    );
  } else {
    warnings.push(
      "The corrected 2021 LRC VTD layer is neither backcast nor forward-cast to November 5, 2024 precinct boundaries.",
    );
  }
  const resultUnits = safe
    ? documents.results.rows.length
    : documents.official.sourceUnitCount;
  const matchedResultUnits = documents.results.rows.length;
  const pendingReview = safe ? 0 : resultUnits;
  const boundaryVintage = year === 2012
    ? "2010 Census VTD statistical geography retained only as an availability diagnostic"
    : year === 2024
      ? "2021 LRC corrected VTD geography reflecting updates through December 31, 2020; retained only as an availability diagnostic"
      : "VEST " + year
        + " election-specific Pennsylvania precinct reconstruction with exact-vector acceptance review";

  return {
    schemaVersion: 1,
    id: spec.manifestId,
    state: "PA",
    election: {
      id: spec.electionId,
      date: spec.date,
      year,
      type: "general",
      office: "president",
    },
    geography: {
      level: "precinct",
      parentLevel: "county",
      boundaryVintage,
      vintageStatus: safe ? "election_date_confirmed" : "unknown",
      derivationMethod: safe
        ? "secondary_reconstruction"
        : "availability_diagnostic",
    },
    source: {
      authority: sourceAuthority(),
      url: spec.geometrySourceUrl,
      retrievedAt: PENNSYLVANIA_REVIEWED_AT,
      artifact: paths.evidence,
      sha256: artifacts.evidence.sha256,
      byteCount: artifacts.evidence.byteCount,
      format: "precinct-source-evidence+json",
      licenseOrTerms: sourceLicenseOrTerms(),
    },
    normalization: {
      script: "scripts/collect-pa-precinct-geometry.mjs",
      sourceCrs:
        documents.geometryModel.archive.sourceCrs
        || "source-defined Shapefile CRS normalized by shpjs",
      servedCrs: "EPSG:4326",
      artifact: paths.geometry,
      sha256: artifacts.geometry.sha256,
      byteCount: artifacts.geometry.byteCount,
      featureCount: documents.geometryModel.features.length,
      sourceFeatureIdFields: ["CRM_FEATURE_ID"],
      parentIdFields: ["CRM_PARENT_GEOID"],
    },
    crosswalk: {
      status: safe ? "reviewed" : "blocked",
      resultSourceId: spec.resultSourceId,
      artifact: paths.crosswalk,
      sha256: artifacts.crosswalk.sha256,
      byteCount: artifacts.crosswalk.byteCount,
      resultUnits,
      colorableResultUnits: resultUnits,
      matchedResultUnits,
      unmatchedResultUnits: safe ? 0 : resultUnits,
      nonGeographicResultUnits: 0,
      sourceAliasResultUnits: 0,
      relationships: {
        oneToOne: matchedResultUnits,
        oneToMany: 0,
        manyToOne: 0,
        unmatched: 0,
        nonGeographic: 0,
        sourceAlias: 0,
        pendingReview,
      },
      reviewedRelationshipRecords: matchedResultUnits,
      reviewedNoDataFeatures:
        documents.geometryModel.noDataFeatureIds.length,
      methods: ["official_crosswalk"],
    },
    validation: {
      status: "blocked",
      geometryValid: safe,
      rowLevelRenderingSafe: safe,
      parentTotalsReconciled: safe,
      resultTotalsReconciled:
        documents.crosswalk.reconciliation.sourceTotalsReconciled,
      errors: safe
        ? [
          "Immutable parent-scoped delivery and the guarded production release have not been completed.",
        ]
        : [
          "Complete election-effective Pennsylvania precinct geometry and a reviewed result crosswalk are unavailable for "
            + year + ".",
        ],
      warnings,
    },
    delivery: null,
    caveats: [
      "No vote is estimated, spatially allocated, or copied from a geometry source.",
      ...warnings,
      safe
        ? "Immutable delivery and guarded production activation remain separate decisions."
        : "The retained diagnostic layer is not public precinct delivery.",
    ],
  };
}

await acquire();
if (year === 2016 || year === 2020) {
  restoreReviewedCrlfArtifact(
    spec.base + "/raw/vest/documentation.txt",
  );
}
verifyPennsylvaniaRawSources(root, year);

const paths = pathsForYear();
let licenseArtifact = null;
if (year === 2016 || year === 2020) {
  const expectedLicense = jsonBytes(licenseEvidence(year));
  if (existsSync(absolute(paths.license))) {
    const existing = readFileSync(absolute(paths.license));
    if (!existing.equals(expectedLicense)) {
      throw new Error(
        "Pennsylvania " + year
          + " VEST version/license evidence drifted before derived writes.",
      );
    }
  } else {
    write(paths.license, expectedLicense);
  }
  licenseArtifact = artifactRecord(
    paths.license,
    "Voting and Election Science Team publication and version-pinned custody evidence",
    "https://www.nature.com/articles/s41597-024-04024-2",
    "version and license evidence JSON",
    "source provenance and reuse terms",
    "Pins the reviewed VEST file checksum, PlanScore custody commit/blob, independent-review limitation, and CC BY 4.0 database terms evidence.",
  );
}

const documents = await buildPennsylvaniaCanonicalDocuments(root, spec);
const resultArtifact = writeGzipJson(paths.results, documents.results);
const geometryArtifact = spec.rowLevelSafe
  ? writeGzipJson(paths.geometry, documents.geometry)
  : writeJson(paths.geometry, documents.geometry);
const crosswalkArtifact = writeJson(paths.crosswalk, documents.crosswalk);
const rawArtifacts = sourceArtifacts(
  paths,
  documents,
  licenseArtifact,
);
const evidence = {
  schemaVersion: 1,
  id: "pa-" + year + "-precinct-geometry-source-evidence-v1",
  state: "PA",
  election: {
    id: spec.electionId,
    date: spec.date,
    year,
    type: "general",
    office: "president",
  },
  retrievedAt: PENNSYLVANIA_REVIEWED_AT,
  authority: sourceAuthority(),
  artifacts: rawArtifacts,
  ...(year === 2024
    ? {
      upstreamArtifacts: [{
        url: PENNSYLVANIA_LRC_UPSTREAM.url,
        byteCount: PENNSYLVANIA_LRC_UPSTREAM.byteCount,
        sha256: PENNSYLVANIA_LRC_UPSTREAM.sha256,
        format: "official statewide multi-layer geography ZIP",
        retention: "external_due_to_repository_limit",
        retentionReason:
          "The 338,792,424-byte upstream archive exceeds the repository's reviewed raw-artifact budget; its exact seven-member VTD subset is retained.",
        retrievalScript: "scripts/collect-pa-precinct-geometry.mjs",
        derivedArtifactPaths: [spec.geometryPath],
      }],
    }
    : {}),
  resultUniverse: {
    sourceUnits: documents.official.sourceUnitCount,
    presidentialSourceRows: documents.official.presidentSourceRows,
    colorableUnits: documents.results.colorableUnitCount,
    mappedSourceComponents: documents.results.mappedSourceComponentCount,
    excludedUnits: documents.results.excludedUnitCount,
    zeroVoteSourceUnits: documents.official.zeroVoteUnitCount,
    mappedZeroVoteSourceComponents:
      documents.results.mappedZeroVoteSourceComponentCount,
    mappedZeroVoteAggregateRows: documents.results.mappedZeroVoteUnitCount,
    totals: documents.results.totals,
    mappedTotals: documents.results.mappedTotals,
    excludedTotals: documents.results.excludedTotals,
  },
  geometryReview: {
    rawFeatures: documents.geometryModel.rawFeatureCount,
    normalizedFeatures: documents.geometryModel.features.length,
    reviewedRelationships: documents.geometryModel.mappedRows.length,
    reviewedNoDataFeatures: documents.geometryModel.noDataFeatureIds.length,
    methods: documents.geometryModel.methods,
    candidateKeyDiagnostics: documents.geometryModel.diagnostics,
  },
  policies: [
    "Pennsylvania Department of State values are the sole displayed election results.",
    "Geometry-source election-value fields are stripped and never copied to normalized geometry or public result rows.",
    "Only complete official source-unit sums may be accepted, and only when county-qualified VTD identity and the complete presidential candidate vector agree exactly with one unique polygon.",
    "Unmatched official result units remain exclusions and are never forced onto polygons.",
  ],
};
const evidenceArtifact = writeJson(paths.evidence, evidence);
const report = {
  schemaVersion: 1,
  state: "PA",
  electionId: spec.electionId,
  status: spec.rowLevelSafe ? "reviewed_partial_candidate" : "blocked",
  resultArtifact,
  geometryArtifact,
  crosswalkArtifact,
  evidenceArtifact,
  resultUniverse: evidence.resultUniverse,
  geometryReview: evidence.geometryReview,
  sourceTotalsReconciled:
    documents.crosswalk.reconciliation.sourceTotalsReconciled,
  parentScopeCount: documents.crosswalk.reconciliation.scopes
    .filter((scope) => scope.scopeType === "parent").length,
  publicDeliveryAuthorized: false,
};
const reportArtifact = writeJson(paths.report, report);
const manifest = manifestDocument(
  documents,
  {
    results: resultArtifact,
    geometry: geometryArtifact,
    crosswalk: crosswalkArtifact,
    evidence: evidenceArtifact,
  },
  paths,
);
const manifestArtifact = writeJson(paths.manifest, manifest);

console.log(JSON.stringify({
  status: "passed",
  year,
  manifestArtifact,
  reportArtifact,
  resultUniverse: evidence.resultUniverse,
  geometryReview: evidence.geometryReview,
  publicDeliveryAuthorized: false,
}, null, 2));
