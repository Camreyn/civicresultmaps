import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AGE_2012, REPORTS, assertPinnedSource, buildPackage, parseArgs, parseDistrictTotals, refreshRaw } from "../../scripts/collect-ak-historical-registration.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const packagePath = "data/ak-historical-registration";
const packageDir = path.join(root, packagePath);
const sourceBytes = (report) => readFile(path.join(packageDir, "raw", report.rawFile));
const sources = [...REPORTS, AGE_2012];
const generated = ["ak-historical-registration-source-review.json", "ak-historical-registration-by-house-district.csv", "ak-historical-registration-by-source-precinct.csv"];

function replaceRequired(bytes, before, after) {
  const text = bytes.toString("utf8");
  assert.ok(text.includes(before), `Mutation target must exist: ${before}`);
  return Buffer.from(text.replace(before, after));
}
async function isolatedPackage(t) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "crm-ak-registration-"));
  // Only remove the directory returned by this test's own mkdtemp call.
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const dir = path.join(tempRoot, packagePath);
  await cp(packageDir, dir, { recursive: true });
  return { root: tempRoot, dir };
}

for (const report of REPORTS) {
  test(`AK ${report.year}: all source precincts reconcile to named districts and the printed statewide summary`, async () => {
    const bytes = await sourceBytes(report);
    assertPinnedSource(bytes, report);
    const parsed = parseDistrictTotals(bytes, report);
    assert.equal(parsed.precincts.length, report.precinctCount);
    assert.equal(parsed.precinctCount, report.precinctCount);
    assert.equal(parsed.statewideRegisteredVoters, report.statewideRegisteredVoters);
    assert.deepEqual(parsed.districtTotals.map((row) => row.district), Array.from({ length: 40 }, (_, index) => String(index + 1).padStart(2, "0")));
    for (const district of parsed.districtTotals) {
      const rows = parsed.precincts.filter((row) => row.district === district.district);
      assert.equal(rows.length, district.precinctCount);
      assert.equal(rows.reduce((sum, row) => sum + row.registeredVoters, 0), district.registeredVoters);
    }
    assert.equal(new Set(parsed.precincts.map((row) => `${row.district}:${row.sourcePrecinctCode}`)).size, report.precinctCount);
  });
}

test("AK registration preserves source precinct names/codes and the unresolved age-report discrepancy", async () => {
  const parsed = parseDistrictTotals(await sourceBytes(REPORTS[0]), REPORTS[0]);
  assert.deepEqual(parsed.precincts[0], { district: "01", sourcePrecinctCode: "135", sourcePrecinctName: "CHENA LAKES", registeredVoters: 2644 });
  assertPinnedSource(await sourceBytes(AGE_2012), AGE_2012);
  const manifest = await buildPackage({ check: true });
  assert.equal(manifest["2012AgeReportDiscrepancy"].difference, 1);
  assert.equal(manifest.runtimeEffect, "none");
  assert.equal(manifest.reports.reduce((sum, report) => sum + report.parsedPrecinctRowCount, 0), 1320);
  assert.ok(manifest.caveats.some((caveat) => /No registration is allocated/.test(caveat)));
  assert.ok(manifest.caveats.some((caveat) => /not election-day turnout denominators/.test(caveat)));
});

