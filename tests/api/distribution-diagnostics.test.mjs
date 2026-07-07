import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync("src/lib/distribution-diagnostics.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const moduleScope = { exports: {} };
vm.runInNewContext(compiled.outputText, { module: moduleScope, exports: moduleScope.exports });
const { buildVoteShareDistributionDiagnostics, voteShareBucketIndex } = moduleScope.exports;

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

function buckets(values) {
  return values.map((value, index) => ({
    high: (index + 1) * 10,
    label: `${index * 10}-${(index + 1) * 10}%`,
    low: index * 10,
    rowCount: value > 0 ? 3 : 0,
    value,
  }));
}

test("vote share bucket assignment clamps edge values", () => {
  assert.equal(voteShareBucketIndex(-12), 0);
  assert.equal(voteShareBucketIndex(0), 0);
  assert.equal(voteShareBucketIndex(49.9), 4);
  assert.equal(voteShareBucketIndex(50), 5);
  assert.equal(voteShareBucketIndex(100), 9);
  assert.equal(voteShareBucketIndex(118), 9);
});

test("clean unimodal distributions mostly score healthy", () => {
  const diagnostics = buildVoteShareDistributionDiagnostics(buckets([1, 3, 8, 15, 22, 18, 12, 7, 3, 1]));
  const healthyOrNeutral = diagnostics.filter((bucket) => bucket.severity === "healthy" || bucket.severity === "neutral");

  assert.equal(healthyOrNeutral.length, diagnostics.length);
});

test("zero valley between populated buckets scores severe", () => {
  const diagnostics = buildVoteShareDistributionDiagnostics(buckets([1, 4, 12, 0, 18, 13, 7, 3, 1, 0]));
  const valley = diagnostics[3];

  assert.equal(valley.severity, "severe");
  assert.match(valley.reason, /Zero-count valley/);
});

test("secondary local maximum near the main peak scores severe", () => {
  const diagnostics = buildVoteShareDistributionDiagnostics(buckets([1, 3, 18, 8, 20, 12, 7, 3, 1, 0]));
  const secondaryPeak = diagnostics[2];

  assert.equal(secondaryPeak.severity, "severe");
  assert.match(secondaryPeak.reason, /Secondary local maximum/);
});

test("sparse distributions stay neutral instead of over-scoring", () => {
  const diagnostics = buildVoteShareDistributionDiagnostics(buckets([0, 0, 0, 12, 0, 0, 0, 0, 0, 0]));

  assert.ok(diagnostics.every((bucket) => bucket.severity === "neutral"));
});
