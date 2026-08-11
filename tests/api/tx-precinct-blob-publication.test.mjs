import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  inspectTexasPrecinctBlobPublicationPlan,
  validateTexasBlobPublicationAuthorization,
} from "../../scripts/lib/tx-precinct-blob-publication.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "crm-tx-blob-"));
  const packageRoot = ".etl/precinct-release-candidates/TX/tx-fixture";
  const years = [2012, 2016, 2020, 2024].map((year) => {
    const electionDate = year === 2012
      ? "2012-11-06"
      : year === 2016
        ? "2016-11-08"
        : year === 2020
          ? "2020-11-03"
          : "2024-11-05";
    const assetRoot = `delivery-assets/tx-${year}`;
    const publicRoot = `/data/geography/tx/${electionDate}/precinct/tx-${year}`;
    const parents = Array.from({ length: 254 }, (_, index) => {
      const county = 1 + index * 2;
      const parentGeoid = "48" + String(county).padStart(3, "0");
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
      certifiedResults: { reportingUnits: 254 },
      parentScopedDelivery: {
        format: "parent_scoped_geojson",
        publicationPerformed: false,
        electionValuesInDelivery: false,
        parentCount: 254,
        featureCount: 254,
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
    id: "tx-precinct-gis-four-election-v1",
    state: "TX",
    decision: "NO_GO_PRODUCTION",
    safety: {
      publicFileWritten: false,
      canonicalManifestChanged: false,
      publicEligibilityChanged: false,
    },
    totals: { elections: 4 },
    years,
  };
  const bytes = Buffer.from(JSON.stringify(document) + "\n");
  const packagePath = `${packageRoot}/release-candidate.json`;
  writeFileSync(path.join(root, ...packagePath.split("/")), bytes);
  return { root, packagePath, packageSha256: sha256(bytes) };
}

test("Texas Blob plan pins 1,016 county files before four indexes", () => {
  const value = fixture();
  try {
    const plan = inspectTexasPrecinctBlobPublicationPlan(value);
    assert.equal(plan.assetCount, 1020);
    assert.equal(plan.parentArtifactCount, 1016);
    assert.equal(plan.indexCount, 4);
    assert.equal(plan.uploadOrder, "all parent artifacts before indexes");
    assert.ok(plan.artifacts.slice(0, 1016).every((item) => item.kind === "parent"));
    assert.ok(plan.artifacts.slice(1016).every((item) => item.kind === "index"));
    assert.throws(
      () => validateTexasBlobPublicationAuthorization(plan, {}),
      /not explicitly authorized/,
    );
    assert.deepEqual(validateTexasBlobPublicationAuthorization(plan, {
      CRM_TX_PRECINCT_PUBLIC_FILE_WRITES:
        "I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD",
      CRM_TX_PRECINCT_PUBLIC_FILE_PACKAGE_SHA256: value.packageSha256,
      CRM_TX_PRECINCT_PUBLIC_FILE_AUTHORIZATION_ID: "tx-owner-approved",
    }), { authorizationId: "tx-owner-approved" });

    const first = plan.artifacts[0];
    writeFileSync(first.absolutePath, Buffer.from("tampered"));
    assert.throws(
      () => inspectTexasPrecinctBlobPublicationPlan(value),
      /hash or byte count drifted/,
    );
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});
