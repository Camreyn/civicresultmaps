import { NextResponse } from "next/server";
import { apiEnvelope, apiErrorEnvelope, publicApiErrorHeaders, publicDataCacheHeaders } from "@/lib/api";
import { readPublishedConnections } from "@/lib/connection-research-repository";

export async function GET() {
  try {
    const document = await readPublishedConnections();
    if (!document) return NextResponse.json(apiErrorEnvelope({ code: "CONNECTIONS_RELEASES_DISABLED", message: "Reviewed connections releases are not activated." }), { status: 503, headers: publicApiErrorHeaders });
    return NextResponse.json(apiEnvelope(document, { schemaVersion: "connections/2", source: "reviewed_connections_release", releaseId: document.releaseId }), { headers: publicDataCacheHeaders });
  } catch {
    return NextResponse.json(apiErrorEnvelope({ code: "CONNECTIONS_UNAVAILABLE", message: "Reviewed connections release unavailable." }), { status: 503, headers: publicApiErrorHeaders });
  }
}
