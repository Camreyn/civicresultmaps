import type { MetadataRoute } from "next";

const siteUrl = "https://www.civicresultmaps.org";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/readiness`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];
}
