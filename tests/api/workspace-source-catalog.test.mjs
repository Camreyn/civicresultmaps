import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterAndSortWorkspaceSources } from "../../src/lib/workspace-source-catalog.ts";

function source(overrides) {
  return {
    authority: "Secretary of State",
    category: "results",
    confidence: "Official certified results",
    electionYear: 2024,
    id: "source-default",
    localArtifact: "data/default.csv",
    parser: "scripts/import-default.ts",
    sourceUrl: "https://example.gov/results",
    state: "WA",
    status: "loaded",
    timestampBasis: "certified",
    title: "Certified results",
    ...overrides,
  };
}

const sources = [
  source({ id: "loaded-z", title: "Zeta results" }),
  source({ category: "turnout", id: "missing-a", sourceUrl: "", status: "needs_data", title: "Alpha turnout" }),
  source({ category: "equipment", id: "candidate-b", parser: "scripts/import-verifier.ts", status: "candidate", title: "Beta equipment" }),
];

test("source catalog search covers provenance fields and composes filters", () => {
  const filtered = filterAndSortWorkspaceSources(sources, {
    category: "equipment",
    link: "linked",
    query: "verifier",
    sort: "grouped",
    status: "candidate",
  });
  assert.deepEqual(filtered.map((item) => item.id), ["candidate-b"]);
});

test("source catalog attention sorting puts missing links and actionable statuses first", () => {
  const sorted = filterAndSortWorkspaceSources(sources, {
    category: "all",
    link: "all",
    query: "",
    sort: "attention",
    status: "all",
  });
  assert.deepEqual(sorted.map((item) => item.id), ["missing-a", "candidate-b", "loaded-z"]);
});

test("source catalog returns an empty result for nonmatching filters without mutating input", () => {
  const original = sources.map((item) => item.id);
  const filtered = filterAndSortWorkspaceSources(sources, {
    category: "turnout",
    link: "linked",
    query: "",
    sort: "title",
    status: "all",
  });
  assert.deepEqual(filtered, []);
  assert.deepEqual(sources.map((item) => item.id), original);
});

test("source catalog variants remain distinct and initial disclosure changes reach the live preview", () => {
  const component = readFileSync("src/app/workspace-source-catalog.tsx", "utf8");

  assert.match(component, /variant === "expanded"/);
  assert.match(component, /variant === "summary"/);
  assert.match(component, /source-catalog-summary-grid/);
  assert.match(component, /setOpen\(initiallyOpen\)/);
  assert.match(component, /source-catalog-disclosure/);
});
