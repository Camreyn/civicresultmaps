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

export const workspaceLayoutRuntimeV3 = flag<boolean>({
  key: "workspace-layout-runtime-v3",
  adapter: vercelAdapter(),
  defaultValue: process.env.NODE_ENV === "development" && !process.env.VERCEL,
  options: [
    { value: false, label: "Compatibility runtime" },
    { value: true, label: "Grouped runtime v3" },
  ],
  description: "Enables schema-v3 layout groups and presentation tokens in the public workspace runtime.",
});

export const workspaceBuilderV4 = flag<boolean>({
  key: "workspace-builder-v4",
  adapter: vercelAdapter(),
  defaultValue: process.env.NODE_ENV === "development" && !process.env.VERCEL,
  options: [
    { value: false, label: "Builder v3" },
    { value: true, label: "Builder v4" },
  ],
  description: "Enables grouped visual editing, named drafts, revision diffs, and scheduling controls.",
});
