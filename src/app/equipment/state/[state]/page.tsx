import type { Metadata } from "next";
import Image from "next/image";
import { ChevronRight, ExternalLink, MapPinned, Network, Share2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { SiteHeader } from "../../../site-header";
import { EquipmentShareButton } from "../../equipment-share-button.client";
import {
  equipmentCatalogMetadata,
  getEquipmentSystem,
} from "@/lib/equipment-catalog";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";
import {
  buildEquipmentStateSocialPreview,
  equipmentSocialCardPath,
  listTrackedEquipmentStates,
  type EquipmentStateSocialPreviewSystem,
} from "@/lib/equipment-social-preview";
import {
  getEquipmentUsageSource,
  type EquipmentUsageManufacturerContextSummary,
} from "@/lib/equipment-usage";
import styles from "../../equipment.module.css";
import upgradeStyles from "../../equipment-upgrades.module.css";

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
  const imageAlt = `${preview.stateName} exact product-family matches and manufacturer context`;

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

function reportedNames(names: string[]) {
  const visible = names.slice(0, 4);
  const remaining = names.length - visible.length;
  return `${visible.join("; ")}${remaining > 0 ? `; +${remaining} more` : ""}`;
}

function StateSystemCard({ system }: { system: EquipmentStateSocialPreviewSystem }) {
  const source = system.usage.sourceIds
    .map((sourceId) => getEquipmentUsageSource(sourceId))
    .find((entry) => Boolean(entry));

  return (
    <article className={styles.stateSystemCard} data-evidence="device-family">
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
          <span className={styles.namedEvidenceBadge}>{system.evidenceShortLabel}</span>
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

        <div className={styles.stateSystemLinks}>
          <a href={system.detailHref}>Open exact-match records <ChevronRight aria-hidden size={14} /></a>
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

function ManufacturerContextCard({
  context,
}: {
  context: EquipmentUsageManufacturerContextSummary;
}) {
  const source = context.sourceIds
    .map((sourceId) => getEquipmentUsageSource(sourceId))
    .find((entry) => Boolean(entry));
  const relatedSystems = context.relatedDossierSlugs
    .map((slug) => getEquipmentSystem(slug))
    .filter((system) => Boolean(system));

  return (
    <article className={upgradeStyles.manufacturerCard} data-evidence="manufacturer-context">
      <span>Manufacturer context only</span>
      <h3>{context.manufacturer.displayName}</h3>
      <p><strong>{context.totalRecords.toLocaleString()}</strong> source rows name this vendor without identifying an exact reviewed dossier model.</p>
      {context.reportedSystemNames.length > 0 ? (
        <div className={upgradeStyles.reportedNames}>
          <strong>Names in the source rows</strong>
          <span>{reportedNames(context.reportedSystemNames)}</span>
        </div>
      ) : null}
      <p>{context.caveat}</p>
      {relatedSystems.length > 0 ? (
        <div className={upgradeStyles.relatedDossiers}>
          <strong>Browse same-vendor dossiers — not deployment evidence</strong>
          {relatedSystems.map((system) => system ? (
            <a href={`/equipment/${system.slug}/usage?usageEvidence=manufacturer_context&usageState=${context.state}`} key={system.slug}>
              {system.deviceName} context <ChevronRight aria-hidden size={12} />
            </a>
          ) : null)}
        </div>
      ) : null}
      {source ? (
        <div className={styles.stateSystemLinks}>
          <a href={source.sourceUrl} rel="noreferrer" target="_blank">
            Open {source.authority} source <ExternalLink aria-hidden size={13} />
          </a>
        </div>
      ) : null}
    </article>
  );
}

export default async function EquipmentStatePage({ params }: PageProps) {
  const equipmentEnabled = isEquipmentExplorerEnabled({ catalogChannel: equipmentCatalogMetadata.channel, productionReady: equipmentCatalogMetadata.productionReady });
  if (!equipmentEnabled) notFound();
  const { state } = await params;
  const preview = buildEquipmentStateSocialPreview(state);
  if (!preview) notFound();
  if (state !== preview.stateCode) redirect(`/equipment/state/${preview.stateCode}`);

  const stateOptions = listTrackedEquipmentStates();
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
              Exact product-family matches are linked to reviewed dossiers. Manufacturer-only rows are grouped once
              by vendor and never fanned out into machine-level usage claims. Networking labels appear only on exact
              dossier cards and remain certification or documentation context.
            </p>
          </div>
          <aside className={styles.scopeCard}>
            <span>State evidence summary</span>
            <strong>{preview.observationCount.toLocaleString()} sourced observations</strong>
            <p>{preview.namedFamilySystemCount} exact dossier {preview.namedFamilySystemCount === 1 ? "match" : "matches"}; {preview.manufacturerContextCount} vendor-context {preview.manufacturerContextCount === 1 ? "group" : "groups"}.</p>
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
            <p>The destination URL has its own social preview summarizing exact family matches and vendor-level context without conflating them.</p>
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

        {preview.systems.length > 0 ? (
          <section className={styles.dossierSection} aria-labelledby="named-equipment-heading">
            <div className={styles.sectionHead}>
              <div><p className={styles.eyebrow}>Stronger match</p><h2 id="named-equipment-heading">Named product-family records</h2></div>
              <p>The source row explicitly names this product family. It still does not prove internal parts, firmware, networking state, or configuration of a particular unit.</p>
            </div>
            <div className={styles.stateSystemGrid}>
              {preview.systems.map((system) => <StateSystemCard key={system.slug} system={system} />)}
            </div>
          </section>
        ) : null}

        {preview.manufacturerContexts.length > 0 ? (
          <section className={styles.dossierSection} aria-labelledby="context-equipment-heading">
            <div className={styles.sectionHead}>
              <div><p className={styles.eyebrow}>Related context</p><h2 id="context-equipment-heading">Manufacturer context only</h2></div>
              <p>Each vendor appears once. Related dossier links are research navigation, not evidence that a listed machine was selected, installed, configured, or used in this state.</p>
            </div>
            <div className={upgradeStyles.manufacturerGrid}>
              {preview.manufacturerContexts.map((context) => (
                <ManufacturerContextCard context={context} key={context.manufacturer.id} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
