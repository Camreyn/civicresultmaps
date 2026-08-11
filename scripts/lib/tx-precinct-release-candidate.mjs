import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { buildPrecinctDeliveryCandidateFeatureCollection } from "./precinct-delivery-builder.mjs";
import { buildParentScopedPrecinctDeliveryPackage } from "./precinct-parent-delivery-builder.mjs";
import { buildTexasPrecinctGisPlan } from "./tx-precinct-gis-plan.mjs";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";

export const TEXAS_RELEASE_CANDIDATE_ID = "tx-precinct-gis-four-election-v1";
export const TEXAS_RELEASE_CANDIDATE_ROOT = ".etl/precinct-release-candidates/TX";
export const TEXAS_LOCAL_VALIDATION_REPORT = ".etl/local-db/tx-precinct-gis-validation.json";
export const TEXAS_DELIVERY_COORDINATE_DECIMALS = 5;
export const TEXAS_MAX_PARENT_DELIVERY_BYTES = 4_350_000;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function serializeTexasReleaseDocument(value) {
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
    throw new Error("Unsafe Texas release artifact path: " + relativePath);
  }
  const resolvedRoot = path.resolve(root);
  const absolutePath = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (!absolutePath.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Texas release artifact escapes repository root: " + relativePath);
  }
  return absolutePath;
}

function readArtifact(root, declaration, allowedRoots = ["data/", ".etl/"]) {
  const absolutePath = safePath(root, declaration.path, allowedRoots);
  if (!existsSync(absolutePath)) {
    throw new Error("Texas release artifact is missing: " + declaration.path);
  }
  const bytes = readFileSync(absolutePath);
  const digest = sha256(bytes);
  if (
    Number.isInteger(declaration.byteCount)
    && bytes.length !== declaration.byteCount
  ) {
    throw new Error("Texas release artifact byte count drifted: " + declaration.path);
  }
  if (declaration.sha256 && digest !== declaration.sha256) {
    throw new Error("Texas release artifact SHA-256 drifted: " + declaration.path);
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
    throw new Error("Texas local database validation report is not release-safe");
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
    if (!row) throw new Error("Texas local validation is missing " + year.year);
    for (const [key, value] of Object.entries(expected)) {
      if (Number(row[key]) !== value) {
        throw new Error("Texas " + year.year + " local validation " + key + " drifted");
      }
    }
  }
  if (rows.size !== plan.years.length) {
    throw new Error("Texas local validation year set drifted");
  }
  return {
    generatedAtUtc: report.generatedAtUtc,
    revision: report.validation.revision,
    invalidConstraints: report.validation.invalidConstraints,
    database: report.validation.database,
  };
}

function publicUrl(year, manifestId, indexSha256) {
  return "/data/geography/tx/"
    + year.electionDate
    + "/precinct/"
    + manifestId
    + "-"
    + indexSha256.slice(0, 12)
    + "/index.json";
}

function quantizeCoordinates(value, scale) {
  if (!Array.isArray(value)) return value;
  if (
    value.length >= 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
  ) {
    return value.map((coordinate) =>
      Number.isFinite(coordinate)
        ? Math.round(coordinate * scale) / scale
        : coordinate);
  }
  return value.map((item) => quantizeCoordinates(item, scale));
}

export function quantizeTexasDeliveryCollection(collection) {
  const scale = 10 ** TEXAS_DELIVERY_COORDINATE_DECIMALS;
  return {
    ...collection,
    metadata: {
      ...collection.metadata,
      coordinatePrecisionDecimals: TEXAS_DELIVERY_COORDINATE_DECIMALS,
      presentationGeometry: "source coordinates rounded for county-scoped web delivery; identity and joins are unchanged",
    },
    features: collection.features.map((feature) => ({
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: quantizeCoordinates(feature.geometry.coordinates, scale),
      },
    })),
  };
}

