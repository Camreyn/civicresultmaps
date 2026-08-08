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
  buildMinnesotaReleaseReview,
  minnesotaReleaseReviewPolicy,
} from "../../scripts/lib/mn-precinct-release-review.mjs";
import {
  prepareMinnesotaReleaseReview,
} from "../../scripts/review-mn-precinct-release-overlay.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function serialize(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

function write(root, relativePath, bytes) {
  const target = path.join(root, ...relativePath.split("/"));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return { path: relativePath, byteCount: bytes.length, sha256: sha256(bytes) };
}

function projectionFor(policy) {
  if (policy.path === "package.json") {
    return {
      scripts: {
        "precinct-gis:production-preflight:mn": "node preflight.mjs",
        "precinct-gis:production-release:mn": "node release.mjs",
        "precinct-gis:release-overlay:mn": "node overlay.mjs",
        "precinct-gis:release-review:mn": "node review.mjs",
      },
      dependencies: { postgres: "^3.4.9", shpjs: "6.2.0" },
    };
  }
  if (policy.path === "package-lock.json") {
    return {
      lockfileVersion: 3,
      rootDependencies: { postgres: "^3.4.9", shpjs: "6.2.0" },
      packages: {
        "node_modules/postgres": { version: "3.4.9" },
        "node_modules/shpjs": { version: "6.2.0" },
      },
    };
  }
  if (policy.path === "data/precinct-geometry-manifests.json") {
    return { manifests: [{ state: "MN", id: "mn-test" }] };
  }
  return { states: [{ state: "MN" }] };
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-release-review-"));
  const packagePath =
    ".etl/precinct-release-candidates/MN/test/release-candidate.json";
  const packageArtifact = write(root, packagePath, serialize({
    schemaVersion: 1,
    id: "mn-precinct-gis-four-election-v1",
    state: "MN",
  }));
  const overlayPath = ".etl/precinct-release-overlays/MN/test/overlay.json";
  const overlayRoot = path.posix.dirname(overlayPath);
  const policy = minnesotaReleaseReviewPolicy();
  const files = [];
  for (const item of policy) {
    const working = Buffer.from("reviewed working bytes for " + item.path + "\n");
    const copied = write(root, path.posix.join(overlayRoot, "files", item.path), working);
    let patchArtifact = null;
    if (item.decision === "include_entire_patch" || item.decision === "include_curated_hunks") {
      const patchBytes = Buffer.from([
        "diff --git a/" + item.path + " b/" + item.path,
        ...(item.requiredMarkers ?? []),
        "",
      ].join("\n"));
      patchArtifact = write(
        root,
        path.posix.join(overlayRoot, "patches", item.path.replaceAll("/", "__") + ".patch"),
        patchBytes,
      );
      patchArtifact.path = path.posix.relative(overlayRoot, patchArtifact.path);
    }
    let projectionArtifact = null;
    if (item.decision === "include_semantic_projection") {
      projectionArtifact = write(
        root,
        path.posix.join(overlayRoot, "projections", item.path.replaceAll("/", "__")),
        serialize(projectionFor(item)),
      );
      projectionArtifact.path = path.posix.relative(overlayRoot, projectionArtifact.path);
    }
    files.push({
      path: item.path,
      overlayPath: path.posix.relative(overlayRoot, copied.path),
      byteCount: copied.byteCount,
      sha256: copied.sha256,
      gitDisposition: item.path === "docs/developer/precinct-gis-implementation.md"
        ? "added"
        : "modified",
      base: { byteCount: 10, sha256: "a".repeat(64) },
      patchPath: patchArtifact?.path ?? null,
      patchArtifact,
      projectionPath: projectionArtifact?.path ?? null,
      projectionArtifact,
      reviewClass: item.decision === "include_semantic_projection"
        ? "semantic_projection_review"
        : "hunk_review",
      reviewStatus: "human_review_required",
    });
  }
  const additionalReviewed = new Set([
    "src/app/api/results/route.ts",
    "drizzle/meta/_journal.json",
    "src/app/privacy/page.tsx",
  ]);
  const overlay = {
    schemaVersion: 1,
    state: "MN",
    sourceReleaseCandidate: packageArtifact,
    decision: "REVIEW_REQUIRED",
    files,
    reviewQueue: files
      .filter((file) => !additionalReviewed.has(file.path))
      .map((file) => ({ path: file.path })),
  };
  write(root, overlayPath, serialize(overlay));
  return { root, packagePath, overlayPath };
}

