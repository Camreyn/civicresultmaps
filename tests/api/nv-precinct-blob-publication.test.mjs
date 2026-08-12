import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  inspectNevadaPrecinctBlobPublicationPlan,
  validateNevadaBlobPublicationAuthorization,
} from "../../scripts/lib/nv-precinct-blob-publication.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "crm-nv-blob-"));
  const packageRoot = ".etl/precinct-release-candidates/NV/nv-fixture";
  const countyGeoids = [
    "32001", "32003", "32005", "32007", "32009", "32011",
    "32013", "32015", "32017", "32019", "32021", "32023",
    "32027", "32029", "32031", "32033", "32510",
  ];
  const years = [2016, 2020, 2024].map((year) => {
    const electionDate = year === 2016
        ? "2016-11-08"
        : year === 2020
          ? "2020-11-03"
          : "2024-11-05";
    const assetRoot = `delivery-assets/nv-${year}`;
    const publicRoot = `/data/geography/nv/${electionDate}/precinct/nv-${year}`;
    const parents = countyGeoids.map((parentGeoid) => {
      const bytes = Buffer.from(`{"parent":"${parentGeoid}"}\n`);
      const digest = sha256(bytes);
      const relative = `${assetRoot}/parents/${parentGeoid}-${digest.slice(0, 12)}.geojson`;
      const absolute = path.join(root, packageRoot, ...relative.split("/"));
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, bytes);
      return {
        parentGeoid,
        packageRelativePath: relative,
        publicUrl: `${publicRoot}/parents/${parentGeoid}-${digest.slice(0, 12)}.geojson`,
        byteCount: bytes.length,
        sha256: digest,
        featureCount: 1,
      };
    });
    const indexBytes = Buffer.from(`{"year":${year}}\n`);
    const indexSha256 = sha256(indexBytes);
    const indexPath = `${assetRoot}/index.json`;
    const indexAbsolute = path.join(root, packageRoot, ...indexPath.split("/"));
    mkdirSync(path.dirname(indexAbsolute), { recursive: true });
    writeFileSync(indexAbsolute, indexBytes);
    const index = {
      packageRelativePath: indexPath,
      publicUrl: `${publicRoot}/index.json`,
      byteCount: indexBytes.length,
      sha256: indexSha256,
    };
    return {
      year,
      certifiedResults: { reportingUnits: 17 },
      reviewedGeometry: { featureCount: 17 },
      parentScopedDelivery: {
        format: "parent_scoped_geojson",
        publicationPerformed: false,
        electionValuesInDelivery: false,
        parentCount: 17,
        featureCount: 17,
        index,
        parentArtifacts: parents,
      },
      proposedPublicDelivery: {
        format: "parent_scoped_geojson",
        url: index.publicUrl,
        sha256: index.sha256,
        byteCount: index.byteCount,
      },
    };
  });
  const document = {
    schemaVersion: 1,
    id: "nv-precinct-gis-three-election-v1",
    state: "NV",
    decision: "NO_GO_PRODUCTION",
    safety: {
      publicFileWritten: false,
      canonicalManifestChanged: false,
      publicEligibilityChanged: false,
    },
    totals: { elections: 3 },
    years,
  };
  const bytes = Buffer.from(JSON.stringify(document) + "\n");
  const packagePath = `${packageRoot}/release-candidate.json`;
  writeFileSync(path.join(root, ...packagePath.split("/")), bytes);
  return { root, packagePath, packageSha256: sha256(bytes) };
}

test("Nevada Blob plan pins 51 county files before three indexes", () => {
  const value = fixture();
  try {
    const plan = inspectNevadaPrecinctBlobPublicationPlan(value);
    assert.equal(plan.assetCount, 54);
    assert.equal(plan.parentArtifactCount, 51);
    assert.equal(plan.indexCount, 3);
    assert.equal(plan.uploadOrder, "all parent artifacts before indexes");
    assert.ok(plan.artifacts.slice(0, 51).every((item) => item.kind === "parent"));
    assert.ok(plan.artifacts.slice(51).every((item) => item.kind === "index"));
    assert.throws(
      () => validateNevadaBlobPublicationAuthorization(plan, {}),
      /not explicitly authorized/,
    );
    assert.deepEqual(validateNevadaBlobPublicationAuthorization(plan, {
      CRM_NV_PRECINCT_PUBLIC_FILE_WRITES:
        "I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD",
      CRM_NV_PRECINCT_PUBLIC_FILE_PACKAGE_SHA256: value.packageSha256,
      CRM_NV_PRECINCT_PUBLIC_FILE_AUTHORIZATION_ID: "nv-owner-approved",
    }), { authorizationId: "nv-owner-approved" });

    const first = plan.artifacts[0];
    writeFileSync(first.absolutePath, Buffer.from("tampered"));
    assert.throws(
      () => inspectNevadaPrecinctBlobPublicationPlan(value),
      /hash or byte count drifted/,
    );
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});
