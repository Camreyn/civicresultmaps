import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { seoStates, seoCounties, datasetPath, stateElectionPath, countyElectionPath, countyByTag } from "@/lib/seo-geography";
import { loadSeoAvailability, indexableStateCodes } from "@/lib/seo-data";
import { equipmentCatalogMetadata, listEquipmentSystemSlugs } from "@/lib/equipment-catalog";
import { equipmentDossierSections } from "@/app/equipment/[slug]/dossier-navigation";
import { listTrackedEquipmentStates } from "@/lib/equipment-social-preview";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const availability = await loadSeoAvailability();
  const indexableStates = indexableStateCodes(availability);
  const paths = new Set([
    "/", "/elections", "/elections/2024/president", "/states", "/counties", "/datasets",
    "/compare", "/security", "/readiness", "/evidence", "/releases", "/developers", "/privacy",
    "/district-compactness",
  ]);
  // Preserve existing equipment discovery, but never list disabled/404 pages.
  if (isEquipmentExplorerEnabled({ catalogChannel: equipmentCatalogMetadata.channel, productionReady: equipmentCatalogMetadata.productionReady })) {
    paths.add("/equipment");
    paths.add("/equipment/compare");
    if (equipmentCatalogMetadata.productionReady) {
      for (const slug of listEquipmentSystemSlugs()) {
        for (const section of equipmentDossierSections) paths.add(`/equipment/${slug}${section.path}`);
      }
      for (const { stateCode } of listTrackedEquipmentStates()) paths.add(`/equipment/state/${stateCode}`);
    }
  }
  for (const state of seoStates) {
    paths.add(`/states/${state.slug}`);
    paths.add(`/counties/${state.slug}`);
    if (indexableStates.has(state.code)) {
      paths.add(stateElectionPath(state));
      paths.add(datasetPath(state));
    }
  }
  const resultTags = new Set(availability.filter((row) => row.level === "county" && row.sourceLinked && countyByTag(row.jurisdictionTag)?.state === row.state).map((row) => row.jurisdictionTag));
  for (const county of seoCounties) {
    paths.add(county.path);
    paths.add(`/county/${county.fips}`);
    if (resultTags.has(county.jurisdictionTag)) paths.add(countyElectionPath(county));
  }
  // No trustworthy page-modification timestamps are recorded. Omit lastModified.
  // This inventory is well below the single-sitemap 50,000 URL limit.
  return [...paths].map((path) => ({ url: absoluteUrl(path) }));
}
