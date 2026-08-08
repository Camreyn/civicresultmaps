import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("precinct detail stays county-gated and eligible-manifest-only", () => {
  const component = readFileSync(
    "src/app/precinct-detail-map.tsx",
    "utf8",
  );
  assert.match(component, /geographyManifestApiPath/);
  assert.doesNotMatch(component, /includeBlocked/);
  assert.match(component, /if \(!manifestId \|\| !manifestOffice \|\| !parentGeoid\)/);
  assert.match(component, /parentScopedPrecinctDeliveryApiPath/);
  assert.match(component, /Promise\.all/);
  assert.match(component, /office: manifestOffice/);
  assert.match(component, /parentGeoid,/);
  assert.match(component, /row\.office\.toLowerCase\(\) === manifestOffice\.toLowerCase\(\)/);
  assert.match(component, /level: "precinct"/);
  assert.match(component, /joinPrecinctDeliveryResults/);
  assert.match(component, /resultOutcomeDescription/);
  assert.match(component, /No votes reported/);
  assert.match(component, /source\.licenseOrTerms/);
  assert.match(component, /2012: "2012-11-06"/);
  assert.doesNotMatch(component, /manifest\.delivery\.url/);
  assert.match(component, /parent_scoped_geojson/);
});

test("precinct geography API accompanies geometry with source terms", () => {
  const route = readFileSync(
    "src/app/api/precinct-geography/route.ts",
    "utf8",
  );
  const builder = readFileSync(
    "scripts/lib/precinct-delivery-builder.mjs",
    "utf8",
  );
  assert.match(route, /licenseOrTerms: delivery.collection.metadata.licenseOrTerms/);
  assert.match(route, /sourceAuthority: delivery.collection.metadata.sourceAuthority/);
  assert.match(builder, /licenseOrTerms: manifest.source.licenseOrTerms/);
  assert.match(builder, /sourceAuthority: manifest.source.authority/);
});

test("Vercel retains the precinct manifest registry without raw geometry", () => {
  const vercelIgnore = readFileSync(".vercelignore", "utf8");
  assert.match(vercelIgnore, /^data\/\*\*$/m);
  assert.match(
    vercelIgnore,
    /^!data\/precinct-geometry-manifests\.json$/m,
  );
  assert.doesNotMatch(vercelIgnore, /^!data\/precinct-geometry\/?$/m);
  assert.doesNotMatch(vercelIgnore, /^!data\/precinct-geometry\/\*\*$/m);
});

test("precinct map has one keyboard control rather than focusable GIS paths", () => {
  const component = readFileSync(
    "src/app/precinct-detail-map.tsx",
    "utf8",
  );
  assert.match(component, /Precinct to inspect/);
  assert.match(component, /<select/);
  assert.match(component, /aria-hidden="true"/);
  assert.match(component, /focusable="false"/);
  assert.doesNotMatch(component, /tabIndex/);
  assert.match(component, /result unavailable/);
  assert.match(component, /explicit reporting-unit code/);
});

test("results explorer opens precinct detail from a canonical county tag", () => {
  const explorer = readFileSync(
    "src/app/results-explorer.tsx",
    "utf8",
  );
  const styles = readFileSync("src/app/globals.css", "utf8");
  assert.match(explorer, /pinnedCountyGeoid/);
  assert.equal(
    explorer.includes("match(/^county:(\\d{5})$/)"),
    true,
  );
  assert.match(explorer, /<PrecinctDetailMap/);
  assert.match(explorer, /parentGeoid=\{pinnedCountyGeoid\}/);
  assert.match(styles, /precinct-detail-map/);
  assert.match(styles, /precinct-detail-controls/);
  assert.match(styles, /@media \(max-width: 800px\)/);
});
