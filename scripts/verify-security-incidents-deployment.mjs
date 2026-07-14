import assert from "node:assert/strict";

const defaultAttempts = 12;
const defaultDelayMs = 5_000;

function readArgument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

const baseUrl = (readArgument("base-url") ?? process.env.SECURITY_SMOKE_BASE_URL ?? "")
  .replace(/\/$/, "");
const attempts = Number(readArgument("attempts") ?? defaultAttempts);
const delayMs = Number(readArgument("delay-ms") ?? defaultDelayMs);

if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
  throw new Error("Provide an HTTP(S) base URL with --base-url=<url> or SECURITY_SMOKE_BASE_URL.");
}
if (!Number.isInteger(attempts) || attempts < 1 || !Number.isInteger(delayMs) || delayMs < 0) {
  throw new Error("Smoke retry options must be non-negative integers and attempts must be at least 1.");
}

const expectedReports = [
  {
    label: "national",
    path: "/api/security-incidents?year=2024&limit=5000",
    totals: {
      countyCount: 109,
      knownThreatCount: 227,
      rowCount: 111,
      stateCount: 9,
      statewideUnspecifiedThreatCount: 66,
    },
  },
  {
    label: "Georgia",
    path: "/api/security-incidents?state=GA&year=2024&limit=5000",
    totals: {
      countyCount: 4,
      knownThreatCount: 60,
      rowCount: 5,
      stateCount: 1,
      statewideUnspecifiedThreatCount: 19,
    },
  },
  {
    label: "Minnesota",
    path: "/api/security-incidents?state=MN&year=2024&limit=5000",
    totals: {
      countyCount: 0,
      knownThreatCount: 47,
      rowCount: 1,
      stateCount: 1,
      statewideUnspecifiedThreatCount: 47,
    },
  },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchResponse(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "user-agent": "CivicResultMaps-security-smoke/1.0" },
  });
  assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
  return response;
}

async function verify() {
  const pageResponse = await fetchResponse("/security");
  const page = await pageResponse.text();
  assert.match(page, /at least 227 reported threats/i);
  assert.match(page, /66 additional threats reported only at statewide/i);

  for (const expected of expectedReports) {
    const response = await fetchResponse(expected.path);
    const payload = await response.json();
    assert.ok(Array.isArray(payload.data), `${expected.label} response data must be an array`);
    assert.equal(payload.meta.schemaVersion, "4.1.0", `${expected.label} API schema version`);
    assert.equal(payload.data.length, expected.totals.rowCount, `${expected.label} response rows`);
    for (const [key, value] of Object.entries(expected.totals)) {
      assert.equal(payload.meta[key], value, `${expected.label} ${key}`);
    }
  }
}

let lastError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await verify();
    console.log(`Security incident deployment smoke passed for ${baseUrl}.`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt === attempts) break;
    console.warn(`Security smoke attempt ${attempt}/${attempts} failed: ${error.message}`);
    await wait(delayMs);
  }
}

throw lastError;
