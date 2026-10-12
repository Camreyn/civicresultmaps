import "server-only";
import { isClerkConfigured } from "./ui-layout-auth";
import { parseLayoutAdminAllowlist } from "./ui-layout-admin-policy";
import type { ResearchActor } from "./connection-research";

export class ResearchAccessError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export async function requireResearchActor(publisher = false): Promise<ResearchActor> {
  if (!isClerkConfigured()) throw new ResearchAccessError(503, "Research sign-in is not configured.");
  const { auth, currentUser } = await import("@clerk/nextjs/server");
  if (!(await auth()).userId) throw new ResearchAccessError(401, "Sign in required.");
  const user = await currentUser();
  if (!user) throw new ResearchAccessError(401, "Sign in required.");
  const researchers = parseLayoutAdminAllowlist(process.env.CONNECTIONS_RESEARCHER_EMAILS);
  const publishers = parseLayoutAdminAllowlist(process.env.CONNECTIONS_PUBLISHER_EMAILS);
  const emails = user.emailAddresses.filter((entry) => entry.verification?.status === "verified").map((entry) => entry.emailAddress.trim().toLowerCase());
  const email = emails.find((address) => publishers.has(address)) ?? emails.find((address) => researchers.has(address));
  if (!email || (publisher && !publishers.has(email))) throw new ResearchAccessError(403, "This account is not authorized for that research operation.");
  return { id: user.id, email, publisher: publishers.has(email) };
}
export function requireResearchOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new ResearchAccessError(403, "Same-origin research request required.");
}
