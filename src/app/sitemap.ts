import type { MetadataRoute } from "next";
import { getCanonicalJurisdictionRegistry } from "@/lib/jurisdiction-tags";

const siteUrl = "https://www.civicresultmaps.org";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRouteConfig = [
    { path: "", changeFrequency: "daily", priority: 1 },
    { path: "/compare", changeFrequency: "daily", priority: 0.95 },
    { path: "/security", changeFrequency: "weekly", priority: 0.85 },
    { path: "/readiness", changeFrequency: "daily", priority: 0.8 },
    { path: "/evidence", changeFrequency: "weekly", priority: 0.7 },
    { path: "/releases", changeFrequency: "weekly", priority: 0.75 },
    { path: "/developers", changeFrequency: "monthly", priority: 0.65 },
  ] as const;
  const staticRoutes: MetadataRoute.Sitemap = staticRouteConfig.map((route) => ({
    url: siteUrl + route.path,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const countyRoutes: MetadataRoute.Sitemap = getCanonicalJurisdictionRegistry().jurisdictions
    .filter((county) => county.jurisdictionTag.startsWith("county:"))
    .map((county) => ({
      url: siteUrl + "/county/" + county.fips,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.45,
    }));

  return [...staticRoutes, ...countyRoutes];
}
