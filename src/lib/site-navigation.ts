/** One public destination registry for the toolbar, mobile menu and footer. */
export const siteNavigation = [
  { id: "workspace", label: "Results", href: "/", group: "primary", prefixes: ["/"] },
  { id: "compare", label: "Compare", href: "/compare", group: "primary", prefixes: ["/compare"] },
  { id: "connections", label: "Connections", href: "/connections", group: "primary", prefixes: ["/connections"] },
  { id: "equipment", label: "Equipment", href: "/equipment", group: "primary", prefixes: ["/equipment"] },
  { id: "evidence", label: "Evidence", href: "/evidence", group: "primary", prefixes: ["/evidence", "/timeline"] },
  { id: "news", label: "News", href: "/news", group: "primary", prefixes: ["/news"] },
  { id: "security", label: "Security", href: "/security", group: "Tools", prefixes: ["/security"] },
  { id: "compactness", label: "District compactness", href: "/district-compactness", group: "Tools", prefixes: ["/district-compactness"] },
  { id: "elections", label: "Elections", href: "/elections", group: "Browse", prefixes: ["/elections"] },
  { id: "states", label: "States", href: "/states", group: "Browse", prefixes: ["/states"] },
  { id: "counties", label: "Counties", href: "/counties", group: "Browse", prefixes: ["/counties", "/county"] },
  { id: "datasets", label: "Datasets", href: "/datasets", group: "Data & API", prefixes: ["/datasets"] },
  { id: "releases", label: "Releases", href: "/releases", group: "Data & API", prefixes: ["/releases"] },
  { id: "developers", label: "API", href: "/developers", group: "Data & API", prefixes: ["/developers"] },
  { id: "readiness", label: "Readiness", href: "/readiness", group: "Data & API", prefixes: ["/readiness"] },
  { id: "privacy", label: "Privacy", href: "/privacy", group: "Policies", prefixes: ["/privacy"] },
] as const;

export type SitePage = typeof siteNavigation[number]["id"];
export type SiteNavigationLink = typeof siteNavigation[number];

export function visibleSiteNavigation(equipmentEnabled: boolean) {
  return siteNavigation.filter((link) => link.id !== "equipment" || equipmentEnabled);
}

export function activeSitePage(pathname: string): SitePage | null {
  const matches = siteNavigation.flatMap((link) => link.prefixes.filter((prefix) => prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`)).map((prefix) => ({ id: link.id, length: prefix.length })));
  return matches.sort((a, b) => b.length - a.length)[0]?.id ?? null;
}
