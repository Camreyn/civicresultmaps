import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { buildPrecinctDeliveryCandidateFeatureCollection } from "./precinct-delivery-builder.mjs";
import { buildParentScopedPrecinctDeliveryPackage } from "./precinct-parent-delivery-builder.mjs";
import { buildFloridaPrecinctGisPlan } from "./fl-precinct-gis-plan.mjs";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";

export const FLORIDA_RELEASE_CANDIDATE_ID = "fl-precinct-gis-three-election-v1";
export const FLORIDA_RELEASE_CANDIDATE_ROOT = ".etl/precinct-release-candidates/FL";
export const FLORIDA_PRECINCT_VALIDATION_REPORT = ".etl/local-db/fl-precinct-gis-validation.json";
export const FLORIDA_PUBLIC_RELEASE_YEARS = Object.freeze([
  2016,
  2020,
  2024,
]);
export const FLORIDA_DELIVERY_COORDINATE_DECIMALS = 7;
export const FLORIDA_DELIVERY_SIMPLIFICATION_TOLERANCE_DEGREES = 0.000005;
export const FLORIDA_MAX_PARENT_DELIVERY_BYTES = 8_000_000;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function serializeFloridaReleaseDocument(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

function safePath(root, relativePath, allowedRoots) {
  if (
    typeof relativePath !== "string"
    || !relativePath
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || !allowedRoots.some((prefix) => relativePath.startsWith(prefix))
  ) {
    throw new Error("Unsafe Florida release artifact path: " + relativePath);
  }
  const resolvedRoot = path.resolve(root);
  const absolutePath = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (!absolutePath.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Florida release artifact escapes repository root: " + relativePath);
  }
  return absolutePath;
}

function readArtifact(root, declaration, allowedRoots = ["data/", ".etl/"]) {
  const absolutePath = safePath(root, declaration.path, allowedRoots);
  if (!existsSync(absolutePath)) {
    throw new Error("Florida release artifact is missing: " + declaration.path);
  }
  const bytes = readFileSync(absolutePath);
  const digest = sha256(bytes);
  if (
    Number.isInteger(declaration.byteCount)
    && bytes.length !== declaration.byteCount
  ) {
    throw new Error("Florida release artifact byte count drifted: " + declaration.path);
  }
  if (declaration.sha256 && digest !== declaration.sha256) {
    throw new Error("Florida release artifact SHA-256 drifted: " + declaration.path);
  }
  return { path: declaration.path, byteCount: bytes.length, sha256: digest, bytes };
}

export function inspectReleaseArtifact(root, relativePath, options = {}) {
  return readArtifact(root, {
    path: relativePath,
    byteCount: options.byteCount,
    sha256: options.sha256,
  }, options.allowedRoots ?? ["data/", ".etl/", "drizzle/", "scripts/"]);
}

function parseJsonArtifact(root, declaration, allowedRoots) {
  const artifact = readArtifact(root, declaration, allowedRoots);
  const payload = declaration.path.endsWith(".gz")
    ? gunzipSync(artifact.bytes)
    : artifact.bytes;
  return { artifact, value: JSON.parse(payload.toString("utf8")) };
}

function validateLocalReport(report, plan) {
  if (
    report?.schemaVersion !== 1
    || report?.productionMutationPerformed !== false
    || report?.publicDeliveryAuthorized !== false
    || report?.validation?.database?.environment !== "local"
    || report?.validation?.database?.host !== "loopback"
    || report?.validation?.database?.port !== 54329
    || report?.validation?.database?.name !== "crm_clone_dev"
    || report?.validation?.database?.readOnlySession !== true
    || report?.validation?.invalidConstraints !== 0
    || !Number.isInteger(report?.validation?.revision)
    || Number.isNaN(Date.parse(report?.generatedAtUtc))
  ) {
    throw new Error("Florida precinct database validation report is not release-safe");
  }
  const rows = new Map(
    (report.validation.years ?? []).map((row) => [Number(row.year), row]),
  );
  for (const year of plan.years) {
    const row = rows.get(year.year);
    const expected = {
      reportingUnits: year.reportingUnits.length,
      resultRows: year.resultRows.length,
      sameYearResultRows: year.resultRows.length,
      totalVotes: year.totals.Total,
      zeroVoteUnits: year.zeroVoteUnits,
      geographyVersions: 1,
      features: year.geometry.features.length,
      safeBlockedGeographyVersions: 1,
      reviewedCrosswalks: year.geometry.crosswalks.length,
      exactFeatures: year.geometry.features.length,
      exactCrosswalks: year.geometry.crosswalks.length,
    };
    if (!row) throw new Error("Florida precinct validation is missing " + year.year);
    for (const [key, value] of Object.entries(expected)) {
      if (Number(row[key]) !== value) {
        throw new Error("Florida " + year.year + " local validation " + key + " drifted");
      }
    }
  }
  if (rows.size !== plan.years.length) {
    throw new Error("Florida precinct validation year set drifted");
  }
  return {
    generatedAtUtc: report.generatedAtUtc,
    revision: report.validation.revision,
    invalidConstraints: report.validation.invalidConstraints,
    database: report.validation.database,
  };
}

function publicUrl(year, manifestId, indexSha256) {
  return "/data/geography/fl/"
    + year.electionDate
    + "/precinct/"
    + manifestId
    + "-"
    + indexSha256.slice(0, 12)
    + "/index.json";
}

function squaredDistanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) {
    return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  }
  const amount = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy)
        / (dx * dx + dy * dy),
    ),
  );
  const projectedX = start[0] + amount * dx;
  const projectedY = start[1] + amount * dy;
  return (point[0] - projectedX) ** 2 + (point[1] - projectedY) ** 2;
}

