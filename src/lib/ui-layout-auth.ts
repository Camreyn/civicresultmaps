import "server-only";

import type { LayoutActor } from "./ui-layout-repository";
import {
  parseLayoutAdminAllowlist,
  selectAuthorizedLayoutAdminEmail,
} from "./ui-layout-admin-policy";

export type LayoutAdminState =
  | { status: "ready"; actor: LayoutActor }
  | { status: "unconfigured" }
  | { status: "signed-out" }
  | { status: "forbidden"; email?: string };

export class LayoutAdminAuthorizationError extends Error {
  constructor(public readonly status: LayoutAdminState["status"]) {
    super(status === "forbidden" ? "This account is not authorized to manage UI layouts." : "Sign in is required.");
    this.name = "LayoutAdminAuthorizationError";
  }
}

export function isClerkConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export function layoutAdminAllowlist() {
  return parseLayoutAdminAllowlist(process.env.UI_LAYOUT_ADMIN_EMAILS);
}

export async function readLayoutAdmin(): Promise<LayoutAdminState> {
  if (!isClerkConfigured()) return { status: "unconfigured" };

  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const session = await auth();
  if (!session.userId) return { status: "signed-out" };

  const user = await currentUser();
  if (!user) return { status: "signed-out" };
  const verifiedEmails = user.emailAddresses
    .filter((address) => address.verification?.status === "verified")
    .map((address) => address.emailAddress.trim().toLowerCase());
  const authorizedEmail = selectAuthorizedLayoutAdminEmail(
    verifiedEmails,
    process.env.UI_LAYOUT_ADMIN_EMAILS,
  );
  if (!authorizedEmail) {
    return { status: "forbidden", email: verifiedEmails[0] };
  }

  return {
    status: "ready",
    actor: { id: user.id, email: authorizedEmail },
  };
}

export async function requireLayoutAdmin() {
  const state = await readLayoutAdmin();
  if (state.status !== "ready") {
    throw new LayoutAdminAuthorizationError(state.status);
  }
  return state.actor;
}
