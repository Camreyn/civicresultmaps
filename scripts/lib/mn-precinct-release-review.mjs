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
    ],
    rationale: "The complete diff provides strict local-clone reads and unambiguous contest/result grouping used by the four-year rehearsal.",
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
      "hidden-load implementation is not enabled",
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
      "listResults({ state, year, level, office })",
    ],
    rationale: "The complete diff makes contest selection explicit for multi-year precinct result delivery.",
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

function markerReview(text, policy) {
  const missingRequired = (policy.requiredMarkers ?? []).filter((marker) => !text.includes(marker));
  const presentExcluded = (policy.excludedMarkers ?? []).filter((marker) => text.includes(marker));
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
      markers = markerReview(patch.bytes.toString("utf8"), policy);
    } else if ((policy.requiredMarkers ?? []).length || (policy.excludedMarkers ?? []).length) {
      throw new Error(policy.path + " requires a patch marker review but has no patch artifact");
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
      reason: "The exact include/exclude policy is reproducible, but an independent human must confirm it and apply it in a clean integration worktree before the release gate passes.",
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
      "independent human confirmation and clean-worktree application of this review",
      "current read-only production schema and row preflight",
      "current full production backup with verified restoration",
      "named independent deployment and rollback roles in an active window",
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
