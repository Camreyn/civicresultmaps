import { NextResponse } from "next/server";
import { apiEnvelope, publicDataCacheHeaders } from "@/lib/api";
import { currentNationalReleaseId } from "@/lib/api-version";
import { listNationalDataReleases, nationalReleaseMeta } from "@/lib/national-releases";

export function GET() {
  const releases = listNationalDataReleases();
  return NextResponse.json(
    apiEnvelope(releases, {
      ...nationalReleaseMeta(),
      currentReleaseId: currentNationalReleaseId,
      total: releases.length,
    }),
    { headers: publicDataCacheHeaders },
  );
}
