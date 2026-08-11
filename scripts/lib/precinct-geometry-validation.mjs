import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  inspectPrecinctGeometryRegistry,
  isPrecinctGeometryManifestPubliclyEligible,
} from "../../src/lib/precinct-geography.ts";
import { inspectPrecinctCrosswalk } from "../../src/lib/precinct-crosswalk.ts";
import {
  inspectPrecinctSourcePackageManifest,
} from "../../src/lib/precinct-source-package.ts";

const MAX_DETAIL_ERRORS = 100;

function pushLimited(errors, message) {
  if (errors.length < MAX_DETAIL_ERRORS) {
    errors.push(message);
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function resolveInside(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (
    resolved !== resolvedRoot
    && !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error("path escapes repository root: " + relativePath);
  }
  return { resolvedRoot, resolved };
}

function readVerifiedFile(root, relativePath, expectedSha, expectedBytes) {
  const { resolvedRoot, resolved } = resolveInside(root, relativePath);
  if (!existsSync(resolved)) {
    return {
      errors: ["missing artifact " + relativePath],
      buffer: null,
    };
  }

  const realRoot = realpathSync(resolvedRoot);
  const realFile = realpathSync(resolved);
  if (
    realFile !== realRoot
    && !realFile.startsWith(realRoot + path.sep)
  ) {
    return {
      errors: ["artifact resolves outside repository root: " + relativePath],
      buffer: null,
    };
  }

  const errors = [];
  const size = statSync(realFile).size;
  if (expectedBytes !== undefined && size !== expectedBytes) {
    errors.push(
      relativePath
      + " byte count "
      + size
      + " does not match manifest "
      + expectedBytes,
    );
  }

  const buffer = readFileSync(realFile);
  const actualSha = sha256(buffer);
  if (actualSha.toLowerCase() !== String(expectedSha).toLowerCase()) {
    errors.push(
      relativePath
      + " SHA-256 "
      + actualSha
      + " does not match manifest "
      + expectedSha,
    );
  }

  return { errors, buffer };
}

function valueForFields(properties, fields) {
  return fields.map((field) => String(properties[field] ?? "").trim());
}

function samePosition(left, right) {
  return (
    Array.isArray(left)
    && Array.isArray(right)
    && left.length >= 2
    && right.length >= 2
    && left[0] === right[0]
    && left[1] === right[1]
  );
}

function inspectPosition(position, context, errors, metrics) {
  if (
    !Array.isArray(position)
    || position.length < 2
    || !Number.isFinite(position[0])
    || !Number.isFinite(position[1])
  ) {
    pushLimited(errors, context + " has an invalid coordinate position");
    return;
  }

  const longitude = Number(position[0]);
  const latitude = Number(position[1]);
  if (longitude < -180 || longitude > 180) {
    pushLimited(errors, context + " longitude is outside WGS84 range");
  }
  if (latitude < -90 || latitude > 90) {
    pushLimited(errors, context + " latitude is outside WGS84 range");
  }
  metrics.positions += 1;
}

function inspectRing(ring, context, errors, metrics) {
  if (!Array.isArray(ring) || ring.length < 4) {
    pushLimited(errors, context + " must contain at least four positions");
    return;
  }
  if (!samePosition(ring[0], ring[ring.length - 1])) {
    pushLimited(errors, context + " is not closed");
  }
  for (let index = 0; index < ring.length; index += 1) {
    inspectPosition(ring[index], context + "[" + index + "]", errors, metrics);
  }
  metrics.rings += 1;
}

function inspectPolygonCoordinates(coordinates, context, errors, metrics) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    pushLimited(errors, context + " must contain at least one ring");
    return;
  }
  for (let index = 0; index < coordinates.length; index += 1) {
    inspectRing(
      coordinates[index],
      context + "[" + index + "]",
      errors,
      metrics,
    );
  }
}