function simplifyLine(points, squaredTolerance) {
  if (points.length <= 2) return points;
  let maximumDistance = squaredTolerance;
  let maximumIndex = -1;
  const start = points[0];
  const end = points[points.length - 1];
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = squaredDistanceToSegment(points[index], start, end);
    if (distance > maximumDistance) {
      maximumDistance = distance;
      maximumIndex = index;
    }
  }
  if (maximumIndex < 0) return [start, end];
  const left = simplifyLine(points.slice(0, maximumIndex + 1), squaredTolerance);
  const right = simplifyLine(points.slice(maximumIndex), squaredTolerance);
  return [...left.slice(0, -1), ...right];
}

function samePoint(left, right) {
  return left[0] === right[0] && left[1] === right[1];
}

function quantizeCoordinate(coordinate, scale) {
  return coordinate.map((value) =>
    Number.isFinite(value) ? Math.round(value * scale) / scale : value);
}

function simplifyRing(ring, scale, tolerance) {
  const quantized = ring
    .map((coordinate) => quantizeCoordinate(coordinate, scale))
    .filter((coordinate, index, rows) =>
      index === 0 || !samePoint(coordinate, rows[index - 1]));
  if (
    quantized.length > 1
    && samePoint(quantized[0], quantized[quantized.length - 1])
  ) {
    quantized.pop();
  }
  if (new Set(quantized.map((coordinate) => coordinate.join(","))).size < 3) {
    return null;
  }

  let anchorIndex = 0;
  for (let index = 1; index < quantized.length; index += 1) {
    if (
      quantized[index][0] < quantized[anchorIndex][0]
      || (
        quantized[index][0] === quantized[anchorIndex][0]
        && quantized[index][1] < quantized[anchorIndex][1]
      )
    ) {
      anchorIndex = index;
    }
  }
  const rotated = [
    ...quantized.slice(anchorIndex),
    ...quantized.slice(0, anchorIndex),
  ];
  let splitIndex = 1;
  let splitDistance = -1;
  for (let index = 1; index < rotated.length; index += 1) {
    const distance = (rotated[index][0] - rotated[0][0]) ** 2
      + (rotated[index][1] - rotated[0][1]) ** 2;
    if (distance > splitDistance) {
      splitDistance = distance;
      splitIndex = index;
    }
  }
  const squaredTolerance = tolerance ** 2;
  const firstArc = simplifyLine(
    rotated.slice(0, splitIndex + 1),
    squaredTolerance,
  );
  const secondArc = simplifyLine(
    [...rotated.slice(splitIndex), rotated[0]],
    squaredTolerance,
  );
  const simplified = [...firstArc, ...secondArc.slice(1, -1)];
  const usable = new Set(
    simplified.map((coordinate) => coordinate.join(",")),
  ).size >= 3 ? simplified : rotated;
  return [...usable, usable[0]];
}

