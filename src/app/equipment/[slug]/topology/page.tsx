import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getEquipmentSystem,
  sourcesForEquipmentSystem,
} from "@/lib/equipment-catalog";
import { buildEquipmentDossierMetadata } from "../dossier-format";
import { EquipmentTopologyEvidencePanel } from "../equipment-network-evidence.client";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildEquipmentDossierMetadata(slug, "topology");
}

export default async function EquipmentTopologyPage({ params }: PageProps) {
  const { slug } = await params;
  const system = getEquipmentSystem(slug);
  if (!system) notFound();
  const sources = sourcesForEquipmentSystem(system);

  return (
    <div data-tour="equipment-topology-evidence" id="equipment-topology-evidence">
      <EquipmentTopologyEvidencePanel evidence={system.networkEvidence} sources={sources} />
    </div>
  );
}
