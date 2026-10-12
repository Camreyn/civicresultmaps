import { NextResponse } from "next/server";
import { z } from "zod";
import { requireResearchActor, requireResearchOrigin, ResearchAccessError } from "@/lib/connection-research-auth";
import { mutateResearchWorkspace, readResearchWorkspace, ResearchRepositoryError } from "@/lib/connection-research-repository";
import { sourceRevisionSchema } from "@/lib/connection-research";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" };
const base = { expectedVersion: z.number().int().nonnegative(), note: z.string().trim().min(1).max(2000) };
const commandSchema = z.discriminatedUnion("operation", [
  z.object({ ...base, operation: z.literal("save"), document: z.record(z.unknown()) }).strict(),
  z.object({ ...base, operation: z.literal("capture"), revision: sourceRevisionSchema, publicSourceCopy: z.literal(true) }).strict(),
  z.object({ ...base, operation: z.literal("review_source"), revisionId: z.string(), decision: z.enum(["approve", "reject"]) }).strict(),
  z.object({ ...base, operation: z.literal("transition"), claimId: z.string(), state: z.enum(["draft", "in_review", "approved", "withdrawn"]) }).strict(),
  z.object({ ...base, operation: z.literal("publish") }).strict(),
  z.object({ ...base, operation: z.literal("rollback"), releaseId: z.string().max(100) }).strict(),
]);
function failure(error: unknown) {
  const status = error instanceof ResearchAccessError || error instanceof ResearchRepositoryError ? error.status : error instanceof z.ZodError ? 400 : 400;
  const message = error instanceof ResearchAccessError || error instanceof ResearchRepositoryError ? error.message : "Research operation failed validation. Check the evidence and review state.";
  return NextResponse.json({ error: message }, { status, headers });
}
export async function GET() {
  try {
    const actor = await requireResearchActor();
    return NextResponse.json({ ...await readResearchWorkspace(), publisher: actor.publisher }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    requireResearchOrigin(request);
    const actor = await requireResearchActor();
    const reader = request.body?.getReader();
    if (!reader) throw new ResearchAccessError(400, "Research command required.");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 3 * 1024 * 1024) { await reader.cancel(); throw new ResearchAccessError(413, "Research document is too large."); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const raw = Buffer.concat(chunks).toString("utf8");
    const { expectedVersion, ...command } = commandSchema.parse(JSON.parse(raw));
    return NextResponse.json(await mutateResearchWorkspace(expectedVersion, command, actor), { headers });
  } catch (error) { return failure(error); }
}
