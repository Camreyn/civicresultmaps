export const equipmentDossierSections = [
  { key: "overview", label: "Overview", path: "", description: "Scope, certification, and dossier coverage" },
  { key: "components", label: "Components", path: "/components", description: "Accessible parts list and optional 3D schematic" },
  { key: "topology", label: "Topology", path: "/topology", description: "Source-linked nodes, paths, controls, and evidence gaps" },
  { key: "history", label: "History", path: "/history", description: "Versions, changes, findings, power, and deployments" },
  { key: "usage", label: "Usage", path: "/usage", description: "2024 product-family and manufacturer context" },
  { key: "sources", label: "Sources", path: "/sources", description: "Grouped archived source manifest" },
] as const;

export type EquipmentDossierSectionKey = (typeof equipmentDossierSections)[number]["key"];

export function equipmentDossierHref(slug: string, section: EquipmentDossierSectionKey) {
  const configuration = equipmentDossierSections.find((candidate) => candidate.key === section);
  return `/equipment/${slug}${configuration?.path ?? ""}`;
}
