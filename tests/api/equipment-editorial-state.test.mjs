import assert from "node:assert/strict";
import test from "node:test";

import { assertEquipmentClaimSourceRevisionsReady } from "../../scripts/equipment-editorial-policy.mjs";

const manifest = {
  sources: [{
    currentReviewedRevisionId: "revision-new",
    id: "source-a",
    revisions: [
      { archiveStatus: "verified", id: "revision-old" },
      { archiveStatus: "verified", id: "revision-new" },
    ],
  }],
};

function claim(pinnedRevisionId) {
  return { editorial: { sourceRevisionIds: [pinnedRevisionId] } };
}

test("equipment publication rejects a stale verified source revision", () => {
  assert.throws(
    () => assertEquipmentClaimSourceRevisionsReady({
      claim: claim("revision-old"),
      manifest,
      slug: "fixture-system",
      targetState: "published",
    }),
    /cannot advance with stale source revision revision-old; the current reviewed revision is revision-new/,
  );
});

test("equipment publication accepts the current verified source revision", () => {
  assert.doesNotThrow(() => assertEquipmentClaimSourceRevisionsReady({
    claim: claim("revision-new"),
    manifest,
    slug: "fixture-system",
    targetState: "published",
  }));
});

test("moving a stale claim back to review remains possible", () => {
  assert.doesNotThrow(() => assertEquipmentClaimSourceRevisionsReady({
    claim: claim("revision-old"),
    manifest,
    slug: "fixture-system",
    targetState: "in_review",
  }));
});
