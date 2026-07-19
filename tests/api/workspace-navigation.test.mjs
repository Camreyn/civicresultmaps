import assert from "node:assert/strict";
import test from "node:test";
import {
  workspaceNavigationContextFromSearchParams,
  workspaceNavigationHref,
  workspaceStateHref,
} from "../../src/lib/workspace-navigation.ts";

const mapContext = {
  fips: "53033",
  mode: "margin",
  state: "WA",
  tab: "map",
  year: 2020,
};

test("state selection preserves valid map context but clears state-specific geography", () => {
  assert.equal(
    workspaceStateHref(mapContext, "OR"),
    "/?state=OR&year=2020&tab=map&mode=margin",
  );
});

test("secondary workspace destinations retain their tab and canonical 2024 context", () => {
  assert.equal(
    workspaceStateHref({ ...mapContext, tab: "review" }, "OR"),
    "/?state=OR&year=2024&tab=review",
  );
});

test("historical navigation removes administration-only map layers", () => {
  assert.equal(
    workspaceNavigationHref({ ...mapContext, mode: "equipment", year: 2016 }),
    "/?state=WA&year=2016&tab=map&fips=53033",
  );
});

test("live URL context does not resurrect a cleared geography or map layer", () => {
  assert.deepEqual(
    workspaceNavigationContextFromSearchParams(
      new URLSearchParams("state=WA&year=2024&tab=map"),
      { ...mapContext, year: 2024 },
    ),
    {
      fips: undefined,
      mode: undefined,
      state: "WA",
      tab: "map",
      year: 2024,
    },
  );
});
