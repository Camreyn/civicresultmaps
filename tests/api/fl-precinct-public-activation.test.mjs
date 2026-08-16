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
import { inspectFloridaPublicActivationPlan } from "../../scripts/lib/fl-precinct-public-activation.mjs";
import { writeFloridaActivationTrackedOutputs } from "../../scripts/prepare-fl-precinct-public-activation.mjs";
import { buildFloridaTestReleaseFixture } from "./fl-precinct-release-fixture.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const coverage = JSON.parse(readFileSync(
  "data/precinct-geometry-coverage-inventory-2016.json",
  "utf8",
));
const existingFloridaRow = coverage.states.find((row) => row.state === "FL");
const { prepared } = await buildFloridaTestReleaseFixture({
  write: true,
  generatedAtUtc: existingFloridaRow?.checkedAt,
});
const inspected = inspectFloridaPublicActivationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});

test("Florida static activation adds or verifies exactly three guarded manifests", () => {
  assert.equal(inspected.plan.manifests.length, 3);
  assert.deepEqual(inspected.plan.manifests.map((item) => item.year), [2016, 2020, 2024]);
  assert.equal(inspected.plan.trackedOutputs.length, 4);
  const dispositions = new Set(
    inspected.plan.trackedOutputs.map((output) => output.disposition),
  );
  assert.equal(dispositions.size, 1);
  assert.ok(["activate", "verified_existing"].includes([...dispositions][0]));
  assert.equal(inspected.plan.safety.productionMutationPerformed, false);
  assert.equal(inspected.plan.safety.publicEndpointsRemainDatabaseGated, true);
});

test("Florida activation atomically writes its registry and three inventories", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-fl-activation-"));
  try {
    const outputs = Array.from({ length: 4 }, (_, index) => {
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
    assert.equal(writeFloridaActivationTrackedOutputs(outputs).length, 4);
    for (const output of outputs) {
      assert.deepEqual(readFileSync(output.absolutePath), output.bytes);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
