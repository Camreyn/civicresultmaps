import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("native importer promotes validated staging artifacts only", () => {
  const importer = readFileSync("src/db/native-import.ts", "utf8");
  const script = readFileSync("scripts/promote-native-staging.mjs", "utf8");

  assert.match(importer, /promoteNativeStagingArtifact/);
  assert.match(importer, /Native staging artifact validation did not pass/);
  assert.match(importer, /must not self-authorize production writes/);
  assert.match(importer, /source_documents/);
  assert.match(importer, /result_rows/);
  assert.match(importer, /review_rows/);
  assert.match(importer, /turnout_rows/);
  assert.match(importer, /shouldReplaceResultRows/);
  assert.match(importer, /!artifact\.capabilities\.certifiedResults/);
  assert.match(importer, /shouldReplaceReviewRows/);
  assert.match(importer, /"nativeReviewRows" in native\.metrics/);
  assert.match(importer, /!artifact\.capabilities\.reviewGraphs/);
  assert.match(importer, /delete from analysis_indicators/);
  assert.match(importer, /analysisIndicatorsForNativeRows/);
  assert.match(importer, /insert into analysis_indicators/);
  assert.match(importer, /storedIndicatorRows/);
  assert.match(importer, /reviewPolicy/);
  assert.match(importer, /certified_results = excluded\.certified_results/);
  assert.match(importer, /if \(native\.turnoutRows\.length > 0\)/);
  assert.doesNotMatch(importer, /parseLegacyBundle/);
  assert.match(script, /promoteNativeStagingArtifact/);
});
