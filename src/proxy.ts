import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const productionHosts = new Set(["civicresultmaps.org", "www.civicresultmaps.org"]);

export function proxy(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("host")?.split(":")[0] ?? "";

  if (productionHosts.has(host) && forwardedProto === "http") {
    const secureUrl = request.nextUrl.clone();
    secureUrl.protocol = "https:";
    return NextResponse.redirect(secureUrl, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
