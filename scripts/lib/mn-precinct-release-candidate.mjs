import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  buildPrecinctDeliveryArtifact,
} from "../build-precinct-delivery-geometry.mjs";
import {
  buildMinnesotaPrecinctGisPlan,
} from "./mn-precinct-gis-plan.mjs";
import {
  buildParentScopedPrecinctDeliveryPackage,
} from "./precinct-parent-delivery-builder.mjs";
import {
  inspectPrecinctGeometryManifest,
} from "../../src/lib/precinct-geography.ts";

export const MINNESOTA_RELEASE_CANDIDATE_ID =
  "mn-precinct-gis-four-election-v1";
export const MINNESOTA_RELEASE_CANDIDATE_ROOT = path.posix.join(
  ".etl",
  "precinct-release-candidates",
  "MN",
);

export function minnesotaReleaseCandidateOutputRoot(packageSha256) {
  if (!/^[a-f0-9]{64}$/.test(packageSha256)) {
    throw new Error("Minnesota release package hash must be SHA-256");
  }
  return path.posix.join(
    MINNESOTA_RELEASE_CANDIDATE_ROOT,
    MINNESOTA_RELEASE_CANDIDATE_ID + "-" + packageSha256.slice(0, 12),
  );
}

const DEFAULT_VALIDATION_REPORT =
  ".etl/local-db/mn-precinct-gis-validation.json";

const RELEASE_DEPENDENCY_PATHS = Object.freeze([
  "package.json",
  "package-lock.json",
  "drizzle/0008_typical_thunderbolts.sql",
  "drizzle/meta/_journal.json",
  "drizzle/meta/0008_snapshot.json",
  "scripts/apply-mn-precinct-release.mjs",
  "scripts/backup-mn-precinct-production.ps1",
  "scripts/build-precinct-delivery-geometry.mjs",
  "scripts/clone-production-db.ps1",
  "scripts/collect-mn-2012-precinct-geometry-reviewed.mjs",
  "scripts/collect-mn-2016-precinct-geometry-diagnostic.mjs",
  "scripts/collect-mn-2020-precinct-geometry-reviewed.mjs",
  "scripts/collect-mn-2024-precinct-geometry.mjs",
  "scripts/lib/mn-precinct-gis-db.mjs",
  "scripts/lib/mn-precinct-gis-plan.mjs",
  "scripts/lib/mn-precinct-production-preflight.mjs",
  "scripts/lib/mn-precinct-production-release.mjs",
  "scripts/lib/mn-precinct-blob-publication.mjs",
  "scripts/lib/mn-precinct-public-activation.mjs",
  "scripts/lib/mn-precinct-release-candidate.mjs",
  "scripts/lib/mn-precinct-release-overlay.mjs",
  "scripts/lib/mn-precinct-release-review.mjs",
  "scripts/lib/precinct-delivery-builder.mjs",
  "scripts/lib/precinct-parent-delivery-builder.mjs",
  "scripts/lib/precinct-geometry-validation.mjs",
  "scripts/prepare-mn-precinct-release-candidate.mjs",
  "scripts/prepare-mn-precinct-release-overlay.mjs",
  "scripts/prepare-mn-precinct-public-activation.mjs",
  "scripts/publish-mn-precinct-geography-status.mjs",
  "scripts/publish-mn-precinct-delivery-assets.mjs",
  "scripts/promote-native-staging-local.mjs",
  "scripts/review-mn-precinct-release-overlay.mjs",
  "scripts/report-mn-precinct-production-preflight.mjs",
  "scripts/run-mn-precinct-geometry-tests.mjs",
  "scripts/setup-mn-precinct-gis-local.mjs",
  "scripts/validate-mn-precinct-gis-local.mjs",
  "scripts/verify-mn-precinct-rehearsal.mjs",
  "src/app/api/geography-manifests/route.ts",
  "src/app/api/precinct-geography/route.ts",
  "src/app/api/results/route.ts",
  "src/app/globals.css",
  "src/app/precinct-detail-map.tsx",
  "src/app/privacy/page.tsx",
  "src/app/results-explorer.tsx",
  "src/app/workspace-guided-links.tsx",
  "src/app/workspace-tabs.tsx",
  "src/db/database-driver.ts",
  "src/db/native-import.ts",
  "src/db/neon-transaction.ts",
  "src/db/read-sql.ts",
  "src/db/schema.ts",
  "src/lib/api.ts",
  "src/lib/api-version.ts",
  "src/lib/data-access.ts",
  "src/lib/mn-precinct-rehearsal-server.ts",
  "src/lib/openstreetmap-basemap.ts",
  "src/lib/precinct-crosswalk.ts",
  "src/lib/precinct-delivery-server.ts",
  "src/lib/precinct-geography.ts",
  "src/lib/precinct-result-publication.ts",
  "src/lib/precinct-map-delivery.ts",
  "src/lib/precinct-source-package.ts",
  "src/lib/result-row-summary.ts",
  "src/lib/state-year-results.ts",
  "tests/api/api-contract.test.mjs",
  "tests/api/mn-2012-precinct-geometry.test.mjs",
  "tests/api/mn-2016-precinct-geometry.test.mjs",
  "tests/api/mn-2020-precinct-geometry.test.mjs",
  "tests/api/mn-precinct-geometry.test.mjs",
  "tests/api/mn-precinct-delivery-candidates.test.mjs",
  "tests/api/mn-precinct-gis-local-db.test.mjs",
  "tests/api/mn-precinct-gis-local-setup.test.mjs",
  "tests/api/mn-precinct-local-rehearsal.test.mjs",
  "tests/api/mn-precinct-production-release.test.mjs",
  "tests/api/mn-precinct-blob-publication.test.mjs",
  "tests/api/mn-precinct-public-activation.test.mjs",
  "tests/api/mn-precinct-result-publication-gate.test.mjs",
  "tests/api/mn-precinct-release-candidate.test.mjs",
  "tests/api/mn-precinct-release-overlay.test.mjs",
  "tests/api/mn-precinct-release-review.test.mjs",
  "tests/api/mn-zero-vote-precinct-display.test.mjs",
  "tests/api/precinct-openstreetmap-basemap.test.mjs",
  "tests/api/precinct-parent-delivery-builder.test.mjs",
  "tests/api/precinct-delivery-server.test.mjs",
  "tests/api/precinct-geography-schema.test.mjs",
  "tests/api/precinct-map-delivery.test.mjs",
  "tests/api/precinct-map-ui.test.mjs",
  "tests/api/precinct-reporting-unit-import.test.mjs",
  "tests/api/precinct-source-package-contract.test.mjs",
  "tests/e2e/mn-precinct-rehearsal.spec.ts",
  "docs/developer/local-database-clone.md",
  "docs/developer/mn-precinct-release-runbook.md",
]);

