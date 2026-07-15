import assert from "node:assert/strict";
import test from "node:test";
import {
  isLayoutVisitorId,
  selectLayoutVisitorId,
} from "../../src/lib/workspace-layout-visitor.ts";

test("layout rollout visitor IDs accept only UUID v4 values", () => {
  assert.equal(isLayoutVisitorId("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isLayoutVisitorId("550e8400-e29b-11d4-a716-446655440000"), false);
  assert.equal(isLayoutVisitorId("------------------------------------"), false);
  assert.equal(isLayoutVisitorId("visitor@example.com"), false);
});
test("layout rollout visitor selection skips malformed values", () => {
  assert.equal(
    selectLayoutVisitorId("not-a-uuid", "550e8400-e29b-41d4-a716-446655440000"),
    "550e8400-e29b-41d4-a716-446655440000",
  );
  assert.equal(selectLayoutVisitorId("not-a-uuid", undefined), undefined);
});
