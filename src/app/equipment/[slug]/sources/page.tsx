import type { Metadata } from "next";
import { ExternalLink, FileCheck2 } from "lucide-react";
import { notFound } from "next/navigation";

import {
  getEquipmentSystem,
  sourcesForEquipmentSystem,
  type EquipmentSource,
} from "@/lib/equipment-catalog";
import { buildEquipmentDossierMetadata, scopeLabel } from "../dossier-format";
import styles from "../../equipment.module.css";
import upgradeStyles from "../../equipment-upgrades.module.css";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function groupSources(sources: EquipmentSource[]) {
  const groups = new Map<string, EquipmentSource[]>();
  for (const source of sources) {
    const group = groups.get(source.authorityLevel) ?? [];
    group.push(source);
    groups.set(source.authorityLevel, group);
  }
  return [...groups.entries()]
    .map(([authorityLevel, entries]) => ({
      authorityLevel,
      entries: entries.sort((left, right) => left.publisher.localeCompare(right.publisher) || left.title.localeCompare(right.title)),
    }))
    .sort((left, right) => left.authorityLevel.localeCompare(right.authorityLevel));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildEquipmentDossierMetadata(slug, "sources");
}

export default async function EquipmentSourcesPage({ params }: PageProps) {
  const { slug } = await params;
  const system = getEquipmentSystem(slug);
  if (!system) notFound();
  const sources = sourcesForEquipmentSystem(system);
  const groups = groupSources(sources);

  return (
    <section
      className={styles.dossierSection}
      aria-labelledby="source-heading"
      data-tour="equipment-source-manifest"
      id="equipment-source-manifest"
    >
      <div className={styles.sectionHead}>
        <div><p className={styles.eyebrow}><FileCheck2 aria-hidden size={14} /> Provenance</p><h2 id="source-heading">Archived source manifest</h2></div>
        <p>{sources.length} reviewed artifacts grouped by authority. Open technical details only when you need hashes, revision IDs, or archive paths.</p>
      </div>

      <div className={upgradeStyles.sourceGroups}>
        {groups.map((group, index) => (
          <details key={group.authorityLevel} open={index === 0}>
            <summary>
              <span>{scopeLabel(group.authorityLevel)}</span>
              <strong>{group.entries.length} {group.entries.length === 1 ? "source" : "sources"}</strong>
            </summary>
            <div className={upgradeStyles.sourceGroupGrid}>
              {group.entries.map((source) => (
                <article key={source.id}>
                  <span>{source.publisher}</span>
                  <h3>{source.title}</h3>
                  <p>{source.pageOrSection}</p>
                  <a href={source.url} rel="noreferrer" target="_blank">Open source <ExternalLink aria-hidden size={13} /></a>
                  <details className={upgradeStyles.sourceTechnical}>
                    <summary>Archive and integrity details</summary>
                    <dl>
                      <div><dt>Reviewed revision</dt><dd>{source.currentReviewedRevisionId}</dd></div>
                      <div><dt>Local artifact</dt><dd>{source.localArtifact}</dd></div>
                      <div><dt>SHA-256</dt><dd><code>{source.sha256}</code></dd></div>
                    </dl>
                  </details>
                </article>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
