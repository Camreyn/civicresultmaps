import assert from "node:assert/strict";
import test from "node:test";
import { parsePublicPage, readStablePublicPage, PublicPageError } from "../../src/lib/public-data-pagination.ts";
import { readPublicApi } from "../../tools/civicresultmaps-mcp/evidence.ts";

const pageResponse = (rows, meta = {}) => new Response(JSON.stringify({ data: rows, meta: { source: "database", ...meta } }), {
  headers: { "content-type": "application/json" },
});

const row = (id, index) => ({ id, state: "WI", electionYear: 2024, level: "county", index });

test("parsePublicPage validates bounded pagination and revision fences", () => {
  assert.deepEqual(parsePublicPage(new URLSearchParams()), { limit: 1000, offset: 0, revision: undefined });
  assert.deepEqual(parsePublicPage(new URLSearchParams("limit=4000&offset=200000&revision=public:7")), { limit: 4000, offset: 200000, revision: "public:7" });
  for (const [query, code] of [
    ["limit=0", "invalid_limit"], ["limit=4001", "invalid_limit"], ["limit=-1", "invalid_limit"],
    ["limit=1.5", "invalid_limit"], ["offset=-1", "invalid_offset"], ["offset=200001", "invalid_offset"],
    ["offset=1", "revision_required"], ["offset=1&revision=public:0", "invalid_revision"],
    ["revision=Public:1", "invalid_revision"], ["revision=public:123456789012345678901", "invalid_revision"],
  ]) {
    assert.throws(() => parsePublicPage(new URLSearchParams(query)), (error) => error instanceof PublicPageError && error.code === code && error.status === 400);
  }
});

test("readStablePublicPage calls uncached strict loader between before/after revision reads", async () => {
  const calls = [];
  let revisions = 0;
  const result = await readStablePublicPage({ limit: 2, offset: 4, revision: "public:12" }, {
    revision: async () => { revisions++; return "public:12"; },
    rows: async (request) => { calls.push(request); return [{ id: "a" }, { id: "b" }, { id: "c" }]; },
  });
  assert.equal(revisions, 2);
  assert.deepEqual(calls, [{ limit: 3, offset: 4, strict: true }]);
  assert.deepEqual(result.meta, { source: "database", paginationVersion: 1, dataRevision: "public:12", offset: 4, limit: 2, hasMore: true, nextOffset: 6 });
  assert.deepEqual(result.data, [{ id: "a" }, { id: "b" }]);
});

test("readStablePublicPage never fabricates a total for an empty out-of-range page", async () => {
  const result = await readStablePublicPage({ limit: 1000, offset: 200_000, revision: "public:12" }, {
    revision: async () => "public:12",
    rows: async () => [],
  });
  assert.deepEqual(result.data, []);
  assert.deepEqual(result.meta, {
    source: "database", paginationVersion: 1, dataRevision: "public:12",
    offset: 200_000, limit: 1000, hasMore: false, nextOffset: null,
  });
});

test("readStablePublicPage rejects unavailable, stale, and changed revisions", async () => {
  let rowsCalled = false;
  await assert.rejects(() => readStablePublicPage({ limit: 1, offset: 0 }, {
    revision: async () => null,
    rows: async () => { rowsCalled = true; return []; },
  }), (error) => error instanceof PublicPageError && error.code === "database_revision_unavailable" && error.status === 503);
  assert.equal(rowsCalled, false);

  let revisionCalls = 0;
  await assert.rejects(() => readStablePublicPage({ limit: 1, offset: 0, revision: "public:2" }, {
    revision: async () => { revisionCalls++; return "public:1"; },
    rows: async () => { rowsCalled = true; return []; },
  }), (error) => error instanceof PublicPageError && error.code === "data_revision_changed" && error.status === 409);
  assert.equal(revisionCalls, 1);

  let after = 0;
  await assert.rejects(() => readStablePublicPage({ limit: 1, offset: 0 }, {
    revision: async () => (++after === 1 ? "public:1" : "public:2"),
    rows: async () => [{ id: "a" }],
  }), (error) => error instanceof PublicPageError && error.code === "data_revision_changed" && error.status === 409);
});

test("evidence pager completes more than 5,000 rows across revision-fenced pages", async () => {
  const allRows = Array.from({ length: 5_001 }, (_, index) => row(`row-${index}`, index));
  const calls = [];
  const evidence = await readPublicApi({ target: "production", family: "review", state: "WI", year: 2024 }, {
    fetchImpl: async (url) => {
      const parsed = new URL(url); calls.push(parsed);
      const offset = Number(parsed.searchParams.get("offset"));
      const rows = allRows.slice(offset, offset + 1000);
      return pageResponse(rows, {
        paginationVersion: 1, dataRevision: "public:31", offset, limit: 1000,
        hasMore: offset + rows.length < allRows.length,
        nextOffset: offset + rows.length < allRows.length ? offset + rows.length : null,
        ...(offset + rows.length >= allRows.length ? { total: allRows.length } : {}),
      });
    },
  });
  assert.equal(evidence.complete, true);
  assert.equal(evidence.error, undefined);
  assert.equal(evidence.rows.length, 5_001);
  assert.equal(evidence.rows.at(-1).id, "row-5000");
  assert.equal(evidence.meta.pagesRead, 6);
  assert.equal(calls.length, 6);
  assert.equal(calls[0].searchParams.get("revision"), null);
  assert.equal(calls[1].searchParams.get("revision"), "public:31");
  assert.equal(calls.at(-1).searchParams.get("offset"), "5000");
});

