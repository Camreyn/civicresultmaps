import type { Metadata } from "next";

import { getEquipmentSystem } from "@/lib/equipment-catalog";
import {
  buildEquipmentMachineSocialPreview,
  equipmentSocialCardPath,
} from "@/lib/equipment-social-preview";
import {
  equipmentDossierHref,
  equipmentDossierSections,
  type EquipmentDossierSectionKey,
} from "./dossier-navigation";

export type EquipmentSearchValue = string | string[] | undefined;

export function scopeLabel(scope: string) {
  return scope.replaceAll("_", " ");
}

export function firstSearchValue(value: EquipmentSearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function buildEquipmentDossierMetadata(
  slug: string,
  section: EquipmentDossierSectionKey = "overview",
): Metadata {
  const system = getEquipmentSystem(slug);
  const preview = buildEquipmentMachineSocialPreview(slug);
  if (!system || !preview) return {};

  const sectionConfiguration = equipmentDossierSections.find((candidate) => candidate.key === section);
  const canonical = equipmentDossierHref(system.slug, section);
  const title = section === "overview"
    ? preview.title
    : `${sectionConfiguration?.label ?? "Dossier"} | ${system.displayName}`;
  const description = section === "overview"
    ? preview.description
    : `${sectionConfiguration?.description ?? "Source-linked equipment evidence"} for ${system.displayName}. ${system.certification.caveat}`;
  const image = equipmentSocialCardPath({ slug: system.slug });
  const imageAlt = `${system.displayName} quick facts and sourced networking status`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: "Civic Result Maps",
      url: canonical,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image, alt: imageAlt }],
    },
  };
}
