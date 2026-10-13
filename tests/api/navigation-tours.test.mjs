import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  header,
  home,
  equipmentIndex,
  equipmentDetail,
  equipmentLayout,
  equipmentDossierNav,
  securityPage,
  securityExplorer,
  guidedTour,
  manifests,
  workspace,
] = await Promise.all([
  readFile("src/app/site-header.tsx", "utf8"),
  readFile("src/app/page.tsx", "utf8"),
  readFile("src/app/equipment/page.tsx", "utf8"),
  readFile("src/app/equipment/[slug]/page.tsx", "utf8"),
  readFile("src/app/equipment/[slug]/layout.tsx", "utf8"),
  readFile("src/app/equipment/[slug]/dossier-section-nav.client.tsx", "utf8"),
  readFile("src/app/security/page.tsx", "utf8"),
  readFile("src/app/security/security-explorer.tsx", "utf8"),
  readFile("src/app/guided-tour.tsx", "utf8"),
  readFile("src/app/tour-manifests.ts", "utf8"),
  readFile("src/app/workspace-tabs.tsx", "utf8"),
]);

const registry = await readFile("src/lib/site-navigation.ts", "utf8");
const navigation = await readFile("src/app/site-mobile-navigation.client.tsx", "utf8");
const pageTools = await readFile("src/app/page-tools.tsx", "utf8");
const rootLayout = await readFile("src/app/layout.tsx", "utf8");
assert.match(registry, /label: "Equipment"/);
assert.match(registry, /href: "\/equipment"/);
assert.match(rootLayout, /<SiteHeader/);
assert.match(header, /equipmentEnabled/);
assert.match(navigation, /aria-current/);
assert.match(pageTools, /TourLaunchButton/);

assert.match(home, /tourId="workspace"/);
assert.match(home, /equipmentExplorerEnabled={equipmentExplorerEnabled}/);
assert.match(equipmentIndex, /tourId="equipment-index"/);
assert.match(equipmentLayout, /tourId="equipment-detail"/);
assert.match(securityPage, /tourId="security"/);

assert.match(guidedTour, /role="dialog"/);
assert.match(guidedTour, /aria-modal="true"/);
assert.match(guidedTour, /event\.key === "Escape"/);
assert.match(guidedTour, /prefers-reduced-motion/);
assert.match(guidedTour, /civicresultmaps:guided-tour:/);
assert.match(guidedTour, /tourStartEventName/);
assert.match(guidedTour, /previousFocusRef/);
assert.match(workspace, /launcher={false}/);
assert.match(workspace, /tourChapterLabels/);

for (const target of [
  "equipment-index-hero",
  "equipment-catalog-summary",
  "equipment-state-context",
  "equipment-catalog",
  "equipment-usage-summary",
  "equipment-methodology",
]) {
  assert.match(equipmentIndex, new RegExp(`data-tour="${target}"`));
  assert.match(manifests, new RegExp(`data-tour='${target}'`));
}

const equipmentDossierRoutes = [equipmentDetail, equipmentLayout, equipmentDossierNav].join("\n");
for (const target of [
  "equipment-detail-hero",
  "equipment-coverage",
  "equipment-dossier-navigation",
  "equipment-dossier-section",
]) {
  assert.match(equipmentDossierRoutes, new RegExp(`data-tour="${target}"`));
  assert.match(manifests, new RegExp(`data-tour='${target}'`));
}

for (const target of ["security-controls", "security-metrics", "security-map", "security-layer-toggle", "security-sources"]) {
  assert.match(securityExplorer, new RegExp(`data-tour="${target}"`));
  assert.match(manifests, new RegExp(`data-tour='${target}'`));
}

console.log("shared navigation and route tour contracts passed");
