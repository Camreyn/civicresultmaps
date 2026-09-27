import { absoluteUrl, publicSourceUrl, siteOrigin } from "./seo.ts";
import { datasetPath, type SeoState } from "./seo-geography.ts";

export type Breadcrumb = { name: string; path: string };
export function breadcrumbJsonLd(items: Breadcrumb[]) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({
    "@type": "ListItem", position: index + 1, name: item.name, item: absoluteUrl(item.path),
  })) };
}

export function datasetName(state: SeoState) { return `${state.name} 2024 Presidential Election Results Dataset`; }
export function datasetDescription(state: SeoState) {
  return `Normalized 2024 presidential result rows for ${state.name}, with reporting-grain labels, candidate votes, source links, and coverage limitations. Different reporting grains must not be summed together.`;
}
export function resultDistributions(state: SeoState, levels: string[]) {
  return [...new Set(levels)].sort().map((level) => ({
    "@type": "DataDownload", name: `${state.name} 2024 presidential results (${level})`,
    encodingFormat: "application/json",
    contentUrl: absoluteUrl(`/api/results?state=${state.code}&year=2024&office=president&level=${encodeURIComponent(level)}`),
  }));
}
export function datasetJsonLd(state: SeoState, levels: string[], sourceUrls: string[]) {
  const url = absoluteUrl(datasetPath(state));
  return {
    "@context": "https://schema.org", "@type": "Dataset", "@id": `${url}#dataset`,
    name: datasetName(state), description: datasetDescription(state), url, identifier: url,
    // The project creates this normalized compilation, not the underlying official records.
    creator: { "@id": `${siteOrigin}/#organization`, "@type": "Organization", name: "Civic Result Maps", url: siteOrigin },
    temporalCoverage: "2024", spatialCoverage: { "@type": "Place", name: `${state.name}, United States` },
    isPartOf: { "@id": `${siteOrigin}/datasets#catalog` },
    isBasedOn: [...new Set(sourceUrls.map(publicSourceUrl).filter((url): url is string => Boolean(url)))],
    distribution: resultDistributions(state, levels),
    // No verified uniform license or equivalent external dataset is recorded.
    // Do not invent license, sameAs, datePublished or dateModified.
  };
}
export function catalogJsonLd(states: SeoState[]) {
  return { "@context": "https://schema.org", "@type": "DataCatalog", "@id": `${siteOrigin}/datasets#catalog`,
    name: "Civic Result Maps election datasets", url: absoluteUrl("/datasets"),
    description: "Source-linked normalized presidential result datasets, with explicit reporting grains and provenance.",
    publisher: { "@id": `${siteOrigin}/#organization` },
    dataset: states.map((state) => ({ "@type": "Dataset", "@id": `${absoluteUrl(datasetPath(state))}#dataset`,
      name: datasetName(state), description: datasetDescription(state), url: absoluteUrl(datasetPath(state)) })),
  };
}
