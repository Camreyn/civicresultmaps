import { NextResponse } from "next/server";
import { requireResearchActor, ResearchAccessError } from "@/lib/connection-research-auth";
import { readResearchWorkspace } from "@/lib/connection-research-repository";
import { readResearchArtifact } from "@/lib/connection-research-artifacts";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireResearchActor();
    const { id } = await context.params;
    const revision = (await readResearchWorkspace()).document.revisions.find((record) => record.id === id);
    if (!revision) return NextResponse.json({ error: "Source revision unavailable" }, { status: 404, headers });
    const bytes = await readResearchArtifact(revision);
    let text: string;
    const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
    if (!Number.isInteger(page) || page < 1 || page > 2000) return NextResponse.json({ error: "Invalid page" }, { status: 400, headers });
    if (revision.contentType === "application/pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(bytes), isEvalSupported: false });
      try { text = (await parser.getText({ partial: [page] })).text; } finally { await parser.destroy(); }
    } else {
      text = bytes.subarray(0, 256 * 1024).toString("utf8");
      if (revision.contentType === "text/html") text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ");
    }
    return NextResponse.json({ text: text.slice(0, 100000), page: revision.contentType === "application/pdf" ? page : null, derivative: "Bounded text extraction; verify layout/context against the private original.", sha256: revision.sha256 }, { headers });
  } catch (error) { return NextResponse.json({ error: "Private source text unavailable" }, { status: error instanceof ResearchAccessError ? error.status : 503, headers }); }
}
