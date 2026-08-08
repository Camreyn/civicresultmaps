import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  inspectMinnesotaPrecinctBlobPublicationPlan,
  validateMinnesotaBlobPublicationAuthorization,
} from "../../scripts/lib/mn-precinct-blob-publication.mjs";

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function write(root, relativePath, bytes) {
  const target = path.join(root, ...relativePath.split("/"));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

function fixture(root) {
  const releaseRoot =
    ".etl/precinct-release-candidates/MN/mn-precinct-fixture-aaaaaaaaaaaa";
  const years = [2012, 2016, 2020, 2024].map((year) => {
    const assetRoot = `delivery-assets/mn-${year}-fixture-aaaaaaaaaaaa`;
    const publicRoot =
      `/data/geography/mn/${year}-11-01/precinct/mn-${year}-fixture-aaaaaaaaaaaa`;
    const parentArtifacts = Array.from({ length: 87 }, (_, index) => {
      const parentGeoid = "27" + String(index * 2 + 1).padStart(3, "0");
      const bytes = Buffer.from(`${year}:${parentGeoid}\n`);
      const sha256 = digest(bytes);
      const packageRelativePath =
        `${assetRoot}/parents/${parentGeoid}-${sha256.slice(0, 12)}.geojson`;
      write(root, `${releaseRoot}/${packageRelativePath}`, bytes);
      return {
        parentGeoid,
        packageRelativePath,
        publicUrl:
          `${publicRoot}/parents/${parentGeoid}-${sha256.slice(0, 12)}.geojson`,
        sha256,
        byteCount: bytes.length,
        featureCount: 1,
      };
    });
    const indexBytes = Buffer.from(`index:${year}\n`);
    const index = {
      packageRelativePath: `${assetRoot}/index.json`,
      publicUrl: `${publicRoot}/index.json`,
      sha256: digest(indexBytes),
      byteCount: indexBytes.length,
    };
    write(root, `${releaseRoot}/${index.packageRelativePath}`, indexBytes);
    return {
      year,
      certifiedResults: { reportingUnits: 87 },
      proposedPublicDelivery: {
        format: "parent_scoped_geojson",
        url: index.publicUrl,
        sha256: index.sha256,
        byteCount: index.byteCount,
      },
      parentScopedDelivery: {
        format: "parent_scoped_geojson",
        publicationPerformed: false,
        electionValuesInDelivery: false,
        parentCount: 87,
        featureCount: 87,
        index,
        parentArtifacts,
      },
    };
  });
  const document = {
    schemaVersion: 1,
    id: "mn-precinct-gis-four-election-v1",
    state: "MN",
    decision: "NO_GO_PRODUCTION",
    safety: {
      publicFileWritten: false,
      canonicalManifestChanged: false,
      publicEligibilityChanged: false,
    },
    totals: { elections: 4 },
    years,
  };
  const packageBytes = Buffer.from(JSON.stringify(document) + "\n");
  const packagePath = `${releaseRoot}/release-candidate.json`;
  write(root, packagePath, packageBytes);
  return { packagePath, packageSha256: digest(packageBytes), document };
}

test("Minnesota Blob plan verifies all 352 immutable package assets", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-blob-plan-"));
  try {
    const built = fixture(root);
    const plan = inspectMinnesotaPrecinctBlobPublicationPlan({
      root,
      packagePath: built.packagePath,
      packageSha256: built.packageSha256,
    });
    assert.equal(plan.decision, "NO_GO_PUBLICATION");
    assert.equal(plan.assetCount, 352);
    assert.equal(plan.parentArtifactCount, 348);
    assert.equal(plan.indexCount, 4);
    assert.equal(plan.artifacts.at(-1).kind, "index");
    assert.equal(plan.canonicalManifestChanged, false);
    assert.throws(
      () => validateMinnesotaBlobPublicationAuthorization(plan, {}),
      /not explicitly authorized/,
    );
    assert.equal(
      validateMinnesotaBlobPublicationAuthorization(plan, {
        CRM_MN_PRECINCT_PUBLIC_FILE_WRITES:
          "I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD",
        CRM_MN_PRECINCT_PUBLIC_FILE_PACKAGE_SHA256: built.packageSha256,
        CRM_MN_PRECINCT_PUBLIC_FILE_AUTHORIZATION_ID: "fixture-window",
      }).authorizationId,
      "fixture-window",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Minnesota Blob plan rejects tampered package assets", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-blob-tamper-"));
  try {
    const built = fixture(root);
    const relative = built.document.years[0]
      .parentScopedDelivery.parentArtifacts[0].packageRelativePath;
    writeFileSync(
      path.join(
        root,
        ".etl/precinct-release-candidates/MN/mn-precinct-fixture-aaaaaaaaaaaa",
        ...relative.split("/"),
      ),
      Buffer.from("tampered\n"),
    );
    assert.throws(
      () => inspectMinnesotaPrecinctBlobPublicationPlan({
        root,
        packagePath: built.packagePath,
        packageSha256: built.packageSha256,
      }),
      /hash or byte count drifted/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Blob publication CLI remains plan-only without explicit write flags", () => {
  const source = readFileSync(
    "scripts/publish-mn-precinct-delivery-assets.mjs",
    "utf8",
  );
  assert.match(source, /if \(!options\.write\)/);
  assert.match(source, /allowOverwrite: false/);
  assert.match(source, /addRandomSuffix: false/);
  assert.match(
    source,
    /const parentResults = await publishBatch[\s\S]*const indexResults = await publishBatch/,
  );
  assert.match(source, /canonicalManifestChanged: false/);
});
