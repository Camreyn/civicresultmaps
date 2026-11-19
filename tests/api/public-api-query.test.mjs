import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const src = new URL("src/", root);

// Run the actual Next route handlers without a dev server. Resolve the same
// source aliases, extensionless imports, and JSON imports as the app bundler.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/cache") {
      // No Next server cache exists in this process; run the underlying read.
      return nextResolve("data:text/javascript,export const unstable_cache = (read) => read;", context);
    }
    if (specifier === "next/server") {
      return nextResolve(`${specifier}.js`, context);
    }
    const path = specifier.startsWith("@/") ? new URL(specifier.slice(2), src)
      : specifier.startsWith(".") && context.parentURL?.startsWith(src.href)
        ? new URL(specifier, context.parentURL) : null;
    if (path) {
      const ts = new URL(`${path.href}.ts`);
      return nextResolve(existsSync(fileURLToPath(ts)) ? ts.href : path.href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(root.href) && url.endsWith(".json") && !context.importAttributes?.type) {
      return nextLoad(url, { ...context, importAttributes: { type: "json" } });
    }
    return nextLoad(url, context);
  },
});

// Positive cases use the built-in fixtures, never a configured database.
for (const key of Object.keys(process.env)) {
  if (/^(?:CRM_DATABASE_|DATABASE_URL|POSTGRES|CRM_URL)/i.test(key)) delete process.env[key];
}
test.after(() => hooks.deregister());

const { NextRequest } = await import("next/server");
const routes = Object.fromEntries(await Promise.all(
  ["admin-sources", "completeness", "turnout-sources"].map(async (name) => [
    name, (await import(`../../src/app/api/${name}/route.ts`)).GET,
  ]),
));

function request(route, query = "") {
  return routes[route](new NextRequest(`http://localhost/api/${route}${query}`));
}

const invalid = [
  ["admin-sources", "?year=not-a-year", ["year"]],
  ["admin-sources", "?state=ZZ&status=unknown", ["state", "status"]],
  ["completeness", "?year=not-a-year", ["year"]],
  ["completeness", "?year=2024.5", ["year"]],
  ["turnout-sources", "?year=not-a-year", ["year"]],
  ["turnout-sources", "?state=&status=unknown", ["state", "status"]],
];

for (const [route, query, fields] of invalid) {
  test(`${route} rejects ${fields.join(", ")} with a safe, non-cacheable 400`, async () => {
    const response = await request(route, query);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    for (const header of ["cache-control", "cdn-cache-control", "vercel-cdn-cache-control"]) {
      assert.equal(response.headers.get(header), "no-store");
    }
    const body = await response.json();
    assert.equal(body.data, null);
    assert.equal(body.error.code, "invalid_query");
    assert.deepEqual(body.error.issues.map(({ field }) => field), fields);
    assert.doesNotMatch(JSON.stringify(body.error), /not-a-year|planet|unknown|Wisconsin|ZodError/);
  });
}

test("valid source-status requests retain omitted defaults and apply supplied filters", async () => {
  for (const route of ["admin-sources", "turnout-sources"]) {
    const defaults = await request(route);
    assert.equal(defaults.status, 200);
    const { state, status, year } = (await defaults.json()).meta;
    assert.deepEqual({ state, status, year }, { state: null, status: null, year: 2024 });

    const filtered = await request(route, "?state=wi&status=loaded&year=2020");
    assert.equal(filtered.status, 200);
    const { meta } = await filtered.json();
    assert.deepEqual([meta.state, meta.status, meta.year], ["WI", "loaded", 2020]);
  }
});

test("valid completeness retains the default year", async () => {
  const response = await request("completeness");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).meta.year, 2024);
});
