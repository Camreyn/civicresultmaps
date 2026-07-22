import type { Metadata } from "next";
import Image from "next/image";
import { ArrowLeft, Box, ChevronRight, Database, ExternalLink, FileCheck2, GitCompareArrows } from "lucide-react";
import { notFound } from "next/navigation";

import { BrandMark } from "../brand-mark";
import { equipmentCatalogMetadata, listEquipmentSystemTiles } from "@/lib/equipment-catalog";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";
import styles from "./equipment.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Election Equipment Catalog Pilot",
  description: "Source-linked certified configurations, hardware change records, version observations, findings, and evidence gaps for reviewed election systems.",
  alternates: { canonical: "/equipment" },
  robots: { index: false, follow: false },
};

export default function EquipmentIndexPage() {
  if (!isEquipmentExplorerEnabled({ productionReady: equipmentCatalogMetadata.productionReady })) notFound();
  const systems = listEquipmentSystemTiles();

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/">
          <BrandMark />
          <span><strong>Civic Result Maps</strong><small>Equipment catalog pilot</small></span>
        </a>
        <nav className={styles.topnav} aria-label="Primary navigation">
          <a href="/"><ArrowLeft aria-hidden size={15} /> State workspace</a>
          <a href="/compare"><GitCompareArrows aria-hidden size={15} /> Compare</a>
        </nav>
      </header>

      <div className={styles.page}>
        <section className={styles.indexHero}>
          <div>
            <p className={styles.eyebrow}><Box aria-hidden size={15} /> Reviewed equipment evidence</p>
            <h1>Election equipment, separated by what the source actually proves.</h1>
            <p className={styles.lede}>
              Explore EAC-certified configurations, VSTL test and change records, state approvals, public findings,
              and deployment observations without treating those different evidence scopes as interchangeable.
            </p>
          </div>
          <aside className={styles.scopeCard}>
            <span>
              Feature-gated {equipmentCatalogMetadata.productionReady
                ? "published catalog"
                : equipmentCatalogMetadata.editorialState.replaceAll("_", " ")}
            </span>
            <strong>{systems.length} reviewed {systems.length === 1 ? "dossier" : "dossiers"}</strong>
            <p>
              Generated {equipmentCatalogMetadata.generatedOn}. {equipmentCatalogMetadata.productionReady
                ? "Every visible dossier has cleared the publication workflow; access remains controlled by the deployment feature gate."
                : "Production discovery stays feature-gated while the evidence model is reviewed."}
            </p>
          </aside>
        </section>

        <section className={styles.boundaryGrid} aria-label="Evidence boundaries">
          <article><FileCheck2 aria-hidden size={20} /><strong>Certified configuration</strong><span>Components and versions in an evaluated federal or state configuration.</span></article>
          <article><Database aria-hidden size={20} /><strong>Deployment observation</strong><span>A dated jurisdiction/system record; unit internals remain unconfirmed unless separately sourced.</span></article>
          <article><Box aria-hidden size={20} /><strong>Illustrative 3D</strong><span>An accessible selection aid, never a teardown, proprietary CAD drawing, or field inventory.</span></article>
        </section>

        <section className={styles.catalogSection} aria-labelledby="catalog-heading">
          <div className={styles.sectionHead}>
            <div><p className={styles.eyebrow}>Reviewed systems</p><h2 id="catalog-heading">Available pilot dossiers</h2></div>
            <p>Every visible claim resolves to one or more archived sources.</p>
          </div>
          <div className={styles.systemGrid}>
            {systems.map((system) => (
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
                            {source.publisher}
                            <ExternalLink aria-hidden size={12} />
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
                <a className={styles.primaryLink} href={`/equipment/${system.slug}`}>
                  Open source-linked dossier <ChevronRight aria-hidden size={15} />
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.methodNote}>
          <strong>Interpretation rule</strong>
          <p>{equipmentCatalogMetadata.methodology.caveat}</p>
        </section>
      </div>
    </main>
  );
}
