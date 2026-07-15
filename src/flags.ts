import { vercelAdapter } from "@flags-sdk/vercel";
import { cookies, headers } from "next/headers";
import { dedupe, flag } from "flags/next";

import {
  LAYOUT_VISITOR_COOKIE,
  LAYOUT_VISITOR_HEADER,
  selectLayoutVisitorId,
} from "@/lib/workspace-layout-visitor";

export { LAYOUT_VISITOR_COOKIE, LAYOUT_VISITOR_HEADER };

type LayoutFlagEntities = {
  visitor?: { id: string };
};

const identifyLayoutVisitor = dedupe(async (): Promise<LayoutFlagEntities> => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const id = selectLayoutVisitorId(
    cookieStore.get(LAYOUT_VISITOR_COOKIE)?.value,
    headerStore.get(LAYOUT_VISITOR_HEADER),
  );
  return id ? { visitor: { id } } : {};
});

export const workspaceLayoutCandidate = flag<boolean, LayoutFlagEntities>({
  key: "workspace-layout-candidate",
  adapter: vercelAdapter(),
  identify: identifyLayoutVisitor,
  defaultValue: false,
  options: [
    { value: false, label: "Stable layout" },
    { value: true, label: "Candidate layout" },
  ],
  description: "Routes an eligible visitor to the staged workspace layout candidate.",
});
