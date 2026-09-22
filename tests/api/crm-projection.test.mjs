import assert from "node:assert/strict";
import test from "node:test";
import { compareFamilyRows, calculateStagedIndicators, sourceProjectionContext } from "../../tools/civicresultmaps-mcp/projection.ts";
import { createRuntimeContext } from "../../tools/civicresultmaps-mcp/runtime.ts";
const scope = { state: "DC", year: 2024 };

test("actual native results compare to grouped API rows without generated identifiers", () => {
  const native = { level: "county", jurisdictionName: "District of Columbia", votes: { Harris: 12, Trump: 3, Other: 1 }, sourceId: "certified" };
  const api = { ...native, state: "DC", year: 2024, id: "database-id", jurisdictionCode: "DC-DISTRICT-OF-COLUMBIA", jurisdictionTag: "county:11001", totalVotes: 16, marginPct: 40 };
  const same = compareFamilyRows("results", [native], [api], scope);
  assert.deepEqual(same.counts, { staged: 1, live: 1, added: 0, removed: 0, changed: 0 });
  assert.equal(compareFamilyRows("results", [native], [{ ...api, votes: { Harris: 11, Trump: 4, Other: 1 } }], scope).counts.changed, 1);
  assert.equal(compareFamilyRows("results", [native, native], [api], scope).status, "fail");
});

test("review and turnout use importer name, candidate-neutral and denominator transformations", () => {
  const native = { county: "District of Columbia", localUnit: "001", level: "precinct", harris: 12, trump: 3, harrisShare: 80, trumpShare: 20, totalVotes: 15, sourceId: "s", comparisonDemVotes: 10, comparisonRepVotes: 4 };
  const api = { state: "DC", electionYear: 2024, jurisdictionName: native.county, localUnit: "001", level: "precinct", demVotes: 12, repVotes: 3, demShare: 80, repShare: 20, totalVotes: 15, sourceId: "s", metrics: native };
  assert.equal(compareFamilyRows("review", [native], [api], scope).counts.changed, 0);
  const turnout = { county: native.county, localUnit: "001", ballotsCast: 15, sourceId: "s", denominatorType: "registration" };
  const delivered = { state: "DC", electionYear: 2024, jurisdictionName: "District of Columbia / 001", level: "local", ballotsCast: 15, sourceId: "s", denominatorNote: "registration", warningRequired: false, registeredVoters: null, turnoutPct: null };
  assert.equal(compareFamilyRows("turnout", [turnout], [delivered], scope).counts.changed, 0);
});

test("historical years, grain and explicit tags are preserved", () => {
  const row = { electionYear: 2020, sourceLevel: "county", jurisdictionName: "District of Columbia", localUnit: "county", sourceId: "s", demVotes: 10, repVotes: 2, otherVotes: 1, totalVotes: 13, rowMethod: "official" };
  assert.equal(compareFamilyRows("historical", [row], [{ ...row, state: "DC", sourceDocumentId: "s", id: "db-id" }], scope).counts.changed, 0);
  const mismatch = compareFamilyRows("historical", [{ ...row, jurisdictionTag: "county:11001" }], [{ ...row, jurisdictionTag: "county:99999" }], scope);
  assert.equal(mismatch.status, "fail");
  assert.equal(compareFamilyRows("historical", [row], [{ ...row, sourceLevel: "town" }], scope).counts.removed, 1);
});

test("exact indicator projection calls pure importer calculation without opening a database", async () => {
  const result = await calculateStagedIndicators(createRuntimeContext(), { sources: [{ id: "s" }], native: { reviewRows: [], historicalReviewRows: [] } }, "DC", 2024);
  assert.deepEqual(result, []);
  await assert.rejects(calculateStagedIndicators(createRuntimeContext(), {}, "DC", 2012), /not supported/);
});

test("source identities follow the importer's exact public slug and metadata-year contract", () => {
  const current = { id: "dc-2024-current", authority: "Fixture", sourceUrl: "https://example.test/current" };
  const historical = { id: "historic", metadata: { electionYears: [2016, 2020] } };
  const sourceContext = sourceProjectionContext({ sources: [current, historical] }, "DC");
  assert.deepEqual(sourceContext.sourceYears, [2020, 2024]);
  assert.equal(sourceContext.sourceSlugs["dc-2024-current"], "dc-2024-dc-2024-current");
  const currentApi = { ...current, id: "dc-2024-dc-2024-current", state: "DC", electionYear: 2024 };
  assert.equal(compareFamilyRows("sources", [current], [currentApi], { ...scope, ...sourceContext }).counts.changed, 0);
  const result = { jurisdictionName: "Fixture", level: "county", votes: { A: 5 }, sourceId: current.id };
  assert.equal(compareFamilyRows("results", [result], [{ ...result, state: "DC", year: 2024, sourceId: currentApi.id }], { ...scope, ...sourceContext }).counts.changed, 0);
  const historicalRow = { electionYear: 2020, jurisdictionName: "Fixture", localUnit: "county", sourceLevel: "county", sourceId: "historic", demVotes: 2, repVotes: 2, otherVotes: 1, totalVotes: 5 };
  const delivered = { ...historicalRow, state: "DC", sourceDocumentId: "dc-2020-historic" };
  assert.equal(compareFamilyRows("historical", [historicalRow], [delivered], { ...scope, ...sourceContext }).counts.changed, 0);
  assert.throws(() => sourceProjectionContext({ sources: [current, current] }, "DC"), /Duplicate/);
});
