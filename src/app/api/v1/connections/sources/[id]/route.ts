import { NextResponse } from "next/server";
import { apiEnvelope, apiErrorEnvelope, publicApiErrorHeaders, publicDataCacheHeaders } from "@/lib/api";
import { readPublishedConnections } from "@/lib/connection-research-repository";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const document = await readPublishedConnections();
    const { id } = await context.params;
    const revision = document?.revisions.find((record) => record.id === id);
    if (!document || !revision) return NextResponse.json(apiErrorEnvelope({ code: "SOURCE_REVISION_UNAVAILABLE", message: "Published source revision unavailable." }), { status: document ? 404 : 503, headers: publicApiErrorHeaders });
    return NextResponse.json(apiEnvelope({ revision, source: document.sources.find((source) => source.id === revision.sourceId), passages: document.evidence.filter((item) => item.revisionId === id) }, { schemaVersion: "connections/2", source: "reviewed_connections_release", releaseId: document.releaseId }), { headers: publicDataCacheHeaders });
  } catch {
    return NextResponse.json(apiErrorEnvelope("Source revision unavailable"), { status: 503, headers: publicApiErrorHeaders });
  }
}
