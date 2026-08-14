import assert from "node:assert/strict";
import test from "node:test";
import {
  contextualizeWorkspaceHref,
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

test("exports preserve the selected historical election while removing map-only context", () => {
  assert.equal(
    workspaceStateHref({ ...mapContext, tab: "exports" }, "AK"),
    "/?state=AK&year=2020&tab=exports",
  );

  assert.deepEqual(
    workspaceNavigationContextFromSearchParams(
      new URLSearchParams("state=AK&year=2016&tab=exports&mode=margin&fips=02020"),
      mapContext,
    ),
    {
      fips: undefined,
      mode: undefined,
      state: "AK",
      tab: "exports",
      year: 2016,
    },
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

test("custom workspace links inherit state context and discard map-only context for secondary tabs", () => {
  const href = contextualizeWorkspaceHref("/?tab=data&view=sources&fips=01001#catalog", mapContext);
  const url = new URL(href, "https://civicresultmaps.local");
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("state"), "WA");
  assert.equal(url.searchParams.get("year"), "2024");
  assert.equal(url.searchParams.get("tab"), "data");
  assert.equal(url.searchParams.get("view"), "sources");
  assert.equal(url.searchParams.has("fips"), false);
  assert.equal(url.searchParams.has("mode"), false);
  assert.equal(url.hash, "#catalog");
});

test("custom exports links inherit the selected historical election", () => {
  const href = contextualizeWorkspaceHref("/?tab=exports#downloads", mapContext);
  const url = new URL(href, "https://civicresultmaps.local");
  assert.equal(url.searchParams.get("state"), "WA");
  assert.equal(url.searchParams.get("year"), "2020");
  assert.equal(url.searchParams.get("tab"), "exports");
  assert.equal(url.searchParams.has("fips"), false);
  assert.equal(url.searchParams.has("mode"), false);
  assert.equal(url.hash, "#downloads");
});

test("bare workspace links retain map context while external and non-workspace paths remain unchanged", () => {
  assert.equal(
    contextualizeWorkspaceHref("/", mapContext),
    "/?state=WA&year=2020&tab=map&mode=margin&fips=53033",
  );
  assert.equal(contextualizeWorkspaceHref("/developers", mapContext), "/developers");
  assert.equal(contextualizeWorkspaceHref("https://example.com", mapContext), "https://example.com");
});