const RELEASE_REPORT_PATHS = Object.freeze([
  "data/precinct-geometry/MN/2012-11-06-general/reports/mn-2012-11-06-precinct-geometry-report.json",
  "data/precinct-geometry/MN/2012-11-06-general/reports/mn-2012-11-06-precinct-geometry-reviewed-report.json",
  "data/precinct-geometry/MN/2016-11-08-general/reports/mn-2016-11-08-precinct-geometry-report.json",
  "data/precinct-geometry/MN/2020-11-03-general/reports/mn-2020-11-03-precinct-geometry-report.json",
  "data/precinct-geometry/MN/2024-11-05-general/reports/mn-2024-11-05-precinct-geometry-report.json",
]);

const SHARED_REVIEW_PATHS = Object.freeze([
  "data/native-import-source-packages.json",
  "data/precinct-geometry-coverage-inventory-2012.json",
  "data/precinct-geometry-coverage-inventory-2016.json",
  "data/precinct-geometry-coverage-inventory-2020.json",
  "data/precinct-geometry-coverage-inventory.json",
  "data/precinct-geometry-manifests.json",
  "data/source-acquisition-tiers.json",
  "docs/developer/precinct-gis-implementation.md",
  "docs/native-import-source-packages.md",
]);

const PATCH_ISOLATION_WARNINGS = Object.freeze([
  "package.json contains precinct scripts plus other workspace-wide changes; isolate only reviewed release dependencies.",
  "src/app/results-explorer.tsx and src/app/globals.css contain precinct-map work alongside other UI changes; review their patch hunks, not just filenames.",
  "src/app/workspace-tabs.tsx and related supported-year files are shared product surfaces; retain only the changes required for 2012 and precinct rendering.",
  "src/db/native-import.ts, src/db/neon-transaction.ts, and src/db/schema.ts are shared database code; review the reporting-unit changes independently from unrelated work.",
  "The national manifest registry, coverage inventories, source inventories, and continuation ledger contain other states; preserve every unrelated row byte-for-byte.",
]);

