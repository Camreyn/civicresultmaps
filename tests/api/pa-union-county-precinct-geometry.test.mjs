import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "../../scripts/lib/precinct-geometry-validation.mjs";

const REVIEWED_AT = "2026-08-18T00:00:00.000Z";
const SCRIPT = "scripts/collect-pa-union-county-precinct-geometry.mjs";
const PARENT_GEOID = "42119";
const YEARS = Object.freeze([
  Object.freeze({
    year: 2020,
    electionId: "2020-11-03-general",
    officialResultPath: "data/pa-2020-general-election-returns-precinct.txt",
    officialReadmePath: "data/pa-2020-general-election-returns-readme.txt",
    rawFilename: "UnionCounty_VotingPrecincts202010.zip",
    rawBytes: 193_925,
    rawSha256:
      "4dfac59077195d7eefdf29dc137d820caac14888f3290a242553efc8637df36b",
    vintageStatus: "election_date_confirmed",
    featureMetadataDate: "2020-09-24",
    electionDateApplicabilityEstablished: true,
    totals: Object.freeze({
      democratic: 7_475,
      republican: 12_356,
      other: 284,
      total: 20_115,
    }),
    currentMappedUnits: 25,
    currentMappedVotes: 19_077,
    additionalUnits: 2,
    additionalVotes: 1_038,
    remainingStatewideVotes: 6_895_929,
    candidateRows: 81,
    canonicalManifestBytes: 4_263,
    canonicalManifestSha256:
      "9c089d28435d7c5b2343551e12185ee11c7ac07ec12195f94d60cea4734a2726",
  }),
  Object.freeze({
    year: 2024,
    electionId: "2024-11-05-general",
    officialResultPath: "data/pa-2024-general-election-returns-precinct.txt",
    officialReadmePath: "data/pa-2024-general-election-returns-readme.txt",
    rawFilename: "UnionCounty_VotingPrecincts202409.zip",
    rawBytes: 196_170,
    rawSha256:
      "54a9e631a5b8b6af4cfdc747081414e0a9a9d40d331966476d2e006718604c24",
    vintageStatus: "unknown",
    featureMetadataDate: "2021-10-12",
    electionDateApplicabilityEstablished: false,
    totals: Object.freeze({
      democratic: 8_015,
      republican: 12_969,
      other: 204,
      total: 21_188,
    }),
    currentMappedUnits: 0,
    currentMappedVotes: 0,
    additionalUnits: 27,
    additionalVotes: 21_188,
    remainingStatewideVotes: 7_010_549,
    candidateRows: 108,
    canonicalManifestBytes: 4_139,
    canonicalManifestSha256:
      "fc702f3309ba0000e759b76b00b1d91a7a25895ca13358cc3685dec68158bc6f",
  }),
]);

function base(spec) {
  return `data/precinct-geometry/PA/${spec.electionId}/official-county-followups/union-county`;
}

