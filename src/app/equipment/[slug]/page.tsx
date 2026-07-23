import type { Metadata } from "next";
import {
  Box,
  Cpu,
  ExternalLink,
  FileCheck2,
  MapPinned,
  PlugZap,
  Search,
  ShieldCheck,
} from "lucide-react";
import { notFound } from "next/navigation";

import { RouteTour } from "../../route-tour";
import { SiteHeader } from "../../site-header";
import { equipmentDetailTourSteps } from "../../tour-manifests";
import {
  equipmentCatalogMetadata,
  getEquipmentSystem,
  sourcesForEquipmentRecord,
  sourcesForEquipmentSystem,
} from "@/lib/equipment-catalog";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";
import {
  buildEquipmentMachineSocialPreview,
  equipmentSocialCardPath,
} from "@/lib/equipment-social-preview";
import {
  defaultEquipmentUsageEvidence,
  equipmentUsageMetadata,
  getEquipmentUsageSource,
  getEquipmentUsageSummary,
  listEquipmentUsageStates,
  queryEquipmentUsage,
  type EquipmentUsageEvidenceKind,
} from "@/lib/equipment-usage";
import { EquipmentExplorer } from "./equipment-explorer.client";
import { EquipmentNetworkEvidencePanel } from "./equipment-network-evidence.client";
import styles from "../equipment.module.css";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;
type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, SearchValue>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const system = getEquipmentSystem(slug);
  const preview = buildEquipmentMachineSocialPreview(slug);
  if (!system || !preview) return {};
  const canonical = `/equipment/${system.slug}`;
  const image = equipmentSocialCardPath({ slug: system.slug });
  const imageAlt = `${system.displayName} quick facts and sourced networking status`;
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

function SourceLinks({ sourceIds, sources }: {
  sourceIds: readonly string[];
  sources: ReturnType<typeof sourcesForEquipmentSystem>;
}) {
  const selected = sourcesForEquipmentRecord(sourceIds, sources);
  return (
    <ul className={styles.inlineSources}>
      {selected.map((source) => (
        <li key={source.id}>
          <a href={source.url} rel="noreferrer" target="_blank">
            {source.publisher}: {source.title} <ExternalLink aria-hidden size={12} />
          </a>
          <span>{source.pageOrSection}</span>
        </li>
      ))}
    </ul>
  );
}

function scopeLabel(scope: string) {
  return scope.replaceAll("_", " ");
}

function firstSearchValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function usagePageHref({
  slug,
  evidenceKind,
  state,
  query,
  page,
}: {
  slug: string;
  evidenceKind: EquipmentUsageEvidenceKind;
  state?: string;
  query?: string;
  page: number;
}) {
  const parameters = new URLSearchParams({ usageEvidence: evidenceKind });
  if (state) parameters.set("usageState", state);
  if (query) parameters.set("usageQuery", query);
  if (page > 1) parameters.set("usagePage", String(page));
  return `/equipment/${slug}?${parameters.toString()}#equipment-usage`;
}

