import assert from "node:assert/strict";

const publicManifestId =
  "ak-2020-11-03-general-precinct-geometry-candidate-v1";

function normalizeBaseUrl(value) {
  const url = new URL(value);
  assert.ok(
    ["http:", "https:"].includes(url.protocol),
    "Public API smoke base URL must use HTTP or HTTPS",
  );
  assert.equal(url.username, "", "Public API smoke base URL cannot contain credentials");
  assert.equal(url.password, "", "Public API smoke base URL cannot contain credentials");
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function assertEnvelope(payload, label, expectedSource) {
  assert.ok(
    payload && typeof payload === "object" && !Array.isArray(payload),
    `${label} must return a JSON object`,
  );
  assert.ok("data" in payload, `${label} must contain data`);
  assert.ok(
    payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta),
    `${label} must contain response metadata`,
  );
  assert.match(
    String(payload.meta.schemaVersion ?? ""),
    /^\d+\.\d+\.\d+$/,
    `${label} must identify a semantic API schema version`,
  );
  assert.ok(
    Number.isFinite(Date.parse(String(payload.meta.generatedAt ?? ""))),
    `${label} must identify when it was generated`,
  );
  assert.ok(
    typeof payload.meta.source === "string" && payload.meta.source.length > 0,
    `${label} must identify its data source`,
  );
  if (expectedSource) {
    assert.equal(payload.meta.source, expectedSource, `${label} data source`);
  }
}

function assertArray(value, label) {
  assert.ok(Array.isArray(value), `${label} data must be an array`);
  return value;
}

function assertRows(rows, expected, label) {
  for (const [index, row] of rows.entries()) {
    assert.ok(row && typeof row === "object", `${label} row ${index} must be an object`);
    for (const [field, value] of Object.entries(expected)) {
      assert.equal(row[field], value, `${label} row ${index} ${field}`);
    }
  }
}

async function fetchJson({
  allowedStatuses = [200],
  baseUrl,
  bypassSecret,
  expectedSource,
  path,
}) {
  const headers = {
    accept: "application/json",
    "user-agent": "CivicResultMaps-public-api-smoke/1.0",
  };
  if (bypassSecret) {
    headers["x-vercel-protection-bypass"] = bypassSecret;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(
    allowedStatuses.includes(response.status),
    `${path} returned HTTP ${response.status}; expected ${allowedStatuses.join(" or ")}`,
  );
  assert.match(
    response.headers.get("content-type") ?? "",
    /^application\/json\b/i,
    `${path} must return JSON rather than an HTML login, error, or redirect page`,
  );
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "*",
    `${path} must remain readable by public API clients`,
  );

  const payload = JSON.parse(await response.text());
  assertEnvelope(payload, path, expectedSource);
  return { payload, response };
}

