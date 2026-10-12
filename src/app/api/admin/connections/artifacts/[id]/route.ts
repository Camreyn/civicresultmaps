import { requireResearchActor, ResearchAccessError } from "@/lib/connection-research-auth";
import { readResearchWorkspace } from "@/lib/connection-research-repository";
import { readResearchArtifact } from "@/lib/connection-research-artifacts";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" };
  try {
    await requireResearchActor();
    const { id } = await context.params;
    const revision = (await readResearchWorkspace()).document.revisions.find((item) => item.id === id);
    if (!revision) return new Response("Not found", { status: 404, headers });
    const bytes = await readResearchArtifact(revision);
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${revision.id}.${revision.contentType === "application/pdf" ? "pdf" : "txt"}"` } });
  } catch (error) {
    return new Response("Private source unavailable", { status: error instanceof ResearchAccessError ? error.status : 503, headers });
  }
}
