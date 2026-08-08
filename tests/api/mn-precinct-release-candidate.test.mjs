import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildMinnesotaPrecinctReleaseCandidate,
  inspectReleaseArtifact,
  minnesotaReleaseCandidateOutputRoot,
  serializeMinnesotaReleaseDocument,
} from "../../scripts/lib/mn-precinct-release-candidate.mjs";
import {
  inspectPrecinctGeometryManifest,
} from "../../src/lib/precinct-geography.ts";

const MANIFEST_PATHS = [
  "data/precinct-geometry/MN/2012-11-06-general/manifest.json",
  "data/precinct-geometry/MN/2016-11-08-general/manifest.json",
  "data/precinct-geometry/MN/2020-11-03-general/manifest.json",
  "data/precinct-geometry/MN/2024-11-05-general/manifest.json",
];
const EXPECTED_DELIVERIES = new Map([
  [2012, { byteCount: 43_222_011, sha256: "f0f9727bd5b212c83d565bf343609d2bdd416a382be1975fd9fcaa525e737714" }],
  [2016, { byteCount: 26_793_881, sha256: "ce27114ad1971cca472f635f0b2292c60be0c3104c44f49c794c7cfc5e74d207" }],
  [2020, { byteCount: 25_998_261, sha256: "c06e1b9712c44c031262872faa70924dd9198928f0ae4274d2259787125e3e8c" }],
  [2024, { byteCount: 27_550_483, sha256: "df94482464f9cd7065b2e6cf624eb6d19ab5717bb477ac57e798dd23066f9f06" }],
]);

function canonicalPreimages() {
  return new Map(
    ["data/precinct-geometry-manifests.json", ...MANIFEST_PATHS]
      .map((relativePath) => [relativePath, readFileSync(relativePath)]),
  );
}

const before = canonicalPreimages();
const built = buildMinnesotaPrecinctReleaseCandidate();

test("Minnesota release candidate freezes four exact deliveries and remains production no-go", () => {
  const document = built.packageDocument;
  assert.equal(document.id, "mn-precinct-gis-four-election-v1");
  assert.equal(document.state, "MN");
  assert.equal(document.decision, "NO_GO_PRODUCTION");
  assert.equal(
    document.disposition,
    "prepared_awaiting_explicit_production_authorization",
  );
  assert.deepEqual(document.safety, {
    productionMutationPerformed: false,
    publicFileWritten: false,
    canonicalManifestChanged: false,
    canonicalRegistryChanged: false,
    publicEligibilityChanged: false,
    gitPublicationPerformed: false,
    explicitProductionAuthorizationRequired: true,
  });
  assert.deepEqual(document.totals, {
    elections: 4,
    countiesPerElection: 87,
    reportingUnits: 16_435,
    candidateResultRows: 49_305,
    zeroVoteUnits: 125,
    geometryFeatures: 16_435,
    reviewedExactCrosswalks: 16_435,
  });
  assert.deepEqual(document.years.map((year) => year.year), [2012, 2016, 2020, 2024]);

  for (const year of document.years) {
    const expected = EXPECTED_DELIVERIES.get(year.year);
    assert.ok(expected);
    assert.equal(year.candidateDelivery.byteCount, expected.byteCount);
    assert.equal(year.candidateDelivery.sha256, expected.sha256);
    assert.ok(year.proposedPublicDelivery.byteCount > 1_000);
    assert.ok(year.proposedPublicDelivery.byteCount < 100_000);
    assert.match(year.proposedPublicDelivery.sha256, /^[a-f0-9]{64}$/);
    assert.equal(
      year.proposedPublicDelivery.format,
      "parent_scoped_geojson",
    );
    assert.match(
      year.proposedPublicDelivery.url,
      new RegExp(
        "^/data/geography/mn/" + year.year
        + "-[^/]+/precinct/[^/]+-[a-f0-9]{12}/index\\.json$",
      ),
    );
    assert.equal(year.proposedPublicDelivery.parentCount, 87);
    assert.equal(
      year.proposedPublicDelivery.featureCount,
      year.certifiedResults.reportingUnits,
    );
    assert.equal(year.parentScopedDelivery.parentArtifacts.length, 87);
    assert.equal(year.parentScopedDelivery.publicationPerformed, false);
    assert.equal(year.parentScopedDelivery.electionValuesInDelivery, false);
    assert.equal(
      year.parentScopedDelivery.parentArtifacts.reduce(
        (sum, artifact) => sum + artifact.featureCount,
        0,
      ),
      year.certifiedResults.reportingUnits,
    );
    assert.equal(year.canonicalManifest.validationStatus, "blocked");
    assert.equal(year.canonicalManifest.rowLevelRenderingSafe, false);
    assert.equal(year.canonicalManifest.delivery, null);
    assert.equal(year.canonicalManifest.publicEligibilityReasons.length, 4);
    assert.equal(year.publicDryRun.declarationMatches, true);
    assert.equal(year.publicDryRun.publicEligible, true);
    assert.equal(year.publicDryRun.writeRequested, false);
    assert.equal(year.publicDryRun.writeDisposition, "dry_run");
    assert.equal(year.reviewedGeometry.electionValuesInDelivery, false);
    assert.match(year.reviewedGeometry.sourceTerms, /disclaimer|warrant/i);
  }

  const pending = document.goNoGoGates
    .filter((gate) => gate.status === "pending")
    .map((gate) => gate.id);
  assert.deepEqual(pending, [
    "clean_isolated_release_diff",
    "current_production_backup",
    "current_production_schema_and_row_preflight",
    "reviewed_production_transaction_path",
    "deployment_window_and_rollback_owner",
    "explicit_production_authorization",
  ]);
  assert.equal(document.databaseActivationContract.productionWriterImplemented, true);
  assert.equal(document.databaseActivationContract.productionWriterEnabled, false);
  assert.ok(document.goNoGoGates.some((gate) =>
    gate.id === "production_transaction_implementation"
    && gate.status === "passed"));
  assert.equal(document.databaseActivationContract.migration.path, "drizzle/0008_typical_thunderbolts.sql");
  assert.equal(document.databaseActivationContract.expectedPostLoad.invalidConstraints, 0);
  assert.equal(document.localValidation.database.name, "crm_clone_dev");
  assert.equal(document.localValidation.database.readOnlySession, true);
});