export function validateGeometryFeatureCollection(geoJson, manifest) {
  const errors = [];
  const warnings = [];
  const metrics = {
    features: 0,
    polygons: 0,
    multiPolygons: 0,
    rings: 0,
    positions: 0,
    uniqueFeatureKeys: 0,
  };

  if (!isRecord(geoJson) || geoJson.type !== "FeatureCollection") {
    return {
      errors: ["normalized geometry must be a GeoJSON FeatureCollection"],
      warnings,
      metrics,
    };
  }
  if (!Array.isArray(geoJson.features) || geoJson.features.length === 0) {
    return {
      errors: ["normalized geometry must contain features"],
      warnings,
      metrics,
    };
  }

  const expectedCount = manifest.normalization.featureCount;
  if (geoJson.features.length !== expectedCount) {
    errors.push(
      "geometry feature count "
      + geoJson.features.length
      + " does not match manifest "
      + expectedCount,
    );
  }

  const featureKeys = new Set();
  const featureParents = new Map();
  for (let index = 0; index < geoJson.features.length; index += 1) {
    const feature = geoJson.features[index];
    const context = "features[" + index + "]";
    if (!isRecord(feature) || feature.type !== "Feature") {
      pushLimited(errors, context + " must be a GeoJSON Feature");
      continue;
    }
    const properties = isRecord(feature.properties) ? feature.properties : {};
    const sourceValues = valueForFields(
      properties,
      manifest.normalization.sourceFeatureIdFields,
    );
    const parentValues = valueForFields(
      properties,
      manifest.normalization.parentIdFields,
    );
    if (sourceValues.some((value) => !value)) {
      pushLimited(errors, context + " is missing a source feature ID field");
    }
    if (parentValues.some((value) => !value)) {
      pushLimited(errors, context + " is missing a parent ID field");
    }
    if (manifest.geography.parentLevel === "county") {
      for (const parentValue of parentValues) {
        if (parentValue && !/^\d{5}$/.test(parentValue)) {
          pushLimited(
            errors,
            context
              + " county parent ID must be a five-digit county/county-equivalent GEOID: "
              + parentValue,
          );
        }
      }
    }

    const featureKey = parentValues.concat(sourceValues).join("|");
    if (featureKeys.has(featureKey)) {
      pushLimited(errors, context + " duplicates feature identity " + featureKey);
    } else {
      featureKeys.add(featureKey);
      featureParents.set(featureKey, parentValues.join("|"));
    }

    const geometry = isRecord(feature.geometry) ? feature.geometry : {};
    if (geometry.type === "Polygon") {
      metrics.polygons += 1;
      inspectPolygonCoordinates(
        geometry.coordinates,
        context + ".geometry.coordinates",
        errors,
        metrics,
      );
    } else if (geometry.type === "MultiPolygon") {
      metrics.multiPolygons += 1;
      if (
        !Array.isArray(geometry.coordinates)
        || geometry.coordinates.length === 0
      ) {
        pushLimited(errors, context + " MultiPolygon must contain polygons");
      } else {
        for (
          let polygonIndex = 0;
          polygonIndex < geometry.coordinates.length;
          polygonIndex += 1
        ) {
          inspectPolygonCoordinates(
            geometry.coordinates[polygonIndex],
            context
              + ".geometry.coordinates["
              + polygonIndex
              + "]",
            errors,
            metrics,
          );
        }
      }
    } else {
      pushLimited(
        errors,
        context + " geometry must be Polygon or MultiPolygon",
      );
    }
  }

  metrics.features = geoJson.features.length;
  metrics.uniqueFeatureKeys = featureKeys.size;
  if (errors.length >= MAX_DETAIL_ERRORS) {
    warnings.push(
      "geometry detail errors were truncated at " + MAX_DETAIL_ERRORS,
    );
  }
  return { errors, warnings, metrics, featureIds: featureKeys, featureParents };
}

function parseNormalizedGeometry(buffer, artifactPath) {
  const payload = artifactPath.endsWith(".gz")
    ? zlib.gunzipSync(buffer)
    : buffer;
  try {
    return JSON.parse(payload.toString("utf8"));
  } catch (error) {
    throw new Error(
      "unable to parse normalized geometry "
      + artifactPath
      + ": "
      + error.message,
    );
  }
}

function isInspectableGeoJson(pathname) {
  return pathname.endsWith(".geojson") || pathname.endsWith(".geojson.gz");
}