const DRAFT_EDITORIAL = Object.freeze({
  2012: {
    warnings: [
      "All 4,102 VTDIDs are reviewed exact one-to-one relationships across 87 county parents and statewide.",
      "The 33 zero-presidential-vote VTDs remain geographic reporting units.",
      "LCC-GIS attribution and the complete disclaimer must accompany every delivered copy.",
    ],
    caveats: [
      "The certified Minnesota Secretary of State workbook is the sole authority for vote values; LCC election-result attributes are retained only for source reconciliation.",
      "Two source PCTNAME values differ from the certified workbook. They are display-only differences and do not affect VTDID, PCTCODE, county parent, or result assignment.",
      "LCC-GIS metadata contains historical spelling and field-description typos; those descriptions are not used for identity or vote assignment.",
      "The public delivery is presentation-only geometry joined by exact VTDID to certified result rows and contains no election values.",
    ],
  },
  2016: {
    warnings: [
      "The LCC preliminary election layer is retained only for geometry and exact identity review; none of its election values enter normalized geometry, delivery, or certified result rows.",
      "The 31 official zero-presidential-vote VTDIDs remain geographic one-to-one result units.",
      "LCC-GIS attribution and the complete disclaimer must accompany every delivered copy.",
    ],
    caveats: [
      "The certified and recount-inclusive Minnesota Secretary of State workbook is the sole authority for vote values. The LCC election snapshot is 6,408 votes below the certified total and is never used as a public vote source.",
      "All 4,120 public relationships use reviewed exact VTDID identity; PCTNAME and MCDNAME differences do not determine result assignment.",
      "The public delivery is presentation-only geometry and contains no election values.",
      "The retained SOS landing-page HTML is a byte-pinned response; later upstream HTML may be regenerated without changing the retained evidence.",
    ],
  },
  2020: {
    warnings: [
      "All 4,110 relationships use LCC geometry and identity only. Preliminary election values are excluded from normalized geometry, delivery, and public results.",
      "The 33 certified zero-vote VTDs remain geographic one-to-one units.",
      "LCC-GIS attribution and the complete disclaimer must accompany every delivered copy.",
    ],
    caveats: [
      "PCTNAME, MCDNAME, and COUNTYNAME display differences are nonbinding; exact VTDID and county/precinct-code construction govern every relationship.",
      "The preliminary LCC archive is not a vote source. The certified Minnesota Secretary of State workbook is the sole authority for vote values.",
      "The public delivery is presentation-only geometry joined by exact VTDID and contains no election values.",
    ],
  },
  2024: {
    warnings: [
      "All 4,103 official VTDID relationships are reviewed one-to-one and reconcile across all 87 counties and statewide.",
      "The 28 official zero-presidential-vote precincts remain geographic reporting units.",
      "LCC-GIS attribution and the complete disclaimer must accompany every delivered copy.",
    ],
    caveats: [
      "The certified Minnesota Secretary of State workbook is the sole authority for vote values; delivery geometry contains no election values.",
      "One zero-vote VTD has a County Commissioner District attribute difference. Exact precinct identity fields still agree and result assignment does not depend on that district attribute.",
      "Public precinct geometry and certified result rows must remain coordinated so every delivered feature resolves to its exact reporting unit.",
    ],
  },
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function semanticJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function serializeMinnesotaReleaseDocument(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

function absoluteInsideRoot(root, relativePath, allowedRoots) {
  if (
    typeof relativePath !== "string"
    || !relativePath
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || !allowedRoots.some((prefix) => relativePath.startsWith(prefix))
  ) {
    throw new Error("Unsafe Minnesota release artifact path: " + relativePath);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (!resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Minnesota release artifact escapes repository root: " + relativePath);
  }
  return resolved;
}

export function inspectReleaseArtifact(root, relativePath, options = {}) {
  const absolutePath = absoluteInsideRoot(
    root,
    relativePath,
    options.allowedRoots ?? ["data/", "docs/", "drizzle/", "package", "scripts/", "src/", "tests/", ".etl/"],
  );
  if (!existsSync(absolutePath)) {
    throw new Error("Minnesota release dependency is missing: " + relativePath);
  }
  const bytes = readFileSync(absolutePath);
  const digest = sha256(bytes);
  if (
    Number.isInteger(options.byteCount)
    && bytes.length !== options.byteCount
  ) {
    throw new Error("Minnesota release dependency byte count drifted: " + relativePath);
  }
  if (options.sha256 && digest !== options.sha256) {
    throw new Error("Minnesota release dependency SHA-256 drifted: " + relativePath);
  }
  return {
    path: relativePath,
    byteCount: bytes.length,
    sha256: digest,
    bytes,
  };
}

function artifactSummary(root, relativePath, options = {}) {
  const { bytes: _bytes, ...summary } = inspectReleaseArtifact(
    root,
    relativePath,
    options,
  );
  return summary;
}

function readJsonArtifact(root, relativePath, allowedRoots) {
  const artifact = inspectReleaseArtifact(root, relativePath, {
    allowedRoots,
  });
  return {
    artifact,
    value: JSON.parse(artifact.bytes.toString("utf8")),
  };
}

function collectExistingDataPaths(root, value, paths) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectExistingDataPaths(root, item, paths));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) =>
      collectExistingDataPaths(root, item, paths));
    return;
  }
  if (typeof value !== "string" || !value.startsWith("data/")) return;
  if (value.includes("\\") || value.split("/").includes("..")) return;
  const target = path.resolve(root, ...value.split("/"));
  if (existsSync(target) && statSync(target).isFile()) paths.add(value);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message);
}

