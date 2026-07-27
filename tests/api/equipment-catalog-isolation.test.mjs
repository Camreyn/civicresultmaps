import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

import { createEquipmentCatalog } from "../../scripts/build-equipment-catalog.mjs";

const sourcePackage = JSON.parse(await readFile("data/equipment-source-packages.json", "utf8"));
const claimFiles = (await readdir("data/equipment-claims"))
  .filter((name) => name.endsWith(".json"))
  .sort();
const claims = await Promise.all(
  claimFiles.map((name) => readFile(`data/equipment-claims/${name}`, "utf8").then(JSON.parse)),
);
const simulatedApprovedSlug = claims[0].system.slug;
const simulatedClaims = claims.map((claim, index) => index === 0
  ? {
      ...claim,
      editorial: {
        ...claim.editorial,
        state: "approved",
        publicationId: null,
        publishedOn: null,
      },
    }
  : claim);

const publicCatalog = createEquipmentCatalog({ channel: "public", claims: simulatedClaims, sourcePackage });
const stagingCatalog = createEquipmentCatalog({ channel: "staging", claims: simulatedClaims, sourcePackage });

assert.equal(publicCatalog.catalogChannel, "public");
assert.equal(publicCatalog.status, "published_catalog");
assert.equal(publicCatalog.editorialState, "public_release");
assert.equal(publicCatalog.systems.length, claims.length - 1);
assert.ok(publicCatalog.systems.every((system) => system.editorialState === "published"));
assert.ok(!publicCatalog.systems.some((system) => system.slug === simulatedApprovedSlug));

assert.equal(stagingCatalog.catalogChannel, "staging");
assert.equal(stagingCatalog.status, "reviewed_pilot");
assert.equal(stagingCatalog.editorialState, "staging_review");
assert.equal(stagingCatalog.systems.length, claims.length);
assert.equal(
  stagingCatalog.systems.find((system) => system.slug === simulatedApprovedSlug)?.editorialState,
  "approved",
);
assert.throws(
  () => createEquipmentCatalog({ channel: "private", claims, sourcePackage }),
  /Unsupported equipment catalog channel/,
);

for (const catalog of [publicCatalog, stagingCatalog]) {
  const sourceIds = new Set(catalog.sources.map((source) => source.id));
  for (const system of catalog.systems) {
    assert.ok(system.sourceIds.every((sourceId) => sourceIds.has(sourceId)));
  }
  assert.ok(sourcePackage.methodology.changeControlSourceIds.every((sourceId) => sourceIds.has(sourceId)));
}

console.log("Equipment public/staging catalog isolation passed.");
