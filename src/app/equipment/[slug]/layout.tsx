import type { ReactNode } from "react";
import { Box, ChevronRight, Cpu } from "lucide-react";
import { notFound } from "next/navigation";

import { RouteTour } from "../../route-tour";
import { SiteHeader } from "../../site-header";
import { equipmentDetailTourSteps } from "../../tour-manifests";
import {
  equipmentCatalogMetadata,
  getEquipmentSystem,
} from "@/lib/equipment-catalog";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";
import { DossierSectionNav } from "./dossier-section-nav.client";
import { scopeLabel } from "./dossier-format";
import styles from "../equipment.module.css";
import upgradeStyles from "../equipment-upgrades.module.css";

export const dynamic = "force-dynamic";

type EquipmentDossierLayoutProps = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function EquipmentDossierLayout({
  children,
  params,
}: EquipmentDossierLayoutProps) {
  const equipmentEnabled = isEquipmentExplorerEnabled({ productionReady: equipmentCatalogMetadata.productionReady });
  if (!equipmentEnabled) notFound();

  const { slug } = await params;
  const system = getEquipmentSystem(slug);
  if (!system) notFound();

  return (
    <main className={styles.shell}>
      <SiteHeader
        activePage="equipment"
        equipmentEnabled={equipmentEnabled}
        subtitle="U.S. election equipment evidence"
        tourId="equipment-detail"
      />
      <RouteTour steps={equipmentDetailTourSteps} tourId="equipment-detail" />

      <div className={styles.page}>
        <nav aria-label="Breadcrumb" className={styles.equipmentBreadcrumb}>
          <a href="/equipment">U.S. Equipment</a>
          <ChevronRight aria-hidden size={14} />
          <span>{system.deviceName}</span>
        </nav>

        <section className={styles.detailHero} data-tour="equipment-detail-hero">
          <div>
            <p className={styles.eyebrow}><Cpu aria-hidden size={15} /> Source-linked configuration dossier</p>
            <h1>{system.displayName}</h1>
            <p className={styles.lede}>{system.summary}</p>
            <div className={styles.scopeBadges}>
              <span>Federal certificate {system.certification.certificationId}</span>
              <span>{system.certification.standard}</span>
              <span>VSTL: {system.certification.vstl}</span>
              <span>Editorial: {scopeLabel(system.editorialState)} r{system.claimRevision}</span>
            </div>
          </div>
          <aside className={styles.scopeCard}>
            <span>Evidence scope</span>
            <strong>Certified, not unit-inspected</strong>
            <p>{system.certification.caveat}</p>
          </aside>
        </section>

        <section className={styles.metrics} aria-label="Dossier coverage" data-tour="equipment-coverage">
          <article><span>Components</span><strong>{system.coverage.componentCount}</strong><small>all source-linked</small></article>
          <article><span>Hardware facts</span><strong>{system.coverage.technicalSpecificationCount}</strong><small>{system.coverage.unknownTechnicalSpecificationCount} explicit unknowns</small></article>
          <article><span>Change records</span><strong>{system.coverage.configurationChangeCount}</strong><small>field status kept separate</small></article>
          <article><span>Findings/statuses</span><strong>{system.coverage.findingCount}</strong><small>version-scoped</small></article>
          <article><span>Archived sources</span><strong>{system.coverage.sourceCount}</strong><small>local hash verified</small></article>
        </section>

        <DossierSectionNav slug={system.slug} />
        <div className={upgradeStyles.dossierContent} data-tour="equipment-dossier-section">
          {children}
        </div>

        <footer className={styles.footerNote}>
          <Box aria-hidden size={18} />
          <p>{system.scene.description} This dossier identifies evidence gaps and source limitations; it does not allege fraud, misconduct, altered votes, or an incorrect election outcome.</p>
        </footer>
      </div>
    </main>
  );
}
