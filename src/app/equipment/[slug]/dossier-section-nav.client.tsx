"use client";

import { usePathname } from "next/navigation";

import { equipmentDossierSections } from "./dossier-navigation";
import upgradeStyles from "../equipment-upgrades.module.css";

type DossierSectionNavProps = {
  slug: string;
};

export function DossierSectionNav({ slug }: DossierSectionNavProps) {
  const pathname = usePathname();
  const basePath = `/equipment/${slug}`;
  const active = equipmentDossierSections.find((section) => `${basePath}${section.path}` === pathname)
    ?? equipmentDossierSections[0];

  return (
    <div className={upgradeStyles.dossierNavWrap} data-tour="equipment-dossier-navigation">
      <label className={upgradeStyles.dossierMobileMenu}>
        <span>Dossier section</span>
        <select
          aria-label="Dossier section"
          onChange={(event) => window.location.assign(event.currentTarget.value)}
          value={`${basePath}${active.path}`}
        >
          {equipmentDossierSections.map((section) => (
            <option key={section.key} value={`${basePath}${section.path}`}>{section.label}</option>
          ))}
        </select>
      </label>
      <nav aria-label="Equipment dossier sections" className={upgradeStyles.dossierNav}>
        {equipmentDossierSections.map((section) => {
          const href = `${basePath}${section.path}`;
          const current = section.key === active.key;
          return (
            <a aria-current={current ? "page" : undefined} href={href} key={section.key}>
              <strong>{section.label}</strong>
              <span>{section.description}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
