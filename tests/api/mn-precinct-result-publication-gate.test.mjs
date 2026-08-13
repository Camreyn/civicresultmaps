import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  matchesPrecinctGeometryPublicationMetadata,
  precinctGeometryPublicManifestSha256,
  requiresPrecinctGeometryPublicationGate,
  requiresPrecinctResultPublicationGate,
} from "../../src/lib/precinct-result-publication.ts";

test("Minnesota precinct results require the managed publication gate", () => {
  assert.equal(
    requiresPrecinctResultPublicationGate({ state: "MN", level: "precinct" }),
    true,
  );
  assert.equal(
    requiresPrecinctResultPublicationGate({ state: "MN", level: "county" }),
    false,
  );
  assert.equal(
    requiresPrecinctResultPublicationGate({ state: "WI", level: "precinct" }),
    false,
  );
});

function publishedManifestFixture() {
  return {
    schemaVersion: 1,
    id: "mn-2024-11-05-lcc-vtd2024general-v1",
    state: "MN",
    election: {
      id: "2024-11-05-general",
      date: "2024-11-05",
      year: 2024,
      type: "general",
      office: "president",
    },
    geography: {
      level: "precinct",
      parentLevel: "county",
      boundaryVintage: "official-2024",
      vintageStatus: "election_date_confirmed",
      derivationMethod: "official_export",
    },
    source: {},
    normalization: { featureCount: 2 },
    crosswalk: {},
    validation: {},
    delivery: {
      format: "parent_scoped_geojson",
      url: "/data/geography/mn/2024-11-05/precinct/index.json",
      sha256: "1".repeat(64),
      byteCount: 123,
      featureIdProperty: "geometryFeatureId",
      resultUnitProperty: "resultUnitCode",
      parentGeoidProperty: "parentGeoid",
      parentCount: 1,
      featureCount: 2,
    },
    caveats: [],
    eligible: true,
    publicEligibilityReasons: [],
  };
}

function publicationMetadata(manifest) {
  const releaseSha256 = "2".repeat(64);
  return {
    manifestId: manifest.id,
    publicDeliveryAuthorized: true,
    normalization: { featureCount: manifest.delivery.featureCount },
    crosswalk: { reviewedRelationships: manifest.delivery.featureCount },
    releaseCandidate: {
      id: "mn-precinct-gis-four-election-v1",
      sha256: releaseSha256,
      publicDeliveryAuthorized: true,
    },
    publicActivation: {
      activationId: "mn-public-2024",
      activationCandidateSha256: "3".repeat(64),
      releasePackageSha256: releaseSha256,
      blobPublicationSha256: "4".repeat(64),
      deliveryOrigin: "https://example.public.blob.vercel-storage.com",
      authorizationSha256: "5".repeat(64),
      changedAtUtc: "2026-08-08T15:00:00.000Z",
      revision: 42,
      mode: "publish",
      year: manifest.election.year,
      manifestId: manifest.id,
      publicManifestSha256: precinctGeometryPublicManifestSha256(manifest),
      delivery: manifest.delivery,
      previousCaveat: "blocked pending release",
    },
  };
}

test("Minnesota precinct geometry requires the same exact publication", () => {
  const manifest = publishedManifestFixture();
  const metadata = publicationMetadata(manifest);
  assert.equal(requiresPrecinctGeometryPublicationGate(manifest), true);
  assert.equal(matchesPrecinctGeometryPublicationMetadata(manifest, metadata), true);

  const wrongManifest = structuredClone(metadata);
  wrongManifest.publicActivation.publicManifestSha256 = "6".repeat(64);
  assert.equal(
    matchesPrecinctGeometryPublicationMetadata(manifest, wrongManifest),
    false,
  );

  const rolledBack = structuredClone(metadata);
  rolledBack.publicActivation.rollback = { rollbackId: "rollback" };
  assert.equal(
    matchesPrecinctGeometryPublicationMetadata(manifest, rolledBack),
    false,
  );
});

test("both precinct result query paths fail closed until exact DB publication", () => {
  const source = readFileSync("src/lib/data-access.ts", "utf8");
  assert.match(source, /if \(requiresPublicationGate\) return \[\];/);
  assert.equal(
    (source.match(/gate_version\.status = 'published'/g) ?? []).length,
    2,
  );
  assert.equal(
    (source.match(/gate_crosswalk\.reporting_unit_id = reporting_units\.id/g) ?? []).length,
    2,
  );
  assert.equal(
    (source.match(/gate_version\.election_id = elections\.id/g) ?? []).length,
    2,
  );
  assert.equal(
    (source.match(/gate_version\.metadata->>'publicDeliveryAuthorized' = 'true'/g) ?? []).length,
    2,
  );
  assert.equal(
    (source.match(/gate_crosswalk\.metadata->>'publicDeliveryAuthorized' = 'true'/g) ?? []).length,
    2,
  );
  assert.equal(
    (source.match(/source_documents\.metadata->>'publicDeliveryAuthorized' = 'true'/g) ?? []).length,
    2,
  );
  assert.equal(
    (source.match(/gate_version\.metadata->'releaseCandidate'->>'sha256'\s*= reporting_units\.metadata->'releaseCandidate'->>'sha256'/g) ?? []).length,
    2,
  );
  assert.match(
    source,
    /left join reporting_units\s+on result_rows\.reporting_unit_id = reporting_units\.id/,
  );
});

test("non-gated results do not require the precinct-only database schema", () => {
  const source = readFileSync("src/lib/data-access.ts", "utf8");
  const start = source.indexOf(
    "// County/state and other non-gated results must remain readable",
  );
  const end = source.indexOf(": (await sql`", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const compatibilityQuery = source.slice(start, end);
  assert.match(compatibilityQuery, /: !requiresPublicationGate/);
  assert.match(compatibilityQuery, /from result_rows/);
  assert.match(compatibilityQuery, /inner join elections/);
  assert.doesNotMatch(compatibilityQuery, /reporting_units/);
  assert.doesNotMatch(compatibilityQuery, /geography_versions/);
  assert.doesNotMatch(compatibilityQuery, /reporting_unit_geometry_crosswalks/);
});

test("precinct geometry fails closed on the same database publication state", () => {
  const dataAccess = readFileSync("src/lib/data-access.ts", "utf8");
  const route = readFileSync(
    "src/app/api/precinct-geography/route.ts",
    "utf8",
  );
  assert.match(dataAccess, /export async function isPrecinctGeometryManifestPublished/);
  assert.match(dataAccess, /geography_versions\.status = 'published'/);
  assert.match(dataAccess, /publicActivation'->>'publicManifestSha256'/);
  assert.match(dataAccess, /authorizedLinkCount/);
  assert.match(dataAccess, /matchesPrecinctGeometryPublicationMetadata/);
  assert.match(route, /await isPrecinctGeometryManifestPublished\(manifest\)/);
  assert.match(route, /local geography publication is not active/);
});