function simplifyPolygon(polygon, scale, tolerance) {
  const outer = simplifyRing(polygon[0], scale, tolerance);
  if (!outer) return null;
  return [
    outer,
    ...polygon.slice(1)
      .map((ring) => simplifyRing(ring, scale, tolerance))
      .filter(Boolean),
  ];
}

function simplifyGeometry(geometry, scale, tolerance) {
  if (geometry.type === "Polygon") {
    const polygon = simplifyPolygon(geometry.coordinates, scale, tolerance);
    if (!polygon) {
      throw new Error("Florida presentation simplification collapsed a polygon");
    }
    return {
      type: "Polygon",
      coordinates: polygon,
    };
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates
      .map((polygon) => simplifyPolygon(polygon, scale, tolerance))
      .filter(Boolean);
    if (polygons.length === 0) {
      throw new Error("Florida presentation simplification collapsed a multipolygon");
    }
    return {
      type: "MultiPolygon",
      coordinates: polygons,
    };
  }
  throw new Error("Florida delivery has an unsupported geometry type");
}

export function quantizeFloridaDeliveryCollection(collection) {
  const scale = 10 ** FLORIDA_DELIVERY_COORDINATE_DECIMALS;
  const tolerance = FLORIDA_DELIVERY_SIMPLIFICATION_TOLERANCE_DEGREES;
  return {
    ...collection,
    metadata: {
      ...collection.metadata,
      coordinatePrecisionDecimals: FLORIDA_DELIVERY_COORDINATE_DECIMALS,
      simplificationToleranceDegrees: tolerance,
      presentationGeometry: "source-normalized geometry is rounded to seven decimals and simplified at a 0.000005-degree presentation tolerance for county-scoped web delivery; zero-area polygon parts are omitted while source artifacts, identities, and joins remain unchanged",
    },
    features: collection.features.map((feature) => ({
      ...feature,
      geometry: simplifyGeometry(feature.geometry, scale, tolerance),
    })),
  };
}

function buildDraftManifest(year, delivery) {
  const geographicReportingUnits = year.reportingUnits.filter(
    (unit) => unit.isGeographic,
  ).length;
  const nonGeographicReportingUnits = year.reportingUnits.length
    - geographicReportingUnits;
  const draft = JSON.parse(JSON.stringify(year.manifest));
  const warnings = [
    ...draft.validation.warnings,
    "All " + geographicReportingUnits
      + " displayable precinct relationships are reviewed one-to-one across all 67 Florida counties.",
    "All official result units without reviewed geometry remain excluded from display and are never spatially allocated.",
    "The " + year.zeroVoteUnits
      + " zero-presidential-vote precincts remain geographic reporting units.",
    "All " + year.manifest.crosswalk.reviewedNoDataFeatures
      + " reviewed no-data polygons remain visible without an invented result row.",
    "Public presentation geometry is rounded to seven decimals and simplified at a 0.000005-degree tolerance; raw source geometry and exact join identities remain hash-pinned and unchanged.",
  ];
  draft.validation = {
    ...draft.validation,
    status: "reviewed",
    rowLevelRenderingSafe: true,
    errors: [],
    warnings: [...new Set(warnings)],
  };
  draft.delivery = {
    format: "parent_scoped_geojson",
    url: publicUrl(year, draft.id, delivery.indexSha256),
    sha256: delivery.indexSha256,
    byteCount: delivery.indexByteCount,
    featureIdProperty: "geometryFeatureId",
    resultUnitProperty: "resultUnitCode",
    parentGeoidProperty: "parentGeoid",
    parentCount: delivery.parentCount,
    featureCount: delivery.featureCount,
  };
  draft.caveats = [...new Set(draft.caveats)];
  const inspection = inspectPrecinctGeometryManifest(draft);
  if (inspection.errors.length || inspection.publicEligibilityReasons.length) {
    throw new Error(
      "Florida " + year.year + " public draft is invalid: "
      + inspection.errors.concat(inspection.publicEligibilityReasons).join("; "),
    );
  }
  return draft;
}

