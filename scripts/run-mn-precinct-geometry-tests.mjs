import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// This release-scoped suite covers the shared precinct contracts plus every
// Minnesota, release-safety, rehearsal, and OpenStreetMap test included here.
const TEST_FILES = [
  "tests/api/precinct-source-package-contract.test.mjs",
  "tests/api/precinct-geography-schema.test.mjs",
  "tests/api/precinct-reporting-unit-import.test.mjs",
  "tests/api/precinct-delivery-server.test.mjs",
  "tests/api/precinct-map-delivery.test.mjs",
  "tests/api/precinct-map-ui.test.mjs",
  "tests/api/mn-precinct-geometry.test.mjs",
  "tests/api/mn-2012-precinct-geometry.test.mjs",
  "tests/api/mn-2016-precinct-geometry.test.mjs",
  "tests/api/mn-2020-precinct-geometry.test.mjs",
  "tests/api/mn-precinct-delivery-candidates.test.mjs",
  "tests/api/mn-precinct-gis-local-db.test.mjs",
  "tests/api/mn-precinct-gis-local-setup.test.mjs",
  "tests/api/mn-precinct-local-rehearsal.test.mjs",
  "tests/api/mn-precinct-production-release.test.mjs",
  "tests/api/mn-precinct-release-candidate.test.mjs",
  "tests/api/mn-precinct-release-overlay.test.mjs",
  "tests/api/mn-precinct-release-review.test.mjs",
  "tests/api/mn-zero-vote-precinct-display.test.mjs",
  "tests/api/precinct-openstreetmap-basemap.test.mjs",
];

if (new Set(TEST_FILES).size !== TEST_FILES.length) {
  throw new Error("Minnesota precinct geometry test list contains duplicate paths");
}

for (const testFile of TEST_FILES) {
  if (!existsSync(testFile)) {
    throw new Error(`Minnesota precinct geometry test file is missing: ${testFile}`);
  }
  console.log(`\n> ${testFile}`);
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", testFile],
    { stdio: "inherit", windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`\nMinnesota precinct geometry suite passed (${TEST_FILES.length} files).`);
