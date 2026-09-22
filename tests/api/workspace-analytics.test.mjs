import assert from "node:assert/strict";
import test from "node:test";
import { supportedPresidentialYears } from "../../src/lib/api-version.ts";
import { usStateOptions } from "../../src/lib/us-states.ts";
import { stateLoadedEventName, stateLoadProperties } from "../../src/lib/workspace-analytics.ts";

test("state loads use one event name and three bounded scalar properties", () => {
  assert.equal(stateLoadedEventName, "state_loaded");
  for (const [state] of usStateOptions) {
    for (const year of supportedPresidentialYears) {
      for (const selection of ["default", "explicit"]) {
        assert.deepEqual(stateLoadProperties(state, year, selection), { state, year, selection });
      }
    }
  }
});

test("default and URL-supplied state loads remain distinguishable", () => {
  assert.deepEqual(stateLoadProperties("WA", 2024, "default"), {
    state: "WA", year: 2024, selection: "default",
  });
  assert.deepEqual(stateLoadProperties("WA", 2024, "explicit"), {
    state: "WA", year: 2024, selection: "explicit",
  });
});

test("unrecognized or raw query values are not sent to analytics", () => {
  for (const state of ["", "XX", "wa", "Washington", "WA&search=private", null, undefined]) {
    assert.equal(stateLoadProperties(state, 2024, "explicit"), null);
  }
  for (const year of [2008, 2028, "2024", NaN, Infinity, null, undefined]) {
    assert.equal(stateLoadProperties("WA", year, "explicit"), null);
  }
  for (const selection of ["clicked", "", "private query", null, undefined]) {
    assert.equal(stateLoadProperties("WA", 2024, selection), null);
  }
});
