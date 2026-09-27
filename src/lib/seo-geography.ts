import { getCanonicalJurisdictionRegistry, type CanonicalJurisdiction } from "./jurisdiction-tags.ts";
import { usStateOptions } from "./us-states.ts";

export function seoSlug(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const seoStates = usStateOptions.map(([code, name]) => ({ code, name, slug: seoSlug(name) }))
  .sort((a, b) => a.name.localeCompare(b.name));
export type SeoState = (typeof seoStates)[number];
export const stateBySlug = (slug: string) => seoStates.find((state) => state.slug === slug);
export const stateByCode = (code: string) => seoStates.find((state) => state.code === code.toUpperCase());

// Strip only "County"; retain city/parish/borough/planning-region distinctions.
function countyBaseSlug(county: CanonicalJurisdiction) {
  return seoSlug(county.displayName.replace(/ County$/i, ""));
}
const counties = getCanonicalJurisdictionRegistry().jurisdictions.filter((county) => /^county:\d{5}$/.test(county.jurisdictionTag));
const slugCounts = new Map<string, number>();
for (const county of counties) {
  const key = `${county.state}/${countyBaseSlug(county)}`;
  slugCounts.set(key, (slugCounts.get(key) ?? 0) + 1);
}
export const seoCounties = counties.map((county) => {
  const base = countyBaseSlug(county);
  const slug = (slugCounts.get(`${county.state}/${base}`) ?? 0) > 1 ? `${base}-${county.fips}` : base;
  return { ...county, slug, path: `/counties/${stateByCode(county.state)!.slug}/${slug}` };
});
export type SeoCounty = (typeof seoCounties)[number];
const countySlugIndex = new Map(seoCounties.map((county) => [`${county.state}/${county.slug}`, county]));
const countyTagIndex = new Map(seoCounties.map((county) => [county.jurisdictionTag, county]));
export const countyBySlug = (state: string, slug: string) => countySlugIndex.get(`${state}/${slug}`);
export const countyByTag = (tag: string | null) => tag ? countyTagIndex.get(tag) : undefined;
export const stateElectionPath = (state: SeoState) => `/states/${state.slug}/elections/2024/president`;
export const countyElectionPath = (county: SeoCounty) => `${county.path}/elections/2024/president`;
export const datasetSlug = (state: SeoState) => `${state.slug}-2024-presidential-results`;
export const datasetPath = (state: SeoState) => `/datasets/${datasetSlug(state)}`;
export const stateByDatasetSlug = (slug: string) => seoStates.find((state) => datasetSlug(state) === slug);
