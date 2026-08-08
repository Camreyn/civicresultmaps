import { NextRequest, NextResponse } from "next/server";
import {
  apiEnvelope,
  apiErrorEnvelope,
  publicApiErrorHeaders,
  publicDataCacheHeaders,
  stateQuery,
} from "@/lib/api";
import { usStateOptions } from "@/lib/county-search";
import {
  listPrecinctGeometryManifestViewsWithMinnesotaRehearsal,
} from "@/lib/mn-precinct-rehearsal-server";
import registry from "../../../../data/precinct-geometry-manifests.json";

const validStates = new Set<string>(usStateOptions.map(([code]) => code));

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(value + "T00:00:00.000Z");
  return (
    !Number.isNaN(date.valueOf())
    && date.toISOString().slice(0, 10) === value
  );
}

function badRequest(message: string) {
  return NextResponse.json(apiErrorEnvelope(message), {
    status: 400,
    headers: publicApiErrorHeaders,
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stateParam = params.get("state");
  const stateResult = stateParam ? stateQuery.safeParse(stateParam) : null;
  if (stateResult && (!stateResult.success || !validStates.has(stateResult.data))) {
    return badRequest(
      "state must be a valid two-letter U.S. state or DC code",
    );
  }

  const electionDate = params.get("electionDate")?.trim() || undefined;
  if (electionDate && !isIsoDate(electionDate)) {
    return badRequest("electionDate must be a valid YYYY-MM-DD date");
  }

  const electionId = params.get("electionId")?.trim() || undefined;
  if (
    electionId
    && !/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(electionId)
  ) {
    return badRequest(
      "electionId must contain an ISO date and lowercase event slug",
    );
  }

  const level = params.get("level")?.trim().toLowerCase() || undefined;
  if (level && !/^[a-z][a-z0-9_]*$/.test(level)) {
    return badRequest(
      "level must be a lowercase geography identifier",
    );
  }

  const includeBlockedParam = params.get("includeBlocked");
  if (
    includeBlockedParam !== null
    && includeBlockedParam !== "true"
    && includeBlockedParam !== "false"
  ) {
    return badRequest("includeBlocked must be true or false");
  }
  const includeBlocked = includeBlockedParam === "true";

  try {
    const manifests = listPrecinctGeometryManifestViewsWithMinnesotaRehearsal(
      registry,
      {
        state: stateResult?.success ? stateResult.data : undefined,
        electionDate,
        electionId,
        level,
        includeBlocked,
      },
    );
    const eligibleCount = manifests.filter((manifest) => manifest.eligible)
      .length;
    const rehearsalCount = manifests.filter(
      (manifest) => "localRehearsal" in manifest,
    ).length;

    return NextResponse.json(
      apiEnvelope(manifests, {
        source: "precinct-geometry-manifest-registry",
        registryUpdatedAt: registry.updatedAt,
        rowCount: manifests.length,
        eligibleCount,
        rehearsalCount,
        blockedCount: manifests.length - eligibleCount,
        filters: {
          state: stateResult?.success ? stateResult.data : null,
          electionDate: electionDate ?? null,
          electionId: electionId ?? null,
          level: level ?? null,
          includeBlocked,
        },
        contract:
          "Only reviewed, reconciled, election-vintage-confirmed manifests "
          + "with immutable delivery artifacts are returned by default. "
          + "An explicitly guarded loopback crm_clone_dev rehearsal may add "
          + "clearly marked, still-blocked Minnesota candidate views without "
          + "changing canonical manifests or public eligibility.",
      }),
      { headers: publicDataCacheHeaders },
    );
  } catch {
    return NextResponse.json(
      apiErrorEnvelope("precinct geometry registry validation failed"),
      {
        status: 500,
        headers: publicApiErrorHeaders,
      },
    );
  }
}
