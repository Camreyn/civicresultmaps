import { NextResponse } from "next/server";
import { apiEnvelope, apiErrorEnvelope, publicApiErrorHeaders, publicDataCacheHeaders } from "@/lib/api";
import { getNationalDataRelease, nationalReleaseMeta } from "@/lib/national-releases";

type RouteContext = {
  params: Promise<{ releaseId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { releaseId } = await context.params;
  const release = getNationalDataRelease(releaseId);
  if (!release) {
    return NextResponse.json(
      apiErrorEnvelope("Unknown national data release", { releaseId }),
      { status: 404, headers: publicApiErrorHeaders },
    );
  }

  return NextResponse.json(
    apiEnvelope(release, nationalReleaseMeta(release.id)),
    { headers: publicDataCacheHeaders },
  );
}
