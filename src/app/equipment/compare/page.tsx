import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { ArrowLeftRight, ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";

import { SiteHeader } from "../../site-header";
import {
  equipmentCatalogMetadata,
  listEquipmentSystems,
} from "@/lib/equipment-catalog";
import {
  buildEquipmentComparison,
  normalizeEquipmentComparisonSlugs,
  validateEquipmentComparisonSlugs,
} from "@/lib/equipment-comparison";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";
import styles from "../equipment.module.css";
import upgradeStyles from "../equipment-upgrades.module.css";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;
type PageProps = {
  searchParams: Promise<Record<string, SearchValue>>;
};

export const metadata: Metadata = {
  title: "Compare election equipment dossiers",
  description: "Compare two or three reviewed election-equipment dossiers without collapsing certification, networking, usage, and source scopes.",
  alternates: { canonical: "/equipment/compare" },
};

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function EquipmentComparePage({ searchParams }: PageProps) {
  const equipmentEnabled = isEquipmentExplorerEnabled({ productionReady: equipmentCatalogMetadata.productionReady });
  if (!equipmentEnabled) notFound();

  const requested = await searchParams;
  const selectedSlugs = normalizeEquipmentComparisonSlugs(requested.slugs);
  const systems = listEquipmentSystems();
  const validation = selectedSlugs.length >= 2
    ? validateEquipmentComparisonSlugs(selectedSlugs)
    : null;
  const comparison = validation?.valid ? buildEquipmentComparison(validation.slugs) : [];
  const columnStyle = {
    "--comparison-count": Math.max(2, comparison.length),
  } as CSSProperties;

  return (
    <main className={styles.shell}>
      <SiteHeader
        activePage="equipment"
        equipmentEnabled={equipmentEnabled}
        subtitle="U.S. election equipment evidence"
      />

      <div className={styles.page}>
        <nav aria-label="Breadcrumb" className={styles.equipmentBreadcrumb}>
          <a href="/equipment">U.S. Equipment</a><ChevronRight aria-hidden size={14} /><span>Compare</span>
        </nav>

        <section className={upgradeStyles.compareHero}>
          <div>
            <p className={styles.eyebrow}><ArrowLeftRight aria-hidden size={15} /> Side-by-side evidence</p>
            <h1>Compare two or three reviewed equipment dossiers.</h1>
            <p className={styles.lede}>The comparison keeps certification, components, network documentation, change history, usage relations, and source coverage in separate rows so unlike evidence is not treated as equivalent.</p>
          </div>
          <aside className={styles.scopeCard}>
            <span>Comparison boundary</span>
            <strong>Maximum three systems</strong>
            <p>Counts summarize reviewed source packages. They are not rankings of security, reliability, adoption, or election performance.</p>
          </aside>
        </section>

        <form action="/equipment/compare" className={upgradeStyles.compareForm} method="get">
          {[0, 1, 2].map((slot) => (
            <label key={slot}>
              <span>System {slot + 1}{slot === 2 ? " (optional)" : ""}</span>
              <select defaultValue={selectedSlugs[slot] ?? ""} name="slugs" required={slot < 2}>
                <option value="">{slot < 2 ? "Choose a dossier" : "No third system"}</option>
                {systems.map((system) => (
                  <option key={system.slug} value={system.slug}>{system.deviceName} — {system.systemName} {system.systemVersion}</option>
                ))}
              </select>
            </label>
          ))}
          <button type="submit">Compare dossiers</button>
        </form>

        {selectedSlugs.length === 1 ? (
          <p className={upgradeStyles.compareError}>Choose one more distinct dossier to build the comparison.</p>
        ) : null}
        {validation && !validation.valid ? (
          <p className={upgradeStyles.compareError}>{validation.message}</p>
        ) : null}

        {comparison.length > 0 ? (
          <div className={upgradeStyles.comparison} style={columnStyle}>
            <section className={upgradeStyles.comparisonSection}>
              <h2>System and role</h2>
              <div className={upgradeStyles.comparisonColumns}>
                {comparison.map((entry) => (
                  <article key={entry.slug}>
                    <h3>{entry.displayName}</h3>
                    <p>{entry.deviceRole}</p>
                    <p>{entry.summary}</p>
                    <a className={styles.primaryLink} href={`/equipment/${entry.slug}`}>Open dossier <ChevronRight aria-hidden size={13} /></a>
                  </article>
                ))}
              </div>
            </section>

            <section className={upgradeStyles.comparisonSection}>
              <h2>Certification scope</h2>
              <div className={upgradeStyles.comparisonColumns}>
                {comparison.map((entry) => (
                  <article key={entry.slug}>
                    <dl>
                      <div><dt>Certificate</dt><dd>{entry.certification.certificationId}</dd></div>
                      <div><dt>Standard</dt><dd>{entry.certification.standard}</dd></div>
                      <div><dt>Certified</dt><dd>{entry.certification.certifiedOn}</dd></div>
                      <div><dt>VSTL</dt><dd>{entry.certification.vstl}</dd></div>
                      <div><dt>Boundary</dt><dd>{entry.certification.caveat}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>

            <section className={upgradeStyles.comparisonSection}>
              <h2>Components and hardware facts</h2>
              <div className={upgradeStyles.comparisonColumns}>
                {comparison.map((entry) => (
                  <article key={entry.slug}>
                    <dl>
                      <div><dt>Components</dt><dd>{entry.components.count}</dd></div>
                      <div><dt>Categories</dt><dd>{entry.components.categories.map(label).join(", ")}</dd></div>
                      <div><dt>Technical facts</dt><dd>{entry.components.technicalSpecificationCount}</dd></div>
                      <div><dt>Explicit unknowns</dt><dd>{entry.components.unknownTechnicalSpecificationCount}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>

            <section className={upgradeStyles.comparisonSection}>
              <h2>Network evidence</h2>
              <div className={upgradeStyles.comparisonColumns}>
                {comparison.map((entry) => (
                  <article key={entry.slug}>
                    <h3>{entry.network.quickFact.label}</h3>
                    <p>{entry.network.quickFact.detail}</p>
                    <dl>
                      <div><dt>Reviewed configurations</dt><dd>{entry.network.configurationCount}</dd></div>
                      <div><dt>Topology kinds</dt><dd>{entry.network.topologyKinds.map(label).join(", ")}</dd></div>
                      <div><dt>Evidence gaps</dt><dd>{entry.network.evidenceGapCount}</dd></div>
                    </dl>
                    <p>{entry.network.quickFact.caveat}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className={upgradeStyles.comparisonSection}>
              <h2>History and findings</h2>
              <div className={upgradeStyles.comparisonColumns}>
                {comparison.map((entry) => (
                  <article key={entry.slug}>
                    <dl>
                      <div><dt>Version observations</dt><dd>{entry.history.versionObservationCount}</dd></div>
                      <div><dt>Change records</dt><dd>{entry.history.configurationChangeCount}</dd></div>
                      <div><dt>Findings/statuses</dt><dd>{entry.history.findingCount}</dd></div>
                      <div><dt>Finding types</dt><dd>{entry.history.findingTypes.map(label).join(", ") || "None in reviewed package"}</dd></div>
                      <div><dt>Dated deployments</dt><dd>{entry.history.deploymentObservationCount}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>

            <section className={upgradeStyles.comparisonSection}>
              <h2>Usage relations and sources</h2>
              <div className={upgradeStyles.comparisonColumns}>
                {comparison.map((entry) => (
                  <article key={entry.slug}>
                    <dl>
                      <div><dt>Exact product-family rows</dt><dd>{entry.usage.exactProductFamilyRecords} across {entry.usage.exactProductFamilyStates} states</dd></div>
                      <div><dt>Vendor-context rows</dt><dd>{entry.usage.manufacturerContextRecords} across {entry.usage.manufacturerContextStates} states; manufacturer target only</dd></div>
                      <div><dt>Archived sources</dt><dd>{entry.sources.count}</dd></div>
                      <div><dt>Interpretation</dt><dd>{entry.sources.caveat}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