function validateLocalDatabaseReport(report, plan) {
  assertEqual(report?.schemaVersion, 1, "Minnesota local validation schema drifted");
  assertEqual(
    report?.productionMutationPerformed,
    false,
    "Minnesota validation report does not prove production remained unchanged",
  );
  assertEqual(
    report?.publicDeliveryAuthorized,
    false,
    "Minnesota validation report unexpectedly authorizes public delivery",
  );
  assertEqual(report?.validation?.database?.environment, "local", "Minnesota validation was not local");
  assertEqual(report?.validation?.database?.host, "loopback", "Minnesota validation was not loopback-only");
  assertEqual(report?.validation?.database?.port, 54329, "Minnesota validation used the wrong port");
  assertEqual(report?.validation?.database?.name, "crm_clone_dev", "Minnesota validation used the wrong database");
  assertEqual(report?.validation?.database?.readOnlySession, true, "Minnesota validation session was not read-only");
  assertEqual(report?.validation?.invalidConstraints, 0, "Minnesota local database has invalid constraints");

  const databaseYears = new Map(
    (report?.validation?.years ?? []).map((row) => [Number(row.year), row]),
  );
  for (const year of plan.years) {
    const row = databaseYears.get(year.year);
    if (!row) throw new Error("Minnesota local validation is missing " + year.year);
    const expected = {
      reportingUnits: year.reportingUnits.length,
      resultRows: year.resultRows.length,
      sameYearResultRows: year.resultRows.length,
      totalVotes: year.totals.Total,
      zeroVoteUnits: year.zeroVoteUnits,
      geographyVersions: 1,
      features: year.geometry.features.length,
      safeBlockedGeographyVersions: 1,
      reviewedCrosswalks: year.geometry.crosswalks.length,
      exactFeatures: year.geometry.features.length,
      exactCrosswalks: year.geometry.crosswalks.length,
    };
    for (const [key, value] of Object.entries(expected)) {
      assertEqual(
        Number(row[key]),
        value,
        "Minnesota " + year.year + " local database " + key + " drifted",
      );
    }
  }
  assertEqual(databaseYears.size, plan.years.length, "Minnesota local validation year set drifted");
  if (!Number.isInteger(report?.validation?.revision)) {
    throw new Error("Minnesota local validation revision is missing");
  }
  if (Number.isNaN(Date.parse(report?.generatedAtUtc))) {
    throw new Error("Minnesota local validation timestamp is invalid");
  }
  return {
    generatedAtUtc: report.generatedAtUtc,
    revision: report.validation.revision,
    invalidConstraints: report.validation.invalidConstraints,
    database: report.validation.database,
  };
}

function proposedPublicUrl(year, indexSha256) {
  return "/data/geography/mn/"
    + year.electionDate
    + "/precinct/"
    + year.manifest.id
    + "-"
    + indexSha256.slice(0, 12)
    + "/index.json";
}

function draftManifestForYear(year, delivery) {
  const editorial = DRAFT_EDITORIAL[year.year];
  if (!editorial) throw new Error("Missing Minnesota release editorial for " + year.year);
  const draft = JSON.parse(JSON.stringify(year.manifest));
  draft.validation = {
    ...draft.validation,
    status: "reviewed",
    rowLevelRenderingSafe: true,
    errors: [],
    warnings: [...editorial.warnings],
  };
  draft.delivery = {
    format: "parent_scoped_geojson",
    url: proposedPublicUrl(year, delivery.indexSha256),
    sha256: delivery.indexSha256,
    byteCount: delivery.indexByteCount,
    featureIdProperty: "geometryFeatureId",
    resultUnitProperty: "resultUnitCode",
    parentGeoidProperty: "parentGeoid",
    parentCount: delivery.parentCount,
    featureCount: delivery.featureCount,
  };
  draft.caveats = [...editorial.caveats];
  const inspection = inspectPrecinctGeometryManifest(draft);
  if (inspection.errors.length || inspection.publicEligibilityReasons.length) {
    throw new Error(
      "Minnesota " + year.year + " draft public manifest failed: "
      + inspection.errors.concat(inspection.publicEligibilityReasons).join("; "),
    );
  }
  return draft;
}