function paths(spec) {
  const packageBase = base(spec);
  return {
    raw: `${packageBase}/raw/pasda/${spec.rawFilename}`,
    evidence: `${packageBase}/source-evidence.json`,
    geometry:
      `${packageBase}/normalized/pa-${spec.year}-union-county-precincts-candidate.geojson.gz`,
    crosswalk:
      `${packageBase}/crosswalk/pa-${spec.year}-union-county-result-to-geometry-review.json`,
    report:
      `${packageBase}/reports/pa-${spec.year}-union-county-precinct-geometry-report.json`,
    manifest: `${packageBase}/manifest.json`,
    canonicalResults:
      `data/precinct-geometry/PA/${spec.electionId}/normalized/pa-${spec.year}-president-results.json.gz`,
    canonicalManifest:
      `data/precinct-geometry/PA/${spec.electionId}/manifest.json`,
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJson(relativePath, root = process.cwd()) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function parseGzipJson(relativePath, root = process.cwd()) {
  return JSON.parse(
    gunzipSync(readFileSync(path.join(root, relativePath))).toString("utf8"),
  );
}

function derivedBytes(spec, root = process.cwd()) {
  const packagePaths = paths(spec);
  return Object.fromEntries(
    [
      packagePaths.evidence,
      packagePaths.geometry,
      packagePaths.crosswalk,
      packagePaths.report,
      packagePaths.manifest,
    ].map((relativePath) => [
      relativePath,
      readFileSync(path.join(root, relativePath)),
    ]),
  );
}

function collectorArguments(root, ...extra) {
  return [
    "--max-old-space-size=4096",
    "--experimental-strip-types",
    SCRIPT,
    "--offline",
    `--root=${root}`,
    `--retrieved-at=${REVIEWED_AT}`,
    ...extra,
  ];
}

function assertVoteFree(value, context) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertVoteFree(entry, `${context}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.doesNotMatch(
      key,
      /^(?:VOTES?|TOTALVOTES?|CANDIDATE|PARTY|G\d{2}PRE)/i,
      `${context} contains election-value property ${key}`,
    );
    assertVoteFree(child, `${context}.${key}`);
  }
}

test("Pennsylvania Union County official archives and candidate manifests are pinned and fail closed", () => {
  for (const spec of YEARS) {
    const packagePaths = paths(spec);
    const raw = readFileSync(packagePaths.raw);
    assert.equal(raw.length, spec.rawBytes);
    assert.equal(sha256(raw), spec.rawSha256);

    const manifest = parseJson(packagePaths.manifest);
    const contract = inspectPrecinctGeometryManifest(manifest);
    assert.deepEqual(contract.errors, []);
    assert.ok(contract.publicEligibilityReasons.length > 0);
    assert.equal(manifest.id, `pa-${spec.year}-union-county-official-precinct-geometry-candidate-v1`);
    assert.equal(manifest.state, "PA");
    assert.equal(manifest.election.id, spec.electionId);
    assert.equal(manifest.geography.vintageStatus, spec.vintageStatus);
    assert.equal(manifest.geography.derivationMethod, "official_export");
    assert.equal(manifest.normalization.featureCount, 27);
    assert.equal(manifest.crosswalk.status, "reviewed");
    assert.equal(manifest.crosswalk.resultUnits, 27);
    assert.equal(manifest.crosswalk.matchedResultUnits, 27);
    assert.equal(manifest.crosswalk.reviewedRelationshipRecords, 27);
    assert.equal(manifest.crosswalk.reviewedNoDataFeatures, 0);
    assert.deepEqual(manifest.crosswalk.methods, ["reviewed_name"]);
    assert.equal(manifest.validation.status, "blocked");
    assert.equal(manifest.validation.rowLevelRenderingSafe, false);
    assert.equal(manifest.delivery, null);

    const validation = validateManifestArtifacts(manifest);
    assert.deepEqual(validation.errors, []);
    assert.equal(validation.eligible, false);
    assert.equal(validation.geometry.features, 27);
    assert.equal(validation.geometry.uniqueFeatureKeys, 27);
    assert.deepEqual(validation.crosswalk, {
      resultUnits: 27,
      colorableResultUnits: 27,
      matchedResultUnits: 27,
      unmatchedResultUnits: 0,
      nonGeographicResultUnits: 0,
      sourceAliasResultUnits: 0,
      relationships: {
        oneToOne: 27,
        oneToMany: 0,
        manyToOne: 0,
        unmatched: 0,
        nonGeographic: 0,
        sourceAlias: 0,
        pendingReview: 0,
      },
    });
    assert.equal(validation.sourceEvidence.artifactCount, 3);
    assert.equal(validation.sourceEvidence.verifiedArtifactCount, 3);
  }
});

test("Pennsylvania Union County packages prove complete county-scoped reviewed name bijections without equating source IDs", () => {
  for (const spec of YEARS) {
    const packagePaths = paths(spec);
    const manifest = parseJson(packagePaths.manifest);
    const evidence = parseJson(packagePaths.evidence);
    const geometry = parseGzipJson(packagePaths.geometry);
    const crosswalk = parseJson(packagePaths.crosswalk);
    const report = parseJson(packagePaths.report);

    assert.equal(evidence.authority, "Union County, Pennsylvania, distributed by Pennsylvania Spatial Data Access (PASDA)");
    assert.equal(evidence.retrievedAt, REVIEWED_AT);
    assert.equal(evidence.boundaryContext.parentGeoid, PARENT_GEOID);
    assert.equal(evidence.boundaryContext.vintageStatus, spec.vintageStatus);
    assert.equal(
      evidence.boundaryContext.featureMetadataDate,
      spec.featureMetadataDate,
    );
    assert.equal(
      evidence.boundaryContext.electionDateApplicabilityEstablished,
      spec.electionDateApplicabilityEstablished,
    );
    assert.match(evidence.boundaryContext.licenseOrTerms, /no explicit open-data license/i);
    assert.equal(evidence.archiveInspection.archiveMembers.length, 9);
    assert.equal(evidence.archiveInspection.sourceFeatureCount, 27);
    assert.equal(evidence.archiveInspection.uniquePrecinctIdCount, 27);
    assert.equal(evidence.resultIdentity.sourceResultUnits, 27);
    assert.equal(evidence.resultIdentity.candidateRows, spec.candidateRows);
    assert.deepEqual(evidence.resultIdentity.officialCountyTotals, spec.totals);
    assert.equal(evidence.exactNameComparison.status, "reviewed_complete_county_bijection");
    assert.equal(evidence.exactNameComparison.matchedResultUnits, 27);
    assert.deepEqual(evidence.exactNameComparison.geometryOnly, []);
    assert.deepEqual(evidence.exactNameComparison.resultOnly, []);
    assert.equal(evidence.exactNameComparison.directIdMatches, 10);
    assert.equal(evidence.exactNameComparison.directIdEqualityUsed, false);
    assert.equal(evidence.exactNameComparison.rows.length, 27);
    assert.equal(
      new Set(evidence.exactNameComparison.rows.map((row) => row.normalizedName)).size,
      27,
    );
    assert.ok(
      evidence.exactNameComparison.rows.some((row) =>
        row.normalizedName === "UNION INDEPENDENT"
        && row.geometrySourceName === "Union Independant"
        && row.resultSourceDisplayName === "UNION INDEPENDENT"
      ),
    );

    assert.equal(geometry.type, "FeatureCollection");
    assert.equal(geometry.features.length, 27);
    assert.equal(geometry.metadata.parentGeoid, PARENT_GEOID);
    assert.equal(geometry.metadata.vintageStatus, spec.vintageStatus);
    assert.equal(
      geometry.metadata.featureMetadataDate,
      spec.featureMetadataDate,
    );
    assertVoteFree(geometry, `Pennsylvania ${spec.year} Union County geometry`);
    const geometryKeys = new Set(
      geometry.features.map((feature) =>
        `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`
      ),
    );
    assert.equal(geometryKeys.size, 27);

    assert.equal(crosswalk.rows.length, 27);
    assert.equal(crosswalk.reconciliation.status, "passed");
    assert.deepEqual(crosswalk.reconciliation.scopes[0].resultTotals, spec.totals);
    assert.deepEqual(crosswalk.reconciliation.scopes[0].mappedTotals, spec.totals);
    assert.ok(crosswalk.rows.every((row) => row.parentGeoid === PARENT_GEOID));
    assert.ok(crosswalk.rows.every((row) => row.relationships.length === 1));
    assert.ok(crosswalk.rows.every((row) => row.relationships[0].matchMethod === "reviewed_name"));
    assert.ok(crosswalk.rows.every((row) => row.relationships[0].reviewStatus === "reviewed"));
    assert.ok(crosswalk.rows.every((row) => geometryKeys.has(row.relationships[0].sourceFeatureId)));

    assert.equal(report.disposition, "reviewed_union_county_candidate_delivery_blocked");
    assert.deepEqual(report.officialCountyTotals, spec.totals);
    assert.equal(report.votesAssignedFromGeometry, 0);
    assert.equal(report.delivery, null);
    assert.equal(report.statewideScope.candidatePackageSourceUnits, 27);
    assert.equal(report.statewideScope.remainingSourceUnits, 9_160);
    assert.equal(report.statewideScope.candidatePackageVotes, spec.totals.total);
    assert.equal(report.statewideScope.remainingVotes, spec.remainingStatewideVotes);
    if (spec.year === 2024) {
      assert.match(
        manifest.validation.errors.join(" "),
        /do not independently establish.*effective on Election Day/i,
      );
      assert.match(
        report.caveats.join(" "),
        /SyncDate\/ModDate values remain 2021-10-12/i,
      );
    }
  }
});

test("Pennsylvania Union County reports quantify only the additive candidate delta from the immutable canonical package", () => {
  for (const spec of YEARS) {
    const packagePaths = paths(spec);
    const report = parseJson(packagePaths.report);
    const comparison = report.canonicalPackageComparison;
    assert.equal(comparison.mappedResultUnits, spec.currentMappedUnits);
    assert.equal(comparison.mappedTotals.total, spec.currentMappedVotes);
    assert.equal(comparison.candidateAdditionalResultUnits, spec.additionalUnits);
    assert.equal(comparison.candidateAdditionalTotals.total, spec.additionalVotes);
    assert.equal(
      comparison.mappedTotals.total + comparison.candidateAdditionalTotals.total,
      spec.totals.total,
    );
  }

  const report2020 = parseJson(paths(YEARS[0]).report);
  assert.deepEqual(
    report2020.canonicalPackageComparison.candidateAdditionalRows,
    [
      {
        sourceUnitId: "0000210",
        sourceDisplayName: "UNION",
        democratic: 342,
        republican: 622,
        other: 9,
        total: 973,
      },
      {
        sourceUnitId: "0000215",
        sourceDisplayName: "UNION INDEPENDENT",
        democratic: 17,
        republican: 46,
        other: 2,
        total: 65,
      },
    ],
  );
});

test("Pennsylvania Union County collection replays byte-identically under an alternate root", () => {
  const before = Object.fromEntries(
    YEARS.flatMap((spec) => Object.entries(derivedBytes(spec))),
  );
  const alternateRoot = mkdtempSync(
    path.join(tmpdir(), "crm-pa-union-county-"),
  );
  try {
    for (const spec of YEARS) {
      const packagePaths = paths(spec);
      for (const relativePath of [
        spec.officialResultPath,
        spec.officialReadmePath,
        packagePaths.raw,
        packagePaths.canonicalResults,
      ]) {
        const destination = path.join(alternateRoot, relativePath);
        mkdirSync(path.dirname(destination), { recursive: true });
        cpSync(relativePath, destination);
      }
    }
    execFileSync(process.execPath, collectorArguments(alternateRoot), {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    for (const spec of YEARS) {
      const after = derivedBytes(spec, alternateRoot);
      for (const [relativePath, bytes] of Object.entries(after)) {
        assert.deepEqual(
          bytes,
          before[relativePath],
          `${relativePath} must replay byte-identically`,
        );
      }
      const manifest = parseJson(paths(spec).manifest, alternateRoot);
      assert.deepEqual(
        validateManifestArtifacts(manifest, { root: alternateRoot }).errors,
        [],
      );
    }
  } finally {
    rmSync(alternateRoot, { recursive: true, force: true });
  }
});

test("Pennsylvania Union County collection rejects timestamp and raw-source drift before derived writes", () => {
  const spec = YEARS[0];
  const before = derivedBytes(spec);
  assert.throws(
    () => execFileSync(
      process.execPath,
      [
        "--experimental-strip-types",
        SCRIPT,
        "--offline",
        "--year=2020",
        "--retrieved-at=2026-08-19T00:00:00.000Z",
      ],
      { cwd: process.cwd(), stdio: "pipe" },
    ),
    /unreviewed timestamps are rejected before writes/,
  );
  assert.deepEqual(derivedBytes(spec), before);

  const alternateRoot = mkdtempSync(path.join(tmpdir(), "crm-pa-union-tamper-"));
  try {
    const packagePaths = paths(spec);
    for (const relativePath of [
      spec.officialResultPath,
      spec.officialReadmePath,
      packagePaths.raw,
      packagePaths.canonicalResults,
    ]) {
      const destination = path.join(alternateRoot, relativePath);
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(relativePath, destination);
    }
    const rawPath = path.join(alternateRoot, packagePaths.raw);
    const raw = readFileSync(rawPath);
    raw[0] ^= 0xff;
    writeFileSync(rawPath, raw);
    assert.throws(
      () => execFileSync(
        process.execPath,
        collectorArguments(alternateRoot, "--year=2020"),
        { cwd: process.cwd(), stdio: "pipe" },
      ),
      /bytes or SHA-256 drifted/,
    );
    assert.throws(() => readFileSync(path.join(alternateRoot, packagePaths.manifest)));
  } finally {
    rmSync(alternateRoot, { recursive: true, force: true });
  }
});

test("Pennsylvania Union County candidates do not mutate canonical manifests or the live registry", () => {
  for (const spec of YEARS) {
    const canonical = readFileSync(paths(spec).canonicalManifest);
    assert.equal(canonical.length, spec.canonicalManifestBytes);
    assert.equal(sha256(canonical), spec.canonicalManifestSha256);
  }
  const registry = parseJson("data/precinct-geometry-manifests.json");
  const pennsylvania = registry.manifests.filter((manifest) =>
    manifest.state === "PA"
  );
  assert.equal(pennsylvania.length, 2);
  assert.deepEqual(
    pennsylvania.map((manifest) => manifest.election.year).sort(),
    [2016, 2020],
  );
  assert.ok(pennsylvania.every((manifest) => manifest.validation.status === "reviewed"));
  assert.ok(
    pennsylvania.every((manifest) => !manifest.id.includes("union-county")),
  );
});

test("Pennsylvania shared inventories preserve published coverage and delivery-null Union follow-ups", () => {
  const config = parseJson("etl/state-configs/pa.json");
  assert.match(config.coverageInventory.status, /published_partial_2016_2020/);
  assert.match(config.coverageInventory.status, /reviewed_union_candidates/);
  assert.ok(
    config.coverageInventory.caveats.some((caveat) =>
      /public for 2016 and 2020/.test(caveat)
      && /Union County 27-precinct reviewed-name candidate/.test(caveat)
      && /delivery=null/.test(caveat)
      && /Election Day boundary effectiveness is unknown/.test(caveat)
    ),
  );

  const sourceInventory = parseJson("data/pa-precinct-gis-source-inventory.json");
  const sourceElection = (year) =>
    sourceInventory.elections.find((entry) => entry.year === year);
  assert.equal(sourceElection(2016).status, "published_reviewed_partial");
  assert.equal(sourceElection(2016).publicDelivery.publicRevision, 27);
  assert.equal(
    sourceElection(2020).status,
    "published_reviewed_partial_with_official_union_candidate",
  );
  assert.equal(sourceElection(2020).publicDelivery.publicRevision, 27);
  assert.equal(sourceElection(2020).officialCountyFollowup.normalizedFeatures, 27);
  assert.equal(sourceElection(2020).officialCountyFollowup.candidateAdditionalUnits, 2);
  assert.equal(sourceElection(2020).officialCountyFollowup.candidateAdditionalVotes, 1_038);
  assert.equal(
    sourceElection(2024).status,
    "blocked_statewide_with_reviewed_union_county_candidate",
  );
  assert.equal(sourceElection(2024).officialCountyFollowup.normalizedFeatures, 27);
  assert.equal(sourceElection(2024).officialCountyFollowup.vintageStatus, "unknown");
  assert.equal(
    sourceElection(2024).officialCountyFollowup.featureMetadataDate,
    "2021-10-12",
  );
  assert.equal(sourceElection(2024).officialCountyFollowup.delivery, null);

  const tiers = parseJson("data/source-acquisition-tiers.json");
  const paTier = tiers.states.find((entry) => entry.state === "PA");
  assert.ok(
    paTier.availableFields.includes(
      "published reviewed partial 2016 and 2020 precinct geometry/crosswalk packages with every geometry-source vote field stripped",
    ),
  );
  assert.ok(
    paTier.availableFields.includes(
      "reviewed delivery-null official Union County 2020 and 2024 candidate packages with 27 polygons and 27 result relationships each; the 2020 vintage is confirmed and the 2024 vintage is unknown",
    ),
  );
  assert.match(paTier.caveats, /2021-10-12 feature metadata/);
  assert.doesNotMatch(paTier.caveats, /No PA geometry manifest is public/i);

  const nativePackages = parseJson("data/native-import-source-packages.json");
  const paNative = nativePackages.states.find((entry) => entry.state === "PA");
  assert.equal(paNative.expected.officialCountyFollowupPackages, 2);
  assert.equal(paNative.expected.publicEligiblePrecinctGeometryManifests, 2);
  assert.equal(
    paNative.validationStatus.precinctGeometryMode,
    "published_partial_2016_2020_plus_delivery_null_union_2020_2024_candidates",
  );

  const coverage2016 = parseJson(
    "data/precinct-geometry-coverage-inventory-2016.json",
  ).states.find((entry) => entry.state === "PA");
  const coverage2020 = parseJson(
    "data/precinct-geometry-coverage-inventory-2020.json",
  ).states.find((entry) => entry.state === "PA");
  const coverage2024 = parseJson(
    "data/precinct-geometry-coverage-inventory.json",
  ).states.find((entry) => entry.state === "PA");
  assert.equal(coverage2016.geometry.publicEligibleManifestCount, 1);
  assert.equal(coverage2020.geometry.publicEligibleManifestCount, 1);
  assert.equal(coverage2020.geometry.candidateFollowup.featureCount, 27);
  assert.equal(
    coverage2020.geometry.candidateFollowup.vintageStatus,
    "election_date_confirmed",
  );
  assert.equal(coverage2020.geometry.candidateFollowup.delivery, null);
  assert.equal(coverage2024.disposition, "blocked");
  assert.equal(coverage2024.geometry.publicEligibleManifestCount, 0);
  assert.equal(coverage2024.geometry.featureCount, 0);
  assert.equal(coverage2024.geometry.candidateFollowup.featureCount, 27);
  assert.equal(coverage2024.geometry.candidateFollowup.vintageStatus, "unknown");
  assert.equal(coverage2024.geometry.candidateFollowup.delivery, null);
  assert.equal(coverage2024.crosswalk.matchedResultUnits, 0);
  assert.equal(coverage2024.crosswalk.candidateFollowup.matchedResultUnits, 27);
});
