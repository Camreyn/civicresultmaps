import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireLayoutAdmin } from "@/lib/ui-layout-auth";
import { WORKSPACE_LAYOUT_DRAFT_COOKIE } from "@/lib/workspace-layout-runtime";

export async function POST(request: NextRequest) {
  await requireLayoutAdmin();
  (await cookies()).delete(WORKSPACE_LAYOUT_DRAFT_COOKIE);
  return NextResponse.redirect(new URL("/admin/layout", request.url), 303);
}