test("evidence pager fails closed for changed revisions and page failures", async () => {
  const changed = await readPublicApi({ target: "production", family: "review", state: "WI", year: 2024 }, {
    fetchImpl: async (url) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      return pageResponse(Array.from({ length: 1000 }, (_, index) => row(`r-${offset + index}`, offset + index)), { paginationVersion: 1, dataRevision: offset ? "public:2" : "public:1", offset, limit: 1000, hasMore: true, nextOffset: offset + 1000 });
    },
  });
  assert.equal(changed.complete, false);
  assert.equal(changed.error, "invalid_or_changed_pagination_identity");

  const failed = await readPublicApi({ target: "production", family: "review", state: "WI", year: 2024 }, {
    fetchImpl: async (url) => Number(new URL(url).searchParams.get("offset")) === 0
      ? pageResponse(Array.from({ length: 1000 }, (_, index) => row(`r-${index}`, index)), { paginationVersion: 1, dataRevision: "public:1", offset: 0, limit: 1000, hasMore: true, nextOffset: 1000 })
      : new Response("upstream failed", { status: 503, headers: { "content-type": "application/json" } }),
  });
  assert.equal(failed.complete, false);
  assert.equal(failed.error, "http_503");
});

test("evidence pager rejects duplicate, skipped, repeated, malformed, and missing page metadata", async () => {
  const cases = [
    { name: "duplicate ids", error: "missing_or_duplicate_paginated_row_identity", pages: (offset) => [row("same", offset)] },
    { name: "skipped next offset", error: "invalid_pagination_progress", pages: () => [row("one", 0)], meta: { nextOffset: 2000 } },
    { name: "repeated offset", error: "invalid_or_changed_pagination_identity", pages: () => [row("one", 0)], repeated: true },
    { name: "malformed final total", error: "invalid_pagination_total", pages: () => [row("one", 0)], final: { hasMore: false, nextOffset: null, total: "1" } },
    { name: "wrong page limit", error: "invalid_or_changed_pagination_identity", pages: () => [row("one", 0)], meta: { limit: 999 } },
    { name: "missing revision", error: "invalid_or_changed_pagination_identity", pages: () => [row("one", 0)], missingRevision: true },
  ];
  for (const fixture of cases) {
    const evidence = await readPublicApi({ target: "production", family: "review", state: "WI", year: 2024 }, {
      fetchImpl: async (url) => {
        const offset = Number(new URL(url).searchParams.get("offset"));
        const first = offset === 0;
        if (fixture.repeated && !first) return pageResponse(fixture.pages(offset), { paginationVersion: 1, dataRevision: "public:1", offset: 0, limit: 1000, hasMore: true, nextOffset: 1000 });
        const final = fixture.final && !first ? fixture.final : {};
        const pageRows = first && fixture.name !== "wrong page limit" && fixture.name !== "missing revision"
          ? Array.from({ length: 1000 }, (_, index) => row(fixture.name === "duplicate ids" && index === 999 ? "same" : `${fixture.name}-${index}`, index))
          : fixture.pages(offset);
        return pageResponse(pageRows, {
          paginationVersion: 1, ...(fixture.missingRevision ? {} : { dataRevision: "public:1" }),
          offset, limit: 1000, hasMore: first, nextOffset: first ? 1000 : null, ...(first ? {} : { total: 1 }),
          ...(fixture.meta ?? {}), ...final,
        });
      },
    });
    assert.equal(evidence.error, fixture.error, fixture.name);
  }
});

test("evidence pager enforces page-count and aggregate-byte bounds", async () => {
  let pagesRequested = 0;
  const tooManyPages = await readPublicApi({ target: "production", family: "review", state: "WI", year: 2024 }, {
    fetchImpl: async (url) => {
      pagesRequested += 1;
      const offset = Number(new URL(url).searchParams.get("offset"));
      return pageResponse(Array.from({ length: 1000 }, (_, index) => row(`r-${offset + index}`, offset + index)), { paginationVersion: 1, dataRevision: "public:1", offset, limit: 1000, hasMore: true, nextOffset: offset + 1000 });
    },
  });
  assert.equal(tooManyPages.error, "paginated_response_page_limit");
  assert.equal(pagesRequested, 200, "the cap must stop before fetching a 201st page");

  const padding = "x".repeat(16 * 1024 * 1024);
  const tooManyBytes = await readPublicApi({ target: "production", family: "review", state: "WI", year: 2024 }, {
    fetchImpl: async (url) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      const final = offset === 4_000;
      return new Response(JSON.stringify({ data: Array.from({ length: 1000 }, (_, index) => row(`b-${offset + index}`, offset + index)), meta: {
        source: "database", paginationVersion: 1, dataRevision: "public:1", offset, limit: 1000,
        hasMore: !final, nextOffset: final ? null : offset + 1000, ...(final ? { total: 5000 } : {}), padding,
      } }), { headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(tooManyBytes.error, "paginated_response_byte_limit");
});

test("legacy APIs fall back to the 5,000-row request and remain capped", async () => {
  const calls = [];
  const result = await readPublicApi({ target: "production", family: "review", state: "WI", year: 2024 }, {
    fetchImpl: async (url) => {
      const parsed = new URL(url); calls.push(parsed);
      const requestedLimit = Number(parsed.searchParams.get("limit"));
      if (parsed.searchParams.get("paginate") === "true") return pageResponse([row("first", 0)], { source: "database" });
      return pageResponse(Array.from({ length: requestedLimit }, (_, index) => row(`legacy-${index}`, index)), { source: "database", total: requestedLimit });
    },
  });
  assert.equal(result.complete, false);
  assert.equal(result.error, "incomplete_or_capped_response");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].searchParams.get("limit"), "5000");
  assert.equal(calls[1].searchParams.get("paginate"), null);
});
