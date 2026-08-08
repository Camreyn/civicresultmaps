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

test("server reads only the hash-pinned parent asset behind a remote index", async () => {
  const metadata = {
    schemaVersion: 1,
    manifestId: "ia-2024-11-05-precinct-v1",
    state: "IA",
    electionId: "2024-11-05-general",
    boundaryVintage: "2024-11-05",
    sourceAuthority: "Iowa Secretary of State",
    sourceUrl: "https://example.gov/precincts",
    licenseOrTerms: "Retain this source notice.",
  };
  const parentCollections = new Map([
    ["19001", {
      type: "FeatureCollection",
      metadata,
      features: [feature("P1", "19001")],
    }],
    ["19003", {
      type: "FeatureCollection",
      metadata,
      features: [feature("P2", "19003")],
    }],
  ]);
  const parentArtifacts = [...parentCollections].map(
    ([parentGeoid, collection]) => {
      const bytes = Buffer.from(JSON.stringify(collection) + "\n");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      return {
        parentGeoid,
        path: "parents/" + parentGeoid + "-" + sha256.slice(0, 12) + ".geojson",
        sha256,
        byteCount: bytes.byteLength,
        featureCount: collection.features.length,
        bytes,
      };
    },
  );
  const index = {
    schemaVersion: 1,
    format: "parent_scoped_geojson",
    metadata,
    featureIdProperty: "geometryFeatureId",
    resultUnitProperty: "resultUnitCode",
    parentGeoidProperty: "parentGeoid",
    parentCount: parentArtifacts.length,
    featureCount: 2,
    parents: parentArtifacts.map(({ bytes: _bytes, ...artifact }) => artifact),
  };
  const indexBytes = Buffer.from(JSON.stringify(index) + "\n");
  const indexSha256 = createHash("sha256").update(indexBytes).digest("hex");
  const indexUrl =
    "/data/geography/ia/2024/precinct/ia-v1-"
    + indexSha256.slice(0, 12)
    + "/index.json";
  const remote = new Map([
    [indexUrl, indexBytes],
    ...parentArtifacts.map((artifact) => [
      indexUrl.slice(0, indexUrl.lastIndexOf("/") + 1) + artifact.path,
      artifact.bytes,
    ]),
  ]);
  const requested = [];
  const fetchImpl = async (url) => {
    const pathname = new URL(url).pathname;
    requested.push(pathname);
    const bytes = remote.get(pathname);
    return new Response(bytes ?? "missing", { status: bytes ? 200 : 404 });
  };
  const manifest = {
    id: metadata.manifestId,
    state: metadata.state,
    election: { id: metadata.electionId },
    geography: { boundaryVintage: metadata.boundaryVintage },
    source: {
      authority: metadata.sourceAuthority,
      url: metadata.sourceUrl,
      licenseOrTerms: metadata.licenseOrTerms,
    },
    eligible: true,
    delivery: {
      format: "parent_scoped_geojson",
      url: indexUrl,
      byteCount: indexBytes.byteLength,
      sha256: indexSha256,
      featureIdProperty: "geometryFeatureId",
      resultUnitProperty: "resultUnitCode",
      parentGeoidProperty: "parentGeoid",
      parentCount: 2,
      featureCount: 2,
    },
  };

  const delivery = await readParentScopedPrecinctDelivery(
    manifest,
    "19001",
    {
      deliveryOrigin: "https://public-geometry.example/",
      fetchImpl,
    },
  );
  assert.equal(delivery.collection.features.length, 1);
  assert.equal(delivery.collection.features[0].properties.parentGeoid, "19001");
  assert.equal(delivery.indexSha256, indexSha256);
  assert.deepEqual(requested, [
    indexUrl,
    indexUrl.slice(0, indexUrl.lastIndexOf("/") + 1)
      + parentArtifacts[0].path,
  ]);

  const badParent = Buffer.from(parentArtifacts[0].bytes);
  badParent[badParent.length - 2] ^= 1;
  remote.set(requested[1], badParent);
  await assert.rejects(
    () => readParentScopedPrecinctDelivery(manifest, "19001", {
      deliveryOrigin: "https://public-geometry.example/",
      fetchImpl,
    }),
    /SHA-256 does not match index/,
  );
});
