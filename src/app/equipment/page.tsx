import type { Metadata } from "next";
import Image from "next/image";
import { Box, ChevronRight, Database, ExternalLink, FileCheck2 } from "lucide-react";
import { notFound } from "next/navigation";

import { RouteTour } from "../route-tour";
import { SiteHeader } from "../site-header";
import { equipmentIndexTourSteps } from "../tour-manifests";
import { equipmentCatalogMetadata, listEquipmentSystemTiles } from "@/lib/equipment-catalog";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";
import { listEquipmentUsageSummaries } from "@/lib/equipment-usage";
import styles from "./equipment.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "U.S. Election Equipment Explorer",
  description: "Source-linked certified configurations, hardware change records, version observations, findings, jurisdiction context, and evidence gaps for reviewed election systems.",
  alternates: { canonical: "/equipment" },
  robots: { index: true, follow: true },
};

export default function EquipmentIndexPage() {
  const equipmentEnabled = isEquipmentExplorerEnabled({ productionReady: equipmentCatalogMetadata.productionReady });
  if (!equipmentEnabled) notFound();
  const systems = listEquipmentSystemTiles();
  const usageBySlug = new Map(listEquipmentUsageSummaries().map((summary) => [summary.slug, summary]));

  return (
    <main className={styles.shell}>
      <SiteHeader
        activePage="equipment"
        equipmentEnabled={equipmentEnabled}
        subtitle="U.S. election equipment evidence"
        tourId="equipment-index"
      />
      <RouteTour steps={equipmentIndexTourSteps} tourId="equipment-index" />

      <div className={styles.page}>
        <section className={styles.indexHero} data-tour="equipment-index-hero">
          <div>
            <p className={styles.eyebrow}><Box aria-hidden size={15} /> Reviewed equipment evidence</p>
            <h1>Election equipment, separated by what the source actually proves.</h1>
            <p className={styles.lede}>
              Explore EAC-certified configurations, VSTL test and change records, state approvals, public findings,
              and jurisdiction observations without treating those different evidence scopes as interchangeable.
            </p>
          </div>
          <aside className={styles.scopeCard}>
            <span>Feature-gated reviewed catalog</span>
            <strong>{systems.length} reviewed {systems.length === 1 ? "dossier" : "dossiers"}</strong>
            <p>
              Generated {equipmentCatalogMetadata.generatedOn}. Every visible dossier has cleared the publication
              workflow; access remains controlled by the deployment feature gate.
            </p>
          </aside>
        </section>

        <section className={styles.boundaryGrid} aria-label="Evidence boundaries" data-tour="equipment-evidence-boundaries">
          <article><FileCheck2 aria-hidden size={20} /><strong>Certified configuration</strong><span>Components and versions in an evaluated federal or state configuration.</span></article>
          <article><Database aria-hidden size={20} /><strong>Jurisdiction observation</strong><span>A dated product-family or manufacturer record at its reported grain; unit internals remain unconfirmed unless separately sourced.</span></article>
          <article><Box aria-hidden size={20} /><strong>Illustrative 3D</strong><span>An accessible selection aid, never a teardown, proprietary CAD drawing, or field inventory.</span></article>
        </section>

        <section className={styles.catalogSection} aria-labelledby="catalog-heading" data-tour="equipment-catalog">
          <div className={styles.sectionHead}>
            <div><p className={styles.eyebrow}>Reviewed systems</p><h2 id="catalog-heading">Available equipment dossiers</h2></div>
            <p>Every visible claim resolves to one or more archived sources.</p>
          </div>
          <div className={styles.systemGrid}>
            {systems.map((system) => {
              const usageSummary = usageBySlug.get(system.slug);
              return (
                <article className={styles.systemCard} key={system.slug}>
                  {system.referenceImage ? (
                    <figure className={styles.systemPreview} data-equipment-preview="true">
                      <div className={styles.systemPreviewFrame}>
                        <Image
                          alt={system.referenceImage.alt}
                          className={styles.systemPreviewImage}
                          height={system.referenceImage.height}
                          sizes="(max-width: 560px) 86vw, (max-width: 780px) 43vw, 560px"
                          src={system.referenceImage.assetUrl}
                          width={system.referenceImage.width}
                        />
                      </div>
                      <figcaption>
                        <div>
                          <span>Source reference image</span>
                          <strong>{system.referenceImage.caption}</strong>
                        </div>
                        <div className={styles.systemPreviewSources}>
                          {system.referenceSources.map((source) => (
                            <a
                              data-equipment-preview-source="true"
                              href={source.url}
                              key={source.id}
                              rel="noreferrer"
                              target="_blank"
                              title={source.title}
                            >
                              {source.publisher}<ExternalLink aria-hidden size={12} />
                            </a>
                          ))}
                        </div>
                      </figcaption>
                    </figure>
                  ) : null}
                  <div className={styles.cardTopline}>
                    <span className={styles.pilotBadge}>{system.editorialState.replaceAll("_", " ")}</span>
                    <span>{system.certification.certificationId}</span>
                  </div>
                  <h3>{system.displayName}</h3>
                  <p>{system.summary}</p>
                  <dl className={styles.compactFacts}>
                    <div><dt>Role</dt><dd>{system.deviceRole}</dd></div>
                    <div><dt>Components</dt><dd>{system.coverage.componentCount}</dd></div>
                    <div><dt>Change records</dt><dd>{system.coverage.configurationChangeCount}</dd></div>
                    <div><dt>Sources</dt><dd>{system.coverage.sourceCount}</dd></div>
                  </dl>
                  {usageSummary ? (
                    <div className={styles.usageSummary} data-tour="equipment-usage-summary">
                      {usageSummary.deviceFamilyRecords > 0 ? (
                        <span><strong>{usageSummary.deviceFamilyRecords.toLocaleString()}</strong> named product-family locale rows across {usageSummary.deviceFamilyStates} states</span>
                      ) : null}
                      {usageSummary.manufacturerContextRecords > 0 ? (
                        <span><strong>{usageSummary.manufacturerContextRecords.toLocaleString()}</strong> manufacturer-context locale rows across {usageSummary.manufacturerContextStates} states</span>
                      ) : null}
                    </div>
                  ) : null}
                  <a className={styles.primaryLink} href={`/equipment/${system.slug}`}>
                    Open source-linked dossier <ChevronRight aria-hidden size={15} />
                  </a>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.methodNote} data-tour="equipment-methodology">
          <strong>Interpretation rule</strong>
          <p>{equipmentCatalogMetadata.methodology.caveat}</p>
        </section>
      </div>
    </main>
  );
}
