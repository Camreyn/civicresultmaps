import type { NextConfig } from "next";

import { resolveEquipmentCatalogChannel } from "./src/lib/equipment-catalog-channel";

const equipmentCatalogChannel = resolveEquipmentCatalogChannel();

const nextConfig: NextConfig = {
  ...(process.platform === "win32"
    ? {
        // Next's logical-core fan-out can terminate page-data child processes on Windows.
        // This retains full static generation while keeping worker creation predictable.
        experimental: { cpus: 4 },
      }
    : {}),
  images: {
    remotePatterns: [
      {
        hostname: "**.public.blob.vercel-storage.com",
        protocol: "https",
      },
    ],
  },
  typedRoutes: true,
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/canonical-jurisdictions.json"],
    "/api/admin/setup-database": ["./drizzle/**/*"],
    "/api/social-card": ["./data/*-counties.geojson"],
  },
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "@equipment-catalog-data": `./data/equipment-catalog.${equipmentCatalogChannel}.json`,
    },
  },
};

export default nextConfig;