function buildDraftManifest(year, delivery) {
  const draft = JSON.parse(JSON.stringify(year.manifest));
  const warnings = [
    ...draft.validation.warnings,
    "All " + year.reportingUnits.length
      + " election-specific VTD relationships are reviewed one-to-one across all 254 Texas counties and statewide.",
    "The " + year.zeroVoteUnits
      + " zero-presidential-vote VTDs remain geographic reporting units.",
    "Public presentation coordinates are rounded to five decimal degrees; source geometry and exact join identities remain hash-pinned and unchanged.",
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
  draft.caveats = [...new Set([
    ...draft.caveats,
    "CivicResultMaps exposes this source at its precinct-map reporting grain while retaining the official Texas VTD/precinct-approximation label.",
  ])];
  const inspection = inspectPrecinctGeometryManifest(draft);
  if (inspection.errors.length || inspection.publicEligibilityReasons.length) {
    throw new Error(
      "Texas " + year.year + " public draft is invalid: "
      + inspection.errors.concat(inspection.publicEligibilityReasons).join("; "),
    );
  }
  return draft;
}

function buildYear(root, year) {
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
  const statewide = quantizeTexasDeliveryCollection(
    buildPrecinctDeliveryCandidateFeatureCollection(
      year.manifest,
      normalized.value,
      crosswalk.value,
    ),
  );
  const delivery = buildParentScopedPrecinctDeliveryPackage(statewide);
  if (
    delivery.parentCount !== 254
    || delivery.featureCount !== year.reportingUnits.length
    || delivery.resultUnitCount !== year.reportingUnits.length
  ) {
    throw new Error("Texas " + year.year + " parent-scoped delivery drifted");
  }
  const largestParentByteCount = Math.max(
    ...delivery.parentArtifacts.map((artifact) => artifact.byteCount),
  );
  if (largestParentByteCount > TEXAS_MAX_PARENT_DELIVERY_BYTES) {
    throw new Error(
      "Texas " + year.year + " parent delivery exceeds the web response safety limit",
    );
  }
  const draft = buildDraftManifest(year, delivery);
  const draftBytes = serializeTexasReleaseDocument(draft);
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
        rowLevelRenderingSafe: false,
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
        resultRows: year.resultRows.length,
        zeroVoteUnits: year.zeroVoteUnits,
        totals: year.totals,
      },
      reviewedGeometry: {
        sourceAuthority: year.manifest.source.authority,
        sourceUrl: year.manifest.source.url,
        sourceTerms: year.manifest.source.licenseOrTerms,
        featureCount: year.geometry.features.length,
        parentCount: delivery.parentCount,
        reviewedExactCrosswalks: year.geometry.crosswalks.length,
        officialGeographyLabel: "VTD / precinct approximation",
        electionValuesInDelivery: false,
      },
      parentScopedDelivery: {
        format: "parent_scoped_geojson",
        originEnvironmentVariable: "CRM_PRECINCT_GEOGRAPHY_ORIGIN",
        index,
        parentCount: delivery.parentCount,
        featureCount: delivery.featureCount,
        resultUnitCount: delivery.resultUnitCount,
        parentArtifactByteCount: delivery.parentArtifactByteCount,
        largestParentByteCount,
        coordinatePrecisionDecimals: TEXAS_DELIVERY_COORDINATE_DECIMALS,
        maximumParentByteCount: TEXAS_MAX_PARENT_DELIVERY_BYTES,
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

export async function buildTexasPrecinctReleaseCandidate(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const plan = await buildTexasPrecinctGisPlan({ root });
  const validationPath = options.validationReportPath
    ?? TEXAS_LOCAL_VALIDATION_REPORT;
  const validationArtifact = readArtifact(root, { path: validationPath }, [".etl/"]);
  const validationValue = JSON.parse(validationArtifact.bytes.toString("utf8"));
  const localValidation = validateLocalReport(validationValue, plan);
  const migrationArtifact = readArtifact(root, {
    path: "drizzle/0008_typical_thunderbolts.sql",
  }, ["drizzle/"]);
  const yearBuilds = plan.years.map((year) => buildYear(root, year));
  const years = yearBuilds.map((year) => year.summary);
  const packageDocument = {
    schemaVersion: 1,
    id: TEXAS_RELEASE_CANDIDATE_ID,
    state: "TX",
    stateName: "Texas",
    scope: "reviewed 2012, 2016, 2020, and 2024 presidential VTD precinct-map GIS release preparation",
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
      countiesPerElection: 254,
      reportingUnits: sum(years, (year) => year.certifiedResults.reportingUnits),
      candidateResultRows: sum(years, (year) => year.certifiedResults.resultRows),
      zeroVoteUnits: sum(years, (year) => year.certifiedResults.zeroVoteUnits),
      geometryFeatures: sum(years, (year) => year.reviewedGeometry.featureCount),
      reviewedExactCrosswalks: sum(years, (year) => year.reviewedGeometry.reviewedExactCrosswalks),
      deliveryIndexes: years.length,
      parentDeliveryArtifacts: years.length * 254,
    },
    years,
    localValidation: {
      path: validationPath,
      byteCount: validationArtifact.byteCount,
      sha256: validationArtifact.sha256,
      ...localValidation,
    },
    databaseActivationContract: {
      migration: {
        path: migrationArtifact.path,
        byteCount: migrationArtifact.byteCount,
        sha256: migrationArtifact.sha256,
      },
      productionWriterImplemented: true,
      productionWriterEnabled: false,
      expectedPostLoad: {
        reportingUnits: 36_762,
        candidateResultRows: 110_286,
        geographyVersions: 4,
        geometryFeatures: 36_762,
        reviewedExactCrosswalks: 36_762,
        zeroVoteUnits: 1_280,
        invalidConstraints: 0,
      },
    },
    releasePolicy: {
      officialResultsScope: "Texas Legislative Council election-specific VTD result products, grouped to Democratic, Republican, and Other for precinct-map display.",
      certifiedCanvassBoundary: "The VTD products do not replace Texas Secretary of State certified county or statewide totals; every documented source delta remains visible as a caveat.",
      publicLabel: "VTD / precinct approximation",
      hiddenLoadRequired: true,
      immutableBlobPublicationRequired: true,
      protectedPreviewRequired: true,
      databasePublicationGateRequired: true,
    },
    goNoGoGates: [
      { id: "official_sources_hash_pinned", status: "passed" },
      { id: "four_year_exact_result_geometry_join", status: "passed" },
      { id: "local_database_exact_validation", status: "passed", evidence: validationPath },
      { id: "immutable_parent_scoped_delivery", status: "passed" },
      { id: "production_hidden_load", status: "pending" },
      { id: "blob_publication", status: "pending" },
      { id: "protected_preview_and_public_activation", status: "pending" },
    ],
  };
  return {
    packageDocument,
    packageBytes: serializeTexasReleaseDocument(packageDocument),
    draftManifests: yearBuilds.map((year) => year.draft),
    deliveryAssets: yearBuilds.flatMap((year) => year.assets),
  };
}

export function texasReleaseCandidateOutputRoot(packageSha256) {
  if (!/^[a-f0-9]{64}$/.test(packageSha256)) {
    throw new Error("Texas release package hash must be SHA-256");
  }
  return path.posix.join(
    TEXAS_RELEASE_CANDIDATE_ROOT,
    TEXAS_RELEASE_CANDIDATE_ID + "-" + packageSha256.slice(0, 12),
  );
}
