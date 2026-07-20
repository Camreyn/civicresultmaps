import type { NextConfig } from "next";

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
  },
};

export default nextConfig;
