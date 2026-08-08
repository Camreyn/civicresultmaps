import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readParentScopedPrecinctDelivery,
} from "../../src/lib/precinct-delivery-server.ts";

function feature(id, parentGeoid) {
  return {
    type: "Feature",
    properties: {
      geometryFeatureId: parentGeoid + "|" + id,
      resultUnitCode:
        "reporting:IA:2024-11-05-general:precinct:"
        + parentGeoid
        + ":"
        + id,
      parentGeoid,
      sourceFeatureId: parentGeoid + "|" + id,
      displayName: "Precinct " + id,
      geographyType: "precinct",
      relationshipType: "one_to_one",
    },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [-93.7, 41.5],
        [-93.6, 41.5],
        [-93.6, 41.6],
        [-93.7, 41.5],
      ]],
    },
  };
}

test("server verifies immutable bytes and filters before returning geometry", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "crm-precinct-"));
  try {
    const relativeUrl = "/data/geography/ia/2024/precinct-v1.geojson";
    const absolutePath = path.join(
      root,
      "public",
      "data",
      "geography",
      "ia",
      "2024",
      "precinct-v1.geojson",
    );
    await mkdir(path.dirname(absolutePath), { recursive: true });
    const bytes = Buffer.from(JSON.stringify({
      type: "FeatureCollection",
      metadata: {
        schemaVersion: 1,
        manifestId: "ia-2024-11-05-precinct-v1",
        state: "IA",
        electionId: "2024-11-05-general",
        boundaryVintage: "2024-11-05",
        sourceAuthority: "Iowa Secretary of State",
        sourceUrl: "https://example.gov/precincts",
        licenseOrTerms: "Retain this source notice.",
      },
      features: [
        feature("P1", "19001"),
        feature("P2", "19003"),
      ],
    }));
    await writeFile(absolutePath, bytes);
    const manifest = {
      id: "ia-2024-11-05-precinct-v1",
      state: "IA",
      election: { id: "2024-11-05-general" },
      geography: { boundaryVintage: "2024-11-05" },
      source: {
        authority: "Iowa Secretary of State",
        url: "https://example.gov/precincts",
        licenseOrTerms: "Retain this source notice.",
      },
      eligible: true,
      delivery: {
        format: "geojson",
        url: relativeUrl,
        byteCount: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    };

    const delivery = await readParentScopedPrecinctDelivery(
      manifest,
      "19001",
      { repositoryRoot: root },
    );
    assert.equal(delivery.collection.features.length, 1);
    assert.equal(
      delivery.collection.features[0].properties.parentGeoid,
      "19001",
    );
    assert.equal(delivery.sourceByteCount, bytes.byteLength);
    assert.equal(delivery.collection.metadata.licenseOrTerms, "Retain this source notice.");

    await assert.rejects(
      () => readParentScopedPrecinctDelivery(
        {
          ...manifest,
          source: {
            ...manifest.source,
            licenseOrTerms: "Wrong source terms.",
          },
        },
        "19001",
        { repositoryRoot: root },
      ),
      /metadata licenseOrTerms does not match manifest/,
    );

    await writeFile(
      absolutePath,
      Buffer.from(bytes.toString("utf8").replace("P1", "X1")),
    );
    await assert.rejects(
      () => readParentScopedPrecinctDelivery(
        manifest,
        "19001",
        { repositoryRoot: root },
      ),
      /SHA-256/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("server rejects unreviewed and path-escaping deliveries", async () => {
  await assert.rejects(
    () => readParentScopedPrecinctDelivery(
      { eligible: false, delivery: null },
      "19001",
    ),
    /not public-delivery eligible/,
  );
  await assert.rejects(
    () => readParentScopedPrecinctDelivery(
      {
        eligible: true,
        delivery: {
          format: "geojson",
          url: "/data/geography/../private.json",
          byteCount: 0,
          sha256: "0".repeat(64),
        },
      },
      "19001",
    ),
    /unsafe path segment/,
  );
});
