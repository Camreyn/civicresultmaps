import assert from "node:assert/strict";

import { resolveEquipmentCatalogChannel } from "../../src/lib/equipment-catalog-channel.ts";

assert.equal(resolveEquipmentCatalogChannel({ NODE_ENV: "production" }), "public");
assert.equal(resolveEquipmentCatalogChannel({ NODE_ENV: "development" }), "staging");
assert.equal(resolveEquipmentCatalogChannel({ NODE_ENV: "production", VERCEL_ENV: "preview" }), "staging");
assert.equal(
  resolveEquipmentCatalogChannel({
    EQUIPMENT_CATALOG_CHANNEL: "public",
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
  }),
  "public",
);
assert.equal(
  resolveEquipmentCatalogChannel({
    EQUIPMENT_CATALOG_CHANNEL: "staging",
    NODE_ENV: "development",
  }),
  "staging",
);
assert.equal(
  resolveEquipmentCatalogChannel({
    EQUIPMENT_CATALOG_CHANNEL: "staging",
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
  }),
  "staging",
);
assert.throws(
  () => resolveEquipmentCatalogChannel({
    EQUIPMENT_CATALOG_CHANNEL: "staging",
    NODE_ENV: "production",
  }),
  /Production deployments may only build the public equipment catalog/,
);

assert.throws(
  () => resolveEquipmentCatalogChannel({
    EQUIPMENT_CATALOG_CHANNEL: "staging",
    NODE_ENV: "production",
    VERCEL_ENV: "production",
  }),
  /Production deployments may only build the public equipment catalog/,
);
assert.throws(
  () => resolveEquipmentCatalogChannel({ EQUIPMENT_CATALOG_CHANNEL: "review" }),
  /must be either public or staging/,
);

console.log("Equipment catalog channel selection passed.");
