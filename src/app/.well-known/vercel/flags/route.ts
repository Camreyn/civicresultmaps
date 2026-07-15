import { getProviderData } from "@flags-sdk/vercel";
import { createFlagsDiscoveryEndpoint } from "flags/next";
import { workspaceLayoutCandidate } from "@/flags";

export const GET = createFlagsDiscoveryEndpoint(
  async () => getProviderData({ workspaceLayoutCandidate }),
  { secret: process.env.FLAGS_SECRET },
);
