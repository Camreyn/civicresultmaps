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
  buildMinnesotaReleaseOverlay,
} from "../../scripts/lib/mn-precinct-release-overlay.mjs";
import {
  prepareMinnesotaReleaseOverlay,
} from "../../scripts/prepare-mn-precinct-release-overlay.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function write(root, relativePath, bytes) {
  const target = path.join(root, ...relativePath.split("/"));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return { path: relativePath, byteCount: bytes.length, sha256: sha256(bytes) };
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-overlay-"));
  const packageBytes = Buffer.from(JSON.stringify({
    scripts: {
      "precinct-gis:plan:mn": "node scripts/setup-mn-precinct-gis-local.mjs",
      "etl:normalize:ia:precinct-geometry": "node scripts/ia.mjs",
      unrelated: "node other.mjs",
    },
    dependencies: { postgres: "^3.4.9", shpjs: "6.2.0" },
  }) + "\n");
  const packageLockBytes = Buffer.from(JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": {
        dependencies: {
          "@modelcontextprotocol/client": "2.0.0",
          postgres: "^3.4.9",
          shpjs: "6.2.0",
        },
      },
      "node_modules/@modelcontextprotocol/client": { version: "2.0.0" },
      "node_modules/postgres": { version: "3.4.9" },
      "node_modules/shpjs": {
        version: "6.2.0",
        dependencies: {
          "but-unzip": "^0.1.4",
          parsedbf: "^2.0.0",
          proj4: "^2.1.4",
        },
      },
      "node_modules/but-unzip": { version: "0.1.10" },
      "node_modules/parsedbf": { version: "2.0.0" },
      "node_modules/proj4": {
        version: "2.21.0",
        dependencies: { mgrs: "1.0.0", "wkt-parser": "^1.5.5" },
      },
      "node_modules/mgrs": { version: "1.0.0" },
      "node_modules/wkt-parser": { version: "1.5.6" },
    },
  }) + "\n");
  const scriptBytes = Buffer.from("console.log('precinct');\n");
  const tiersBytes = Buffer.from(JSON.stringify({
    checkedAt: "2026-08-08",
    states: [{ state: "MN", tier: "official" }, { state: "WI", tier: "official" }],
  }) + "\n");
  const sourceBytes = Buffer.from("official source bytes");
  const packageFile = write(root, "package.json", packageBytes);
  const packageLockFile = write(root, "package-lock.json", packageLockBytes);
  const scriptFile = write(root, "scripts/foo.mjs", scriptBytes);
  const tiersFile = write(root, "data/source-acquisition-tiers.json", tiersBytes);
  const sourceFile = write(root, "data/source.bin", sourceBytes);
  const releaseDocument = {
    schemaVersion: 1,
    id: "mn-precinct-gis-four-election-v1",
    state: "MN",
    scopedFileInventory: {
      releaseDependencies: [packageFile, packageLockFile, scriptFile],
      sharedReviewFiles: [tiersFile],
      sourceAndDataArtifacts: [sourceFile],
    },
  };
  const releasePath =
    ".etl/precinct-release-candidates/MN/mn-precinct-gis-four-election-v1-test/release-candidate.json";
  write(root, releasePath, Buffer.from(JSON.stringify(releaseDocument) + "\n"));
  const basePackage = Buffer.from("{\"scripts\":{}}\n");
  function gitInspector(_root, args) {
    const joined = args.join(" ");
    if (args[0] === "cat-file") {
      return { status: joined.includes("HEAD:package.json") ? 0 : 1, stdout: Buffer.alloc(0) };
    }
    if (args[0] === "show") return { status: 0, stdout: basePackage };
    if (args[0] === "diff") {
      return { status: 0, stdout: Buffer.from("diff --git a/package.json b/package.json\n") };
    }
    throw new Error("Unexpected fake Git call: " + joined);
  }
  return { root, releasePath, gitInspector };
}

test("Minnesota release overlay isolates exact bytes and exposes shared review work", () => {
  const item = fixture();
  try {
    const built = buildMinnesotaReleaseOverlay({
      root: item.root,
      packagePath: item.releasePath,
      gitInspector: item.gitInspector,
    });
    assert.equal(built.document.decision, "REVIEW_REQUIRED");
    assert.deepEqual(built.document.summary, {
      overlayFiles: 4,
      addedFiles: 3,
      modifiedFiles: 1,
      unchangedFiles: 0,
      exactMachineVerifiedFiles: 1,
      humanReviewRequiredFiles: 3,
      sourceArtifactReferences: 1,
    });
    assert.equal(built.document.projections.length, 3);
    assert.ok(built.document.projections.every((projection) => projection.sha256));
    assert.ok(built.outputs.some((output) => output.path === "files/scripts/foo.mjs"));
    assert.ok(built.outputs.some((output) => output.path === "patches/package.json.patch"));
    const packageProjection = JSON.parse(
      built.outputs.find((output) => output.path === "projections/package.json").bytes,
    );
    assert.deepEqual(Object.keys(packageProjection.scripts), ["precinct-gis:plan:mn"]);
    const lockProjection = JSON.parse(
      built.outputs.find((output) => output.path === "projections/package-lock.json").bytes,
    );
    assert.equal(lockProjection.packages["node_modules/@modelcontextprotocol/client"], undefined);
    assert.equal(Object.keys(lockProjection.packages).length, 7);
    assert.equal(
      built.document.sourceAndDataArtifactReferences[0].copiedIntoOverlay,
      false,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota release overlay writes immutably and then verifies existing bytes", () => {
  const item = fixture();
  try {
    const first = prepareMinnesotaReleaseOverlay({
      root: item.root,
      packagePath: item.releasePath,
      gitInspector: item.gitInspector,
      write: true,
    });
    assert.equal(first.mode, "write");
    assert.ok(first.files.every((file) => file.disposition === "created"));
    const second = prepareMinnesotaReleaseOverlay({
      root: item.root,
      packagePath: item.releasePath,
      gitInspector: item.gitInspector,
      write: true,
    });
    assert.ok(second.files.every((file) => file.disposition === "verified_existing"));
    const overlay = JSON.parse(readFileSync(path.join(item.root, ...first.output.split("/")), "utf8"));
    assert.equal(overlay.productionMutationPerformed, false);
    assert.equal(overlay.gitMutationPerformed, false);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});
