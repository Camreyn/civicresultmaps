import type { Metadata } from "next";
import { ExternalLink, MapPinned, Search } from "lucide-react";
import { notFound } from "next/navigation";

import { getEquipmentSystem } from "@/lib/equipment-catalog";
import {
  defaultEquipmentUsageEvidence,
  equipmentUsageMetadata,
  getEquipmentUsageManufacturer,
  getEquipmentUsageSource,
  getEquipmentUsageSummary,
  listEquipmentUsageStates,
  queryEquipmentUsage,
  type EquipmentUsageEvidenceKind,
} from "@/lib/equipment-usage";
import {
  buildEquipmentDossierMetadata,
  firstSearchValue,
  scopeLabel,
  type EquipmentSearchValue,
} from "../dossier-format";
import styles from "../../equipment.module.css";
import upgradeStyles from "../../equipment-upgrades.module.css";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, EquipmentSearchValue>>;
};

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
  return `/equipment/${slug}/usage?${parameters.toString()}#equipment-usage`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildEquipmentDossierMetadata(slug, "usage");
}

export default async function EquipmentUsagePage({ params, searchParams }: PageProps) {
  const [{ slug }, requested] = await Promise.all([params, searchParams]);
  const system = getEquipmentSystem(slug);
  const usageSummary = getEquipmentUsageSummary(slug);
  if (!system || !usageSummary) notFound();

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
  const manufacturer = getEquipmentUsageManufacturer(usageSummary.manufacturerId);

  return (
    <section
      className={styles.dossierSection}
      id="equipment-usage"
      aria-labelledby="equipment-usage-heading"
      data-tour="equipment-usage"
    >
      <div className={styles.sectionHead}>
        <div><p className={styles.eyebrow}><MapPinned aria-hidden size={14} /> Jurisdiction context</p><h2 id="equipment-usage-heading">Where this equipment appears in 2024 records</h2></div>
        <p>{equipmentUsageMetadata.sourcePolicy.caveat}</p>
      </div>

      <div className={styles.usageEvidenceGrid}>
        <article>
          <span>Named product family</span>
          <strong>{usageSummary.deviceFamilyRecords.toLocaleString()} locales</strong>
          <small>{usageSummary.deviceFamilyRecords > 0
            ? `${usageSummary.deviceFamilyStates} states; source rows explicitly name this family`
            : "No current source row explicitly names this dossier family"}</small>
        </article>
        <article>
          <span>{manufacturer?.displayName ?? "Manufacturer"} context</span>
          <strong>{usageSummary.manufacturerContextRecords.toLocaleString()} locales</strong>
          <small>{usageSummary.manufacturerContextStates} states; vendor-only rows target the manufacturer, not this machine</small>
        </article>
        <article>
          <span>Map resolution</span>
          <strong>{usageSummary.jurisdictionMapLinks.toLocaleString()} pinned</strong>
          <small>{usageSummary.stateMapLinks.toLocaleString()} source rows open at state scope</small>
        </article>
      </div>

      {evidenceKind === "manufacturer_context" ? (
        <aside className={upgradeStyles.relationNotice}>
          <strong>Manufacturer context, not {system.deviceName} deployment evidence</strong>
          <p>These rows are connected to {manufacturer?.displayName ?? system.manufacturer}. They are shown here as research context because this dossier shares that manufacturer; the relation target remains the vendor.</p>
        </aside>
      ) : null}

      <form action={`/equipment/${slug}/usage`} className={styles.usageFilters} method="get">
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
                <div>
                  <dt>Relation target</dt>
                  <dd>{record.relationTarget.kind === "equipment_system"
                    ? system.deviceName
                    : record.relationTarget.displayName}</dd>
                </div>
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
  );
}
