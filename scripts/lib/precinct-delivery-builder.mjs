import {
  inspectPrecinctGeometryManifest,
} from "../../src/lib/precinct-geography.ts";
import {
  inspectPrecinctCrosswalk,
} from "../../src/lib/precinct-crosswalk.ts";
import {
  validateGeometryFeatureCollection,
} from "./precinct-geometry-validation.mjs";

function featureIdentity(feature, manifest) {
  const properties = feature?.properties ?? {};
  return manifest.normalization.parentIdFields
    .concat(manifest.normalization.sourceFeatureIdFields)
    .map((field) => String(properties[field] ?? "").trim())
    .join("|");
}

function featureParentIdentity(feature, manifest) {
  const properties = feature?.properties ?? {};
  return manifest.normalization.parentIdFields
    .map((field) => String(properties[field] ?? "").trim())
    .join("|");
}

function buildPrecinctDeliveryFeatureCollectionInternal(
  manifest,
  normalizedGeometry,
  crosswalkDocument,
  options = {},
) {
  const manifestInspection = inspectPrecinctGeometryManifest(manifest);
  if (manifestInspection.errors.length > 0) {
    throw new Error(
      "precinct manifest contract is invalid: "
      + manifestInspection.errors.join("; "),
    );
  }
  const publicEligibilityReasons =
    manifestInspection.publicEligibilityReasons;
  if (options.candidate) {
    const permittedCandidateReasons = new Set([
      "validation status is not reviewed",
      "row-level rendering is not safe",
      "validation errors remain",
      "no immutable delivery artifact is declared",
    ]);
    const candidateBlockingReasons = publicEligibilityReasons.filter(
      (reason) => !permittedCandidateReasons.has(reason),
    );
    if (manifest.validation.status === "rejected") {
      candidateBlockingReasons.unshift("validation status is rejected");
    }
    if (candidateBlockingReasons.length > 0) {
      throw new Error(
        "precinct manifest is not candidate-build ready: "
        + candidateBlockingReasons.join("; "),
      );
    }
  } else if (publicEligibilityReasons.length > 0) {
    throw new Error(
      "precinct manifest is not delivery eligible: "
      + publicEligibilityReasons.join("; "),
    );
  }
  if (!options.candidate && manifest.delivery?.format !== "geojson") {
    throw new Error("initial precinct delivery builder requires GeoJSON");
  }

  const geometryInspection = validateGeometryFeatureCollection(
    normalizedGeometry,
    manifest,
  );
  if (geometryInspection.errors.length > 0) {
    throw new Error(
      "normalized geometry is invalid: "
      + geometryInspection.errors.join("; "),
    );
  }

  const crosswalkInspection = inspectPrecinctCrosswalk(
    crosswalkDocument,
    manifest,
    geometryInspection.featureIds,
    geometryInspection.featureParents,
  );
  if (crosswalkInspection.errors.length > 0) {
    throw new Error(
      "precinct crosswalk is invalid: "
      + crosswalkInspection.errors.join("; "),
    );
  }

  const featuresById = new Map();
  for (const feature of normalizedGeometry.features) {
    const identity = featureIdentity(feature, manifest);
    featuresById.set(identity, feature);
  }

  const resultUnitByFeature = new Map();
  const deliveryFeatures = [];
  for (const row of crosswalkDocument.rows) {
    if (row.isGeographic === true && !row.parentGeoid) {
      throw new Error(
        "geographic delivery row requires parentGeoid for "
        + row.resultUnitCode,
      );
    }
    for (const relationship of row.relationships) {
      if (
        relationship.relationshipType === "non_geographic"
        || relationship.relationshipType === "unmatched"
        || relationship.relationshipType === "source_alias"
      ) {
        continue;
      }
      if (relationship.reviewStatus !== "reviewed") {
        throw new Error(
          "delivery relationship is not reviewed for "
          + row.resultUnitCode,
        );
      }
      if (
        ["one_to_many", "many_to_one"].includes(relationship.relationshipType)
      ) {
        throw new Error(
          relationship.relationshipType
          + " precinct delivery requires an explicit aggregate rendering contract",
        );
      }

      const sourceFeatureId = relationship.sourceFeatureId;
      const feature = featuresById.get(sourceFeatureId);
      if (!feature) {
        throw new Error(
          "reviewed relationship references missing feature "
          + sourceFeatureId,
        );
      }
      const featureParentGeoid = featureParentIdentity(feature, manifest);
      if (featureParentGeoid !== row.parentGeoid) {
        throw new Error(
          "geometry feature "
          + sourceFeatureId
          + " does not belong to result parent "
          + row.parentGeoid,
        );
      }
      const previousResultUnit = resultUnitByFeature.get(sourceFeatureId);
      if (previousResultUnit && previousResultUnit !== row.resultUnitCode) {
        throw new Error(
          "feature "
          + sourceFeatureId
          + " is assigned to multiple result units",
        );
      }
      resultUnitByFeature.set(sourceFeatureId, row.resultUnitCode);

      deliveryFeatures.push({
        type: "Feature",
        properties: {
          geometryFeatureId: sourceFeatureId,
          resultUnitCode: row.resultUnitCode,
          parentGeoid: row.parentGeoid,
          sourceFeatureId,
          displayName: row.sourceDisplayName,
          geographyType: manifest.geography.level,
          relationshipType: relationship.relationshipType,
        },
        geometry: feature.geometry,
      });
    }
  }

  const unlinkedFeatures = normalizedGeometry.features.filter(
    (feature) => !resultUnitByFeature.has(featureIdentity(feature, manifest)),
  );
  const reviewedNoDataFeatures = manifest.crosswalk.reviewedNoDataFeatures;
  if (
    unlinkedFeatures.length > 0
    && reviewedNoDataFeatures === undefined
  ) {
    throw new Error(
      "precinct delivery has "
      + unlinkedFeatures.length
      + " unlinked geometry features without a reviewed no-data declaration",
    );
  }
  if (
    reviewedNoDataFeatures !== undefined
    && unlinkedFeatures.length !== reviewedNoDataFeatures
  ) {
    throw new Error(
      "precinct delivery no-data feature count "
      + unlinkedFeatures.length
      + " does not match manifest "
      + reviewedNoDataFeatures,
    );
  }
  for (const feature of unlinkedFeatures) {
    const sourceFeatureId = featureIdentity(feature, manifest);
    const parentGeoid = featureParentIdentity(feature, manifest);
    if (!parentGeoid) {
      throw new Error(
        "reviewed no-data feature requires a parent identity: "
        + sourceFeatureId,
      );
    }
    const properties = feature?.properties ?? {};
    const displayName = String(
      properties.SOURCE_NAME
      ?? properties.SOURCE_PRECINCT
      ?? properties.CRM_FEATURE_ID
      ?? sourceFeatureId,
    ).trim() || sourceFeatureId;
    deliveryFeatures.push({
      type: "Feature",
      properties: {
        geometryFeatureId: sourceFeatureId,
        resultUnitCode:
          "no-data:"
          + manifest.id
          + ":"
          + encodeURIComponent(sourceFeatureId),
        parentGeoid,
        sourceFeatureId,
        displayName,
        geographyType: manifest.geography.level,
        relationshipType: "no_data",
      },
      geometry: feature.geometry,
    });
  }

  deliveryFeatures.sort((left, right) =>
    left.properties.geometryFeatureId.localeCompare(
      right.properties.geometryFeatureId,
    )
  );
  if (deliveryFeatures.length === 0) {
    throw new Error("precinct delivery would contain no geographic features");
  }

  return {
    type: "FeatureCollection",
    metadata: {
      schemaVersion: 1,
      manifestId: manifest.id,
      state: manifest.state,
      electionId: manifest.election.id,
      boundaryVintage: manifest.geography.boundaryVintage,
      sourceAuthority: manifest.source.authority,
      sourceUrl: manifest.source.url,
      licenseOrTerms: manifest.source.licenseOrTerms,
    },
    features: deliveryFeatures,
  };
}

export function buildPrecinctDeliveryFeatureCollection(
  manifest,
  normalizedGeometry,
  crosswalkDocument,
) {
  return buildPrecinctDeliveryFeatureCollectionInternal(
    manifest,
    normalizedGeometry,
    crosswalkDocument,
    { candidate: false },
  );
}

export function buildPrecinctDeliveryCandidateFeatureCollection(
  manifest,
  normalizedGeometry,
  crosswalkDocument,
) {
  return buildPrecinctDeliveryFeatureCollectionInternal(
    manifest,
    normalizedGeometry,
    crosswalkDocument,
    { candidate: true },
  );
}
