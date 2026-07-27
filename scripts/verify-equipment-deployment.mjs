import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const defaultAttempts = 12;
const defaultDelayMs = 5_000;

function readArgument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

const baseUrl = (readArgument("base-url") ?? process.env.EQUIPMENT_SMOKE_BASE_URL ?? "")
  .replace(/\/$/, "");
const expectedChannel = readArgument("expect-channel") ?? "staging";
const attempts = Number(readArgument("attempts") ?? defaultAttempts);
const delayMs = Number(readArgument("delay-ms") ?? defaultDelayMs);

if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
  throw new Error("Provide an HTTP(S) base URL with --base-url=<url> or EQUIPMENT_SMOKE_BASE_URL.");
}
if (!["public", "staging"].includes(expectedChannel)) {
  throw new Error("--expect-channel must be public or staging.");
}
if (!Number.isInteger(attempts) || attempts < 1 || !Number.isInteger(delayMs) || delayMs < 0) {
  throw new Error("Smoke retry options must be non-negative integers and attempts must be at least 1.");
}

const expectedCatalog = JSON.parse(
  await readFile(`data/equipment-catalog.${expectedChannel}.json`, "utf8"),
);
const expectedSlugs = expectedCatalog.systems.map((system) => system.slug).sort();
assert.ok(expectedSlugs.length > 0, `${expectedChannel} catalog must contain a dossier.`);

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchResponse(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "user-agent": "CivicResultMaps-equipment-smoke/1.0" },
  });
  assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
  return response;
}

async function verify() {
  const pageResponse = await fetchResponse("/equipment");
  const page = await pageResponse.text();
  assert.match(page, /U\.S\. election equipment/i);
  for (const system of expectedCatalog.systems) {
    assert.match(page, new RegExp(system.deviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }

  const listResponse = await fetchResponse("/api/v1/equipment-systems");
  const listPayload = await listResponse.json();
  assert.equal(listPayload.meta.catalogChannel, expectedChannel, "catalog channel");
  assert.equal(listPayload.meta.catalogStatus, expectedCatalog.status, "catalog status");
  assert.deepEqual(
    listPayload.data.map((system) => system.slug).sort(),
    expectedSlugs,
    "deployed dossier slugs",
  );

  const firstSlug = expectedSlugs[0];
  const detailResponse = await fetchResponse(`/api/v1/equipment-systems/${firstSlug}`);
  const detailPayload = await detailResponse.json();
  assert.equal(detailPayload.meta.catalogChannel, expectedChannel, "detail catalog channel");
  assert.equal(detailPayload.meta.catalogStatus, expectedCatalog.status, "detail catalog status");
  assert.equal(detailPayload.data.system.slug, firstSlug, "detail dossier slug");
  assert.ok(detailPayload.data.sources.length > 0, "detail dossier sources");
}

let lastError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await verify();
    console.log(`Equipment deployment smoke passed for ${baseUrl} using the ${expectedChannel} catalog.`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt === attempts) break;
    console.warn(`Equipment smoke attempt ${attempt}/${attempts} failed: ${error.message}`);
    await wait(delayMs);
  }
}

throw lastError;
