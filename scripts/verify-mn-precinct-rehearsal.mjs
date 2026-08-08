import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  MINNESOTA_PRECINCT_REHEARSAL_CANDIDATES,
} from "../src/lib/mn-precinct-rehearsal-server.ts";

const YEAR_DETAILS = new Map([
  [2012, { electionDate: "2012-11-06", zeroVoteUnits: 33 }],
  [2016, { electionDate: "2016-11-08", zeroVoteUnits: 31 }],
  [2020, { electionDate: "2020-11-03", zeroVoteUnits: 33 }],
  [2024, { electionDate: "2024-11-05", zeroVoteUnits: 28 }],
]);
const TEST_PARENT_GEOID = "27053";
const permittedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function argumentValue(name) {
  return process.argv.slice(2)
    .find((argument) => argument.startsWith(name + "="))
    ?.slice(name.length + 1);
}

function rehearsalBaseUrl() {
  const raw = argumentValue("--base-url") ?? "http://127.0.0.1:3000";
  const url = new URL(raw);
  if (url.protocol !== "http:" || !permittedHosts.has(url.hostname)) {
    throw new Error("Minnesota rehearsal verifier requires a loopback HTTP base URL");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

async function fetchJson(baseUrl, pathname, expectedStatus = 200) {
  const response = await fetch(new URL(pathname, baseUrl), {
    cache: "no-store",
  });
  const text = await response.text();
  assert.equal(
    response.status,
    expectedStatus,
    pathname + " returned " + response.status + ": " + text.slice(0, 500),
  );
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(pathname + " did not return JSON");
  }
  return value;
}

function envelope(value, pathname) {
  assert.ok(value && typeof value === "object", pathname + " envelope missing");
  assert.ok("data" in value, pathname + " data missing");
  assert.ok(value.meta && typeof value.meta === "object", pathname + " meta missing");
  return value;
}

function verifyCanonicalReleaseState() {
  const registry = JSON.parse(
    readFileSync("data/precinct-geometry-manifests.json", "utf8"),
  );
  for (const candidate of MINNESOTA_PRECINCT_REHEARSAL_CANDIDATES) {
    const manifest = registry.manifests.find(
      (entry) => entry.id === candidate.manifestId,
    );
    assert.ok(manifest, "canonical manifest missing " + candidate.manifestId);
    assert.equal(manifest.validation.status, "blocked");
    assert.equal(manifest.validation.rowLevelRenderingSafe, false);
    assert.equal(manifest.delivery, null);
  }
  assert.equal(
    existsSync(path.join("public", "data", "geography", "mn")),
    false,
    "local rehearsal must not create public Minnesota geometry",
  );
}

async function run() {
  const baseUrl = rehearsalBaseUrl();
  verifyCanonicalReleaseState();
  const reports = [];

  for (const candidate of MINNESOTA_PRECINCT_REHEARSAL_CANDIDATES) {
    const details = YEAR_DETAILS.get(candidate.electionYear);
    assert.ok(details, "unexpected rehearsal year " + candidate.electionYear);
    const manifestPath = "/api/geography-manifests?" + new URLSearchParams({
      state: "MN",
      electionDate: details.electionDate,
      level: "precinct",
    });
    const manifestEnvelope = envelope(
      await fetchJson(baseUrl, manifestPath),
      manifestPath,
    );
    assert.equal(manifestEnvelope.data.length, 1);
    assert.equal(manifestEnvelope.meta.rehearsalCount, 1);
    assert.equal(manifestEnvelope.meta.eligibleCount, 0);
    const [manifest] = manifestEnvelope.data;
    assert.equal(manifest.id, candidate.manifestId);
    assert.equal(manifest.eligible, false);
    assert.equal(manifest.delivery, null);
    assert.equal(manifest.validation.status, "blocked");
    assert.equal(manifest.localRehearsal.active, true);
    assert.equal(manifest.localRehearsal.publicEligible, false);
    assert.equal(manifest.localRehearsal.delivery.sha256, candidate.sha256);
    assert.equal(
      manifest.localRehearsal.delivery.byteCount,
      candidate.byteCount,
    );

    const geometryPath = "/api/precinct-geography?" + new URLSearchParams({
      manifestId: candidate.manifestId,
      parentGeoid: TEST_PARENT_GEOID,
    });
    const geometryEnvelope = envelope(
      await fetchJson(baseUrl, geometryPath),
      geometryPath,
    );
    assert.equal(geometryEnvelope.meta.localRehearsal, true);
    assert.equal(geometryEnvelope.meta.publicEligible, false);
    assert.equal(geometryEnvelope.meta.sourceSha256, candidate.sha256);
    assert.equal(geometryEnvelope.meta.sourceByteCount, candidate.byteCount);
    assert.ok(geometryEnvelope.data.features.length > 0);
    assert.equal(
      geometryEnvelope.data.features.every(
        (feature) => feature.properties.parentGeoid === TEST_PARENT_GEOID,
      ),
      true,
    );

    const resultsPath = "/api/results?" + new URLSearchParams({
      state: "MN",
      year: String(candidate.electionYear),
      level: "precinct",
      office: "president",
    });
    const resultsEnvelope = envelope(
      await fetchJson(baseUrl, resultsPath),
      resultsPath,
    );
    assert.equal(resultsEnvelope.data.length, candidate.featureCount);
    assert.equal(
      resultsEnvelope.data.filter((row) => row.totalVotes === 0).length,
      details.zeroVoteUnits,
    );
    const resultCodes = new Set(
      resultsEnvelope.data.map((row) => row.jurisdictionCode),
    );
    assert.equal(resultCodes.size, candidate.featureCount);
    assert.equal(
      geometryEnvelope.data.features.every(
        (feature) => resultCodes.has(feature.properties.resultUnitCode),
      ),
      true,
    );

    const workspacePath = "/?" + new URLSearchParams({
      state: "MN",
      tab: "map",
      year: String(candidate.electionYear),
      fips: TEST_PARENT_GEOID,
    });
    const workspaceResponse = await fetch(new URL(workspacePath, baseUrl), {
      cache: "no-store",
    });
    const workspaceHtml = await workspaceResponse.text();
    assert.equal(workspaceResponse.status, 200);
    assert.match(workspaceHtml, /Civic Result Maps/);

    reports.push({
      year: candidate.electionYear,
      manifestId: candidate.manifestId,
      statewideResultUnits: resultsEnvelope.data.length,
      zeroVoteUnits: details.zeroVoteUnits,
      selectedCounty: TEST_PARENT_GEOID,
      selectedCountyFeatures: geometryEnvelope.data.features.length,
      selectedCountyJoinedResults: geometryEnvelope.data.features.length,
      sourceByteCount: geometryEnvelope.meta.sourceByteCount,
      sourceSha256: geometryEnvelope.meta.sourceSha256,
      canonicalPublicEligible: false,
    });
  }

  await fetchJson(
    baseUrl,
    "/api/precinct-geography?manifestId=mn-unknown&parentGeoid=27053",
    404,
  );

  console.log(JSON.stringify({
    schemaVersion: 1,
    scope: "Minnesota local-only precinct API/UI rehearsal",
    baseUrl: baseUrl.origin,
    database: "crm_clone_dev",
    state: "MN",
    publicReleaseChanged: false,
    reports,
  }, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
