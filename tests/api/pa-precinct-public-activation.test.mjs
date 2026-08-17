import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectPennsylvaniaPublicActivationPlan } from "../../scripts/lib/pa-precinct-public-activation.mjs";
import {
  writePennsylvaniaActivationEvidenceThenTrackedOutputs,
  writePennsylvaniaActivationTrackedOutputs,
} from "../../scripts/prepare-pa-precinct-public-activation.mjs";
import { buildPennsylvaniaTestReleaseFixture } from "./pa-precinct-release-fixture.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const coverage = JSON.parse(readFileSync(
  "data/precinct-geometry-coverage-inventory-2016.json",
  "utf8",
));
const existingPennsylvaniaRow = coverage.states.find((row) => row.state === "PA");
const { prepared } = await buildPennsylvaniaTestReleaseFixture({
  write: true,
  generatedAtUtc: existingPennsylvaniaRow?.checkedAt,
});
const inspected = inspectPennsylvaniaPublicActivationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});

test("Pennsylvania static activation adds or verifies exactly two guarded manifests", () => {
  assert.equal(inspected.plan.manifests.length, 2);
  assert.deepEqual(inspected.plan.manifests.map((item) => item.year), [2016, 2020]);
  assert.equal(inspected.plan.trackedOutputs.length, 3);
  const dispositions = new Set(
    inspected.plan.trackedOutputs.map((output) => output.disposition),
  );
  assert.equal(dispositions.size, 1);
  assert.ok(["activate", "verified_existing"].includes([...dispositions][0]));
  assert.equal(inspected.plan.safety.productionMutationPerformed, false);
  assert.equal(inspected.plan.safety.publicEndpointsRemainDatabaseGated, true);
});

test("Pennsylvania activation atomically writes its registry and two inventories", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-pa-activation-"));
  try {
    const outputs = Array.from({ length: 3 }, (_, index) => {
      const absolutePath = path.join(root, `target-${index}.json`);
      const before = Buffer.from(`before-${index}\n`, "utf8");
      const bytes = Buffer.from(`after-${index}\n`, "utf8");
      writeFileSync(absolutePath, before);
      return {
        path: `data/target-${index}.json`,
        absolutePath,
        preimage: { byteCount: before.length, sha256: sha256(before) },
        byteCount: bytes.length,
        sha256: sha256(bytes),
        bytes,
      };
    });
    assert.equal(writePennsylvaniaActivationTrackedOutputs(outputs).length, 3);
    for (const output of outputs) {
      assert.deepEqual(readFileSync(output.absolutePath), output.bytes);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Pennsylvania activation persists immutable evidence before tracked outputs", () => {
  const calls = [];
  const built = {
    outputPath: ".etl/precinct-public-activations/PA/evidence.json",
    bytes: Buffer.from("evidence\n", "utf8"),
    outputs: [{ path: "data/precinct-geometry-manifests.json" }],
  };
  const committed = writePennsylvaniaActivationEvidenceThenTrackedOutputs(
    process.cwd(),
    built,
    {
      writeEvidence: () => {
        calls.push("evidence");
        return "created";
      },
      writeTrackedOutputs: () => {
        calls.push("tracked");
        return [{ path: built.outputs[0].path }];
      },
    },
  );
  assert.deepEqual(calls, ["evidence", "tracked"]);
  assert.equal(committed.evidenceDisposition, "created");

  let trackedWriteAttempted = false;
  assert.throws(() => writePennsylvaniaActivationEvidenceThenTrackedOutputs(
    process.cwd(),
    built,
    {
      writeEvidence: () => {
        throw new Error("evidence write failed");
      },
      writeTrackedOutputs: () => {
        trackedWriteAttempted = true;
        return [];
      },
    },
  ), /evidence write failed/);
  assert.equal(trackedWriteAttempted, false);
});