test("AK registration rejects duplicate district identities instead of inferring them from row order", async () => {
  const changed = replaceRequired(await sourceBytes(REPORTS[0]), "DISTRICT 02", "DISTRICT 01");
  assert.throws(() => parseDistrictTotals(changed, REPORTS[0]), /duplicate.*district 01/);
});
test("AK registration rejects a modern precinct prefix inconsistent with its source heading", async () => {
  const changed = replaceRequired(await sourceBytes(REPORTS[1]), "01-446 AURORA", "99-446 AURORA");
  assert.throws(() => parseDistrictTotals(changed, REPORTS[1]), /does not match its published district heading/);
});
test("AK registration rejects duplicate precinct IDs", async () => {
  const changed = replaceRequired(await sourceBytes(REPORTS[1]), "01-455 FAIRBANKS NO. 1", "01-446 FAIRBANKS NO. 1");
  assert.throws(() => parseDistrictTotals(changed, REPORTS[1]), /duplicate or unscoped precinct/);
});
test("AK registration reconciles actual precinct counts rather than trusting advertised counts", async () => {
  const changed = replaceRequired(await sourceBytes(REPORTS[1]), "TOTAL DISTRICT(9 PRECINCTS)", "TOTAL DISTRICT(8 PRECINCTS)");
  assert.throws(() => parseDistrictTotals(changed, REPORTS[1]), /precinct rows do not reconcile/);
});
test("AK registration rejects changed or malformed precinct totals", async () => {
  const bytes = await sourceBytes(REPORTS[0]);
  for (const value of ["2,643", "2,644oops", "2,64", "-1", "1.5"]) {
    const changed = replaceRequired(bytes, "2,644", value);
    assert.throws(() => parseDistrictTotals(changed, REPORTS[0]), /do not reconcile|invalid integer/);
  }
});
test("AK registration requires the explicitly published statewide aggregate in every HTML layout", async () => {
  for (const report of REPORTS) {
    const before = report.year === 2012 ? "(438 PRECINCTS)" : "TOTAL DISTRICT(441 PRECINCTS)";
    const changed = replaceRequired(await sourceBytes(report), before, "REMOVED STATEWIDE SUMMARY");
    assert.throws(() => parseDistrictTotals(changed, report), /published statewide total is missing/);
  }
});
test("AK registration rejects a changed printed statewide value even when district sums match", async () => {
  const changed = replaceRequired(await sourceBytes(REPORTS[1]), ">528879<", ">528878<");
  assert.throws(() => parseDistrictTotals(changed, REPORTS[1]), /published statewide total\/count do not reconcile/);
});
test("AK registration rejects changed snapshot timing", async () => {
  const changed = replaceRequired(await sourceBytes(REPORTS[0]), "11/3/2012", "11/6/2012");
  assert.throws(() => parseDistrictTotals(changed, REPORTS[0]), /changed report date/);
});
test("AK registration pins detect a same-length label change and whitespace-only changes", async () => {
  const source = REPORTS[0];
  const bytes = await sourceBytes(source);
  const changed = replaceRequired(bytes, "CHENA LAKES", "CHENA LAXES");
  assert.equal(changed.length, bytes.length);
  assert.throws(() => assertPinnedSource(changed, source), /SHA-256 mismatch/);
  assert.throws(() => assertPinnedSource(Buffer.concat([bytes, Buffer.from(" ")]), source), /byte\/SHA-256 mismatch/);
});
test("AK registration replay is deterministic and independent of the working directory", async () => {
  await buildPackage({ check: true });
  for (const filename of [...generated, "source-receipts.json"]) {
    assert.equal((await readFile(path.join(packageDir, filename), "utf8")).includes("\r"), false);
  }
});
test("AK registration detects stale generated data and never rewrites it in check mode", async (t) => {
  const { root: isolatedRoot, dir } = await isolatedPackage(t);
  const output = path.join(dir, generated[2]);
  const altered = `${await readFile(output, "utf8")}\n`;
  await writeFile(output, altered);
  await assert.rejects(buildPackage({ root: isolatedRoot, check: true }), /artifact is stale/);
  assert.equal(await readFile(output, "utf8"), altered);
});
test("AK registration does not update derived outputs after an input hash mismatch", async (t) => {
  const { root: isolatedRoot, dir } = await isolatedPackage(t);
  const before = await Promise.all(generated.map((filename) => readFile(path.join(dir, filename), "utf8")));
  await writeFile(path.join(dir, "raw", REPORTS[0].rawFile), "changed source");
  await assert.rejects(buildPackage({ root: isolatedRoot }), /SHA-256 mismatch/);
  assert.deepEqual(await Promise.all(generated.map((filename) => readFile(path.join(dir, filename), "utf8"))), before);
});
test("AK registration requires a real, matching retrieval receipt for every source", async (t) => {
  const { root: isolatedRoot, dir } = await isolatedPackage(t);
  const receiptPath = path.join(dir, "source-receipts.json");
  const receipts = JSON.parse(await readFile(receiptPath, "utf8"));
  receipts[0].retrievedAt = "not a timestamp";
  await writeFile(receiptPath, JSON.stringify(receipts));
  await assert.rejects(buildPackage({ root: isolatedRoot }), /mismatched source receipt/);
});
test("AK registration refresh rejects changed source bytes before writing any raw file or receipt", async (t) => {
  const { root: isolatedRoot, dir } = await isolatedPackage(t);
  const receiptPath = path.join(dir, "source-receipts.json");
  const receiptsBefore = await readFile(receiptPath, "utf8");
  await assert.rejects(refreshRaw({ root: isolatedRoot, fetchSource: async (url) => {
    const source = sources.find((candidate) => candidate.url === url);
    const bytes = await sourceBytes(source);
    return { ok: true, url, arrayBuffer: async () => source === AGE_2012 ? Buffer.concat([bytes, Buffer.from(" ")]) : bytes };
  } }), /SHA-256 mismatch/);
  assert.equal(await readFile(receiptPath, "utf8"), receiptsBefore);
  for (const source of sources) assertPinnedSource(await readFile(path.join(dir, "raw", source.rawFile)), source);
  assert.equal((await readdir(path.join(dir, "raw"))).length, 4);
});
test("AK registration refresh records collection time while accepting only pinned sources", async (t) => {
  const { root: isolatedRoot, dir } = await isolatedPackage(t);
  const time = "2026-09-06T09:15:00.123Z";
  await refreshRaw({ root: isolatedRoot, now: () => new Date(time), fetchSource: async (url) => {
    const source = sources.find((candidate) => candidate.url === url);
    return { ok: true, url, arrayBuffer: () => sourceBytes(source) };
  } });
  const receipts = JSON.parse(await readFile(path.join(dir, "source-receipts.json"), "utf8"));
  assert.equal(receipts.length, 4);
  assert.ok(receipts.every((receipt) => receipt.retrievedAt === time));
  await buildPackage({ root: isolatedRoot });
  await buildPackage({ root: isolatedRoot, check: true });
});
test("AK registration CLI rejects unknown, duplicate, and contradictory flags", () => {
  assert.deepEqual(parseArgs([]), { check: false, refresh: false });
  assert.deepEqual(parseArgs(["--check"]), { check: true, refresh: false });
  for (const args of [["--check", "--refresh"], ["--check", "--check"], ["--publish"]]) {
    assert.throws(() => parseArgs(args), /Usage:/);
  }
});
