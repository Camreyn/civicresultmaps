import type { Metadata } from "next";
import Image from "next/image";
import {
  Box,
  ChevronRight,
  Network,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { notFound } from "next/navigation";

import { RouteTour } from "../route-tour";
import { SiteHeader } from "../site-header";
import { equipmentIndexTourSteps } from "../tour-manifests";
import { equipmentCatalogMetadata, listEquipmentSystemTiles } from "@/lib/equipment-catalog";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";
import {
  buildEquipmentIndexSocialPreview,
  equipmentSocialCardPath,
  getEquipmentNetworkQuickFact,
  listTrackedEquipmentStates,
} from "@/lib/equipment-social-preview";
import {
  getEquipmentUsageManufacturer,
  listEquipmentUsageSummaries,
} from "@/lib/equipment-usage";
import styles from "./equipment.module.css";
import upgradeStyles from "./equipment-upgrades.module.css";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;
type PageProps = {
  searchParams: Promise<Record<string, SearchValue>>;
};

function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

const equipmentIndexPreview = buildEquipmentIndexSocialPreview();
const equipmentIndexSocialImage = equipmentSocialCardPath();

export const metadata: Metadata = {
  title: equipmentIndexPreview.title,
  description: equipmentIndexPreview.description,
  alternates: { canonical: "/equipment" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Civic Result Maps",
    url: "/equipment",
    title: equipmentIndexPreview.title,
    description: equipmentIndexPreview.description,
    images: [{
      url: equipmentIndexSocialImage,
      width: 1200,
      height: 630,
      alt: "Six reviewed U.S. election equipment dossiers and their sourced networking status",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: equipmentIndexPreview.title,
    description: equipmentIndexPreview.description,
    images: [{
      url: equipmentIndexSocialImage,
      alt: "Six reviewed U.S. election equipment dossiers and their sourced networking status",
    }],
  },
};

export default async function EquipmentIndexPage({ searchParams }: PageProps) {
  const equipmentEnabled = isEquipmentExplorerEnabled({ catalogChannel: equipmentCatalogMetadata.channel, productionReady: equipmentCatalogMetadata.productionReady });
  if (!equipmentEnabled) notFound();
  const requested = await searchParams;
  const systems = listEquipmentSystemTiles();
  const usageBySlug = new Map(listEquipmentUsageSummaries().map((summary) => [summary.slug, summary]));
  const stateOptions = listTrackedEquipmentStates();
  const manufacturerOptions = [...new Map(systems.flatMap((system) => {
    const summary = usageBySlug.get(system.slug);
    const manufacturer = summary ? getEquipmentUsageManufacturer(summary.manufacturerId) : undefined;
    return manufacturer ? [[manufacturer.id, manufacturer.displayName] as const] : [];
  })).entries()]
    .map(([id, displayName]) => ({ id, displayName }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const manufacturerIds = new Set(manufacturerOptions.map((option) => option.id));
  const query = firstValue(requested.q)?.trim().slice(0, 100) ?? "";
  const manufacturer = manufacturerIds.has(firstValue(requested.manufacturer) ?? "")
    ? firstValue(requested.manufacturer) ?? ""
    : "";
  const requestedNetwork = firstValue(requested.network) ?? "";
  const networkStatus = ["documented", "optional", "reviewed_without_attachment"].includes(requestedNetwork)
    ? requestedNetwork
    : "";
  const normalizedQuery = query.toLocaleLowerCase();
  const filteredSystems = systems.filter((system) => {
    const network = getEquipmentNetworkQuickFact(system.slug);
    const usage = usageBySlug.get(system.slug);
    const canonicalManufacturer = usage ? getEquipmentUsageManufacturer(usage.manufacturerId) : undefined;
    if (manufacturer && usage?.manufacturerId !== manufacturer) return false;
    if (networkStatus && network?.status !== networkStatus) return false;
    if (!normalizedQuery) return true;
    return [
      system.displayName,
      system.deviceName,
      system.deviceRole,
      system.manufacturer,
      canonicalManufacturer?.displayName ?? "",
      system.systemName,
      system.systemVersion,
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });

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
            <h1>Explore reviewed U.S. election equipment.</h1>
            <p className={styles.lede}>
              Browse source-linked dossiers, compare reviewed systems, or open state-level context. Certification
              records, jurisdiction observations, vendor context, and optional 3D aids stay labeled by evidence scope.
            </p>
          </div>
          <aside className={styles.scopeCard} data-tour="equipment-catalog-summary">
            <span>Public reviewed catalog</span>
            <strong>{systems.length} reviewed {systems.length === 1 ? "dossier" : "dossiers"}</strong>
            <p>Generated {equipmentCatalogMetadata.generatedOn}. Every visible claim resolves to archived, revision-pinned sources.</p>
            <a className={styles.primaryLink} href="/equipment/compare">Compare systems <ChevronRight aria-hidden size={15} /></a>
          </aside>
        </section>

        <section
          className={styles.statePickerPanel}
          aria-labelledby="equipment-state-picker-heading"
          data-tour="equipment-state-context"
        >
          <div>
            <p className={styles.eyebrow}>State equipment pages</p>
            <h2 id="equipment-state-picker-heading">Browse 2024 equipment context by state</h2>
            <p>Named product-family records link to matching dossiers. Manufacturer-only records remain labeled as broader context.</p>
          </div>
          <form action="/equipment/state" className={styles.statePickerForm} method="get">
            <label htmlFor="equipment-state">State</label>
            <select defaultValue="" id="equipment-state" name="state" required>
              <option disabled value="">Choose a state</option>
              {stateOptions.map((option) => (
                <option key={option.stateCode} value={option.stateCode}>{option.stateName} ({option.stateCode})</option>
              ))}
            </select>
            <button type="submit">View state equipment</button>
          </form>
        </section>

        <section className={styles.catalogSection} aria-labelledby="catalog-heading" data-tour="equipment-catalog">
          <div className={`${styles.sectionHead} ${upgradeStyles.catalogTopline}`}>
            <div><p className={styles.eyebrow}>Reviewed systems</p><h2 id="catalog-heading">Available equipment dossiers</h2></div>
            <a href="/equipment/compare">Open comparison workspace <ChevronRight aria-hidden size={14} /></a>
          </div>

          <form action="/equipment" className={upgradeStyles.indexTools} method="get">
            <label>
              <span><Search aria-hidden size={12} /> Search</span>
              <input defaultValue={query} maxLength={100} name="q" placeholder="Machine, vendor, role, or system" type="search" />
            </label>
            <label>
              <span>Manufacturer</span>
              <select defaultValue={manufacturer} name="manufacturer">
                <option value="">All manufacturers</option>
                {manufacturerOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.displayName}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Network evidence</span>
              <select defaultValue={networkStatus} name="network">
                <option value="">All reviewed statuses</option>
                <option value="documented">Documented path/interface</option>
                <option value="optional">Optional configuration</option>
                <option value="reviewed_without_attachment">Reviewed without attachment</option>
              </select>
            </label>
            <div className={upgradeStyles.indexToolActions}>
              <button type="submit"><SlidersHorizontal aria-hidden size={14} /> Apply</button>
              {query || manufacturer || networkStatus ? (
                <a href="/equipment">Clear filters</a>
              ) : null}
            </div>
          </form>

          {filteredSystems.length > 0 ? (
            <div className={upgradeStyles.compactSystemGrid}>
              {filteredSystems.map((system) => {
                const usageSummary = usageBySlug.get(system.slug);
                const network = getEquipmentNetworkQuickFact(system.slug);
                return (
                  <article
                    className={upgradeStyles.compactSystemCard}
                    data-equipment-card="true"
                    key={system.slug}
                  >
                    {system.referenceImage ? (
                      <figure className={upgradeStyles.compactSystemImage} data-equipment-preview="true">
                        <Image
                          alt={system.referenceImage.alt}
                          fill
                          sizes="(max-width: 600px) 92vw, (max-width: 1080px) 44vw, 30vw"
                          src={system.referenceImage.assetUrl}
                        />
                      </figure>
                    ) : null}
                    <div className={upgradeStyles.compactSystemBody}>
                      <div className={styles.cardTopline}>
                        <span className={styles.pilotBadge}>{system.editorialState.replaceAll("_", " ")}</span>
                        <span>{system.certification.certificationId}</span>
                      </div>
                      <div className={upgradeStyles.compactSystemIntro}>
                        <h3>{system.displayName}</h3>
                        <p>{system.deviceRole}</p>
                        <div className={upgradeStyles.compactFactsRow}>
                          <span>{system.coverage.componentCount} components</span>
                          <span>{system.coverage.configurationChangeCount} changes</span>
                          <span>{system.coverage.sourceCount} sources</span>
                        </div>
                      </div>
                      {network ? (
                        <div
                          className={`${styles.networkQuickFact} ${upgradeStyles.compactNetworkFact}`}
                          data-network-status={network.status}
                        >
                          <Network aria-hidden size={16} />
                          <div><span>Networking</span><strong>{network.shortLabel}</strong><small>{network.caveat}</small></div>
                        </div>
                      ) : null}
                      {usageSummary ? (
                        <div className={upgradeStyles.compactUsage} data-tour="equipment-usage-summary">
                          <span><strong>{usageSummary.deviceFamilyRecords.toLocaleString()}</strong> exact product-family rows</span>
                          <span><strong>{usageSummary.manufacturerContextRecords.toLocaleString()}</strong> vendor-context rows, grouped at manufacturer scope</span>
                        </div>
                      ) : null}
                      <div className={`${styles.systemPreviewSources} ${upgradeStyles.compactSources}`}>
                        {system.referenceSources.map((source) => (
                          <a
                            data-equipment-preview-source="true"
                            href={source.url}
                            key={source.id}
                            rel="noreferrer"
                            target="_blank"
                            title={source.title}
                          >
                            Reference: {source.publisher}
                          </a>
                        ))}
                      </div>
                      <div className={upgradeStyles.cardActions} data-equipment-card-actions="true">
                        <a href={`/equipment/${system.slug}`}>Open dossier <ChevronRight aria-hidden size={13} /></a>
                        <a href={`/equipment/compare?slugs=${encodeURIComponent(system.slug)}`}>Compare system</a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={upgradeStyles.emptyResults}>
              <strong>No reviewed dossier matches these filters.</strong>
              <p>Clear the search or choose broader evidence filters.</p>
              <a href="/equipment">Clear all filters</a>
            </div>
          )}
        </section>

        <section className={styles.methodNote} data-tour="equipment-methodology">
          <strong>Interpretation rule</strong>
          <p>{equipmentCatalogMetadata.methodology.caveat}</p>
        </section>
      </div>
    </main>
  );
}
