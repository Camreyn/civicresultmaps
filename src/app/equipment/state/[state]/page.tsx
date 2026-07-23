import type { Metadata } from "next";
import Image from "next/image";
import { ChevronRight, ExternalLink, MapPinned, Network, Share2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { SiteHeader } from "../../../site-header";
import { EquipmentShareButton } from "../../equipment-share-button.client";
import { equipmentCatalogMetadata } from "@/lib/equipment-catalog";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";
import {
  buildEquipmentStateSocialPreview,
  equipmentSocialCardPath,
  listTrackedEquipmentStates,
  type EquipmentStateSocialPreviewSystem,
} from "@/lib/equipment-social-preview";
import { getEquipmentUsageSource } from "@/lib/equipment-usage";
import styles from "../../equipment.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ state: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { state } = await params;
  const preview = buildEquipmentStateSocialPreview(state);
  if (!preview) return {};
  const canonical = `/equipment/state/${preview.stateCode}`;
  const image = equipmentSocialCardPath({ state: preview.stateCode });
  const imageAlt = `${preview.stateName} tracked election equipment and dossier-level networking status`;

  return {
    title: preview.title,
    description: preview.description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: "Civic Result Maps",
      url: canonical,
      title: preview.title,
      description: preview.description,
      images: [{ url: image, width: 1200, height: 630, alt: imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: preview.title,
      description: preview.description,
      images: [{ url: image, alt: imageAlt }],
    },
  };
}

function reportedNames(system: EquipmentStateSocialPreviewSystem) {
  const names = system.usage.reportedSystemNames.slice(0, 3);
  const remaining = system.usage.reportedSystemNames.length - names.length;
  return `${names.join("; ")}${remaining > 0 ? `; +${remaining} more` : ""}`;
}

function StateSystemCard({ system }: { system: EquipmentStateSocialPreviewSystem }) {
  const source = system.usage.sourceIds
    .map((sourceId) => getEquipmentUsageSource(sourceId))
    .find((entry) => Boolean(entry));
  const namedFamily = system.usage.deviceFamilyRecords > 0;

  return (
    <article className={styles.stateSystemCard} data-evidence={namedFamily ? "device-family" : "manufacturer-context"}>
      {system.referenceImage ? (
        <div className={styles.stateSystemImage}>
          <Image
            alt={system.referenceImage.alt}
            height={system.referenceImage.height}
            sizes="(max-width: 760px) 90vw, 300px"
            src={system.referenceImage.assetUrl}
            width={system.referenceImage.width}
          />
          <span>Source reference image</span>
        </div>
      ) : null}
      <div className={styles.stateSystemBody}>
        <div className={styles.cardTopline}>
          <span className={namedFamily ? styles.namedEvidenceBadge : styles.contextEvidenceBadge}>
            {system.evidenceShortLabel}
          </span>
          <span>{system.evidenceLabel}</span>
        </div>
        <h3>{system.displayName}</h3>
        <p>{system.deviceRole}</p>

        <dl className={styles.stateQuickFacts}>
          <div><dt>System</dt><dd>{system.systemName} {system.systemVersion}</dd></div>
          <div><dt>Components</dt><dd>{system.componentCount} source-linked</dd></div>
          <div><dt>Changes</dt><dd>{system.changeRecordCount} reviewed records</dd></div>
          <div><dt>Sources</dt><dd>{system.sourceCount} archived</dd></div>
        </dl>

        <div className={styles.stateNetworkFact} data-network-status={system.network.status}>
          <Network aria-hidden size={18} />
          <div>
            <span>Dossier networking</span>
            <strong>{system.network.label}</strong>
            <p>{system.network.detail}</p>
            <small>{system.network.caveat}</small>
          </div>
        </div>

        {!namedFamily && system.usage.reportedSystemNames.length > 0 ? (
          <div className={styles.reportedContext}>
            <strong>What the state records actually name</strong>
            <span>{reportedNames(system)}</span>
            <small>These names provide manufacturer context only and do not identify this dossier&apos;s exact model.</small>
          </div>
        ) : null}

        <div className={styles.stateSystemLinks}>
          <a href={system.detailHref}>Open the state-filtered dossier <ChevronRight aria-hidden size={14} /></a>
          {source ? (
            <a href={source.sourceUrl} rel="noreferrer" target="_blank">
              Open {source.authority} source <ExternalLink aria-hidden size={13} />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default async function EquipmentStatePage({ params }: PageProps) {
  const equipmentEnabled = isEquipmentExplorerEnabled({ productionReady: equipmentCatalogMetadata.productionReady });
  if (!equipmentEnabled) notFound();
  const { state } = await params;
  const preview = buildEquipmentStateSocialPreview(state);
  if (!preview) notFound();
  if (state !== preview.stateCode) redirect(`/equipment/state/${preview.stateCode}`);

  const stateOptions = listTrackedEquipmentStates();
  const namedSystems = preview.systems.filter((system) => system.usage.deviceFamilyRecords > 0);
  const contextSystems = preview.systems.filter((system) => system.usage.deviceFamilyRecords === 0);
  const socialImage = equipmentSocialCardPath({ state: preview.stateCode });

  return (
    <main className={styles.shell}>
      <SiteHeader
        activePage="equipment"
        equipmentEnabled={equipmentEnabled}
        subtitle="U.S. election equipment evidence"
      />

      <div className={styles.page}>
        <nav aria-label="Breadcrumb" className={styles.equipmentBreadcrumb}>
          <a href="/equipment">U.S. Equipment</a><ChevronRight aria-hidden size={14} /><span>{preview.stateName}</span>
        </nav>

        <section className={styles.stateHero}>
          <div>
            <p className={styles.eyebrow}><MapPinned aria-hidden size={15} /> 2024 tracked equipment records</p>
            <h1>{preview.stateName} election equipment records</h1>
            <p className={styles.lede}>
              See every reviewed dossier connected to a {preview.stateName}{" "}source row, with exact product-family
              evidence kept separate from manufacturer-only context. Networking labels come from the dossier&apos;s
              certification, test, or model-family sources—not from an assumed state configuration.
            </p>
          </div>
          <aside className={styles.scopeCard}>
            <span>State share preview</span>
            <strong>{preview.systems.length} tracked {preview.systems.length === 1 ? "dossier" : "dossiers"}</strong>
            <p>{preview.namedFamilySystemCount} named product-family; {preview.manufacturerContextOnlySystemCount} manufacturer-context only.</p>
            <div className={styles.shareActions}>
              <EquipmentShareButton title={preview.title} />
              <a href={socialImage} rel="noreferrer" target="_blank"><Share2 aria-hidden size={14} /> Open preview image</a>
            </div>
          </aside>
        </section>

        <section className={styles.statePickerPanel} aria-labelledby="state-picker-heading">
          <div>
            <p className={styles.eyebrow}>Choose another state</p>
            <h2 id="state-picker-heading">Create a state-specific share link</h2>
            <p>The destination URL has its own Open Graph and X/Twitter preview listing tracked dossiers and their sourced networking status.</p>
          </div>
          <form action="/equipment/state" className={styles.statePickerForm} method="get">
            <label htmlFor="equipment-state">State</label>
            <select defaultValue={preview.stateCode} id="equipment-state" name="state">
              {stateOptions.map((option) => (
                <option key={option.stateCode} value={option.stateCode}>{option.stateName} ({option.stateCode})</option>
              ))}
            </select>
            <button type="submit">View state equipment</button>
          </form>
        </section>

        <section className={styles.stateBoundaryNote}>
          <strong>How to read this page</strong>
          <p>{preview.caveat}</p>
        </section>

        {namedSystems.length > 0 ? (
          <section className={styles.dossierSection} aria-labelledby="named-equipment-heading">
            <div className={styles.sectionHead}>
              <div><p className={styles.eyebrow}>Stronger match</p><h2 id="named-equipment-heading">Named product-family records</h2></div>
              <p>The source row explicitly names this product family. It still does not prove internal parts, firmware, networking state, or configuration of a particular unit.</p>
            </div>
            <div className={styles.stateSystemGrid}>
              {namedSystems.map((system) => <StateSystemCard key={system.slug} system={system} />)}
            </div>
          </section>
        ) : null}

        {contextSystems.length > 0 ? (
          <section className={styles.dossierSection} aria-labelledby="context-equipment-heading">
            <div className={styles.sectionHead}>
              <div><p className={styles.eyebrow}>Related context</p><h2 id="context-equipment-heading">Manufacturer context only</h2></div>
              <p>The source row names the manufacturer but not this dossier&apos;s exact model or configuration. These cards are leads for review, not exact-machine deployment claims.</p>
            </div>
            <div className={styles.stateSystemGrid}>
              {contextSystems.map((system) => <StateSystemCard key={system.slug} system={system} />)}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
