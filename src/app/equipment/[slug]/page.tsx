import type { Metadata, Route } from "next";
import {
  Boxes,
  ChevronRight,
  Clock3,
  FileCheck2,
  MapPinned,
  Network,
  ShieldCheck,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { getEquipmentSystem } from "@/lib/equipment-catalog";
import { getEquipmentNetworkQuickFact } from "@/lib/equipment-social-preview";
import { getEquipmentUsageSummary } from "@/lib/equipment-usage";
import {
  buildEquipmentDossierMetadata,
  type EquipmentSearchValue,
} from "./dossier-format";
import { equipmentDossierSections } from "./dossier-navigation";
import { LegacyDossierHashRedirect } from "./legacy-dossier-hash-redirect.client";
import styles from "../equipment.module.css";
import upgradeStyles from "../equipment-upgrades.module.css";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, EquipmentSearchValue>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildEquipmentDossierMetadata(slug);
}

export default async function EquipmentSystemOverviewPage({ params, searchParams }: PageProps) {
  const [{ slug }, requested] = await Promise.all([params, searchParams]);
  const system = getEquipmentSystem(slug);
  const usageSummary = getEquipmentUsageSummary(slug);
  const network = getEquipmentNetworkQuickFact(slug);
  if (!system || !usageSummary || !network) notFound();

  const legacyUsageKeys = ["usageEvidence", "usageState", "usageQuery", "usagePage"];
  if (legacyUsageKeys.some((key) => requested[key] !== undefined)) {
    const parameters = new URLSearchParams();
    for (const key of legacyUsageKeys) {
      const value = requested[key];
      const selected = Array.isArray(value) ? value[0] : value;
      if (selected) parameters.set(key, selected);
    }
    const legacyUsageRoute = `/equipment/${slug}/usage${parameters.size ? `?${parameters.toString()}` : ""}#equipment-usage` as Route;
    redirect(legacyUsageRoute);
  }

  const icons = {
    components: Boxes,
    topology: Network,
    history: Clock3,
    usage: MapPinned,
    sources: FileCheck2,
  } as const;

  return (
    <>
      <LegacyDossierHashRedirect slug={slug} />

      <section className={styles.scopeWarning} data-tour="equipment-scope-warning">
        <ShieldCheck aria-hidden size={21} />
        <div>
          <strong>Do not collapse evidence scopes.</strong>
          <p>A certified component list does not prove what a jurisdiction installed. A jurisdiction system-version listing does not prove device firmware, change adoption, internal parts, networking state, or power topology.</p>
        </div>
      </section>

      <section className={upgradeStyles.overviewPanel} aria-labelledby="dossier-overview-heading">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Dossier overview</p>
            <h2 id="dossier-overview-heading">Start with the question you need to answer</h2>
          </div>
          <p>Each section has its own shareable URL. Sources and caveats stay attached to every claim.</p>
        </div>

        <div className={upgradeStyles.sectionCardGrid}>
          {equipmentDossierSections.filter((section) => section.key !== "overview").map((section) => {
            const Icon = icons[section.key];
            return (
              <a href={`/equipment/${slug}${section.path}`} key={section.key}>
                <Icon aria-hidden size={20} />
                <strong>{section.label}</strong>
                <span>{section.description}</span>
                <small>Open section <ChevronRight aria-hidden size={13} /></small>
              </a>
            );
          })}
        </div>
      </section>

      <section className={upgradeStyles.overviewFacts} aria-label="Dossier quick facts">
        <article>
          <span>Certified system</span>
          <strong>{system.systemName} {system.systemVersion}</strong>
          <p>{system.certification.certificationId}, certified {system.certification.certifiedOn}.</p>
        </article>
        <article data-network-status={network.status}>
          <span>Documented networking</span>
          <strong>{network.shortLabel}</strong>
          <p>{network.caveat}</p>
        </article>
        <article>
          <span>Exact product-family rows</span>
          <strong>{usageSummary.deviceFamilyRecords.toLocaleString()}</strong>
          <p>{usageSummary.deviceFamilyRecords > 0
            ? `Named-family observations across ${usageSummary.deviceFamilyStates} states.`
            : "No normalized source row currently names this exact product family."}</p>
        </article>
        <article>
          <span>Vendor-only context</span>
          <strong>{usageSummary.manufacturerContextRecords.toLocaleString()}</strong>
          <p>Grouped at manufacturer scope; not counted as exact dossier usage.</p>
        </article>
      </section>
    </>
  );
}
