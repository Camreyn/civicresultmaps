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
  buildMinnesotaPrecinctGisPlan,
  summarizeMinnesotaPrecinctGisPlan,
  verifyPinnedArtifact,
} from "../../scripts/lib/mn-precinct-gis-plan.mjs";

const plan = buildMinnesotaPrecinctGisPlan();
const summary = summarizeMinnesotaPrecinctGisPlan(plan);
const byYear = new Map(plan.years.map((year) => [year.year, year]));

test("Minnesota local GIS plan pins certified reporting units for all tracked elections", () => {
  assert.deepEqual(
    summary.years.map((year) => ({
      year: year.year,
      units: year.reportingUnits,
      resultRows: year.resultRows,
      zero: year.zeroVoteUnits,
      total: year.totals.Total,
    })),
    [
      { year: 2012, units: 4102, resultRows: 12306, zero: 33, total: 2936561 },
      { year: 2016, units: 4120, resultRows: 12360, zero: 31, total: 2944813 },
      { year: 2020, units: 4110, resultRows: 12330, zero: 33, total: 3277171 },
      { year: 2024, units: 4103, resultRows: 12309, zero: 28, total: 3253920 },
    ],
  );
  assert.deepEqual(summary.years.map((year) => year.manifestSha256), [
    "0658bae1392349e5256325ac2a358bf80263235a961dd1e37bad2474d2373194",
    "8c6aa9b074375553abc53a07e90af8db976de03bed7dafde8e6c352849c06031",
    "2a4e0e24e831d760b28a7dc605be3ca56c22020e98b2459d08bc3aaf0c7b5a34",
    "5c1457dcad263610271b3aac3144f2f90773b3648845cec16e74722606d12d0a",
  ]);
  for (const year of plan.years) {
    assert.equal(new Set(year.reportingUnits.map((unit) => unit.code)).size, year.reportingUnits.length);
    assert.equal(new Set(year.reportingUnits.map((unit) => unit.parentGeoid)).size, 87);
    assert.equal(year.resultRows.length, year.reportingUnits.length * 3);
    assert.ok(year.reportingUnits.every((unit) =>
      unit.code.startsWith("reporting:MN:" + year.electionId + ":precinct:")));
  }
});

test("Minnesota local GIS plan loads reviewed geometry for all tracked elections", () => {
  for (const [year, count] of [[2012, 4102], [2016, 4120], [2020, 4110], [2024, 4103]]) {
    const item = byYear.get(year);
    assert.equal(item.geometry.disposition, "loadable_reviewed");
    assert.equal(item.geometry.features.length, count);
    assert.equal(item.geometry.crosswalks.length, count);
    assert.equal(new Set(item.geometry.features.map((row) => row.sourceFeatureId)).size, count);
    assert.ok(item.geometry.crosswalks.every((row) =>
      row.relationshipType === "one_to_one"
      && row.matchMethod === "exact_official_id"
      && row.reviewStatus === "reviewed"
      && row.confidence === "high"));
    assert.equal(item.manifest.delivery, null);
  }
});

test("Minnesota pinned-artifact helper rejects local byte tampering", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-gis-"));
  try {
    mkdirSync(path.join(root, "data"), { recursive: true });
    const artifactPath = path.join(root, "data", "fixture.bin");
    const original = Buffer.from("official retained fixture");
    writeFileSync(artifactPath, original);
    const pinned = {
      artifact: "data/fixture.bin",
      byteCount: original.length,
      sha256: createHash("sha256").update(original).digest("hex"),
    };
    assert.equal(verifyPinnedArtifact(root, pinned, "fixture").byteCount, original.length);
    writeFileSync(artifactPath, Buffer.from("changed"));
    assert.throws(
      () => verifyPinnedArtifact(root, pinned, "fixture"),
      /byte count mismatch|SHA-256 mismatch/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Minnesota GIS database command is local-only and cannot load env files", () => {
  const setup = readFileSync("scripts/setup-mn-precinct-gis-local.mjs", "utf8");
  const validate = readFileSync("scripts/validate-mn-precinct-gis-local.mjs", "utf8");
  const database = readFileSync("scripts/lib/mn-precinct-gis-db.mjs", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const runner = readFileSync("scripts/run-mn-precinct-geometry-tests.mjs", "utf8");
  assert.match(setup, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.match(validate, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.doesNotMatch(setup + validate, /--env-file|from\s+["']dotenv|dotenv\.config/);
  assert.match(database, /getLocalCloneDatabaseUrl\(\{ requireWriteOptIn: true \}\)/);
  assert.match(database, /geometry\.disposition === "blocked"/);
  assert.match(database, /status='blocked'| 'blocked'/);
  assert.match(database, /same_year_result_rows/);
  assert.match(database, /safe_geography_versions/);
  assert.doesNotMatch(database, /runNeonTransaction|@neondatabase/);
  assert.equal(packageJson.scripts["precinct-gis:plan:mn"], "node --experimental-strip-types scripts/setup-mn-precinct-gis-local.mjs");
  assert.equal(packageJson.scripts["precinct-gis:setup:mn:local"], "node --experimental-strip-types scripts/setup-mn-precinct-gis-local.mjs --apply");
  assert.equal(packageJson.scripts["precinct-gis:validate:mn:local"], "node --experimental-strip-types scripts/validate-mn-precinct-gis-local.mjs");
  assert.match(runner, /mn-precinct-gis-local-setup\.test\.mjs/);
  assert.match(runner, /mn-precinct-gis-local-db\.test\.mjs/);
});
