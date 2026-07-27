import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getEquipmentSystem,
  sourcesForEquipmentSystem,
} from "@/lib/equipment-catalog";
import { buildEquipmentDossierMetadata } from "../dossier-format";
import { EquipmentNetworkEvidencePanel } from "../equipment-network-evidence.client";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildEquipmentDossierMetadata(slug, "network");
}

export default async function EquipmentNetworkPage({ params }: PageProps) {
  const { slug } = await params;
  const system = getEquipmentSystem(slug);
  if (!system) notFound();
  const sources = sourcesForEquipmentSystem(system);

  return (
    <div data-tour="equipment-network-evidence" id="equipment-network-evidence">
      <EquipmentNetworkEvidencePanel evidence={system.networkEvidence} sources={sources} />
    </div>
  );
}