export default async function EquipmentSystemPage({ params, searchParams }: PageProps) {
  const equipmentEnabled = isEquipmentExplorerEnabled({ productionReady: equipmentCatalogMetadata.productionReady });
  if (!equipmentEnabled) notFound();
  const [{ slug }, requested] = await Promise.all([params, searchParams]);
  const system = getEquipmentSystem(slug);
  const usageSummary = getEquipmentUsageSummary(slug);
  if (!system || !usageSummary) notFound();

  const sources = sourcesForEquipmentSystem(system);
  const deploymentSourceIds = [...new Set(system.deployments.flatMap((deployment) => deployment.sourceIds))];
  const requestedEvidence = firstSearchValue(requested.usageEvidence);
  const availableEvidence = new Set<EquipmentUsageEvidenceKind>([
    ...(usageSummary.deviceFamilyRecords > 0 ? ["device_family" as const] : []),
    ...(usageSummary.manufacturerContextRecords > 0 ? ["manufacturer_context" as const] : []),
  ]);
  const evidenceKind = availableEvidence.has(requestedEvidence as EquipmentUsageEvidenceKind)
    ? requestedEvidence as EquipmentUsageEvidenceKind
    : defaultEquipmentUsageEvidence(usageSummary);
  const availableStates = listEquipmentUsageStates(slug, evidenceKind);
  const requestedState = firstSearchValue(requested.usageState)?.toUpperCase();
  const selectedState = requestedState && availableStates.includes(requestedState) ? requestedState : undefined;
  const usageQuery = firstSearchValue(requested.usageQuery)?.trim().slice(0, 120) || undefined;
  const pageSize = 20;
  const unpaged = queryEquipmentUsage({ slug, evidenceKind, state: selectedState, query: usageQuery, limit: 1 });
  const pageCount = Math.max(1, Math.ceil(unpaged.total / pageSize));
  const requestedPage = Number(firstSearchValue(requested.usagePage));
  const usagePage = Math.min(pageCount, Math.max(1, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1));
  const usage = queryEquipmentUsage({
    slug,
    evidenceKind,
    state: selectedState,
    query: usageQuery,
    limit: pageSize,
    offset: (usagePage - 1) * pageSize,
  });

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

        <section className={styles.scopeWarning} data-tour="equipment-scope-warning">
          <ShieldCheck aria-hidden size={21} />
          <div><strong>Do not collapse evidence scopes.</strong><p>A certified component list does not prove what a jurisdiction installed. A jurisdiction system-version listing does not prove device firmware, configuration-change adoption, internal parts, or power topology.</p></div>
        </section>

        <div data-tour="equipment-explorer"><EquipmentExplorer sources={sources} system={system} /></div>
        <div data-tour="equipment-network-evidence"><EquipmentNetworkEvidencePanel evidence={system.networkEvidence} sources={sources} /></div>

        <section className={styles.dossierSection} aria-labelledby="version-heading" data-tour="equipment-version-evidence">
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

        <section className={styles.dossierSection} id="equipment-usage" aria-labelledby="equipment-usage-heading" data-tour="equipment-usage">
          <div className={styles.sectionHead}>
            <div><p className={styles.eyebrow}><MapPinned aria-hidden size={14} /> Jurisdiction context</p><h2 id="equipment-usage-heading">Where this equipment appears in 2024 records</h2></div>
            <p>{equipmentUsageMetadata.sourcePolicy.caveat}</p>
          </div>

          <div className={styles.usageEvidenceGrid}>
            {usageSummary.deviceFamilyRecords > 0 ? (
              <article><span>Named product family</span><strong>{usageSummary.deviceFamilyRecords.toLocaleString()} locales</strong><small>{usageSummary.deviceFamilyStates} states; the source row explicitly names the family</small></article>
            ) : null}
            {usageSummary.manufacturerContextRecords > 0 ? (
              <article><span>Manufacturer context</span><strong>{usageSummary.manufacturerContextRecords.toLocaleString()} locales</strong><small>{usageSummary.manufacturerContextStates} states; vendor only, not proof of this exact model</small></article>
            ) : null}
            <article><span>Map resolution</span><strong>{usageSummary.jurisdictionMapLinks.toLocaleString()} pinned</strong><small>{usageSummary.stateMapLinks.toLocaleString()} source rows open at state scope</small></article>
          </div>

          <form action={`/equipment/${slug}`} className={styles.usageFilters} method="get">
            <label>
              <span>Evidence strength</span>
              <select defaultValue={evidenceKind} name="usageEvidence">
                {usageSummary.deviceFamilyRecords > 0 ? <option value="device_family">Named product family</option> : null}
                {usageSummary.manufacturerContextRecords > 0 ? <option value="manufacturer_context">Manufacturer context</option> : null}
              </select>
            </label>
            <label>
              <span>State</span>
              <select defaultValue={selectedState ?? ""} name="usageState">
                <option value="">All states in this evidence band</option>
                {availableStates.map((state) => <option key={state} value={state}>{state}</option>)}
              </select>
            </label>
            <label>
              <span>Locale, system, or vendor</span>
              <span className={styles.usageSearch}><Search aria-hidden size={15} /><input defaultValue={usageQuery} maxLength={120} name="usageQuery" placeholder="Search sourced rows" type="search" /></span>
            </label>
            <button type="submit">Apply filters</button>
          </form>

          <div className={styles.usageResultHeader}>
            <strong>{usage.total.toLocaleString()} matching sourced {usage.total === 1 ? "record" : "records"}</strong>
            <span>Page {usagePage} of {pageCount}</span>
          </div>
          <div className={styles.usageRecordGrid}>
            {usage.records.map((record) => {
              const source = getEquipmentUsageSource(record.sourceId);
              return (
                <article className={styles.usageRecord} key={record.id}>
                  <div className={styles.cardTopline}>
                    <span>{record.state} · {scopeLabel(record.jurisdictionLevel)}</span>
                    <span>{record.evidenceKind === "device_family" ? "named family" : "manufacturer context"}</span>
                  </div>
                  <h3>{record.jurisdictionName}</h3>
                  <dl>
                    {record.systemName ? <div><dt>Reported system</dt><dd>{record.systemName}</dd></div> : null}
                    {record.vendor ? <div><dt>Vendor</dt><dd>{record.vendor}</dd></div> : null}
                    {record.equipmentType ? <div><dt>Equipment type</dt><dd>{record.equipmentType}</dd></div> : null}
                  </dl>
                  <p>{record.matchReason}</p>
                  <div className={styles.usageLinks}>
                    {record.map.href ? <a href={record.map.href}>{record.map.label} <MapPinned aria-hidden size={13} /></a> : null}
                    {source ? <a href={source.sourceUrl} rel="noreferrer" target="_blank">Open {source.authority} source <ExternalLink aria-hidden size={13} /></a> : null}
                  </div>
                  {record.map.caveat ? <small>{record.map.caveat}</small> : null}
                </article>
              );
            })}
          </div>
          {usage.total === 0 ? <p className={styles.usageEmpty}>No source rows match these filters. Clear the state or search filter to restore this evidence band.</p> : null}
          {pageCount > 1 ? (
            <nav aria-label="Jurisdiction record pages" className={styles.usagePagination}>
              {usagePage > 1 ? <a href={usagePageHref({ slug, evidenceKind, state: selectedState, query: usageQuery, page: usagePage - 1 })}>Previous</a> : <span />}
              <span>{((usagePage - 1) * pageSize + 1).toLocaleString()}–{Math.min(usagePage * pageSize, usage.total).toLocaleString()} of {usage.total.toLocaleString()}</span>
              {usagePage < pageCount ? <a href={usagePageHref({ slug, evidenceKind, state: selectedState, query: usageQuery, page: usagePage + 1 })}>Next</a> : <span />}
            </nav>
          ) : null}
        </section>

        <section className={styles.dossierSection} aria-labelledby="source-heading" data-tour="equipment-source-manifest">
          <div className={styles.sectionHead}>
            <div><p className={styles.eyebrow}><FileCheck2 aria-hidden size={14} /> Provenance</p><h2 id="source-heading">Archived source manifest</h2></div>
            <p>Each local artifact is checked against its reviewed SHA-256 during catalog validation.</p>
          </div>
          <div className={styles.sourceGrid}>
            {sources.map((source) => (
              <article className={styles.sourceCard} key={source.id}>
                <span>{scopeLabel(source.authorityLevel)}</span>
                <h3>{source.title}</h3>
                <p>{source.publisher}</p>
                <code>{source.sha256}</code>
                <small>{source.localArtifact}</small>
                <small>Reviewed revision: {source.currentReviewedRevisionId}</small>
                <a href={source.url} rel="noreferrer" target="_blank">Open official source <ExternalLink aria-hidden size={13} /></a>
              </article>
            ))}
          </div>
        </section>

        <footer className={styles.footerNote}>
          <Box aria-hidden size={18} />
          <p>{system.scene.description} This dossier identifies evidence gaps and source limitations; it does not allege fraud, misconduct, altered votes, or an incorrect election outcome.</p>
        </footer>
      </div>
    </main>
  );
}
