import { NextRequest, NextResponse } from "next/server";
import {
  apiEnvelope,
  apiErrorEnvelope,
  publicApiErrorHeaders,
  publicDataCacheHeaders,
} from "@/lib/api";
import { readParentScopedPrecinctDelivery } from "@/lib/precinct-delivery-server";
import { listPrecinctGeometryManifestViews } from "@/lib/precinct-geography";
import {
  findMinnesotaPrecinctRehearsalManifest,
  readMinnesotaPrecinctRehearsalDelivery,
} from "@/lib/mn-precinct-rehearsal-server";
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
  if (!/^\d{5}$/.test(parentGeoid)) {
    return errorResponse("parentGeoid must be a five-digit county GEOID", 400);
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
      return errorResponse("local precinct rehearsal configuration failed", 500);
    }
  }
  if (!manifest && !rehearsal) {
    return errorResponse("eligible precinct geography manifest not found", 404);
  }
  if (manifest && manifest.delivery?.format !== "geojson") {
    return errorResponse(
      "parent-scoped GeoJSON delivery is unavailable for this manifest",
      409,
    );
  }

  try {
    const delivery = manifest
      ? await readParentScopedPrecinctDelivery(manifest, parentGeoid)
      : await readMinnesotaPrecinctRehearsalDelivery(
        rehearsal!,
        parentGeoid,
      );
    const selectedManifest = manifest ?? rehearsal!.manifest;
    const localRehearsal = Boolean(rehearsal);
    return NextResponse.json(
      apiEnvelope(delivery.collection, {
        source: localRehearsal
          ? "local-precinct-rehearsal-candidate"
          : "immutable-precinct-geography-delivery",
        manifestId: selectedManifest.id,
        parentGeoid,
        rowCount: delivery.collection.features.length,
        localRehearsal,
        publicEligible: selectedManifest.eligible,
        sourceByteCount: delivery.sourceByteCount,
        sourceSha256: delivery.sourceSha256,
        sourceAuthority: delivery.collection.metadata.sourceAuthority,
        sourceUrl: delivery.collection.metadata.sourceUrl,
        licenseOrTerms: delivery.collection.metadata.licenseOrTerms,
        boundaryVintage: delivery.collection.metadata.boundaryVintage,
        contract:
          localRehearsal
            ? "This hash-pinned candidate is available only through the guarded "
              + "loopback crm_clone_dev rehearsal. Its canonical manifest remains "
              + "blocked and unpublished. Geometry is county-filtered before transfer."
            : "Geometry is served only from a reviewed, election-vintage-confirmed "
              + "manifest, is filtered to the requested county before transfer, "
              + "and carries the source authority, URL, and license or disclaimer.",
      }),
      { headers: publicDataCacheHeaders },
    );
  } catch {
    return errorResponse("precinct geography delivery validation failed", 500);
  }
}
