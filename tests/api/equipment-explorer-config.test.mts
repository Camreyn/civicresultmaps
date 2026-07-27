import assert from "node:assert/strict";

import { isEquipmentExplorerEnabled } from "../../src/lib/equipment-explorer-config.ts";

const original = {
  EQUIPMENT_EXPLORER_ENABLED: process.env.EQUIPMENT_EXPLORER_ENABLED,
  NEXT_PUBLIC_EQUIPMENT_EXPLORER: process.env.NEXT_PUBLIC_EQUIPMENT_EXPLORER,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
};

function setEnvironment(values: Record<string, string | undefined>) {
  for (const key of Object.keys(original)) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

try {
  setEnvironment({ NODE_ENV: "production" });
  assert.equal(
    isEquipmentExplorerEnabled({ catalogChannel: "public", productionReady: true }),
    false,
    "production defaults closed",
  );

  setEnvironment({
    NODE_ENV: "production",
    EQUIPMENT_EXPLORER_ENABLED: "1",
    NEXT_PUBLIC_EQUIPMENT_EXPLORER: "1",
  });
  assert.equal(
    isEquipmentExplorerEnabled({ catalogChannel: "public", productionReady: true }),
    true,
    "both flags enable a production-ready public catalog",
  );
  assert.equal(
    isEquipmentExplorerEnabled({ catalogChannel: "staging", productionReady: true }),
    false,
    "non-Vercel production also rejects the staging catalog",
  );

  setEnvironment({ NODE_ENV: "production", EQUIPMENT_EXPLORER_ENABLED: "1" });
  assert.equal(
    isEquipmentExplorerEnabled({ catalogChannel: "public", productionReady: true }),
    false,
    "server flag alone is insufficient",
  );

  setEnvironment({ NODE_ENV: "production", NEXT_PUBLIC_EQUIPMENT_EXPLORER: "1" });
  assert.equal(
    isEquipmentExplorerEnabled({ catalogChannel: "public", productionReady: true }),
    false,
    "public flag alone is insufficient",
  );

  setEnvironment({
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "preview",
    EQUIPMENT_EXPLORER_ENABLED: "1",
    NEXT_PUBLIC_EQUIPMENT_EXPLORER: "1",
  });
  assert.equal(
    isEquipmentExplorerEnabled({ catalogChannel: "staging", productionReady: false }),
    true,
    "preview may show approved staging claims",
  );

  setEnvironment({
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    EQUIPMENT_EXPLORER_ENABLED: "1",
    NEXT_PUBLIC_EQUIPMENT_EXPLORER: "1",
  });
  assert.equal(
    isEquipmentExplorerEnabled({ catalogChannel: "public", productionReady: false }),
    false,
    "public production rejects unpublished claims",
  );
  assert.equal(
    isEquipmentExplorerEnabled({ catalogChannel: "staging", productionReady: true }),
    false,
    "public production rejects the staging artifact even when its current claims are published",
  );
  assert.equal(
    isEquipmentExplorerEnabled({ catalogChannel: "public", productionReady: true }),
    true,
    "public production accepts the published public artifact",
  );

  setEnvironment({ NODE_ENV: "development" });
  assert.equal(isEquipmentExplorerEnabled(), true, "local development defaults open");

  console.log("Equipment explorer feature-gate matrix passed.");
} finally {
  setEnvironment(original);
}