function buildYear(root, year) {
  const geographicReportingUnits = year.reportingUnits.filter(
    (unit) => unit.isGeographic,
  ).length;
  const nonGeographicReportingUnits = year.reportingUnits.length
    - geographicReportingUnits;
  const normalized = parseJsonArtifact(root, {
    path: year.manifest.normalization.artifact,
    byteCount: year.manifest.normalization.byteCount,
    sha256: year.manifest.normalization.sha256,
  }, ["data/"]);
  const crosswalk = parseJsonArtifact(root, {
    path: year.manifest.crosswalk.artifact,
    byteCount: year.manifest.crosswalk.byteCount,
    sha256: year.manifest.crosswalk.sha256,
  }, ["data/"]);
  const statewide = quantizeFloridaDeliveryCollection(
    buildPrecinctDeliveryCandidateFeatureCollection(
      year.manifest,
      normalized.value,
      crosswalk.value,
    ),
  );
  const delivery = buildParentScopedPrecinctDeliveryPackage(statewide);
  if (
    delivery.parentCount !== 67
    || delivery.featureCount !== year.geometry.features.length
    || delivery.resultUnitCount !== year.geometry.features.length
  ) {
    throw new Error("Florida " + year.year + " parent-scoped delivery drifted");
  }
  const largestParentByteCount = Math.max(
    ...delivery.parentArtifacts.map((artifact) => artifact.byteCount),
  );
  if (largestParentByteCount > FLORIDA_MAX_PARENT_DELIVERY_BYTES) {
    throw new Error(
      "Florida " + year.year + " parent delivery exceeds the web response safety limit",
    );
  }
  const draft = buildDraftManifest(year, delivery);
  const draftBytes = serializeFloridaReleaseDocument(draft);
  const assetRoot = path.posix.join(
    "delivery-assets",
    draft.id + "-" + delivery.indexSha256.slice(0, 12),
  );
  const index = {
    packageRelativePath: path.posix.join(assetRoot, "index.json"),
    publicUrl: draft.delivery.url,
    byteCount: delivery.indexByteCount,
    sha256: delivery.indexSha256,
  };
  const parentArtifacts = delivery.parentArtifacts.map((artifact) => ({
    parentGeoid: artifact.parentGeoid,
    packageRelativePath: path.posix.join(assetRoot, artifact.path),
    publicUrl: path.posix.join(path.posix.dirname(draft.delivery.url), artifact.path),
    byteCount: artifact.byteCount,
    sha256: artifact.sha256,
    featureCount: artifact.featureCount,
  }));
  return {
    summary: {
      year: year.year,
      electionId: year.electionId,
      manifestId: year.manifest.id,
      canonicalManifest: {
        path: year.manifestPath,
        sha256: year.manifestSha256,
        byteCount: year.manifestByteCount,
        validationStatus: "blocked",
        rowLevelRenderingSafe:
          year.manifest.validation.rowLevelRenderingSafe,
        delivery: null,
      },
      certifiedResults: {
        authority: year.resultSource.authority,
        sourceId: year.resultSource.id,
        sourceUrl: year.resultSource.url,
        artifact: {
          path: year.resultSource.artifact,
          byteCount: year.resultSource.byteCount,
          sha256: year.resultSource.sha256,
        },
        reportingUnits: year.reportingUnits.length,
        geographicReportingUnits,
        nonGeographicReportingUnits,
        resultRows: year.resultRows.length,
        zeroVoteUnits: year.zeroVoteUnits,
        candidateDetailSuppressedUnits: year.candidateDetailSuppressedUnits,
        totals: year.totals,
        officialTotals: year.officialTotals,
      },
      reviewedGeometry: {
        sourceAuthority: year.manifest.source.authority,
        sourceUrl: year.manifest.source.url,
        sourceTerms: year.manifest.source.licenseOrTerms,
        featureCount: year.geometry.features.length,
        parentCount: delivery.parentCount,
        reviewedRelationships: year.geometry.crosswalks.length,
        reviewedNoDataFeatures: year.manifest.crosswalk.reviewedNoDataFeatures,
        publicGeographyLabel: year.year === 2024
          ? "NYT election-specific presentation geometry, including disclosed generated boundaries, joined only to official Florida Department of State results under retained non-commercial attribution terms"
          : "VEST election-specific geometry joined only to official Florida Department of State results under retained CC BY attribution terms",
        electionValuesInDelivery: false,
      },
      parentScopedDelivery: {
        format: "parent_scoped_geojson",
        originEnvironmentVariable: "CRM_PRECINCT_GEOGRAPHY_ORIGIN",
        index,
        parentCount: delivery.parentCount,
        featureCount: delivery.featureCount,
        deliveryIdentityCount: delivery.resultUnitCount,
        colorableResultUnitCount: geographicReportingUnits,
        nonGeographicResultUnitCount: nonGeographicReportingUnits,
        candidateDetailSuppressedResultUnitCount:
          year.candidateDetailSuppressedUnits,
        reviewedNoDataFeatureCount:
          year.manifest.crosswalk.reviewedNoDataFeatures,
        parentArtifactByteCount: delivery.parentArtifactByteCount,
        largestParentByteCount,
        coordinatePrecisionDecimals: FLORIDA_DELIVERY_COORDINATE_DECIMALS,
        simplificationToleranceDegrees:
          FLORIDA_DELIVERY_SIMPLIFICATION_TOLERANCE_DEGREES,
        maximumParentByteCount: FLORIDA_MAX_PARENT_DELIVERY_BYTES,
        parentArtifacts,
        electionValuesInDelivery: false,
        publicationPerformed: false,
      },
      proposedPublicDelivery: draft.delivery,
      draftManifest: {
        path: path.posix.join("draft-manifests", draft.id + ".json"),
        byteCount: draftBytes.length,
        sha256: sha256(draftBytes),
        canonicalMutationPerformed: false,
        reviewRequired: true,
      },
    },
    draft: { path: path.posix.join("draft-manifests", draft.id + ".json"), bytes: draftBytes },
    assets: [
      { path: index.packageRelativePath, bytes: delivery.indexBytes },
      ...delivery.parentArtifacts.map((artifact) => ({
        path: path.posix.join(assetRoot, artifact.path),
        bytes: artifact.bytes,
      })),
    ],
  };
}

