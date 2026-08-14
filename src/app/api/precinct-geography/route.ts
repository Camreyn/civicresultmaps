import { NextRequest, NextResponse } from "next/server";
import {
  apiEnvelope,
  apiErrorEnvelope,
  publicApiErrorHeaders,
  publicDataCacheHeaders,
} from "@/lib/api";
import { readParentScopedPrecinctDelivery } from "@/lib/precinct-delivery-server";
import { listPrecinctGeometryManifestViews } from "@/lib/precinct-geography";
import { isPrecinctGeometryManifestPublished } from "@/lib/data-access";
import {
  findMinnesotaPrecinctRehearsalManifest,
  readMinnesotaPrecinctRehearsalDelivery,
} from "@/lib/mn-precinct-rehearsal-server";
import {
  isSupportedLocalGeographyParentId,
  isValidLocalGeographyParentId,
  localGeographyParentScope,
  localGeographyParentValidationMessage,
} from "@/lib/local-geography-parent";
import registry from "../../../../data/precinct-geometry-manifests.json";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json(apiErrorEnvelope(message), {
    status,
    headers: publicApiErrorHeaders,
  });
}

export async function GET(request: NextRequest) {
  const manifestId = request.nextUrl.searchParams.get("manifestId")?.trim()
    ?? "";
  const parentGeoid = request.nextUrl.searchParams.get("parentGeoid")?.trim()
    ?? "";
  if (!/^[a-z0-9][a-z0-9-]+$/.test(manifestId)) {
    return errorResponse(
      "manifestId must be a lowercase, dash-delimited identifier",
      400,
    );
  }
  if (!isSupportedLocalGeographyParentId(parentGeoid)) {
    return errorResponse(
      "parentGeoid must be a supported county or House District identifier",
      400,
    );
  }

  const manifest = listPrecinctGeometryManifestViews(registry)
    .find((candidate) => candidate.id === manifestId);
  let rehearsal = null;
  if (!manifest) {
    try {
      rehearsal = findMinnesotaPrecinctRehearsalManifest(
        registry,
        manifestId,
      );
    } catch {
      return errorResponse("local geography rehearsal configuration failed", 500);
    }
  }
  if (!manifest && !rehearsal) {
    return errorResponse("eligible local geography manifest not found", 404);
  }
  const selectedManifest = manifest ?? rehearsal!.manifest;
  if (!isValidLocalGeographyParentId({
    state: selectedManifest.state,
    geographyLevel: selectedManifest.geography.level,
    parentGeoid,
  })) {
    return errorResponse(
      localGeographyParentValidationMessage({
        state: selectedManifest.state,
        geographyLevel: selectedManifest.geography.level,
      }),
      400,
    );
  }
  if (
    manifest
    && !["geojson", "parent_scoped_geojson"].includes(
      manifest.delivery?.format ?? "",
    )
  ) {
    return errorResponse(
      "parent-scoped GeoJSON delivery is unavailable for this manifest",
      409,
    );
  }
  if (manifest && !(await isPrecinctGeometryManifestPublished(manifest))) {
    return errorResponse("local geography publication is not active", 404);
  }

  try {
    const delivery = manifest
      ? await readParentScopedPrecinctDelivery(manifest, parentGeoid)
      : await readMinnesotaPrecinctRehearsalDelivery(
        rehearsal!,
        parentGeoid,
      );
    const localRehearsal = Boolean(rehearsal);
    const parentScope = localGeographyParentScope({
      state: selectedManifest.state,
      geographyLevel: selectedManifest.geography.level,
    });
    const parentLabel = parentScope?.singularLabel ?? "parent area";
    return NextResponse.json(
      apiEnvelope(delivery.collection, {
        source: localRehearsal
          ? "local-precinct-rehearsal-candidate"
          : "immutable-local-geography-delivery",
        manifestId: selectedManifest.id,
        parentGeoid,
        rowCount: delivery.collection.features.length,
        localRehearsal,
        publicEligible: selectedManifest.eligible,
        sourceByteCount: delivery.sourceByteCount,
        sourceSha256: delivery.sourceSha256,
        indexByteCount: "indexByteCount" in delivery
          ? delivery.indexByteCount ?? null
          : null,
        indexSha256: "indexSha256" in delivery
          ? delivery.indexSha256 ?? null
          : null,
        sourceAuthority: delivery.collection.metadata.sourceAuthority,
        sourceUrl: delivery.collection.metadata.sourceUrl,
        licenseOrTerms: delivery.collection.metadata.licenseOrTerms,
        boundaryVintage: delivery.collection.metadata.boundaryVintage,
        contract:
          localRehearsal
            ? "This hash-pinned candidate is available only through the guarded "
              + "loopback crm_clone_dev rehearsal. Its canonical manifest remains "
              + "blocked and unpublished. Geometry is filtered to the requested "
              + parentLabel + " before transfer."
            : "Geometry is served only from a reviewed, election-vintage-confirmed "
              + "manifest, is filtered to the requested " + parentLabel
              + " before transfer, "
              + "and carries the source authority, URL, and license or disclaimer.",
      }),
      { headers: publicDataCacheHeaders },
    );
  } catch {
    return errorResponse("local geography delivery validation failed", 500);
  }
}
