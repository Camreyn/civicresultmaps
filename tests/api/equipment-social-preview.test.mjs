import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  catalog,
  usage,
  socialLibrary,
  indexPage,
  dossierMetadata,
  statePage,
  socialRoute,
  sitemap,
] = await Promise.all([
  readFile("data/equipment-catalog.public.json", "utf8").then(JSON.parse),
  readFile("data/equipment-usage-index.json", "utf8").then(JSON.parse),
  readFile("src/lib/equipment-social-preview.ts", "utf8"),
  readFile("src/app/equipment/page.tsx", "utf8"),
  readFile("src/app/equipment/[slug]/dossier-format.ts", "utf8"),
  readFile("src/app/equipment/state/[state]/page.tsx", "utf8"),
  readFile("src/app/api/equipment-social-card/route.tsx", "utf8"),
  readFile("src/app/sitemap.ts", "utf8"),
]);

assert.equal(catalog.systems.length, 6);
for (const system of catalog.systems) {
  assert.match(
    socialLibrary,
    new RegExp(`"${system.slug}"\\s*:\\s*\\{`),
    `${system.slug} must have an editorially reviewed networking quick fact`,
  );
}

assert.match(socialLibrary, /equipmentSocialCardVersion = "equipment-v3"/);
assert.match(socialLibrary, /"ess-evs-6400-ds200"[\s\S]*?status: "optional"/);
assert.match(socialLibrary, /Optional cellular modem hardware documented historically/);
assert.match(socialLibrary, /do not establish inclusion in EVS 6\.4\.0\.0 certification, modem firmware, activation, or use/i);
assert.match(socialLibrary, /"dominion-democracy-suite-517-imagecast-x"[\s\S]*?Built-in Ethernet capability documented/);
assert.match(socialLibrary, /A physical interface is not evidence that an external peer was connected, enabled, or used/i);
assert.match(socialLibrary, /"clear-ballot-clearvote-25-clearaccess"[\s\S]*?status: "reviewed_without_attachment"/);

const colorado = new Map();
for (const record of usage.records.filter((entry) => entry.state === "CO")) {
  const [relation] = record.relations;
  const key = relation.target.kind === "equipment_system"
    ? `system:${relation.target.slug}`
    : `manufacturer:${relation.target.id}`;
  colorado.set(key, (colorado.get(key) ?? 0) + 1);
}
assert.deepEqual(
  [...colorado.keys()].sort(),
  [
    "system:clear-ballot-clearvote-25-clearaccess",
    "system:dominion-democracy-suite-517-imagecast-x",
  ],
);
assert.equal(colorado.get("system:clear-ballot-clearvote-25-clearaccess"), 2);
assert.equal(colorado.get("system:dominion-democracy-suite-517-imagecast-x"), 62);

const stateTargets = new Map();
for (const record of usage.records) {
  const targets = stateTargets.get(record.state) ?? new Set();
  for (const relation of record.relations) {
    targets.add(relation.target.kind === "equipment_system"
      ? `system:${relation.target.slug}`
      : `manufacturer:${relation.target.id}`);
  }
  stateTargets.set(record.state, targets);
}
const maximumStateTargetCount = Math.max(...[...stateTargets.values()].map((targets) => targets.size));
assert.equal(maximumStateTargetCount, 4, "the social-card regression fixture must cover exact and vendor-only state rows");

assert.match(indexPage, /State equipment pages/);
assert.match(indexPage, /action="\/equipment\/state"/);
assert.match(indexPage, /getEquipmentNetworkQuickFact/);
assert.match(indexPage, /openGraph:/);
assert.match(indexPage, /twitter:/);
assert.match(dossierMetadata, /buildEquipmentMachineSocialPreview/);
assert.match(dossierMetadata, /summary_large_image/);
assert.match(statePage, /Named product-family records/);
assert.match(statePage, /Manufacturer context only/);
assert.match(statePage, /preview\.caveat/);
assert.match(socialLibrary, /Vendor-only rows are grouped by manufacturer and are not counted as dossier usage/i);
assert.match(socialLibrary, /Dossier network capability does not establish/i);
assert.match(statePage, /equipmentSocialCardPath/);
assert.match(socialRoute, /new ImageResponse/);
assert.match(socialRoute, /width: 1200, height: 630/);
assert.match(socialRoute, /preview\.systems\.length \+ preview\.manufacturerContexts\.length >= 5/);
assert.match(socialRoute, /preview\.manufacturerContexts\.map/);
assert.match(socialRoute, /Not an exact dossier match/);
assert.match(socialRoute, /Exact dossiers/);
assert.match(socialRoute, /Vendor groups/);
assert.match(socialRoute, /Equipment dossier not found/);
assert.match(socialRoute, /Tracked state equipment not found/);
assert.match(sitemap, /listTrackedEquipmentStates/);
assert.match(sitemap, /equipment\/state\/\$\{stateCode\}/);

console.log("equipment social preview tests passed");