function sum(years, selector) {
  return years.reduce((total, year) => total + selector(year), 0);
}

export async function buildFloridaPrecinctReleaseCandidate(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const plan = await buildFloridaPrecinctGisPlan({
    root,
    years: [...FLORIDA_PUBLIC_RELEASE_YEARS],
  });
  const validationPath = options.validationReportPath
    ?? FLORIDA_PRECINCT_VALIDATION_REPORT;
  const validationArtifact = readArtifact(root, { path: validationPath }, [".etl/"]);
  const validationValue = JSON.parse(validationArtifact.bytes.toString("utf8"));
  const localValidation = validateLocalReport(validationValue, plan);
  const migration0008Artifact = readArtifact(root, {
    path: "drizzle/0008_typical_thunderbolts.sql",
  }, ["drizzle/"]);
  const migration0009Artifact = readArtifact(root, {
    path: "drizzle/0009_public_wolfpack.sql",
  }, ["drizzle/"]);
  const yearBuilds = plan.years.map((year) => buildYear(root, year));
  const years = yearBuilds.map((year) => year.summary);
  const packageDocument = {
    schemaVersion: 1,
    id: FLORIDA_RELEASE_CANDIDATE_ID,
    state: "FL",
    stateName: "Florida",
    scope: "reviewed 2016, 2020, and 2024 Florida presidential precinct GIS release preparation; 2012 remains blocked and excluded",
    preparedFromLocalValidationAt: localValidation.generatedAtUtc,
    disposition: "prepared_awaiting_explicit_production_authorization",
    decision: "NO_GO_PRODUCTION",
    safety: {
      productionMutationPerformed: false,
      publicFileWritten: false,
      canonicalManifestChanged: false,
      canonicalRegistryChanged: false,
      publicEligibilityChanged: false,
      gitPublicationPerformed: false,
      explicitProductionAuthorizationRequired: true,
    },
    totals: {
      elections: years.length,
      countyParentsPerElection: 67,
      reportingUnits: sum(years, (year) => year.certifiedResults.reportingUnits),
      candidateResultRows: sum(years, (year) => year.certifiedResults.resultRows),
      zeroVoteUnits: sum(years, (year) => year.certifiedResults.zeroVoteUnits),
      geometryFeatures: sum(years, (year) => year.reviewedGeometry.featureCount),
      reviewedRelationships: sum(years, (year) => year.reviewedGeometry.reviewedRelationships),
      deliveryIndexes: years.length,
      parentDeliveryArtifacts: years.length * 67,
    },
    years,
    localValidation: {
      path: validationPath,
      byteCount: validationArtifact.byteCount,
      sha256: validationArtifact.sha256,
      ...localValidation,
    },
    databaseActivationContract: {
      migrations: [migration0008Artifact, migration0009Artifact].map((artifact) => ({
        path: artifact.path,
        byteCount: artifact.byteCount,
        sha256: artifact.sha256,
      })),
      productionWriterImplemented: true,
      productionWriterEnabled: false,
      expectedPostLoad: {
        reportingUnits: sum(years, (year) => year.certifiedResults.reportingUnits),
        candidateResultRows: sum(years, (year) => year.certifiedResults.resultRows),
        geographyVersions: 3,
        geometryFeatures: sum(years, (year) => year.reviewedGeometry.featureCount),
        reviewedRelationships: sum(years, (year) => year.reviewedGeometry.reviewedRelationships),
        reviewedNoDataFeatures: sum(
          years,
          (year) => year.reviewedGeometry.reviewedNoDataFeatures,
        ),
        zeroVoteUnits: sum(years, (year) => year.certifiedResults.zeroVoteUnits),
        invalidConstraints: 0,
      },
    },
    releasePolicy: {
      officialResultsScope: "Official Florida Department of State presidential rows supply every displayed value. Only the 17,424 result units with reviewed geometry are loaded; excluded source units and their totals remain exactly reconciled in the retained source packages.",
      certifiedCanvassBoundary: "The 161 official source units without reviewed geometry, totaling 29,871 candidate votes across the three elections, are not assigned or estimated onto precinct polygons. Each map therefore discloses the difference between displayed and full official source totals.",
      publicLabel: "Florida precinct results with reviewed election-specific geometry",
      hiddenLoadRequired: true,
      immutableBlobPublicationRequired: true,
      protectedPreviewRequired: true,
      databasePublicationGateRequired: true,
    },
    goNoGoGates: [
      { id: "official_sources_hash_pinned", status: "passed" },
      { id: "three_year_exact_result_geometry_join", status: "passed" },
      { id: "2012_excluded_until_safe_geometry_join_exists", status: "passed" },
      { id: "unmatched_official_units_retained_without_spatial_allocation", status: "passed" },
      { id: "local_database_exact_validation", status: "passed", evidence: validationPath },
      { id: "immutable_parent_scoped_delivery", status: "passed" },
      { id: "production_hidden_load", status: "pending" },
      { id: "blob_publication", status: "pending" },
      { id: "protected_preview_and_public_activation", status: "pending" },
    ],
  };
  return {
    packageDocument,
    packageBytes: serializeFloridaReleaseDocument(packageDocument),
    draftManifests: yearBuilds.map((year) => year.draft),
    deliveryAssets: yearBuilds.flatMap((year) => year.assets),
  };
}

export function floridaReleaseCandidateOutputRoot(packageSha256) {
  if (!/^[a-f0-9]{64}$/.test(packageSha256)) {
    throw new Error("Florida release package hash must be SHA-256");
  }
  return path.posix.join(
    FLORIDA_RELEASE_CANDIDATE_ROOT,
    FLORIDA_RELEASE_CANDIDATE_ID + "-" + packageSha256.slice(0, 12),
  );
}
