import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  header,
  home,
  equipmentIndex,
  equipmentDetail,
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
  readFile("src/app/security/page.tsx", "utf8"),
  readFile("src/app/security/security-explorer.tsx", "utf8"),
  readFile("src/app/guided-tour.tsx", "utf8"),
  readFile("src/app/tour-manifests.ts", "utf8"),
  readFile("src/app/workspace-tabs.tsx", "utf8"),
]);

assert.match(header, /U\.S\. Equipment/);
assert.match(header, /href: "\/equipment"/);
assert.match(header, /equipmentEnabled/);
assert.match(header, /aria-current/);
assert.match(header, /TourLaunchButton/);

assert.match(home, /activePage="workspace"/);
assert.match(home, /tourId="workspace"/);
assert.match(home, /equipmentEnabled={equipmentExplorerEnabled}/);
assert.match(equipmentIndex, /activePage="equipment"/);
assert.match(equipmentIndex, /tourId="equipment-index"/);
assert.match(equipmentDetail, /tourId="equipment-detail"/);
assert.match(securityPage, /activePage="security"/);
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
  "equipment-evidence-boundaries",
  "equipment-catalog",
  "equipment-usage-summary",
  "equipment-methodology",
]) {
  assert.match(equipmentIndex, new RegExp(`data-tour="${target}"`));
  assert.match(manifests, new RegExp(`data-tour='${target}'`));
}

for (const target of [
  "equipment-detail-hero",
  "equipment-coverage",
  "equipment-explorer",
  "equipment-network-evidence",
  "equipment-version-evidence",
  "equipment-usage",
  "equipment-source-manifest",
]) {
  assert.match(equipmentDetail, new RegExp(`data-tour="${target}"`));
  assert.match(manifests, new RegExp(`data-tour='${target}'`));
}

for (const target of ["security-controls", "security-metrics", "security-map", "security-layer-toggle", "security-sources"]) {
  assert.match(securityExplorer, new RegExp(`data-tour="${target}"`));
  assert.match(manifests, new RegExp(`data-tour='${target}'`));
}

console.log("shared navigation and route tour contracts passed");
