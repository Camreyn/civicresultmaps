import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isPrivateAdminPath } from "@/lib/ui-layout-admin-policy";
import {
  isLayoutVisitorId,
  LAYOUT_VISITOR_COOKIE,
  LAYOUT_VISITOR_HEADER,
} from "@/lib/workspace-layout-visitor";

const productionHosts = new Set(["civicresultmaps.org", "www.civicresultmaps.org"]);
const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

function visitorId(request: NextRequest) {
  const existing = request.cookies.get(LAYOUT_VISITOR_COOKIE)?.value;
  return existing && isLayoutVisitorId(existing) ? existing : crypto.randomUUID();
}

function responseWithVisitor(request: NextRequest, id: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LAYOUT_VISITOR_HEADER, id);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const existing = request.cookies.get(LAYOUT_VISITOR_COOKIE)?.value;
  if (!existing || !isLayoutVisitorId(existing)) {
    response.cookies.set(LAYOUT_VISITOR_COOKIE, id, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}

const authenticatedProxy = clerkConfigured
  ? clerkMiddleware(async (auth, request) => {
      if (request.nextUrl.pathname.startsWith("/admin/layout") && !request.nextUrl.pathname.startsWith("/admin/sign-in")) {
        await auth.protect();
      }
      const id = visitorId(request);
      return responseWithVisitor(request, id);
    })
  : null;

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("host")?.split(":")[0] ?? "";

  if (productionHosts.has(host) && forwardedProto === "http") {
    const secureUrl = request.nextUrl.clone();
    secureUrl.protocol = "https:";
    return NextResponse.redirect(secureUrl, 308);
  }

  if (authenticatedProxy && isPrivateAdminPath(request.nextUrl.pathname)) {
    const response = await authenticatedProxy(request, event);
    if (response) return response;
  }
  const id = visitorId(request);
  return responseWithVisitor(request, id);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