test("Minnesota release review policy classifies every shared or modified integration surface", () => {
  const policy = minnesotaReleaseReviewPolicy();
  assert.equal(policy.length, 25);
  assert.equal(new Set(policy.map((item) => item.path)).size, 25);
  assert.equal(policy.filter((item) => item.decision === "include_entire_patch").length, 10);
  assert.equal(policy.filter((item) => item.decision === "include_curated_hunks").length, 5);
  assert.equal(policy.filter((item) => item.decision === "include_semantic_projection").length, 9);
  assert.equal(policy.filter((item) => item.decision === "retain_as_external_ledger").length, 1);
});

test("Minnesota release review produces a no-production confirmation record", () => {
  const item = fixture();
  try {
    const built = buildMinnesotaReleaseReview(item);
    assert.equal(built.document.decision, "READY_FOR_HUMAN_CONFIRMATION");
    assert.equal(
      built.document.isolatedDiffGate.status,
      "pending_human_confirmation_and_clean_application",
    );
    assert.deepEqual(built.document.summary, {
      reviewedFiles: 25,
      originalHumanReviewQueue: 22,
      additionalModifiedDependenciesReviewed: 3,
      decisions: {
        include_entire_patch: 10,
        include_curated_hunks: 5,
        include_semantic_projection: 9,
        retain_as_external_ledger: 1,
      },
    });
    assert.equal(built.document.safety.productionContacted, false);
    assert.equal(built.document.safety.gitMutationPerformed, false);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota release review rejects explicitly excluded work in a curated patch", () => {
  const item = fixture();
  try {
    const overlayTarget = path.join(item.root, ...item.overlayPath.split("/"));
    const overlay = JSON.parse(readFileSync(overlayTarget, "utf8"));
    const file = overlay.files.find((entry) => entry.path === "src/app/globals.css");
    const patchTarget = path.join(
      item.root,
      ...path.posix.join(path.posix.dirname(item.overlayPath), file.patchArtifact.path).split("/"),
    );
    const patchBytes = Buffer.concat([
      readFileSync(patchTarget),
      Buffer.from(".indicator-count-summary\n", "utf8"),
    ]);
    writeFileSync(patchTarget, patchBytes);
    file.patchArtifact.byteCount = patchBytes.length;
    file.patchArtifact.sha256 = sha256(patchBytes);
    writeFileSync(overlayTarget, serialize(overlay));
    assert.throws(
      () => buildMinnesotaReleaseReview(item),
      /still contains explicitly excluded work/,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota release review writes immutably and detects projection tampering", () => {
  const item = fixture();
  try {
    const first = prepareMinnesotaReleaseReview({ ...item, write: true });
    assert.equal(first.disposition, "created");
    const second = prepareMinnesotaReleaseReview({ ...item, write: true });
    assert.equal(second.disposition, "verified_existing");
    const overlay = JSON.parse(readFileSync(path.join(item.root, ...item.overlayPath.split("/")), "utf8"));
    const packageProjection = overlay.files.find((file) => file.path === "package.json").projectionArtifact;
    writeFileSync(
      path.join(item.root, ...path.posix.join(path.posix.dirname(item.overlayPath), packageProjection.path).split("/")),
      "{}\n",
    );
    assert.throws(
      () => buildMinnesotaReleaseReview(item),
      /byte count drifted|SHA-256 drifted/,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});