export function validateSourcePackageArtifacts(
  sourcePackageDocument,
  precinctManifest,
  options = {},
) {
  const root = options.root ?? process.cwd();
  const errors = [];
  const warnings = [];
  const inspection = inspectPrecinctSourcePackageManifest(
    sourcePackageDocument,
  );
  errors.push(
    ...inspection.errors.map((error) => "source package manifest: " + error),
  );

  const sourcePackageManifest = inspection.manifest;
  if (!sourcePackageManifest) {
    return {
      errors,
      warnings,
      metrics: null,
    };
  }

  for (const [actual, expected, label] of [
    [sourcePackageManifest.state, precinctManifest.state, "state"],
    [
      sourcePackageManifest.election.id,
      precinctManifest.election.id,
      "election.id",
    ],
    [
      sourcePackageManifest.election.date,
      precinctManifest.election.date,
      "election.date",
    ],
    [
      sourcePackageManifest.election.type,
      precinctManifest.election.type,
      "election.type",
    ],
    [
      sourcePackageManifest.geographyLevel,
      precinctManifest.geography.level,
      "geography level",
    ],
    [
      sourcePackageManifest.authority,
      precinctManifest.source.authority,
      "source authority",
    ],
  ]) {
    if (actual !== expected) {
      errors.push(
        "source package manifest "
        + label
        + " "
        + actual
        + " does not match precinct manifest "
        + expected,
      );
    }
  }

  let verifiedPackageCount = 0;
  for (const sourcePackage of sourcePackageManifest.packages) {
    const verified = readVerifiedFile(
      root,
      sourcePackage.artifact,
      sourcePackage.sha256,
      sourcePackage.byteCount,
    );
    errors.push(
      ...verified.errors.map(
        (error) => "source package " + sourcePackage.id + ": " + error,
      ),
    );
    if (verified.buffer && verified.errors.length === 0) {
      verifiedPackageCount += 1;
    }
  }

  return {
    errors,
    warnings,
    metrics: {
      packageCount: sourcePackageManifest.summary.packageCount,
      verifiedPackageCount,
      byteCount: sourcePackageManifest.summary.byteCount,
      sourceFeatureCount: sourcePackageManifest.summary.sourceFeatureCount,
      parentsWithPackages:
        sourcePackageManifest.coverage.parentsWithPackages,
      missingParentCount:
        sourcePackageManifest.coverage.missingParents.length,
    },
  };
}