function buildYearRelease(root, year, registryManifest, dataPaths) {
  if (semanticJson(registryManifest) !== semanticJson(year.manifest)) {
    throw new Error("Minnesota " + year.year + " registry manifest differs from its canonical file");
  }
  if (
    year.manifest.validation.status !== "blocked"
    || year.manifest.validation.rowLevelRenderingSafe !== false
    || year.manifest.delivery !== null
  ) {
    throw new Error("Minnesota " + year.year + " canonical manifest is no longer fail-closed");
  }

  const candidateBuild = buildPrecinctDeliveryArtifact({
    root,
    manifest: year.manifest,
    candidate: true,
    write: false,
  });
  const candidateArtifact = artifactSummary(root, candidateBuild.output, {
    allowedRoots: [".etl/precinct-delivery-candidates/"],
    byteCount: candidateBuild.byteCount,
    sha256: candidateBuild.sha256,
  });
  const candidateCollection = readJsonArtifact(
    root,
    candidateBuild.output,
    [".etl/precinct-delivery-candidates/"],
  ).value;
  const parentPackage = buildParentScopedPrecinctDeliveryPackage(
    candidateCollection,
  );
  const draftManifest = draftManifestForYear(year, parentPackage);
  const publicDryRun = {
    output: draftManifest.delivery.url,
    declarationMatches:
      draftManifest.delivery.sha256 === parentPackage.indexSha256
      && draftManifest.delivery.byteCount === parentPackage.indexByteCount,
    publicEligible:
      inspectPrecinctGeometryManifest(draftManifest)
        .publicEligibilityReasons.length === 0,
    featureCount: parentPackage.featureCount,
    parentCount: parentPackage.parentCount,
    resultUnitCount: parentPackage.resultUnitCount,
    byteCount: parentPackage.indexByteCount,
    sha256: parentPackage.indexSha256,
    writeRequested: false,
    writeDisposition: "dry_run",
  };
  if (
    publicDryRun.declarationMatches !== true
    || publicDryRun.publicEligible !== true
    || publicDryRun.sha256 !== parentPackage.indexSha256
    || publicDryRun.byteCount !== parentPackage.indexByteCount
    || publicDryRun.featureCount !== year.reportingUnits.length
  ) {
    throw new Error("Minnesota " + year.year + " public delivery dry run drifted");
  }

  const draftBytes = serializeMinnesotaReleaseDocument(draftManifest);
  const draftPath = path.posix.join(
    "draft-manifests",
    draftManifest.id + ".json",
  );
  const deliveryAssetRoot = path.posix.join(
    "delivery-assets",
    draftManifest.id + "-" + parentPackage.indexSha256.slice(0, 12),
  );
  const deliveryFiles = [
    {
      path: path.posix.join(deliveryAssetRoot, "index.json"),
      bytes: parentPackage.indexBytes,
    },
    ...parentPackage.parentArtifacts.map((artifact) => ({
      path: path.posix.join(deliveryAssetRoot, artifact.path),
      bytes: artifact.bytes,
    })),
  ];

  for (const artifactPath of [
    year.manifestPath,
    year.manifest.source.artifact,
    year.manifest.normalization.artifact,
    year.manifest.crosswalk.artifact,
    year.resultSource.artifact,
  ]) {
    dataPaths.add(artifactPath);
  }
  const sourceDocument = readJsonArtifact(
    root,
    year.manifest.source.artifact,
    ["data/"],
  );
  collectExistingDataPaths(root, sourceDocument.value, dataPaths);

  return {
    year: year.year,
    electionId: year.electionId,
    manifestId: year.manifest.id,
    canonicalManifest: {
      path: year.manifestPath,
      sha256: year.manifestSha256,
      byteCount: year.manifestByteCount,
      validationStatus: year.manifest.validation.status,
      rowLevelRenderingSafe: year.manifest.validation.rowLevelRenderingSafe,
      delivery: year.manifest.delivery,
      publicEligibilityReasons:
        inspectPrecinctGeometryManifest(year.manifest).publicEligibilityReasons,
    },
    certifiedResults: {
      authority: year.resultSource.authority,
      sourceId: year.resultSource.id,
      sourceUrl: year.resultSource.url,
      artifact: artifactSummary(root, year.resultSource.artifact, {
        allowedRoots: ["data/"],
        byteCount: year.resultSource.byteCount,
        sha256: year.resultSource.sha256,
      }),
      reportingUnits: year.reportingUnits.length,
      resultRows: year.resultRows.length,
      zeroVoteUnits: year.zeroVoteUnits,
      totals: year.totals,
    },
    reviewedGeometry: {
      sourceAuthority: year.manifest.source.authority,
      sourceUrl: year.manifest.source.url,
      sourceTerms: year.manifest.source.licenseOrTerms,
      featureCount: year.geometry.features.length,
      parentCount: 87,
      reviewedExactCrosswalks: year.geometry.crosswalks.length,
      electionValuesInDelivery: false,
    },
    candidateDelivery: {
      ...candidateArtifact,
      featureCount: candidateBuild.featureCount,
      parentCount: candidateBuild.parentCount,
      resultUnitCount: candidateBuild.resultUnitCount,
    },
    parentScopedDelivery: {
      format: "parent_scoped_geojson",
      originEnvironmentVariable: "CRM_PRECINCT_GEOGRAPHY_ORIGIN",
      index: {
        packageRelativePath: path.posix.join(
          deliveryAssetRoot,
          "index.json",
        ),
        publicUrl: draftManifest.delivery.url,
        byteCount: parentPackage.indexByteCount,
        sha256: parentPackage.indexSha256,
      },
      parentCount: parentPackage.parentCount,
      featureCount: parentPackage.featureCount,
      resultUnitCount: parentPackage.resultUnitCount,
      parentArtifactByteCount: parentPackage.parentArtifactByteCount,
      parentArtifacts: parentPackage.parentArtifacts.map(
        ({ bytes: _bytes, path: artifactPath, ...artifact }) => ({
          ...artifact,
          packageRelativePath: path.posix.join(
            deliveryAssetRoot,
            artifactPath,
          ),
          publicUrl: path.posix.join(
            path.posix.dirname(draftManifest.delivery.url),
            artifactPath,
          ),
        }),
      ),
      electionValuesInDelivery: false,
      publicationPerformed: false,
    },
    proposedPublicDelivery: draftManifest.delivery,
    draftManifest: {
      path: draftPath,
      byteCount: draftBytes.length,
      sha256: sha256(draftBytes),
      canonicalMutationPerformed: false,
      reviewRequired: true,
    },
    publicDryRun: {
      output: publicDryRun.output,
      declarationMatches: publicDryRun.declarationMatches,
      publicEligible: publicDryRun.publicEligible,
      featureCount: publicDryRun.featureCount,
      parentCount: publicDryRun.parentCount,
      resultUnitCount: publicDryRun.resultUnitCount,
      byteCount: publicDryRun.byteCount,
      sha256: publicDryRun.sha256,
      writeRequested: publicDryRun.writeRequested,
      writeDisposition: publicDryRun.writeDisposition,
    },
    draftManifestValue: draftManifest,
    draftManifestBytes: draftBytes,
    deliveryFiles,
  };
}

