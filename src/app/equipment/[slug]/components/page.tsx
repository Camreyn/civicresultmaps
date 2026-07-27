import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getEquipmentSystem,
  sourcesForEquipmentSystem,
} from "@/lib/equipment-catalog";
import { buildEquipmentDossierMetadata } from "../dossier-format";
import { EquipmentExplorer } from "../equipment-explorer.client";
import upgradeStyles from "../../equipment-upgrades.module.css";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildEquipmentDossierMetadata(slug, "components");
}

export default async function EquipmentComponentsPage({ params }: PageProps) {
  const { slug } = await params;
  const system = getEquipmentSystem(slug);
  if (!system) notFound();
  const sources = sourcesForEquipmentSystem(system);

  return (
    <div
      className={upgradeStyles.componentPageFlow}
      data-tour="equipment-explorer"
      id="equipment-explorer"
    >
      <EquipmentExplorer sources={sources} system={system} />
    </div>
  );
}
