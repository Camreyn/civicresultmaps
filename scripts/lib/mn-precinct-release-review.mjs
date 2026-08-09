import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  inspectReleaseArtifact,
} from "./mn-precinct-release-candidate.mjs";
import {
  MINNESOTA_PACKAGE_SCRIPTS,
} from "./mn-precinct-release-overlay.mjs";

export const MINNESOTA_RELEASE_REVIEW_ROOT =
  ".etl/precinct-release-reviews/MN";

const POLICY = Object.freeze([
  {
    path: "package.json",
    decision: "include_semantic_projection",
    phase: "shared_release_tooling",
    rationale: "Retain only reviewed precinct/Minnesota scripts plus postgres and shpjs; exclude unrelated workspace scripts and dependencies.",
  },
  {
    path: "package-lock.json",
    decision: "include_semantic_projection",
    phase: "shared_release_tooling",
    rationale: "Retain only postgres, shpjs, and their locked runtime dependency closure; exclude unrelated MCP dependency additions.",
  },
  {
    path: "src/app/globals.css",
    decision: "include_curated_hunks",
    phase: "public_cutover",
    requiredMarkers: [
      ".precinct-detail-status",
      ".precinct-detail-basemap-attribution",
      ".precinct-detail-source-terms",
      "@media (max-width: 800px)",
    ],
    excludedMarkers: [
      ".indicator-count-summary",
      ".indicator-card-heading",
      ".indicator-table-entry",
    ],
    rationale: "Include the precinct-detail map and visibly attributed OpenStreetMap basemap styles; exclude unrelated advisory-indicator presentation changes.",
  },
  {
    path: "src/app/privacy/page.tsx",
    decision: "include_entire_patch",
    phase: "public_cutover",
    requiredMarkers: [
      "August 7, 2026",
      "OpenStreetMap map tiles",
      "tile.openstreetmap.org",
      "https://osmfoundation.org/wiki/Privacy_Policy",
    ],
    rationale: "Disclose the direct browser request to the OSMF tile service and link the governing privacy policy.",
  },
  {
    path: "src/app/results-explorer.tsx",
    decision: "include_curated_hunks",
    phase: "public_cutover",
    requiredMarkers: [
      "import { PrecinctDetailMap }",
      "electionYear: SupportedPresidentialYear",
      "[\"Harris\", \"Biden\", \"Clinton\", \"Obama\"]",
      "[\"Trump\", \"Romney\"]",
      "const pinnedCountyGeoid",
      "<PrecinctDetailMap",
    ],
    excludedMarkers: [
      "formatIndicatorScopeSummary",
      "summarizeIndicatorScopes",
      "indicator-count-summary",
    ],
    rationale: "Include 2012 labels and the guarded precinct map surface; exclude unrelated indicator-scope UI work.",
  },
  {
    path: "src/app/workspace-guided-links.tsx",
    decision: "include_entire_patch",
    phase: "public_cutover",
    requiredMarkers: ["SupportedPresidentialYear"],
    rationale: "The complete diff only widens the reviewed year type to include 2012.",
  },
  {
    path: "src/app/workspace-tabs.tsx",
    decision: "include_curated_hunks",
    phase: "public_cutover",
    requiredMarkers: [
      "import type { SupportedPresidentialYear }",
      "electionYear: SupportedPresidentialYear",
    ],
    excludedMarkers: [
      "browserRCalculationsEnabled",
      "rCalculationContext",
    ],
    rationale: "Include only the 2012-capable year type; exclude the unrelated browser-R layout integration.",
  },
  {
    path: "src/db/native-import.ts",
    decision: "include_entire_patch",
    phase: "shared_database_prerequisite",
    requiredMarkers: [
      "buildNativeReportingUnitRecord",
      "runPostgresTransaction",
      "insert into reporting_units",
      "reporting_unit_id",
    ],
    rationale: "The complete diff implements the reviewed reporting-unit linkage and guarded local PostgreSQL native-import path.",
  },
  {
    path: "src/db/neon-transaction.ts",
    decision: "include_entire_patch",
    phase: "shared_database_prerequisite",
    requiredMarkers: [
      "import postgres from \"postgres\"",
      "runPostgresTransaction",
    ],
    rationale: "The complete diff is the local PostgreSQL transaction adapter required by the normalized rehearsal path.",
  },
  {
    path: "src/db/schema.ts",
    decision: "include_entire_patch",
    phase: "hidden_load",
    requiredMarkers: [
      "geographyVersions",
      "geographyFeatures",
      "reportingUnits",
      "reportingUnitGeometryCrosswalks",
      "reportingUnitId",
    ],
    rationale: "The complete diff mirrors migration 0008's normalized geography, reporting-unit, and linkage schema.",
  },
  {
    path: "src/lib/api-version.ts",
    decision: "include_curated_hunks",
    phase: "public_cutover",
    requiredMarkers: [
      "supportedPresidentialYears = [2012, 2016, 2020, 2024]",
    ],
    excludedMarkers: [
      "securityIncidentApiSchemaVersion = \"4.2.0\"",
    ],
    rationale: "Include 2012 as a supported presidential year; exclude the unrelated security-incident API version change.",
  },
  {
    path: "src/lib/data-access.ts",
    decision: "include_entire_patch",
    phase: "shared_database_prerequisite",
    requiredMarkers: [
      "getReadSql",
      "hasReadableDatabase",
      "rethrowReadErrorIfStrict",
      "office?: string",
      "finalizeResultRowSummary",
      "requiresPublicationGate",
      "gate_version.status = 'published'",
      "isPrecinctGeometryManifestPublished",
      "publicManifestSha256",
    ],
    rationale: "The complete diff provides strict local-clone reads and unambiguous contest/result grouping used by the four-year rehearsal.",
  },
  {
    path: "src/lib/precinct-result-publication.ts",
    decision: "include_entire_patch",
    phase: "hidden_load",
    requiredMarkers: [
      "requiresPrecinctResultPublicationGate",
      "requiresPrecinctGeometryPublicationGate",
      "matchesPrecinctGeometryPublicationMetadata",
      "input.state === \"MN\"",
      "input.level === \"precinct\"",
    ],
    rationale: "The complete file declares the Minnesota-only fail-closed result gate used before hidden precinct rows are loaded.",
  },
  {
    path: "src/lib/state-year-results.ts",
    decision: "include_entire_patch",
    phase: "public_cutover",
    requiredMarkers: [
      "2012: { dem: \"Obama\", rep: \"Romney\" }",
    ],
    rationale: "The complete diff adds only the reviewed 2012 candidate labels.",
  },
  {
    path: "data/native-import-source-packages.json",
    decision: "include_semantic_projection",
    phase: "provenance",
    rationale: "Merge only the Minnesota source-package entry and Minnesota list membership; preserve every other state.",
  },
  {
    path: "data/precinct-geometry-coverage-inventory-2012.json",
    decision: "include_semantic_projection",
    phase: "public_cutover",
    rationale: "Retain the Minnesota 2012 coverage row as a semantic projection; the national file must be integrated separately.",
  },
  {
    path: "data/precinct-geometry-coverage-inventory-2016.json",
    decision: "include_semantic_projection",
    phase: "public_cutover",
    rationale: "Retain the Minnesota 2016 coverage row as a semantic projection; the national file must be integrated separately.",
  },
  {
    path: "data/precinct-geometry-coverage-inventory-2020.json",
    decision: "include_semantic_projection",
    phase: "public_cutover",
    rationale: "Retain the Minnesota 2020 coverage row as a semantic projection; the national file must be integrated separately.",
  },
  {
    path: "data/precinct-geometry-coverage-inventory.json",
    decision: "include_semantic_projection",
    phase: "public_cutover",
    rationale: "Retain the Minnesota 2024 coverage row as a semantic projection; the national file must be integrated separately.",
  },
  {
    path: "data/precinct-geometry-manifests.json",
    decision: "include_semantic_projection",
    phase: "public_cutover",
    rationale: "Retain only the four blocked Minnesota manifest records; do not replace the shared national registry.",
  },
  {
    path: "data/source-acquisition-tiers.json",
    decision: "include_semantic_projection",
    phase: "provenance",
    rationale: "Merge only the Minnesota source-acquisition entry and preserve every unrelated state row.",
  },
  {
    path: "docs/developer/precinct-gis-implementation.md",
    decision: "retain_as_external_ledger",
    phase: "provenance",
    rationale: "The untracked national continuation ledger contains many states; retain its exact hash as evidence but do not treat the whole file as a Minnesota-only integration diff.",
  },
  {
    path: "docs/native-import-source-packages.md",
    decision: "include_curated_hunks",
    phase: "provenance",
    requiredMarkers: [
      "Local four-election GIS release candidate",
      "Local release-candidate precinct units, four elections",
      "guarded hidden-load implementation exists but has not been executed in production",
    ],
    excludedMarkers: [
      "## 2024 Precinct Geometry Wave 17 Closeout",
      "Precinct-geometry diagnostic",
    ],
    rationale: "Include only the Minnesota section changes; exclude unrelated New York, Utah, and South Dakota documentation.",
  },
  {
    path: "src/app/api/results/route.ts",
    decision: "include_entire_patch",
    phase: "public_cutover",
    requiredMarkers: [
      "officeQuery",
      "parentGeoidQuery",
      "parentGeoid is supported only for precinct results",
    ],
    rationale: "The complete diff keeps contest selection explicit and adds county-qualified precinct result delivery.",
  },
  {
    path: "drizzle/meta/_journal.json",
    decision: "include_entire_patch",
    phase: "hidden_load",
    requiredMarkers: ["0008_typical_thunderbolts"],
    rationale: "The complete diff registers the exact normalized geography migration used by the atomic writer.",
  },
  {
    path: "tests/api/api-contract.test.mjs",
    decision: "include_entire_patch",
    phase: "shared_release_tooling",
    requiredMarkers: [
      "precinct geography API defaults to delivery-eligible manifests",
      "precinct delivery API validates immutable geometry before county transfer",
      "rethrowReadErrorIfStrict\\(error\\)",
      "results API keeps contest offices separated",
    ],
    rationale: "The complete diff updates the repository API contract for the guarded precinct endpoints, strict local-clone reads, and explicit contest selection introduced by this integration.",
  },
  {
    path: "docs/developer/local-database-clone.md",
    decision: "include_entire_patch",
    phase: "production_safety",
    requiredMarkers: [
      "full SHA-256 over normalized host, port, and database name",
      "bf2bf2213814",
    ],
    rationale: "The complete documentation patch distinguishes the legacy approved-host check from the full port-bound release fingerprint.",
  },
  {
    path: "docs/developer/mn-precinct-release-runbook.md",
    decision: "include_entire_patch",
    phase: "provenance",
    requiredMarkers: [
      "348 immutable county GeoJSON files",
      "CRM_PRECINCT_GEOGRAPHY_ORIGIN",
      "CRM_MN_PRECINCT_BACKUP_ACK=CREATE_FULL_PUBLIC_SCHEMA_ROLLBACK_BACKUP",
      "SOLE_OWNER",
    ],
    rationale: "The complete diff documents the county-scoped serving shape, immutable-object publication gate, package-bound full backup procedure, and explicit sole-owner accountability model.",
  },
  {
    path: "scripts/lib/mn-precinct-production-release.mjs",
    decision: "include_entire_patch",
    phase: "production_safety",
    requiredMarkers: [
      "manifest?.releaseCandidate?.sha256",
      "releaseCandidateSha256",
      "MINNESOTA_SOLE_OWNER_ACKNOWLEDGEMENT",
      "validateMinnesotaReleaseHumanControl",
    ],
    rationale: "The complete diff binds rollback evidence to the exact reviewed release package and validates either default two-person or explicit sole-owner human control.",
  },
  {
    path: "scripts/lib/mn-precinct-release-candidate.mjs",
    decision: "include_entire_patch",
    phase: "shared_release_tooling",
    requiredMarkers: [
      "buildParentScopedPrecinctDeliveryPackage",
      "parent_scoped_geojson",
      "deliveryAssets",
    ],
    rationale: "The complete diff seals deterministic county artifacts, indexes, publication tooling, and their dependencies into the release candidate.",
  },
  {
    path: "scripts/lib/mn-precinct-release-overlay.mjs",
    decision: "include_entire_patch",
    phase: "shared_release_tooling",
    requiredMarkers: [
      "precinct-gis:delivery-publish:mn",
      "precinct-gis:public-activation:mn",
      "precinct-gis:publication-status:mn",
      "precinct-gis:production-backup:mn",
      "src/lib/api.ts",
    ],
    rationale: "The complete diff includes the publication and backup commands and treats the shared API query contract as a reviewed hunk.",
  },
  {
    path: "scripts/prepare-mn-precinct-release-candidate.mjs",
    decision: "include_entire_patch",
    phase: "shared_release_tooling",
    requiredMarkers: [
      "built.deliveryAssets.map",
      "deliveryAssetCount",
    ],
    rationale: "The complete diff writes every sealed county/index asset into the immutable local release package.",
  },
  {
    path: "scripts/run-mn-precinct-geometry-tests.mjs",
    decision: "include_entire_patch",
    phase: "shared_release_tooling",
    requiredMarkers: [
      "precinct-parent-delivery-builder.test.mjs",
      "mn-precinct-blob-publication.test.mjs",
      "mn-precinct-public-activation.test.mjs",
    ],
    rationale: "The complete diff adds the county package and guarded publication checks to the Minnesota suite.",
  },
  {
    path: "src/app/api/precinct-geography/route.ts",
    decision: "include_entire_patch",
    phase: "public_cutover",
    requiredMarkers: [
      "parent_scoped_geojson",
      "indexSha256",
      "indexByteCount",
      "isPrecinctGeometryManifestPublished",
    ],
    rationale: "The complete diff allows reviewed parent-scoped delivery and returns its verified index metadata.",
  },
  {
    path: "src/app/precinct-detail-map.tsx",
    decision: "include_entire_patch",
    phase: "public_cutover",
    requiredMarkers: [
      "parent_scoped_geojson",
      "parentGeoid,",
    ],
    rationale: "The complete diff accepts the parent-scoped format and requests results only for the selected county.",
  },
  {
    path: "src/lib/api.ts",
    decision: "include_entire_patch",
    phase: "public_cutover",
    requiredMarkers: ["parentGeoidQuery"],
    rationale: "The complete diff defines the strict five-digit county GEOID query contract used by precinct results.",
  },
  {
    path: "src/lib/precinct-delivery-server.ts",
    decision: "include_entire_patch",
    phase: "public_cutover",
    requiredMarkers: [
      "CRM_PRECINCT_GEOGRAPHY_ORIGIN",
      "selectPrecinctParentDeliveryArtifact",
      "delivery artifact SHA-256 does not match index",
    ],
    rationale: "The complete diff verifies the pinned index and one pinned county artifact from a credential-free HTTPS origin before returning geometry.",
  },
  {
    path: "src/lib/precinct-geography.ts",
    decision: "include_entire_patch",
    phase: "public_cutover",
    requiredMarkers: [
      "parent_scoped_geojson",
      "parentGeoidProperty",
      "parentCount must be greater than zero",
    ],
    rationale: "The complete diff adds the validated parent-scoped delivery declaration to the canonical manifest contract.",
  },
  {
    path: "src/lib/precinct-map-delivery.ts",
    decision: "include_entire_patch",
    phase: "public_cutover",
    requiredMarkers: [
      "selectPrecinctParentDeliveryArtifact",
      "isSafeParentArtifactPath",
      "indexed parent feature counts must equal index.featureCount",
    ],
    rationale: "The complete diff validates safe content-addressed county paths, hashes, counts, and parent selection.",
  },
  {
    path: "tests/api/mn-precinct-production-release.test.mjs",
    decision: "include_entire_patch",
    phase: "shared_release_tooling",
    requiredMarkers: [
      "releaseCandidate: releaseCandidate()",
      "exactSourceRowCounts = \\$true",
      "sole-owner roles must all name the approved owner",
    ],
    rationale: "The complete diff tests exact package binding, full-backup safeguards, and fail-closed sole-owner authorization.",
  },
  {
    path: "tests/api/mn-precinct-release-candidate.test.mjs",
    decision: "include_entire_patch",
    phase: "shared_release_tooling",
    requiredMarkers: [
      "parent_scoped_geojson",
      "four indexes and 348 county assets",
    ],
    rationale: "The complete diff verifies the new package shape and all delivery declarations.",
  },
  {
    path: "tests/api/precinct-delivery-server.test.mjs",
    decision: "include_entire_patch",
    phase: "shared_release_tooling",
    requiredMarkers: [
      "hash-pinned parent asset behind a remote index",
      "SHA-256 does not match index",
    ],
    rationale: "The complete diff proves that remote delivery reads only and verifies the requested county artifact.",
  },
  {
    path: "tests/api/precinct-map-delivery.test.mjs",
    decision: "include_entire_patch",
    phase: "shared_release_tooling",
    requiredMarkers: [
      "selectPrecinctParentDeliveryArtifact",
      "parent delivery index is hash-pinned, parent-qualified, and bounded",
    ],
    rationale: "The complete diff covers safe parent-index validation and selection bounds.",
  },
  {
    path: "tests/api/precinct-map-ui.test.mjs",
    decision: "include_entire_patch",
    phase: "shared_release_tooling",
    requiredMarkers: [
      "parentGeoid,",
      "parent_scoped_geojson",
    ],
    rationale: "The complete diff checks the browser's county-filtered result request and parent-scoped format handling.",
  },
  {
    path: "scripts/apply-mn-precinct-release.mjs",
    decision: "include_entire_patch",
    phase: "production_safety",
    requiredMarkers: [
      "export function verifyBackupDump",
      "path.dirname(path.resolve(manifest.path))",
      "manifest directory is outside its fixed root",
    ],
    rationale: "The complete diff resolves and verifies the rollback dump beside its package-bound manifest under the fixed backup root.",
  },
  {
    path: "scripts/lib/mn-precinct-release-review.mjs",
    decision: "include_entire_patch",
    phase: "shared_release_tooling",
    requiredMarkers: [
      "docs/developer/mn-precinct-release-runbook.md",
      "scripts/apply-mn-precinct-release.mjs",
      "sealed_file_and_patch",
      "sealed_unchanged_file",
      "src/lib/api.ts",
      "tests/api/precinct-map-ui.test.mjs",
    ],
    rationale: "The complete diff explicitly classifies every new production-delivery integration surface in the fail-closed review policy.",
  },
  {
    path: "tests/api/mn-precinct-release-review.test.mjs",
    decision: "include_entire_patch",
    phase: "shared_release_tooling",
    requiredMarkers: [
      "policy.length, 52",
      "include_entire_patch\").length, 37",
      "validates unchanged merged surfaces from sealed bytes",
    ],
    rationale: "The complete diff locks the expanded review-policy coverage and decision counts.",
  },
  {
    path: "scripts/lib/mn-precinct-public-activation.mjs",
    decision: "include_entire_patch",
    phase: "production_safety",
    requiredMarkers: [
      "validateMinnesotaHiddenLoadReceipt",
      "validateMinnesotaBlobPublicationEvidence",
      "PROTECTED_PREVIEW_REQUIRED",
      "validateMinnesotaReleaseHumanControl",
      "GO_ROLLBACK",
      "protectionVerified",
      "productionDeployment",
      "gitTreeSha",
      "rollbackTarget",
      "databaseBlockFirstAcknowledged",
    ],
    rationale: "The complete file validates exact hidden-load and immutable-Blob receipts before producing the deterministic canonical registry and coverage transition.",
  },
  {
    path: "scripts/prepare-mn-precinct-public-activation.mjs",
    decision: "include_entire_patch",
    phase: "public_cutover",
    requiredMarkers: [
      "write_preview_candidate",
      "databasePublicationStatusChanged: false",
      "gitPublicationPerformed: false",
    ],
    rationale: "The complete file writes only the five receipt-bound preview candidate surfaces and never contacts production or publishes Git/deployments.",
  },
  {
    path: "scripts/publish-mn-precinct-geography-status.mjs",
    decision: "include_entire_patch",
    phase: "production_safety",
    requiredMarkers: [
      "I_ACKNOWLEDGE_PUBLIC_PRECINCT_MAP_CUTOVER",
      "applyMinnesotaGeographyPublicationTransaction",
      "DATABASE_PUBLISHED_VERIFY_ALREADY_DEPLOYED_APPLICATION",
      "DATABASE_ROLLED_BACK_RESTORE_PINNED_APPLICATION",
      "I_ACKNOWLEDGE_PUBLIC_PRECINCT_MAP_ROLLBACK",
      "CRM_MN_PRECINCT_PUBLIC_ACTIVATION_CANDIDATE_SHA256",
      "I_ACKNOWLEDGE_READ_ONLY_PUBLICATION_RECEIPT_RECOVERY",
      "HEAD^{tree}",
      "production deployment commit does not resolve",
      "rollback deployment commit does not resolve",
      "publicAuthorizationArtifact",
      "rollbackTarget: context.authorization.rollbackTarget",
    ],
    rationale: "The complete file performs the separately authorized, atomic, idempotent database publication-status transition and retains an explicit rollback path.",
  },
  {
    path: "tests/api/mn-precinct-public-activation.test.mjs",
    decision: "include_entire_patch",
    phase: "shared_release_tooling",
    requiredMarkers: [
      "receipt-bound and plan-only by default",
      "changes only five deterministic tracked files",
      "requires verified preview and production deployments plus declared human control",
      "atomically publishes exact versions and crosswalks",
    ],
    rationale: "The complete test file proves receipt binding, deterministic static activation, declared human-control validation, tamper rejection, and the exact database transition.",
  },
  {
    path: "tests/api/mn-precinct-result-publication-gate.test.mjs",
    decision: "include_entire_patch",
    phase: "hidden_load",
    requiredMarkers: [
      "both precinct result query paths fail closed",
      "gate_version\\.status = 'published'",
      "publicDeliveryAuthorized",
    ],
    rationale: "The complete test file proves both public result query shapes remain blocked until exact publication metadata and joins are present.",
  },
]);

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function serialize(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

function requireDocument(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be a JSON object");
  }
  return value;
}