function inventoryPaths(root, paths) {
  return [...new Set(paths)]
    .sort()
    .map((relativePath) => artifactSummary(root, relativePath));
}

function sumYears(years, key) {
  return years.reduce((sum, year) => sum + year.certifiedResults[key], 0);
}

export function buildMinnesotaPrecinctReleaseCandidate(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const validationReportPath = options.validationReportPath
    ?? DEFAULT_VALIDATION_REPORT;
  const plan = buildMinnesotaPrecinctGisPlan({ root });
  const registryArtifact = readJsonArtifact(
    root,
    "data/precinct-geometry-manifests.json",
    ["data/"],
  );
  const registryMinnesota = new Map(
    registryArtifact.value.manifests
      .filter((manifest) => manifest.state === "MN")
      .map((manifest) => [manifest.election.year, manifest]),
  );
  if (registryMinnesota.size !== plan.years.length) {
    throw new Error("Minnesota canonical registry year set drifted");
  }

  const validationArtifact = readJsonArtifact(
    root,
    validationReportPath,
    [".etl/"],
  );
  const localValidation = validateLocalDatabaseReport(
    validationArtifact.value,
    plan,
  );

  const dataPaths = new Set([
    ...SHARED_REVIEW_PATHS.filter((entry) => entry.startsWith("data/")),
    ...RELEASE_REPORT_PATHS,
  ]);
  const yearBuilds = plan.years.map((year) =>
    buildYearRelease(
      root,
      year,
      registryMinnesota.get(year.year),
      dataPaths,
    ));

  const years = yearBuilds.map(({
    draftManifestValue,
    draftManifestBytes,
    deliveryFiles: _deliveryFiles,
    ...year
  }) => year);
  const migration = artifactSummary(root, "drizzle/0008_typical_thunderbolts.sql");
  const releaseDependencies = inventoryPaths(root, RELEASE_DEPENDENCY_PATHS);
  const sharedReviewFiles = inventoryPaths(root, SHARED_REVIEW_PATHS);
  const dataArtifacts = inventoryPaths(root, dataPaths);
  const validationReport = {
    path: validationReportPath,
    byteCount: validationArtifact.artifact.bytes.length,
    sha256: validationArtifact.artifact.sha256,
    ...localValidation,
  };

  const packageDocument = {
    schemaVersion: 1,
    id: MINNESOTA_RELEASE_CANDIDATE_ID,
    state: "MN",
    stateName: "Minnesota",
    scope: "local-only production-release preparation for 2012, 2016, 2020, and 2024 presidential precinct GIS",
    preparedFromLocalValidationAt: localValidation.generatedAtUtc,
    disposition: "prepared_awaiting_explicit_production_authorization",
    decision: "NO_GO_PRODUCTION",
    safety: {
      productionMutationPerformed: false,
      publicFileWritten: false,
      canonicalManifestChanged: false,
      canonicalRegistryChanged: false,
      publicEligibilityChanged: false,
      gitPublicationPerformed: false,
      explicitProductionAuthorizationRequired: true,
    },
    totals: {
      elections: years.length,
      countiesPerElection: 87,
      reportingUnits: sumYears(years, "reportingUnits"),
      candidateResultRows: sumYears(years, "resultRows"),
      zeroVoteUnits: sumYears(years, "zeroVoteUnits"),
      geometryFeatures: years.reduce((sum, year) => sum + year.reviewedGeometry.featureCount, 0),
      reviewedExactCrosswalks: years.reduce((sum, year) => sum + year.reviewedGeometry.reviewedExactCrosswalks, 0),
    },
    years,
    localValidation: validationReport,
    databaseActivationContract: {
      migration,
      lastObservedProductionSchema: {
        observedAt: "2026-08-05",
        source: "docs/developer/local-database-clone.md",
        postgresVersion: "17.10",
        publicTables: 27,
        migration0008Present: false,
        currentReadOnlyPreflightRequired: true,
      },
      productionWriterImplemented: true,
      productionWriterEnabled: false,
      productionWriterReason:
        "The production transaction runner is implemented but remains unusable without a fresh read-only preflight, restoration-verified backup, named independent roles, an active deployment window, matching package/evidence hashes, and exact explicit authorization acknowledgements.",
      transactionRequirements: [
        "Use one reviewed transaction for all four Minnesota election result-unit, result, geography-version, feature, and crosswalk changes.",
        "Acquire a Minnesota-specific advisory lock and reject any schema, source hash, manifest preimage, count, total, or same-election relationship drift before mutation.",
        "Keep geography versions non-public until all 16,435 exact result/geometry joins and 125 zero-vote units validate.",
        "Never copy preliminary LCC vote fields into result rows, geometry properties, delivery properties, or crosswalk metadata.",
      ],
      expectedPostLoad: {
        reportingUnits: 16_435,
        candidateResultRows: 49_305,
        geographyVersions: 4,
        geometryFeatures: 16_435,
        reviewedExactCrosswalks: 16_435,
        zeroVoteUnits: 125,
        invalidConstraints: 0,
      },
    },
    deploymentSequence: [
      {
        order: 1,
        phase: "isolate_and_review",
        action: "Extract the hashed Minnesota dependency set into a clean review branch/worktree and review every shared-file patch hunk.",
        productionWrite: false,
      },
      {
        order: 2,
        phase: "backup_and_read_only_preflight",
        action: "Create and verify a current production backup; record current schema, Minnesota year/row sets, constraints, public revision, and live API baseline using read-only sessions.",
        productionWrite: false,
      },
      {
        order: 3,
        phase: "additive_schema",
        action: "After authorization, apply the pinned additive migration 0008 in a single migration transaction and validate every new table, column, index, foreign key, and check constraint.",
        productionWrite: true,
      },
      {
        order: 4,
        phase: "hidden_data_load",
        action: "Load all four certified result-unit/result sets and reviewed geometry/crosswalk sets in one transaction while canonical manifests remain blocked and public delivery remains absent.",
        productionWrite: true,
      },
      {
        order: 5,
        phase: "pre_cutover_validation",
        action: "Verify hashes, totals, 16,435 exact same-election joins, 125 zero-vote units, source documents, disclaimer retention, constraints, and preview API/UI behavior before public eligibility changes.",
        productionWrite: false,
      },
      {
        order: 6,
        phase: "application_cutover",
        action: "Upload the four immutable parent indexes and 348 county GeoJSON files, configure the pinned HTTPS delivery origin, verify a protected preview, and deploy the identical reviewed activation tree to production while both database gates remain blocked; publish the exact database status only after the production deployment is verified.",
        productionWrite: true,
      },
      {
        order: 7,
        phase: "post_cutover_verification",
        action: "Verify all four manifest, geometry, result, and workspace paths; check Hennepin and statewide joins, all zero-vote units, source links/terms, logs, cache behavior, and public revision.",
        productionWrite: false,
      },
    ],
    rollback: {
      automaticBeforeCommit: "Any schema or data-load failure must roll back its transaction and leave canonical manifests blocked.",
      application: "After the separately authorized database publication rollback blocks both precinct endpoints, restore the exact previously pinned gate-capable application deployment and verify its blocked static manifests.",
      database: "Execute the receipt-bound Minnesota publication-status rollback first while the activated gate-capable application remains live; use the verified pre-release backup only for a broader separately authorized recovery, and retain the additive schema unless an independent migration review authorizes its removal.",
      immutableFiles: "Do not overwrite or repurpose a released immutable URL. Unreferenced bytes may remain while the previous manifest deployment is restored.",
      stopConditions: [
        "Any candidate, source, manifest-preimage, migration, or draft-manifest hash differs from this package.",
        "Any tracked year, result row, reporting unit, feature, crosswalk, zero-vote count, or certified total differs from the expected contract.",
        "Any public geometry feature lacks one exact same-election result row identity or any source disclaimer is unavailable to the user.",
        "Any constraint is invalid, any API/UI request fails, or any production year/row set would be removed without an approved preservation decision.",
      ],
    },
    goNoGoGates: [
      { id: "pinned_sources_and_geometry", status: "passed", evidence: "Every retained source, canonical manifest, normalized geometry, and crosswalk is hash inventoried." },
      { id: "candidate_delivery_bytes", status: "passed", evidence: "The four reviewed statewide candidates deterministically produce four hash-pinned indexes and 348 county GeoJSON files covering all 16,435 features; draft public declarations match the index bytes." },
      { id: "local_database_exact_join", status: "passed", evidence: validationReport.path },
      { id: "draft_public_manifest_contract", status: "passed", evidence: "Each draft is contract-valid and public-builder dry-run eligible; canonical files remain unchanged." },
      { id: "production_transaction_implementation", status: "passed", evidence: "The separate runner applies migration 0008 and all four hidden Minnesota data sets atomically, validates before commit, and leaves public/canonical delivery unchanged; production execution remains evidence- and authorization-gated." },
      { id: "isolated_overlay_review_implementation", status: "passed", evidence: "The content-addressed review tool hash-checks every overlay copy, patch, and semantic projection, classifies required versus excluded shared work, and emits an immutable no-production confirmation record." },
      { id: "clean_isolated_release_diff", status: "pending", evidence: "Machine classifications are reproducible, but an independent human must confirm them and apply the reviewed projections/hunks in a clean integration worktree." },
      { id: "current_production_backup", status: "pending", evidence: "Must be created and verified immediately before any authorized production change." },
      { id: "current_production_schema_and_row_preflight", status: "pending", evidence: "The 2026-08-05 observation is not a substitute for a current read-only preflight." },
      { id: "reviewed_production_transaction_path", status: "pending", evidence: "The separately guarded implementation exists and is local-testable; independent human review plus current preflight/backup evidence are still required before use." },
      { id: "deployment_window_and_rollback_owner", status: "pending", evidence: "Requires an operational owner and rollback decision point." },
      { id: "explicit_production_authorization", status: "pending", evidence: "No production promotion, public release, or publication is authorized by this package." },
    ],
    scopedFileInventory: {
      releaseDependencies,
      sharedReviewFiles,
      sourceAndDataArtifacts: dataArtifacts,
      patchIsolationWarnings: PATCH_ISOLATION_WARNINGS,
    },
  };

  return {
    packageDocument,
    packageBytes: serializeMinnesotaReleaseDocument(packageDocument),
    draftManifests: yearBuilds.map((year) => ({
      path: year.draftManifest.path,
      bytes: year.draftManifestBytes,
      manifest: year.draftManifestValue,
    })),
    deliveryAssets: yearBuilds.flatMap((year) => year.deliveryFiles),
  };
}
