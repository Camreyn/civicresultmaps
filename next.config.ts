import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingIncludes: {
    "/api/admin/setup-database": ["./drizzle/**/*"],
    "/api/social-card": ["./data/*-counties.geojson"],
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
