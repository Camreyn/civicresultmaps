import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingIncludes: {
    "/api/admin/setup-database": ["./drizzle/**/*"],
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
