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
    chapter: "Hardware",
    id: "equipment-detail-explorer",
    target: "[data-tour='equipment-explorer']",
    title: "Inspect and isolate components",
    body: "Rotate and zoom the illustrative orthographic model, explode the assembly, select components, and use isolate or hide controls. Component claims remain tied to their listed evidence scope.",
  },
  {
    chapter: "Network",
    id: "equipment-detail-network",
    target: "[data-tour='equipment-network-evidence']",
    fallbackTarget: "[data-tour='equipment-explorer']",
    title: "Trace documented network paths",
    body: "Network diagrams, modems, ports, and transmission paths appear only when a reviewed source documents them. Configuration examples do not prove that every deployment used the same path.",
  },
  {
    chapter: "Versions",
    id: "equipment-detail-versions",
    target: "[data-tour='equipment-version-evidence']",
    title: "Read the last sourced observation",
    body: "Last means the latest observation in this reviewed package, not a live firmware reading and not necessarily the newest release for the product family.",
  },
  {
    chapter: "Locales",
    id: "equipment-detail-usage",
    target: "[data-tour='equipment-usage']",
    title: "Open jurisdiction and map records",
    body: "Filter the sourced 2024 jurisdiction records by evidence strength, state, or name. Each row links to its source and, when geometry resolves, directly to the equipment map.",
  },
  {
    chapter: "Sources",
    id: "equipment-detail-sources",
    target: "[data-tour='equipment-source-manifest']",
    title: "Verify the source manifest",
    body: "The manifest lists official and supplemental artifacts, reviewed revisions, local hashes, and direct source links used by the dossier.",
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
