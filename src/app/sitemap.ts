import type { MetadataRoute } from "next";
import {
  equipmentCatalogMetadata,
  listEquipmentSystemSlugs,
} from "@/lib/equipment-catalog";
import { equipmentDossierSections } from "@/app/equipment/[slug]/dossier-navigation";
import { listTrackedEquipmentStates } from "@/lib/equipment-social-preview";
import { getCanonicalJurisdictionRegistry } from "@/lib/jurisdiction-tags";

const siteUrl = "https://www.civicresultmaps.org";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRouteConfig = [
    { path: "", changeFrequency: "daily", priority: 1 },
    { path: "/compare", changeFrequency: "daily", priority: 0.95 },
    { path: "/equipment", changeFrequency: "weekly", priority: 0.9 },
    { path: "/equipment/compare", changeFrequency: "monthly", priority: 0.73 },
    { path: "/security", changeFrequency: "weekly", priority: 0.85 },
    { path: "/readiness", changeFrequency: "daily", priority: 0.8 },
    { path: "/evidence", changeFrequency: "weekly", priority: 0.7 },
    { path: "/releases", changeFrequency: "weekly", priority: 0.75 },
    { path: "/developers", changeFrequency: "monthly", priority: 0.65 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.35 },
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

  const equipmentRoutes: MetadataRoute.Sitemap = equipmentCatalogMetadata.productionReady
    ? [
        ...listEquipmentSystemSlugs().flatMap((slug) => equipmentDossierSections.map((section) => ({
          url: `${siteUrl}/equipment/${slug}${section.path}`,
          lastModified: now,
          changeFrequency: "monthly" as const,
          priority: section.key === "overview" ? 0.72 : 0.64,
        }))),
        ...listTrackedEquipmentStates().map(({ stateCode }) => ({
          url: `${siteUrl}/equipment/state/${stateCode}`,
          lastModified: now,
          changeFrequency: "monthly" as const,
          priority: 0.62,
        })),
      ]
    : [];

  return [...staticRoutes, ...equipmentRoutes, ...countyRoutes];
}