function overlayChild(root, overlayPath, artifact) {
  if (!artifact) return null;
  const child = typeof artifact === "string" ? { path: artifact } : artifact;
  if (
    typeof child.path !== "string"
    || child.path.includes("\\")
    || child.path.split("/").includes("..")
  ) {
    throw new Error("Minnesota release review overlay child path is unsafe");
  }
  const relativePath = path.posix.join(path.posix.dirname(overlayPath), child.path);
  return inspectReleaseArtifact(root, relativePath, {
    allowedRoots: [".etl/precinct-release-overlays/MN/"],
    byteCount: child.byteCount,
    sha256: child.sha256,
  });
}

function validateStateProjection(value, sourcePath) {
  const rows = sourcePath === "data/precinct-geometry-manifests.json"
    ? value.manifests
    : value.states;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(sourcePath + " Minnesota projection is empty");
  }
  if (rows.some((row) => row?.state !== "MN")) {
    throw new Error(sourcePath + " projection contains a non-Minnesota row");
  }
  if (
    Array.isArray(value.discovery)
    && value.discovery.some((row) => row !== "MN" && row?.state !== "MN")
  ) {
    throw new Error(sourcePath + " projection contains a non-Minnesota discovery row");
  }
}

function validateProjection(sourcePath, value) {
  requireDocument(value, sourcePath + " projection");
  if (sourcePath === "package.json") {
    const scriptNames = Object.keys(value.scripts ?? {});
    const unexpected = scriptNames.filter((name) => !MINNESOTA_PACKAGE_SCRIPTS.includes(name));
    if (unexpected.length) {
      throw new Error("package.json projection contains unrelated scripts: " + unexpected.join(", "));
    }
    for (const required of [
      "precinct-gis:production-preflight:mn",
      "precinct-gis:production-release:mn",
      "precinct-gis:release-overlay:mn",
      "precinct-gis:release-review:mn",
    ]) {
      if (typeof value.scripts?.[required] !== "string") {
        throw new Error("package.json projection is missing " + required);
      }
    }
    if (!value.dependencies?.postgres || !value.dependencies?.shpjs) {
      throw new Error("package.json projection must pin postgres and shpjs");
    }
    return;
  }
  if (sourcePath === "package-lock.json") {
    if (!value.rootDependencies?.postgres || !value.rootDependencies?.shpjs) {
      throw new Error("package-lock projection must pin postgres and shpjs");
    }
    const packageNames = Object.keys(value.packages ?? {});
    if (!packageNames.includes("node_modules/postgres") || !packageNames.includes("node_modules/shpjs")) {
      throw new Error("package-lock projection is missing a direct release dependency");
    }
    if (packageNames.some((name) => name.includes("@modelcontextprotocol"))) {
      throw new Error("package-lock projection contains unrelated MCP dependencies");
    }
    return;
  }
  validateStateProjection(value, sourcePath);
}

