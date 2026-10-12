import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireResearchActor, requireResearchOrigin, ResearchAccessError } from "@/lib/connection-research-auth";
import { mutateResearchWorkspace, readResearchWorkspace, ResearchRepositoryError } from "@/lib/connection-research-repository";
import { sourceRevisionSchema } from "@/lib/connection-research";
import { assertResearchWrites } from "@/lib/connection-database-policy";
import { storeResearchArtifact } from "@/lib/connection-research-artifacts";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" };
export async function POST(request: Request) {
  try {
    requireResearchOrigin(request);
    const actor = await requireResearchActor();
    try { assertResearchWrites(process.env); } catch { throw new ResearchRepositoryError(503, "Research database or editing is not configured for this environment."); }
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Source copy required");
    const chunks: Uint8Array[] = []; let total = 0;
    try {
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > 4 * 1024 * 1024) { await reader.cancel(); throw new ResearchAccessError(413, "Browser captures are limited to 3 MiB; use the private collector for larger documents."); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
    const file = form.get("file"); const sourceId = String(form.get("sourceId") ?? "");
    const note = String(form.get("note") ?? "").trim(); const expectedVersion = Number(form.get("expectedVersion"));
    if (!(file instanceof File) || file.size < 1 || file.size > 3 * 1024 * 1024 || !note || note.length > 2000 || !/^[0-9]+$/.test(String(form.get("expectedVersion") ?? "")) || !Number.isSafeInteger(expectedVersion) || form.get("publicSourceCopy") !== "1") throw new ResearchAccessError(400, "A registered public-source copy, version, and decision note are required.");
    const workspace = await readResearchWorkspace();
    if (workspace.version !== expectedVersion) throw new ResearchRepositoryError(409, "Workspace changed; reload before capturing.");
    const source = workspace.document.sources.find((record) => record.id === sourceId);
    if (!source) throw new Error("Register the public source first");
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) ? "application/pdf" : file.type;
    if (!["application/pdf", "text/html", "text/plain", "application/json"].includes(type)) throw new Error("Unsupported public source document");
    if (type === "application/json") JSON.parse(bytes.toString("utf8"));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = workspace.document.revisions.find((record) => record.sourceId === sourceId && record.sha256 === sha256);
    const revision = existing ?? sourceRevisionSchema.parse({ id: `revision-${sha256}-${createHash("sha256").update(sourceId).digest("hex").slice(0, 12)}`, sourceId, url: source.url, retrievedAt: null, capturedAt: new Date().toISOString(), captureMethod: "researcher_copy", publishedOn: source.publishedOn, sha256, byteLength: bytes.byteLength, contentType: type, completeness: "partial", artifactPath: `connection-sources/${sourceId}/${sha256}/artifact` });
    await storeResearchArtifact(revision, bytes);
    return NextResponse.json(await mutateResearchWorkspace(expectedVersion, { operation: "capture", revision, publicSourceCopy: true, note }, actor), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ResearchAccessError || error instanceof ResearchRepositoryError ? error.message : "Public-source capture failed validation or private storage is unavailable." }, { status: error instanceof ResearchAccessError || error instanceof ResearchRepositoryError ? error.status : 400, headers });
  }
}
