import assert from "node:assert/strict";
import test from "node:test";
import { evidenceUrl, readPublicApi, createEvidenceReader } from "../../tools/civicresultmaps-mcp/evidence.ts";

const request = { target: "production", family: "results", state: "WI", year: 2024 };
const response = (data = [], meta = { source: "database" }) => new Response(JSON.stringify({ data, meta }), { headers: { "content-type": "application/json" } });

test("fixed evidence URLs reject target, state, family and level injection", () => {
  assert.equal(evidenceUrl(request), "https://www.civicresultmaps.org/api/results?state=WI&year=2024&level=county");
  for (const override of [{ target: "https://evil.invalid" }, { target: "__proto__" }, { state: "WI&token=x" }, { family: "admin" }, { level: "county&admin=1" }, { year: NaN }]) {
    assert.throws(() => evidenceUrl({ ...request, ...override }));
  }
});

test("evidence distinguishes complete database reads from seed, missing metadata, and truncated payloads", async () => {
  let init;
  const complete = await readPublicApi(request, { fetchImpl: async (_url, options) => { init = options; return response([{ state: "WI", year: 2024, level: "county" }]); } });
  assert.equal(complete.complete, true);
  assert.equal(init.method, "GET");
  assert.equal(init.credentials, "omit");
  assert.equal(init.redirect, "error");
  assert.deepEqual(init.headers, { accept: "application/json" });
  for (const source of ["seed-fallback", null, "unknown"]) {
    assert.equal((await readPublicApi(request, { fetchImpl: async () => response([], { source }) })).complete, false);
  }
  const capped = await readPublicApi({ ...request, family: "review" }, { fetchImpl: async () => response(Array.from({ length: 5000 }, () => ({ state: "WI" }))) });
  assert.equal(capped.error, "incomplete_or_capped_response");
  assert.equal((await readPublicApi(request, { fetchImpl: async () => response([], { source: "database", hasMore: true }) })).complete, false);
});

test("scope, errors, oversize and metadata redaction fail closed", async () => {
  assert.equal((await readPublicApi(request, { fetchImpl: async () => response([{ state: "MN" }]) })).error, "state_scope_mismatch");
  assert.equal((await readPublicApi(request, { fetchImpl: async () => response([{ state: "WI", year: 2020 }]) })).error, "year_scope_mismatch");
  assert.equal((await readPublicApi(request, { fetchImpl: async () => response([{ year: 2024 }]) })).error, "state_scope_mismatch");
  assert.equal((await readPublicApi(request, { fetchImpl: async () => response([{ state: "WI" }]) })).error, "year_scope_mismatch");
  assert.equal((await readPublicApi(request, { fetchImpl: async () => response([{ state: "WI", year: 2024, level: "district" }]) })).error, "result_level_scope_mismatch");
  assert.equal((await readPublicApi(request, { fetchImpl: async () => new Response("login", { status: 403 }) })).error, "http_403");
  assert.equal((await readPublicApi(request, { fetchImpl: async () => new Response("<html>login</html>") })).error, "non_json_response");
  assert.equal((await readPublicApi(request, { fetchImpl: async () => { throw new Error("Bearer should-not-leak"); } })).error, "public_read_failed");
  const clean = await readPublicApi(request, { fetchImpl: async () => response([], { source: "database", password: "secret" }) });
  assert.equal(JSON.stringify(clean).includes("secret"), false);
  const oversized = await readPublicApi(request, { fetchImpl: async () => new Response("{}", { headers: { "content-type": "application/json", "content-length": "999999999" } }) });
  assert.equal(oversized.complete, false);
});

test("canonical geography source is explicit; reader deduplicates and bounds concurrency", async () => {
  const geo = await readPublicApi({ ...request, family: "jurisdictions" }, { fetchImpl: async () => response([], { source: "canonical-jurisdictions", total: 0 }) });
  assert.equal(geo.complete, true);
  let active = 0, maximum = 0, calls = 0;
  const read = createEvidenceReader({ fetchImpl: async () => {
    calls++; active++; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--; return response();
  } });
  await Promise.all(["WI", "MN", "DC", "AL", "AK", "AZ", "WI"].map((state) => read({ ...request, state })));
  assert.equal(calls, 6);
  assert.ok(maximum <= 4);
});
