import type { TourStep } from "./guided-tour";

export const equipmentIndexTourSteps: TourStep[] = [
  {
    chapter: "Scope",
    id: "equipment-index-scope",
    target: "[data-tour='equipment-index-hero']",
    title: "Start with the evidence scope",
    body: "The catalog keeps certified configurations, jurisdiction observations, and illustrative 3D geometry separate. Read this boundary before comparing systems.",
  },
  {
    chapter: "Scope",
    id: "equipment-index-boundaries",
    target: "[data-tour='equipment-evidence-boundaries']",
    title: "Know what each record proves",
    body: "A certificate can identify an evaluated configuration. A jurisdiction record can name a product family or manufacturer. Neither one silently proves a fielded unit's internals or firmware.",
  },
  {
    chapter: "Dossiers",
    id: "equipment-index-dossiers",
    target: "[data-tour='equipment-catalog']",
    title: "Choose a reviewed dossier",
    body: "Each tile opens a source-linked equipment dossier with components, version observations, findings, network evidence, and known gaps.",
  },
  {
    chapter: "Dossiers",
    id: "equipment-index-usage",
    target: "[data-tour='equipment-usage-summary']",
    fallbackTarget: "[data-tour='equipment-catalog']",
    title: "Read locale evidence conservatively",
    body: "Named product-family counts are stronger than manufacturer-only context. Vendor-only rows are labeled separately and never presented as proof that the exact dossier model was deployed.",
  },
  {
    chapter: "Sources",
    id: "equipment-index-methodology",
    target: "[data-tour='equipment-methodology']",
    title: "Keep the interpretation rule attached",
    body: "The methodology note explains the catalog's claim boundary. Follow the cited source and caveat whenever a detail matters to a review.",
  },
];

export const equipmentDetailTourSteps: TourStep[] = [
  {
    chapter: "Scope",
    id: "equipment-detail-scope",
    target: "[data-tour='equipment-detail-hero']",
    title: "Identify the reviewed configuration",
    body: "The dossier title and certification badges identify the reviewed system scope. They are not a live reading from every fielded device.",
  },
  {
    chapter: "Scope",
    id: "equipment-detail-coverage",
    target: "[data-tour='equipment-coverage']",
    title: "Check dossier coverage",
    body: "These counts summarize sourced components, technical facts, change records, findings, and archived sources. Explicit unknowns remain visible.",
  },
  {
    chapter: "Navigate",
    id: "equipment-detail-navigation",
    target: "[data-tour='equipment-dossier-navigation']",
    title: "Use the shareable dossier sections",
    body: "Components, network evidence, history, jurisdiction context, and sources now have stable URLs. On smaller screens, use the dossier-section menu.",
  },
  {
    chapter: "Review",
    id: "equipment-detail-section",
    target: "[data-tour='equipment-dossier-section']",
    title: "Keep the active section in scope",
    body: "Every section preserves its source caveats and evidence boundaries. Use the section navigation to move without returning to one very long dossier page.",
  },
];

export const securityTourSteps: TourStep[] = [
  {
    chapter: "Scope",
    id: "security-scope",
    target: "[data-tour='security-hero']",
    title: "Read the qualifier first",
    body: "Incident records and election results are separate datasets. The map's election overlay is geographic context and does not allege a relationship or an incorrect outcome.",
  },
  {
    chapter: "Explore",
    id: "security-controls",
    target: "[data-tour='security-controls']",
    title: "Filter the incident records",
    body: "Use the controls to narrow the visible records by state, status, mapped grain, or search terms without changing the underlying sourced totals.",
  },
  {
    chapter: "Explore",
    id: "security-summary",
    target: "[data-tour='security-metrics']",
    title: "Separate mapped and statewide counts",
    body: "The summary keeps county-mapped incidents separate from records reported only at statewide grain so unmapped records are not silently assigned to counties.",
  },
  {
    chapter: "Map",
    id: "security-map",
    target: "[data-tour='security-map']",
    title: "Inspect the source-linked map",
    body: "Select a mapped county to inspect its incident record. Statewide-only records remain in totals and source lists but do not receive invented county geometry.",
  },
  {
    chapter: "Map",
    id: "security-overlay",
    target: "[data-tour='security-layer-toggle']",
    fallbackTarget: "[data-tour='security-map']",
    title: "Treat the election layer as context",
    body: "The optional winner and margin layer is joined by county FIPS for orientation. It is not evidence that an incident changed votes or results.",
  },
  {
    chapter: "Sources",
    id: "security-sources",
    target: "[data-tour='security-sources']",
    fallbackTarget: "[data-tour='security-map']",
    title: "Open the underlying reports",
    body: "Use the source links and caveats to verify dates, locations, and reporting limitations before citing an incident record.",
  },
];
