import type { Metadata } from "next";
import { PlugZap } from "lucide-react";
import { notFound } from "next/navigation";

import {
  getEquipmentSystem,
  sourcesForEquipmentSystem,
} from "@/lib/equipment-catalog";
import { buildEquipmentDossierMetadata, scopeLabel } from "../dossier-format";
import { SourceLinks } from "../source-links";
import styles from "../../equipment.module.css";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildEquipmentDossierMetadata(slug, "history");
}

export default async function EquipmentHistoryPage({ params }: PageProps) {
  const { slug } = await params;
  const system = getEquipmentSystem(slug);
  if (!system) notFound();
  const sources = sourcesForEquipmentSystem(system);
  const deploymentSourceIds = [...new Set(system.deployments.flatMap((deployment) => deployment.sourceIds))];

  return (
    <>
      <section
        className={styles.dossierSection}
        aria-labelledby="version-heading"
        data-tour="equipment-version-evidence"
        id="equipment-version-evidence"
      >
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}>Version evidence</p><h2 id="version-heading">Last sourced observations</h2></div>
          <p>“Last” means latest in this reviewed source package, not a live device reading or the newest product-family release.</p>
        </div>
        <div className={styles.recordGrid}>
          {system.versionObservations.map((observation) => (
            <article className={styles.recordCard} key={observation.id}>
              <div className={styles.cardTopline}><span className={styles.scopePill}>{scopeLabel(observation.assertionScope)} assertion</span><span>{observation.observedOn}</span></div>
              <h3>{observation.label}</h3>
              <p className={styles.versionValue}>{observation.value}</p>
              <p>{observation.caveat}</p>
              <SourceLinks sourceIds={observation.sourceIds} sources={sources} />
            </article>
          ))}
        </div>
      </section>

      <section className={styles.dossierSection} aria-labelledby="change-heading">
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}>VSTL + EAC change control</p><h2 id="change-heading">Configuration change history</h2></div>
          <p>These are source-linked certification and change records. Field deployment remains separate and unknown unless explicitly documented.</p>
        </div>
        <div className={styles.timeline}>
          {system.configurationChanges.map((change) => (
            <article key={change.id}>
              <div className={styles.timelineMarker} aria-hidden />
              <div className={styles.timelineBody}>
                <div className={styles.cardTopline}><span className={styles.changeId}>{change.changeId}</span><span>EAC approved {change.eacApprovedOn}</span></div>
                <h3>{change.description}</h3>
                <dl className={styles.changeFacts}>
                  <div><dt>VSTL</dt><dd>{change.vstl}</dd></div>
                  <div><dt>Dossier relationship</dt><dd>{scopeLabel(change.relationshipToPilot)}</dd></div>
                  <div><dt>Field deployment</dt><dd>{change.fieldDeploymentStatus}</dd></div>
                </dl>
                <p>{change.caveat}</p>
                <SourceLinks sourceIds={change.sourceIds} sources={sources} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.dossierSection} aria-labelledby="finding-heading">
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}>Findings and public status</p><h2 id="finding-heading">Tests, limitations, and listing gaps</h2></div>
          <p>Neutral finding types replace a generic “bugs” bucket so affected versions and source scope remain visible.</p>
        </div>
        <div className={styles.recordGrid}>
          {system.findings.map((finding) => (
            <article className={styles.recordCard} key={finding.id}>
              <div className={styles.cardTopline}><span className={styles.findingBadge}>{scopeLabel(finding.findingType)}</span><span>{scopeLabel(finding.publicStatus)}</span></div>
              <h3>{finding.title}</h3>
              <p>{finding.description}</p>
              <div className={styles.caveatBox}>{finding.caveat}</div>
              <SourceLinks sourceIds={finding.sourceIds} sources={sources} />
            </article>
          ))}
        </div>
      </section>

      <section className={styles.dossierSection} aria-labelledby="power-heading">
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}><PlugZap aria-hidden size={14} /> Power evidence</p><h2 id="power-heading">Backup supply and runtime</h2></div>
          <p>Named power equipment is rendered exactly as sourced. Missing capacity and runtime remain explicit instead of being inferred from another device or installation.</p>
        </div>
        {system.power.map((power) => (
          <article className={power.knowledgeStatus === "confirmed" ? styles.powerPanel : styles.unknownPanel} key={power.id}>
            <div><span>{scopeLabel(power.knowledgeStatus)}</span><h3>{system.deviceName} power / backup supply</h3><p>{power.description}</p></div>
            <dl className={styles.unknownFacts}>
              <div><dt>Supply type</dt><dd>{power.supplyType ?? "Not publicly confirmed"}</dd></div>
              <div><dt>Manufacturer</dt><dd>{power.manufacturer ?? "Not publicly confirmed"}</dd></div>
              <div><dt>UPS model</dt><dd>{power.model ?? "Not publicly confirmed"}</dd></div>
              <div><dt>Capacity</dt><dd>{power.capacity ?? "Not specified in reviewed source"}</dd></div>
              <div><dt>Runtime</dt><dd>{power.runtime ?? "Not specified in reviewed source"}</dd></div>
            </dl>
            <div className={styles.caveatBox}>{power.caveat}</div>
            <SourceLinks sourceIds={power.sourceIds} sources={sources} />
          </article>
        ))}
      </section>

      <section className={styles.dossierSection} aria-labelledby="deployment-heading">
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}>Deployment evidence</p><h2 id="deployment-heading">Dated jurisdiction observations</h2></div>
          <p>Deployment records remain at their documented grain. A system-level observation does not establish unit components, firmware, change adoption, or power configuration.</p>
        </div>
        {system.deployments.length > 0 ? (
          <>
            <div className={styles.deploymentTableWrap}>
              <table className={styles.deploymentTable}>
                <thead><tr><th>Jurisdiction</th><th>Observation</th><th>System version</th><th>Components confirmed</th></tr></thead>
                <tbody>{system.deployments.map((deployment) => (
                  <tr key={deployment.id}>
                    <td><strong>{deployment.jurisdiction}</strong></td>
                    <td>{deployment.electionOrAsOf}</td>
                    <td>{deployment.systemVersion}</td>
                    <td>{deployment.componentsConfirmed.length > 0 ? deployment.componentsConfirmed.join(", ") : "Not established at component or unit grain"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <SourceLinks sourceIds={deploymentSourceIds} sources={sources} />
          </>
        ) : (
          <article className={styles.unknownPanel}>
            <div><span>not collected</span><h3>No reviewed deployment observation in this dossier</h3><p>The source package currently establishes a certified configuration and test history, but no dated jurisdiction-level use record.</p></div>
            <div className={styles.caveatBox}>Absence from this catalog is not evidence that the system is unused. Deployment claims require a separately reviewed state or local source.</div>
          </article>
        )}
      </section>
    </>
  );
}
