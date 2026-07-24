import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  catalog,
  usage,
  socialLibrary,
  indexPage,
  detailPage,
  statePage,
  socialRoute,
  sitemap,
] = await Promise.all([
  readFile("data/equipment-catalog.json", "utf8").then(JSON.parse),
  readFile("data/equipment-usage-index.json", "utf8").then(JSON.parse),
  readFile("src/lib/equipment-social-preview.ts", "utf8"),
  readFile("src/app/equipment/page.tsx", "utf8"),
  readFile("src/app/equipment/[slug]/page.tsx", "utf8"),
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

assert.match(socialLibrary, /equipmentSocialCardVersion = "equipment-v2"/);
assert.match(socialLibrary, /"ess-evs-6400-ds200"[\s\S]*?status: "optional"/);
assert.match(socialLibrary, /Optional cellular modem hardware documented historically/);
assert.match(socialLibrary, /do not establish inclusion in EVS 6\.4\.0\.0 certification, modem firmware, activation, or use/i);
assert.match(socialLibrary, /"dominion-democracy-suite-517-imagecast-x"[\s\S]*?Built-in Ethernet capability documented/);
assert.match(socialLibrary, /A physical interface is not evidence that an external peer was connected, enabled, or used/i);
assert.match(socialLibrary, /"clear-ballot-clearvote-25-clearaccess"[\s\S]*?status: "reviewed_without_attachment"/);

const colorado = new Map();
for (const record of usage.records.filter((entry) => entry.state === "CO")) {
  for (const match of record.matches) {
    const summary = colorado.get(match.slug) ?? { deviceFamily: 0, manufacturerContext: 0 };
    if (match.evidenceKind === "device_family") summary.deviceFamily += 1;
    else summary.manufacturerContext += 1;
    colorado.set(match.slug, summary);
  }
}
assert.equal(colorado.size, 4);
assert.equal([...colorado.values()].filter((entry) => entry.deviceFamily > 0).length, 2);
assert.equal([...colorado.values()].filter((entry) => entry.deviceFamily === 0 && entry.manufacturerContext > 0).length, 2);

const stateSystems = new Map();
for (const record of usage.records) {
  const systems = stateSystems.get(record.state) ?? new Set();
  for (const match of record.matches) systems.add(match.slug);
  stateSystems.set(record.state, systems);
}
const maximumStateSystemCount = Math.max(...[...stateSystems.values()].map((systems) => systems.size));
assert.equal(maximumStateSystemCount, 6, "the social-card regression fixture must cover the maximum state density");

assert.match(indexPage, /State equipment share pages/);
assert.match(indexPage, /action="\/equipment\/state"/);
assert.match(indexPage, /getEquipmentNetworkQuickFact/);
assert.match(indexPage, /openGraph:/);
assert.match(indexPage, /twitter:/);
assert.match(detailPage, /buildEquipmentMachineSocialPreview/);
assert.match(detailPage, /summary_large_image/);
assert.match(statePage, /Named product-family records/);
assert.match(statePage, /Manufacturer context only/);
assert.match(statePage, /preview\.caveat/);
assert.match(socialLibrary, /Dossier network capability does not establish/i);
assert.match(statePage, /equipmentSocialCardPath/);
assert.match(socialRoute, /new ImageResponse/);
assert.match(socialRoute, /width: 1200, height: 630/);
assert.match(socialRoute, /const dense = preview\.systems\.length >= 5/);
assert.match(socialRoute, /minHeight: dense \? 52 : 62/);
assert.match(socialRoute, /gap: dense \? 5 : 7/);
assert.match(socialRoute, /compact=\{dense\}/);
assert.match(socialRoute, /flexShrink: 0/);
assert.match(socialRoute, /Equipment dossier not found/);
assert.match(socialRoute, /Tracked state equipment not found/);
assert.match(sitemap, /listTrackedEquipmentStates/);
assert.match(sitemap, /equipment\/state\/\$\{stateCode\}/);

console.log("equipment social preview tests passed");
