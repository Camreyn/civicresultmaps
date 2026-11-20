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
  async headers() {
    return [
      {
        source: "/vendor/webr/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  typedRoutes: true,
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/canonical-jurisdictions.json"],
    "/api/admin/setup-database": ["./drizzle/**/*"],
    "/api/social-card": ["./public/data/national-counties.geojson", "./data/map-thumbnail-paths/*.json.gz", "./data/ak-2024-legacy-house-district-overlay.json"],
  },
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "@equipment-catalog-data": `./data/equipment-catalog.${equipmentCatalogChannel}.json`,
    },
  },
};

export default nextConfig;