export async function verifyPublicApiDeployment(options) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const expectedGitSha = options.expectedGitSha || undefined;
  const expectedSource = options.expectedSource || undefined;
  const bypassSecret = options.bypassSecret || undefined;
  const summary = { baseUrl, checks: 0, rowCounts: {} };

  const check = async (path, input = {}) => {
    const result = await fetchJson({
      baseUrl,
      bypassSecret,
      expectedSource,
      path,
      ...input,
    });
    summary.checks += 1;
    return result;
  };

  const statesResponse = await check("/api/states");
  if (expectedGitSha) {
    assert.match(expectedGitSha, /^[0-9a-f]{40}$/i, "Expected deployment Git SHA");
    assert.equal(
      statesResponse.response.headers.get("x-deployment-sha"),
      expectedGitSha,
      "Public alias must resolve to the deployment that triggered this smoke test",
    );
  }
  const states = statesResponse.payload;
  const stateRows = assertArray(states.data, "states");
  assert.ok(stateRows.length > 0, "states must not be empty");
  assert.ok(stateRows.some((row) => row.code === "WI"), "states must include Wisconsin");
  for (const row of stateRows) assert.match(row.code, /^[A-Z]{2}$/, "state code");
  summary.rowCounts.states = stateRows.length;

  const elections = (await check("/api/elections?year=2024&office=president")).payload;
  const electionRows = assertArray(elections.data, "elections");
  assert.ok(electionRows.length > 0, "2024 presidential elections must not be empty");
  assertRows(electionRows, { office: "president", year: 2024 }, "elections");
  summary.rowCounts.elections = electionRows.length;

  const results = (await check(
    "/api/results?state=WI&year=2024&level=county&office=president",
  )).payload;
  const resultRows = assertArray(results.data, "results");
  assert.ok(resultRows.length > 0, "Wisconsin 2024 county results must not be empty");
  assertRows(
    resultRows,
    { level: "county", office: "president", state: "WI", year: 2024 },
    "results",
  );
  summary.rowCounts.results = resultRows.length;

  const blockedWisconsinLocalResults = (await check(
    "/api/results?state=WI&year=2024&level=local_reporting_unit&parentGeoid=55025&office=president",
  )).payload;
  assert.equal(
    assertArray(
      blockedWisconsinLocalResults.data,
      "blocked Wisconsin local reporting results",
    ).length,
    0,
    "Wisconsin local reporting results must remain closed before publication",
  );

  const blockedWisconsinManifests = (await check(
    "/api/geography-manifests?state=WI&electionDate=2024-11-05&level=local_reporting_unit",
    { expectedSource: undefined },
  )).payload;
  assert.equal(
    assertArray(
      blockedWisconsinManifests.data,
      "eligible Wisconsin local geography manifests",
    ).length,
    0,
    "Wisconsin must not expose a public manifest before static activation",
  );

  const reviewedWisconsinManifests = (await check(
    "/api/geography-manifests?state=WI&electionDate=2024-11-05&level=local_reporting_unit&includeBlocked=true",
    { expectedSource: undefined },
  )).payload;
  const reviewedWisconsinManifestRows = assertArray(
    reviewedWisconsinManifests.data,
    "reviewed Wisconsin local geography manifests",
  );
  assert.equal(
    reviewedWisconsinManifestRows.length,
    0,
    "Wisconsin must remain absent from the canonical registry before activation",
  );

  const blockedWisconsinGeometry = await check(
    "/api/precinct-geography?manifestId=wi-2024-11-05-reviewed-local-reporting-geometry-v1&parentGeoid=55025",
    { allowedStatuses: [404], expectedSource: undefined },
  );
  assert.equal(
    blockedWisconsinGeometry.payload.data,
    null,
    "blocked Wisconsin geometry data",
  );
  assert.match(
    String(blockedWisconsinGeometry.payload.error ?? ""),
    /eligible local geography manifest not found|publication is not active/i,
    "blocked Wisconsin geography gate error",
  );

  const sources = (await check("/api/sources?state=WI&year=2024")).payload;
  const sourceRows = assertArray(sources.data, "sources");
  assert.ok(sourceRows.length > 0, "Wisconsin 2024 sources must not be empty");
  assertRows(sourceRows, { electionYear: 2024, state: "WI" }, "sources");
  summary.rowCounts.sources = sourceRows.length;

  const coverage = (await check("/api/coverage?state=WI&year=2024")).payload;
  assert.ok(coverage.data && typeof coverage.data === "object", "coverage data must be present");
  assert.equal(coverage.data.state, "WI", "coverage state");
  assert.equal(coverage.data.year, 2024, "coverage year");

  const arrayChecks = [
    ["indicators", "/api/indicators?state=WI&year=2024", { electionYear: 2024, state: "WI" }],
    ["review rows", "/api/review-rows?state=WI&year=2024&limit=5", { electionYear: 2024, state: "WI" }],
    ["turnout", "/api/turnout?state=WI&year=2024&limit=5", { electionYear: 2024, state: "WI" }],
    ["historical baselines", "/api/historical-baselines?state=WI&limit=5", { state: "WI" }],
  ];
  for (const [label, path, expected] of arrayChecks) {
    const payload = (await check(path)).payload;
    const rows = assertArray(payload.data, label);
    assertRows(rows, expected, label);
    summary.rowCounts[label] = rows.length;
  }

  const acquisition = (await check("/api/source-acquisition-tiers?state=AK", {
    expectedSource: undefined,
  })).payload;
  assert.ok(acquisition.data && typeof acquisition.data === "object", "source tiers must be an object");
  const acquisitionRows = assertArray(acquisition.data.states, "source tiers");
  assertRows(acquisitionRows, { state: "AK" }, "source tiers");
  assert.ok(acquisitionRows.length === 1, "source tiers must contain exactly Alaska");

  const packages = (await check("/api/native-source-packages?state=AK", {
    expectedSource: undefined,
  })).payload;
  assert.ok(packages.data && typeof packages.data === "object", "native packages must be an object");
  const packageRows = assertArray(packages.data.states, "native packages");
  assertRows(packageRows, { state: "AK" }, "native packages");
  assert.ok(packageRows.length === 1, "native packages must contain exactly Alaska");

  const historicalResults = (await check(
    "/api/results?state=AK&year=2020&level=county&office=president",
  )).payload;
  assertRows(
    assertArray(historicalResults.data, "Alaska 2020 results"),
    { level: "county", office: "president", state: "AK", year: 2020 },
    "Alaska 2020 results",
  );

  const historicalReviewRows = (await check(
    "/api/review-rows?state=AK&year=2020&limit=5",
  )).payload;
  assertRows(
    assertArray(historicalReviewRows.data, "Alaska 2020 review rows"),
    { electionYear: 2020, state: "AK" },
    "Alaska 2020 review rows",
  );

  const precinctResults = (await check(
    "/api/results?state=AK&year=2020&level=precinct&parentGeoid=HD01&office=president",
  )).payload;
  assertRows(
    assertArray(precinctResults.data, "Alaska 2020 precinct results"),
    { level: "precinct", office: "president", state: "AK", year: 2020 },
    "Alaska 2020 precinct results",
  );

  const manifests = (await check(
    "/api/geography-manifests?state=AK&electionDate=2020-11-03&level=precinct",
    { expectedSource: undefined },
  )).payload;
  const manifestRows = assertArray(manifests.data, "geography manifests");
  assert.equal(manifestRows.length, 1, "Alaska 2020 must have one eligible static manifest");
  assert.equal(manifestRows[0].id, publicManifestId, "Alaska 2020 manifest id");
  assert.equal(manifestRows[0].state, "AK", "Alaska 2020 manifest state");
  assert.equal(manifestRows[0].election.date, "2020-11-03", "Alaska 2020 manifest election date");
  assert.equal(manifestRows[0].geography.level, "precinct", "Alaska 2020 manifest level");

  const geography = await check(
    `/api/precinct-geography?manifestId=${publicManifestId}&parentGeoid=HD01`,
    { allowedStatuses: [200, 404], expectedSource: undefined },
  );
  if (geography.response.status === 200) {
    assert.equal(geography.payload.data.type, "FeatureCollection", "geography collection type");
    assert.ok(Array.isArray(geography.payload.data.features), "geography features must be an array");
    assert.equal(geography.payload.meta.manifestId, publicManifestId, "geography manifest id");
    assert.equal(geography.payload.meta.parentGeoid, "HD01", "geography parent id");
  } else {
    assert.equal(geography.payload.data, null, "closed geography data");
    assert.match(
      String(geography.payload.error ?? ""),
      /publication is not active/i,
      "closed geography gate error",
    );
  }

  const badParent = await check(
    "/api/results?state=AK&year=2020&level=precinct&parentGeoid=02020",
    { allowedStatuses: [400] },
  );
  assert.equal(badParent.payload.data, null, "invalid Alaska precinct parent data");
  assert.match(String(badParent.payload.error ?? ""), /House District/i);

  const badDate = await check(
    "/api/geography-manifests?state=AK&electionDate=2020-13-03",
    { allowedStatuses: [400], expectedSource: undefined },
  );
  assert.equal(badDate.payload.data, null, "invalid manifest date data");
  assert.match(String(badDate.payload.error ?? ""), /valid YYYY-MM-DD date/i);

  return summary;
}
