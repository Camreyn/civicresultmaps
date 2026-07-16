import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  },
};

export default nextConfig;