export function validateSourceEvidenceArtifacts(
  sourceEvidenceDocument,
  manifest,
  options = {},
) {
  const root = options.root ?? process.cwd();
  const errors = [];
  const warnings = [];
  let artifactCount = 0;
  let verifiedArtifactCount = 0;
  let byteCount = 0;
  let upstreamArtifactCount = 0;
  let upstreamByteCount = 0;
  const metrics = () => ({
    artifactCount,
    verifiedArtifactCount,
    byteCount,
    ...(upstreamArtifactCount > 0
      ? { upstreamArtifactCount, upstreamByteCount }
      : {}),
  });

  if (!isRecord(sourceEvidenceDocument)) {
    return {
      errors: ["source evidence must be a JSON object"],
      warnings,
      metrics: metrics(),
    };
  }
  if (sourceEvidenceDocument.schemaVersion !== 1) {
    errors.push("source evidence schemaVersion must be 1");
  }
  if (sourceEvidenceDocument.state !== manifest.state) {
    errors.push(
      "source evidence state "
      + sourceEvidenceDocument.state
      + " does not match manifest "
      + manifest.state,
    );
  }
  if (sourceEvidenceDocument.election?.id !== manifest.election.id) {
    errors.push(
      "source evidence election "
      + sourceEvidenceDocument.election?.id
      + " does not match manifest "
      + manifest.election.id,
    );
  }
  if (sourceEvidenceDocument.authority !== manifest.source.authority) {
    errors.push("source evidence authority does not match manifest authority");
  }
  if (sourceEvidenceDocument.retrievedAt !== manifest.source.retrievedAt) {
    errors.push("source evidence retrieval time does not match manifest");
  }

  const artifacts = sourceEvidenceDocument.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    errors.push("source evidence artifacts must contain at least one artifact");
    return {
      errors,
      warnings,
      metrics: metrics(),
    };
  }

  artifactCount = artifacts.length;
  const artifactPaths = new Set();
  for (const [index, artifact] of artifacts.entries()) {
    const context = "source evidence artifacts[" + index + "]";
    if (!isRecord(artifact)) {
      errors.push(context + " must be an object");
      continue;
    }

    const locatorFields = ["url", "sourceUrl", "sourceUrls"].filter(
      (field) => artifact[field] !== undefined,
    );
    if (locatorFields.length !== 1) {
      errors.push(
        context
        + " must declare exactly one artifact-level HTTPS locator field: url, sourceUrl, or sourceUrls",
      );
    }
    if (
      artifact.url !== undefined
      && (typeof artifact.url !== "string" || !artifact.url.startsWith("https://"))
    ) {
      errors.push(context + ".url must use HTTPS");
    }
    if (
      artifact.sourceUrl !== undefined
      && (
        typeof artifact.sourceUrl !== "string"
        || !artifact.sourceUrl.startsWith("https://")
      )
    ) {
      errors.push(context + ".sourceUrl must use HTTPS");
    }
    if (artifact.sourceUrls !== undefined) {
      if (
        !Array.isArray(artifact.sourceUrls)
        || artifact.sourceUrls.length === 0
      ) {
        errors.push(context + ".sourceUrls must be a nonempty array");
      } else {
        const uniqueSourceUrls = new Set();
        for (const sourceUrl of artifact.sourceUrls) {
          if (
            typeof sourceUrl !== "string"
            || !sourceUrl.startsWith("https://")
          ) {
            errors.push(context + ".sourceUrls entries must use HTTPS");
          }
          if (uniqueSourceUrls.has(sourceUrl)) {
            errors.push(context + ".sourceUrls must not contain duplicates");
          }
          uniqueSourceUrls.add(sourceUrl);
        }
      }
    }
    if (
      (artifact.sourceUrl !== undefined || artifact.sourceUrls !== undefined)
      && (
        typeof artifact.derivation !== "string"
        || !artifact.derivation.trim()
      )
    ) {
      errors.push(
        context
        + ".derivation must explain how the retained artifact was produced from sourceUrl/sourceUrls",
      );
    }
    if (
      artifact.archiveMember !== undefined
      && (
        typeof artifact.archiveMember !== "string"
        || !artifact.archiveMember.trim()
      )
    ) {
      errors.push(context + ".archiveMember must be a nonempty string");
    }
    if (artifact.derivedFromUrls !== undefined) {
      if (
        !Array.isArray(artifact.derivedFromUrls)
        || artifact.derivedFromUrls.length === 0
        || artifact.derivedFromUrls.some(
          (url) => typeof url !== "string" || !url.startsWith("https://"),
        )
      ) {
        errors.push(
          context + ".derivedFromUrls must contain only HTTPS URLs",
        );
      }
    }

    const localArtifactPath = String(artifact.localArtifactPath ?? "");
    const expectedSha = String(artifact.sha256 ?? "");
    const expectedBytes = artifact.byteCount;
    const expectedUncompressedSha = artifact.uncompressedSha256;
    const expectedUncompressedBytes = artifact.uncompressedByteCount;
    const hasUncompressedMetadata =
      expectedUncompressedSha !== undefined
      || expectedUncompressedBytes !== undefined;
    if (
      !localArtifactPath.startsWith("data/")
      || localArtifactPath.includes("\\")
      || localArtifactPath.split("/").includes("..")
    ) {
      errors.push(context + " has an unsafe localArtifactPath");
      continue;
    }
    if (artifactPaths.has(localArtifactPath)) {
      errors.push(context + " duplicates artifact path " + localArtifactPath);
      continue;
    }
    artifactPaths.add(localArtifactPath);
    if (!/^[a-f0-9]{64}$/i.test(expectedSha)) {
      errors.push(context + " has an invalid SHA-256 value");
      continue;
    }
    if (!Number.isInteger(expectedBytes) || expectedBytes <= 0) {
      errors.push(context + " has an invalid byteCount");
      continue;
    }

    const verified = readVerifiedFile(
      root,
      localArtifactPath,
      expectedSha,
      expectedBytes,
    );
    const artifactErrors = [...verified.errors];
    if (localArtifactPath.endsWith(".gz") && !hasUncompressedMetadata) {
      artifactErrors.push(
        localArtifactPath
        + " must declare uncompressedByteCount and uncompressedSha256",
      );
    }
    if (hasUncompressedMetadata) {
      const validUncompressedSha =
        /^[a-f0-9]{64}$/i.test(String(expectedUncompressedSha ?? ""));
      const validUncompressedBytes =
        Number.isInteger(expectedUncompressedBytes)
        && expectedUncompressedBytes > 0;
      if (!localArtifactPath.endsWith(".gz")) {
        artifactErrors.push(
          localArtifactPath
          + " declares uncompressed metadata but is not a gzip artifact",
        );
      }
      if (!validUncompressedSha) {
        artifactErrors.push(
          localArtifactPath + " has an invalid uncompressed SHA-256 value",
        );
      }
      if (!validUncompressedBytes) {
        artifactErrors.push(
          localArtifactPath + " has an invalid uncompressedByteCount",
        );
      }
      if (
        verified.buffer
        && localArtifactPath.endsWith(".gz")
        && validUncompressedSha
        && validUncompressedBytes
      ) {
        try {
          const uncompressed = zlib.gunzipSync(verified.buffer);
          if (uncompressed.length !== expectedUncompressedBytes) {
            artifactErrors.push(
              localArtifactPath
              + " uncompressed byte count "
              + uncompressed.length
              + " does not match evidence "
              + expectedUncompressedBytes,
            );
          }
          const actualUncompressedSha = sha256(uncompressed);
          if (
            actualUncompressedSha.toLowerCase()
            !== String(expectedUncompressedSha).toLowerCase()
          ) {
            artifactErrors.push(
              localArtifactPath
              + " uncompressed SHA-256 "
              + actualUncompressedSha
              + " does not match evidence "
              + expectedUncompressedSha,
            );
          }
        } catch (error) {
          artifactErrors.push(
            localArtifactPath + " cannot be gunzipped: " + error.message,
          );
        }
      }
    }
    errors.push(
      ...artifactErrors.map((error) => context + ": " + error),
    );
    byteCount += expectedBytes;
    if (verified.buffer && artifactErrors.length === 0) {
      verifiedArtifactCount += 1;
    }
  }

  const upstreamArtifacts = sourceEvidenceDocument.upstreamArtifacts;
  if (upstreamArtifacts !== undefined) {
    if (!Array.isArray(upstreamArtifacts) || upstreamArtifacts.length === 0) {
      errors.push(
        "source evidence upstreamArtifacts must be a nonempty array when declared",
      );
    } else {
      upstreamArtifactCount = upstreamArtifacts.length;
      const upstreamKeys = new Set();
      for (const [index, upstream] of upstreamArtifacts.entries()) {
        const context = "source evidence upstreamArtifacts[" + index + "]";
        if (!isRecord(upstream)) {
          errors.push(context + " must be an object");
          continue;
        }
        const url = String(upstream.url ?? "");
        const expectedSha = String(upstream.sha256 ?? "");
        const expectedBytes = upstream.byteCount;
        const format = String(upstream.format ?? "").trim();
        const retention = String(upstream.retention ?? "");
        const retentionReason = String(upstream.retentionReason ?? "").trim();
        const retrievalScript = String(upstream.retrievalScript ?? "");
        const derivedArtifactPaths = upstream.derivedArtifactPaths;
        const upstreamKey = url + "|" + expectedSha;

        if (!url.startsWith("https://")) {
          errors.push(context + ".url must use HTTPS");
        }
        if (!/^[a-f0-9]{64}$/i.test(expectedSha)) {
          errors.push(context + " has an invalid SHA-256 value");
        }
        if (!Number.isInteger(expectedBytes) || expectedBytes <= 0) {
          errors.push(context + " has an invalid byteCount");
        } else {
          upstreamByteCount += expectedBytes;
        }
        if (!format) {
          errors.push(context + ".format must be a nonempty string");
        }
        if (retention !== "external_due_to_repository_limit") {
          errors.push(
            context
            + ".retention must be external_due_to_repository_limit",
          );
        }
        if (!retentionReason) {
          errors.push(context + ".retentionReason must be a nonempty string");
        }
        if (
          !retrievalScript.startsWith("scripts/")
          || retrievalScript.includes("\\")
          || retrievalScript.split("/").includes("..")
        ) {
          errors.push(context + ".retrievalScript is not a safe script path");
        } else {
          try {
            const resolvedScript = resolveInside(root, retrievalScript).resolved;
            if (!existsSync(resolvedScript) || !statSync(resolvedScript).isFile()) {
              errors.push(context + ".retrievalScript does not exist");
            }
          } catch (error) {
            errors.push(context + ".retrievalScript: " + error.message);
          }
        }
        if (
          !Array.isArray(derivedArtifactPaths)
          || derivedArtifactPaths.length === 0
        ) {
          errors.push(
            context + ".derivedArtifactPaths must be a nonempty array",
          );
        } else {
          for (const derivedPath of derivedArtifactPaths) {
            if (
              typeof derivedPath !== "string"
              || !artifactPaths.has(derivedPath)
            ) {
              errors.push(
                context
                + ".derivedArtifactPaths must reference retained evidence artifacts",
              );
            }
          }
        }
        if (upstreamKeys.has(upstreamKey)) {
          errors.push(context + " duplicates an upstream URL and hash");
        }
        upstreamKeys.add(upstreamKey);
        warnings.push(
          context
          + " is externally reproducible but not retained in the repository: "
          + retentionReason,
        );
      }
    }
  }

  return {
    errors,
    warnings,
    metrics: metrics(),
  };
}

