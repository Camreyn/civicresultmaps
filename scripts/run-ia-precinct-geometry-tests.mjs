import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const TEST_FILES = [
  "tests/api/precinct-geography-schema.test.mjs",
  "tests/api/precinct-parent-delivery-builder.test.mjs",
  "tests/api/precinct-map-delivery.test.mjs",
  "tests/api/mn-precinct-result-publication-gate.test.mjs",
  "tests/api/ia-precinct-geometry.test.mjs",
  "tests/api/ia-precinct-gis-plan.test.mjs",
  "tests/api/ia-precinct-gis-local.test.mjs",
  "tests/api/ia-precinct-release-candidate.test.mjs",
  "tests/api/ia-precinct-blob-publication.test.mjs",
  "tests/api/ia-precinct-production-release.test.mjs",
  "tests/api/ia-precinct-public-activation.test.mjs",
  "tests/api/ia-precinct-publication.test.mjs",
  "tests/api/ia-precinct-publication-gate.test.mjs",
  "tests/api/precinct-map-ui.test.mjs",
  "tests/api/tx-precinct-publication-gate.test.mjs",
];

if (new Set(TEST_FILES).size !== TEST_FILES.length) {
  throw new Error("Iowa precinct geometry test list contains duplicate paths");
}

for (const testFile of TEST_FILES) {
  if (!existsSync(testFile)) {
    throw new Error("Iowa precinct geometry test file is missing: " + testFile);
  }
  console.log("\n> " + testFile);
  const result = spawnSync(
    process.execPath,
    ["--max-old-space-size=4096", "--experimental-strip-types", testFile],
    { stdio: "inherit", windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(
  "\nIowa precinct geometry suite passed (" + TEST_FILES.length + " files).",
);