test("Minnesota local draft manifests pass the public contract without changing canonical files", () => {
  assert.equal(built.draftManifests.length, 4);
  for (const draft of built.draftManifests) {
    const inspection = inspectPrecinctGeometryManifest(draft.manifest);
    assert.deepEqual(inspection.errors, []);
    assert.deepEqual(inspection.publicEligibilityReasons, []);
    assert.equal(draft.manifest.validation.status, "reviewed");
    assert.equal(draft.manifest.validation.rowLevelRenderingSafe, true);
    assert.deepEqual(draft.manifest.validation.errors, []);
    assert.equal(
      draft.manifest.delivery.format,
      "parent_scoped_geojson",
    );
    assert.equal(draft.manifest.delivery.parentCount, 87);
    assert.equal(draft.manifest.source.licenseOrTerms.length > 100, true);
    assert.equal(
      draft.manifest.caveats.some((caveat) => /delivery remains null|delivery remains blocked/i.test(caveat)),
      false,
    );
    assert.ok(draft.path.startsWith("draft-manifests/"));
  }

  const after = canonicalPreimages();
  for (const [relativePath, bytes] of before) {
    assert.equal(after.get(relativePath).equals(bytes), true, relativePath);
  }
});

test("Minnesota release package carries four indexes and 348 county assets", () => {
  assert.equal(built.deliveryAssets.length, 352);
  assert.equal(
    built.deliveryAssets.filter((artifact) => artifact.path.endsWith("/index.json")).length,
    4,
  );
  assert.equal(
    built.deliveryAssets.filter((artifact) => artifact.path.includes("/parents/")).length,
    348,
  );
  assert.equal(
    built.deliveryAssets.every((artifact) => artifact.bytes.length > 0),
    true,
  );
});

test("Minnesota release package serialization and dependency inventory are hash reviewable", () => {
  assert.equal(
    built.packageBytes.equals(
      serializeMinnesotaReleaseDocument(built.packageDocument),
    ),
    true,
  );
  assert.ok(built.packageBytes.length > 20_000);
  assert.match(
    createHash("sha256").update(built.packageBytes).digest("hex"),
    /^[a-f0-9]{64}$/,
  );
  const packageSha256 = createHash("sha256")
    .update(built.packageBytes)
    .digest("hex");
  assert.match(
    minnesotaReleaseCandidateOutputRoot(packageSha256),
    /^\.etl\/precinct-release-candidates\/MN\/mn-precinct-gis-four-election-v1-[a-f0-9]{12}$/,
  );

  const inventory = built.packageDocument.scopedFileInventory;
  assert.ok(inventory.releaseDependencies.length > 35);
  assert.equal(
    inventory.releaseDependencies.some((item) => item.path === "src/lib/api.ts"),
    true,
  );
  assert.ok(inventory.sourceAndDataArtifacts.length > 20);
  assert.ok(inventory.sharedReviewFiles.length >= 8);
  for (const group of [
    inventory.releaseDependencies,
    inventory.sourceAndDataArtifacts,
    inventory.sharedReviewFiles,
  ]) {
    assert.equal(new Set(group.map((item) => item.path)).size, group.length);
    assert.equal(group.every((item) => item.byteCount > 0), true);
    assert.equal(group.every((item) => /^[a-f0-9]{64}$/.test(item.sha256)), true);
  }
  assert.ok(inventory.patchIsolationWarnings.length >= 4);
});

test("Minnesota release artifact inspection rejects hash or byte tampering", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-release-"));
  try {
    mkdirSync(path.join(root, "data"), { recursive: true });
    const relativePath = "data/release-fixture.bin";
    const bytes = Buffer.from("reviewed release fixture");
    writeFileSync(path.join(root, ...relativePath.split("/")), bytes);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const inspected = inspectReleaseArtifact(root, relativePath, {
      allowedRoots: ["data/"],
      byteCount: bytes.length,
      sha256: digest,
    });
    assert.equal(inspected.byteCount, bytes.length);
    assert.equal(inspected.sha256, digest);
    writeFileSync(path.join(root, ...relativePath.split("/")), "changed");
    assert.throws(
      () => inspectReleaseArtifact(root, relativePath, {
        allowedRoots: ["data/"],
        byteCount: bytes.length,
        sha256: digest,
      }),
      /byte count drifted|SHA-256 drifted/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Minnesota release CLI stays local and exposes no production apply option", () => {
  const cli = readFileSync(
    "scripts/prepare-mn-precinct-release-candidate.mjs",
    "utf8",
  );
  assert.match(cli, /MINNESOTA_RELEASE_CANDIDATE_ROOT/);
  assert.match(cli, /productionMutationPerformed: false/);
  assert.match(cli, /publicFileWritten: false/);
  assert.match(cli, /canonicalManifestChanged: false/);
  assert.doesNotMatch(cli, /--apply|DATABASE_URL|runNeonTransaction|runPostgresTransaction/);
});
