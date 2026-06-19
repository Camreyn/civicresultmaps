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
  assert.match(importer, /if \(native\.resultRows\.length > 0\)/);
  assert.match(importer, /if \(native\.reviewRows\.length > 0\)/);
  assert.match(importer, /if \(native\.turnoutRows\.length > 0\)/);
  assert.doesNotMatch(importer, /parseLegacyBundle/);
  assert.match(script, /promoteNativeStagingArtifact/);
});