export function validateManifestArtifacts(manifest, options = {}) {
  const root = options.root ?? process.cwd();
  const errors = [];
  const warnings = [];

  const source = readVerifiedFile(
    root,
    manifest.source.artifact,
    manifest.source.sha256,
    manifest.source.byteCount,
  );
  errors.push(...source.errors);

  let sourcePackages = null;
  if (
    source.buffer
    && manifest.source.format === "precinct-source-package-manifest+json"
  ) {
    try {
      const sourcePackageDocument = JSON.parse(source.buffer.toString("utf8"));
      sourcePackages = validateSourcePackageArtifacts(
        sourcePackageDocument,
        manifest,
        { root },
      );
      errors.push(...sourcePackages.errors);
      warnings.push(...sourcePackages.warnings);
    } catch (error) {
      errors.push(
        "unable to parse source package manifest: " + error.message,
      );
    }
  }

  let sourceEvidence = null;
  if (
    source.buffer
    && manifest.source.format === "precinct-source-evidence+json"
  ) {
    try {
      const sourceEvidenceDocument = JSON.parse(source.buffer.toString("utf8"));
      sourceEvidence = validateSourceEvidenceArtifacts(
        sourceEvidenceDocument,
        manifest,
        { root },
      );
      errors.push(...sourceEvidence.errors);
      warnings.push(...sourceEvidence.warnings);
    } catch (error) {
      errors.push("unable to parse source evidence: " + error.message);
    }
  }

  const normalized = readVerifiedFile(
    root,
    manifest.normalization.artifact,
    manifest.normalization.sha256,
  );
  errors.push(...normalized.errors);

  const crosswalk = readVerifiedFile(
    root,
    manifest.crosswalk.artifact,
    manifest.crosswalk.sha256,
  );
  errors.push(...crosswalk.errors);

  let geometry = null;
  if (normalized.buffer && isInspectableGeoJson(manifest.normalization.artifact)) {
    try {
      const geoJson = parseNormalizedGeometry(
        normalized.buffer,
        manifest.normalization.artifact,
      );
      geometry = validateGeometryFeatureCollection(geoJson, manifest);
      errors.push(...geometry.errors);
      warnings.push(...geometry.warnings);
    } catch (error) {
      errors.push(error.message);
    }
  } else if (normalized.buffer) {
    warnings.push(
      "normalized artifact is not directly inspectable GeoJSON: "
      + manifest.normalization.artifact,
    );
  }
  let crosswalkInspection = null;
  if (crosswalk.buffer) {
    try {
      const crosswalkDocument = JSON.parse(crosswalk.buffer.toString("utf8"));
      if (
        manifest.crosswalk.status === "reviewed"
        || crosswalkDocument?.schemaVersion === 1
      ) {
        crosswalkInspection = inspectPrecinctCrosswalk(
          crosswalkDocument,
          manifest,
          geometry?.featureIds,
          geometry?.featureParents,
        );
        errors.push(...crosswalkInspection.errors);
        const relationships = Array.isArray(crosswalkDocument?.rows)
          ? crosswalkDocument.rows.flatMap((row) =>
            Array.isArray(row?.relationships) ? row.relationships : []
          )
          : [];
        const reviewedRelationships = relationships.filter(
          (relationship) => relationship?.reviewStatus === "reviewed",
        );
        if (
          manifest.crosswalk.reviewedRelationshipRecords !== undefined
          && reviewedRelationships.length
            !== manifest.crosswalk.reviewedRelationshipRecords
        ) {
          errors.push(
            "reviewed crosswalk relationship record count "
            + reviewedRelationships.length
            + " does not match manifest "
            + manifest.crosswalk.reviewedRelationshipRecords,
          );
        }
        if (geometry && manifest.crosswalk.status === "reviewed") {
          const linkedFeatureIds = new Set(
            reviewedRelationships
              .map((relationship) => relationship?.sourceFeatureId)
              .filter((featureId) => typeof featureId === "string" && featureId),
          );
          const reviewedNoDataFeatures = geometry.featureIds.size
            - linkedFeatureIds.size;
          if (
            reviewedNoDataFeatures > 0
            && manifest.crosswalk.reviewedNoDataFeatures === undefined
          ) {
            errors.push(
              "reviewed crosswalk leaves "
              + reviewedNoDataFeatures
              + " geometry features without result data but does not declare reviewedNoDataFeatures",
            );
          } else if (
            manifest.crosswalk.reviewedNoDataFeatures !== undefined
            && reviewedNoDataFeatures
              !== manifest.crosswalk.reviewedNoDataFeatures
          ) {
            errors.push(
              "reviewed no-data feature count "
              + reviewedNoDataFeatures
              + " does not match manifest "
              + manifest.crosswalk.reviewedNoDataFeatures,
            );
          }
        }
      }
    } catch (error) {
      errors.push("unable to parse crosswalk artifact: " + error.message);
    }
  }


  if (manifest.delivery && !options.skipDelivery) {
    const relativeDeliveryPath = path.posix.join(
      "public",
      manifest.delivery.url.replace(/^\//, ""),
    );
    const delivery = readVerifiedFile(
      root,
      relativeDeliveryPath,
      manifest.delivery.sha256,
      manifest.delivery.byteCount,
    );
    errors.push(...delivery.errors);
  }

  const eligible = isPrecinctGeometryManifestPubliclyEligible(manifest) && errors.length === 0;
  return {
    id: manifest.id,
    state: manifest.state,
    electionId: manifest.election.id,
    level: manifest.geography.level,
    reviewStatus: manifest.validation.status,
    eligible,
    errors,
    warnings,
    geometry: geometry?.metrics ?? null,
    crosswalk: crosswalkInspection?.summary ?? null,
    sourcePackages: sourcePackages?.metrics ?? null,
    sourceEvidence: sourceEvidence?.metrics ?? null,
  };
}

export function validatePrecinctGeometryRegistryArtifacts(
  registry,
  options = {},
) {
  const contract = inspectPrecinctGeometryRegistry(registry);
  const manifests = Array.isArray(registry?.manifests)
    ? registry.manifests.map((manifest) =>
        validateManifestArtifacts(manifest, options),
      )
    : [];
  const artifactErrors = manifests.flatMap((manifest) =>
    manifest.errors.map((error) => manifest.id + ": " + error),
  );

  return {
    schemaVersion: registry?.schemaVersion ?? null,
    manifestCount: manifests.length,
    eligibleManifestCount: manifests.filter((manifest) => manifest.eligible)
      .length,
    blockedManifestCount: manifests.filter(
      (manifest) => manifest.reviewStatus === "blocked",
    ).length,
    errors: contract.errors.concat(artifactErrors),
    manifests,
  };
}