function markerReview(workingText, patchText, policy) {
  const missingRequired = (policy.requiredMarkers ?? [])
    .filter((marker) => !workingText.includes(marker));
  const presentExcluded = (policy.excludedMarkers ?? [])
    .filter((marker) => patchText.includes(marker));
  if (missingRequired.length) {
    throw new Error(policy.path + " patch is missing required review markers: " + missingRequired.join(", "));
  }
  if (presentExcluded.length) {
    throw new Error(policy.path + " patch still contains explicitly excluded work: " + presentExcluded.join(", "));
  }
  return {
    includedMarkers: policy.requiredMarkers ?? [],
    excludedMarkers: policy.excludedMarkers ?? [],
  };
}

export function buildMinnesotaReleaseReview(options) {
  const root = path.resolve(options.root ?? process.cwd());
  const packageArtifact = inspectReleaseArtifact(root, options.packagePath, {
    allowedRoots: [".etl/precinct-release-candidates/MN/"],
  });
  const overlayArtifact = inspectReleaseArtifact(root, options.overlayPath, {
    allowedRoots: [".etl/precinct-release-overlays/MN/"],
  });
  const release = requireDocument(
    JSON.parse(packageArtifact.bytes.toString("utf8")),
    "Minnesota release package",
  );
  const overlay = requireDocument(
    JSON.parse(overlayArtifact.bytes.toString("utf8")),
    "Minnesota release overlay",
  );
  if (release.state !== "MN" || release.id !== "mn-precinct-gis-four-election-v1") {
    throw new Error("Minnesota release review package identity drifted");
  }
  if (overlay.state !== "MN" || overlay.schemaVersion !== 1) {
    throw new Error("Minnesota release review overlay identity drifted");
  }
  if (
    overlay.sourceReleaseCandidate?.sha256 !== packageArtifact.sha256
    || overlay.sourceReleaseCandidate?.byteCount !== packageArtifact.byteCount
    || overlay.sourceReleaseCandidate?.path !== options.packagePath
  ) {
    throw new Error("Minnesota release overlay is not pinned to the supplied package");
  }

  const files = new Map((overlay.files ?? []).map((file) => [file.path, file]));
  const queue = new Set((overlay.reviewQueue ?? []).map((file) => file.path));
  const policyPaths = new Set(POLICY.map((item) => item.path));
  const unexpectedQueue = Array.from(queue).filter((item) => !policyPaths.has(item));
  if (unexpectedQueue.length) {
    throw new Error("Minnesota release overlay has unclassified review files: " + unexpectedQueue.join(", "));
  }
  const unexpectedModified = (overlay.files ?? [])
    .filter((file) => file.gitDisposition === "modified" && !policyPaths.has(file.path))
    .map((file) => file.path);
  if (unexpectedModified.length) {
    throw new Error("Minnesota release overlay has unclassified modified files: " + unexpectedModified.join(", "));
  }

  const reviewItems = POLICY.map((policy) => {
    const file = files.get(policy.path);
    if (!file) throw new Error("Minnesota release overlay is missing review file: " + policy.path);
    const copied = overlayChild(root, options.overlayPath, {
      path: file.overlayPath,
      byteCount: file.byteCount,
      sha256: file.sha256,
    });
    let patch = null;
    let markers = { includedMarkers: [], excludedMarkers: [] };
    if (file.patchArtifact) {
      patch = overlayChild(root, options.overlayPath, file.patchArtifact);
      markers = {
        ...markerReview(
          copied.bytes.toString("utf8"),
          patch.bytes.toString("utf8"),
          policy,
        ),
        markerSource: "sealed_file_and_patch",
      };
    } else if ((policy.requiredMarkers ?? []).length || (policy.excludedMarkers ?? []).length) {
      if (file.gitDisposition !== "unchanged") {
        throw new Error(policy.path + " requires a patch marker review but has no patch artifact");
      }
      markers = {
        ...markerReview(copied.bytes.toString("utf8"), "", policy),
        markerSource: "sealed_unchanged_file",
      };
    }
    let projection = null;
    if (policy.decision === "include_semantic_projection") {
      if (!file.projectionArtifact) {
        throw new Error(policy.path + " requires a semantic projection");
      }
      projection = overlayChild(root, options.overlayPath, file.projectionArtifact);
      validateProjection(
        policy.path,
        JSON.parse(projection.bytes.toString("utf8")),
      );
    }
    return {
      path: policy.path,
      decision: policy.decision,
      phase: policy.phase,
      rationale: policy.rationale,
      gitDisposition: file.gitDisposition,
      base: file.base,
      working: {
        byteCount: copied.byteCount,
        sha256: copied.sha256,
      },
      patch: patch && {
        path: file.patchArtifact.path,
        byteCount: patch.byteCount,
        sha256: patch.sha256,
      },
      projection: projection && {
        path: file.projectionArtifact.path,
        byteCount: projection.byteCount,
        sha256: projection.sha256,
      },
      ...markers,
    };
  });

  const counts = Object.fromEntries(
    [
      "include_entire_patch",
      "include_curated_hunks",
      "include_semantic_projection",
      "retain_as_external_ledger",
    ].map((decision) => [
      decision,
      reviewItems.filter((item) => item.decision === decision).length,
    ]),
  );
  const document = {
    schemaVersion: 1,
    state: "MN",
    scope: "Minnesota precinct release shared-file isolation review",
    sourceReleaseCandidate: {
      path: options.packagePath,
      byteCount: packageArtifact.byteCount,
      sha256: packageArtifact.sha256,
    },
    sourceOverlay: {
      path: options.overlayPath,
      byteCount: overlayArtifact.byteCount,
      sha256: overlayArtifact.sha256,
    },
    decision: "READY_FOR_HUMAN_CONFIRMATION",
    isolatedDiffGate: {
      status: "pending_human_confirmation_and_clean_application",
      machineClassificationsComplete: true,
      unclassifiedReviewFiles: 0,
      reason: "The exact include/exclude policy is reproducible, but the project owner must confirm it and apply it in a clean integration worktree before the release gate passes.",
    },
    safety: {
      productionContacted: false,
      productionMutationPerformed: false,
      publicFileWritten: false,
      canonicalManifestChanged: false,
      gitMutationPerformed: false,
    },
    summary: {
      reviewedFiles: reviewItems.length,
      originalHumanReviewQueue: queue.size,
      additionalModifiedDependenciesReviewed: reviewItems.filter((item) =>
        item.gitDisposition === "modified" && !queue.has(item.path)).length,
      decisions: counts,
    },
    reviewItems,
    excludedWorkClasses: [
      "advisory-indicator presentation changes",
      "browser-R layout integration",
      "security-incident API version change",
      "MCP dependency and script additions",
      "other-state precinct scripts, registry rows, and documentation",
    ],
    remainingGates: [
      "project-owner confirmation and clean-worktree application of this review",
      "current read-only production schema and row preflight",
      "current full production backup with verified restoration",
      "named deployment and rollback roles under the declared human-control mode in an active window",
      "explicit production authorization",
      "separate public file and canonical-manifest cutover review",
    ],
  };
  const bytes = serialize(document);
  const reviewSha256 = digest(bytes);
  const outputRoot = path.posix.join(
    MINNESOTA_RELEASE_REVIEW_ROOT,
    packageArtifact.sha256.slice(0, 12)
      + "-" + overlayArtifact.sha256.slice(0, 12)
      + "-" + reviewSha256.slice(0, 12),
  );
  return { document, bytes, reviewSha256, outputRoot };
}

export function minnesotaReleaseReviewPolicy() {
  return POLICY.map((item) => ({ ...item }));
}
