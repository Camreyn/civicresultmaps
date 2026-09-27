import type { Metadata } from "next";

export const siteOrigin = "https://www.civicresultmaps.org";
export const siteName = "Civic Result Maps";
export const homeTitle = "Civic Result Maps | U.S. Election Results, Precinct Maps & Election Data";
export const homeDescription = "Explore source-linked U.S. election results, precinct maps, county profiles, data coverage, and downloadable election data with provenance and limitations.";

export function absoluteUrl(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new Error("Expected a site-relative SEO path.");
  return new URL(path, siteOrigin).href;
}

export function pageMetadata(input: { title: string; description: string; path: string; index?: boolean; canonical?: boolean; image?: { path: string; alt: string } }): Metadata {
  const title = input.title.includes(siteName) ? input.title : `${input.title} | ${siteName}`;
  const url = absoluteUrl(input.path);
  return {
    title: { absolute: title },
    description: input.description,
    ...(input.canonical === false ? {} : { alternates: { canonical: url } }),
    robots: { index: input.index ?? true, follow: true },
    openGraph: { type: "website", title, description: input.description, siteName,
      ...(input.canonical === false ? {} : { url }),
      ...(input.image ? { images: [{ url: absoluteUrl(input.image.path), width: 1200, height: 630, alt: input.image.alt }] } : {}),
    },
    twitter: { card: input.image ? "summary_large_image" : "summary", title, description: input.description,
      ...(input.image ? { images: [{ url: absoluteUrl(input.image.path), alt: input.image.alt }] } : {}),
    },
  };
}

// JSON-LD is data, not executable markup. Source titles can contain HTML characters.
export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export const identityJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${siteOrigin}/#organization`, name: siteName, url: siteOrigin,
      logo: absoluteUrl("/icons/logo/crm-logo-full-lockup.svg"), sameAs: ["https://github.com/Camreyn/civicresultmaps"] },
    { "@type": "WebSite", "@id": `${siteOrigin}/#website`, name: siteName, url: siteOrigin,
      publisher: { "@id": `${siteOrigin}/#organization` } },
  ],
};

export function publicSourceUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
