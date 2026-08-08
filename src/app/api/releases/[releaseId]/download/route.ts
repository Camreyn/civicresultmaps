import { NextResponse } from "next/server";
import { apiErrorEnvelope, publicApiErrorHeaders } from "@/lib/api";
import { getNationalDataRelease } from "@/lib/national-releases";

type RouteContext = {
  params: Promise<{ releaseId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { releaseId } = await context.params;
  const release = getNationalDataRelease(releaseId);
  if (!release) {
    return NextResponse.json(
      apiErrorEnvelope("Unknown public data release", { releaseId }),
      { status: 404, headers: publicApiErrorHeaders },
    );
  }

  const response = NextResponse.redirect(new URL(release.archivePath, request.url), 307);
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set(
    "Access-Control-Expose-Headers",
    "ETag, Location, X-Archive-Sha256, X-Data-Sha256, X-Release-Id",
  );
  response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  response.headers.set("ETag", `"${release.archiveSha256}"`);
  response.headers.set("X-Archive-Sha256", release.archiveSha256);
  response.headers.set("X-Data-Sha256", release.dataSha256);
  response.headers.set("X-Release-Id", release.id);
  return response;
}
