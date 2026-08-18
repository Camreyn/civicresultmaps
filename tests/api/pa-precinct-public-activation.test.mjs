import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
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

function copyActivationInputs(root) {
  const packageDirectory = path.dirname(prepared.releaseCandidate.path);
  cpSync(packageDirectory, path.join(root, packageDirectory), { recursive: true });
  for (const relativePath of [
    "data/precinct-geometry-manifests.json",
    "data/precinct-geometry-coverage-inventory-2016.json",
    "data/precinct-geometry-coverage-inventory-2020.json",
    "data/precinct-geometry/PA/2016-11-08-general/manifest.json",
    "data/precinct-geometry/PA/2020-11-03-general/manifest.json",
  ]) {
    const destination = path.join(root, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(relativePath, destination);
  }
}

test("Pennsylvania static activation verifies the two live guarded manifests without stripping fail-closed follow-ups", () => {
  assert.equal(inspected.plan.manifests.length, 2);
  assert.deepEqual(inspected.plan.manifests.map((item) => item.year), [2016, 2020]);
  assert.equal(inspected.plan.trackedOutputs.length, 3);
  const dispositions = new Set(
    inspected.plan.trackedOutputs.map((output) => output.disposition),
  );
  assert.equal(dispositions.size, 1);
  assert.equal([...dispositions][0], "verified_existing");
  const coverage2020Output = inspected.outputs.find((output) =>
    output.path === "data/precinct-geometry-coverage-inventory-2020.json"
  );
  const coverage2020 = JSON.parse(coverage2020Output.bytes.toString("utf8"));
  const pennsylvania2020 = coverage2020.states.find((row) => row.state === "PA");
  assert.deepEqual(pennsylvania2020.geometry.manifestIds, [
    "pa-2020-11-03-reviewed-precinct-geometry-v1",
    "pa-2020-union-county-official-precinct-geometry-candidate-v1",
  ]);
  assert.equal(
    pennsylvania2020.geometry.candidateFollowup.validationStatus,
    "blocked",
  );
  assert.equal(pennsylvania2020.geometry.candidateFollowup.delivery, null);
  assert.equal(inspected.plan.safety.productionMutationPerformed, false);
  assert.equal(inspected.plan.safety.publicEndpointsRemainDatabaseGated, true);
});

test("Pennsylvania activation rejects removed or drifted fail-closed follow-up identity", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-pa-activation-followup-"));
  try {
    copyActivationInputs(root);
    const coveragePath = path.join(
      root,
      "data/precinct-geometry-coverage-inventory-2020.json",
    );
    const original = JSON.parse(readFileSync(coveragePath, "utf8"));
    const pennsylvaniaIndex = original.states.findIndex((row) => row.state === "PA");

    const drifted = structuredClone(original);
    drifted.states[pennsylvaniaIndex].geometry.candidateFollowup.manifestPath =
      "data/precinct-geometry/PA/2020-11-03-general/official-county-followups/substituted/manifest.json";
    writeFileSync(coveragePath, JSON.stringify(drifted, null, 2) + "\n");
    assert.throws(
      () => inspectPennsylvaniaPublicActivationPlan({
        root,
        packagePath: prepared.releaseCandidate.path,
        packageSha256: prepared.releaseCandidate.sha256,
      }),
      /contains a drifted Pennsylvania row/,
    );

    const removed = structuredClone(original);
    removed.states[pennsylvaniaIndex].geometry.manifestIds = [
      "pa-2020-11-03-reviewed-precinct-geometry-v1",
    ];
    delete removed.states[pennsylvaniaIndex].geometry.candidateFollowup;
    delete removed.states[pennsylvaniaIndex].crosswalk.candidateFollowup;
    writeFileSync(coveragePath, JSON.stringify(removed, null, 2) + "\n");
    assert.throws(
      () => inspectPennsylvaniaPublicActivationPlan({
        root,
        packagePath: prepared.releaseCandidate.path,
        packageSha256: prepared.releaseCandidate.sha256,
      }),
      /contains a drifted Pennsylvania row/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
